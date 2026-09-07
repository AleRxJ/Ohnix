import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import {
    createFactusCreditNote,
    FactusError,
    isFactusConfigured,
} from "./factus.service.js";
import {
    createAlanubeCreditNote,
    AlanubeError,
    isAlanubeConfigured,
} from "./alanube.service.js";
import {
    provisionItcycleCompany,
    setItcycleDianConfiguration,
    createItcycleNumberingResolution,
    updateItcycleNumberingResolution,
    uploadItcycleCertificate,
    createItcycleApiKey,
    createItcycleInvoice,
    createItcycleCreditNote,
    getItcycleInvoiceStatus,
    retryItcycleInvoiceSend,
    ItcycleDianError,
    isItcycleConfigured,
} from "./itcycleDian.service.js";
import { getCompanyDianReadiness } from "./firmaPassProvisioning.service.js";
import { encryptSecret, decryptSecret } from "../utils/secretEncryption.js";
import { computeNitCheckDigit } from "../utils/nit.util.js";
import { normalizeCountryCode } from "./companyCountry.service.js";
import { ensureUserSubscription, getEffectivePlan, getPlanFeatures } from "../middleware/pricing.middleware.js";
import { recordStockMovement } from "./stockMovement.service.js";
import { buildAccountingThirdParty, postOrderReturnJournalEntry } from "./accountingPosting.service.js";
import { creditLocationStockWithCost } from "./productLocationStock.service.js";

const toExternalId = (entity) => entity?.legacyMongoId || entity?.id;

// Electronic invoicing costs real money per document (Alanube bills per
// emission), unlike the other plan-gated features - so this is checked
// directly here rather than only at the route layer, and applies even to
// admins issuing on a user's behalf, since the cost is the same either way.
export const ensureElectronicInvoicingPlan = async (userId) => {
    const subscription = await ensureUserSubscription(userId);
    const effectivePlan = getEffectivePlan(subscription);
    if (!getPlanFeatures(effectivePlan).electronicInvoicing) {
        throw new ApiError(
            403,
            "Electronic invoicing is available starting on the Negocio plan. Upgrade to issue DIAN invoices.",
            [],
            "",
            // `message` here is the English dev-facing fallback (logs, Postman) -
            // the self-service fiscal-setup UI is entirely in Spanish, so it
            // translates this via `code` instead of showing it raw.
            "electronic_invoicing_plan_required"
        );
    }
};

const FACTUS_PROVIDER = "factus";
const ALANUBE_PROVIDER = "alanube";
// itcycle-api-dian: iTCycle's own "software propio" DIAN engine (see
// itcycleDian.service.js) - unlike Factus/Alanube, this is a proveedor
// tecnológico Ohnix's own company built and operates, not a third party.
const ITCYCLE_PROVIDER = "itcycle";
const TERMINAL_STATUSES = ["accepted", "cancelled"];

// Ohnix operates exclusively as DIAN "software propio". Provider values on
// old invoices remain useful historical metadata, but company configuration
// can no longer route new documents to a third party.
const providerFor = () => ITCYCLE_PROVIDER;

// DIAN's standard correction-concept catalog for credit notes. Verify these
// codes against the Factus sandbox response/docs before relying on them in
// production - Factus may expose its own catalog endpoint.
export const CREDIT_NOTE_CONCEPT_CODES = [
    { code: "1", labelKey: "partial_return" },
    { code: "2", labelKey: "cancellation" },
    { code: "3", labelKey: "discount" },
    { code: "4", labelKey: "price_adjustment" },
    { code: "5", labelKey: "other" },
];

// Only these concepts represent goods actually coming back - "discount" and
// "price_adjustment" are financial corrections where the customer keeps the
// product, so issuing one must never add stock back (confirmed as a
// business decision, not inferred - see the "Devoluciones y Ajustes"
// analysis, Fase 3).
const RESTOCK_CONCEPT_CODES = ["1", "2"];

const toNumber = (value) => {
    const result = Number(value);
    return Number.isFinite(result) ? Number(result.toFixed(2)) : 0;
};
const money = (value) => toNumber(value).toFixed(2);
const text = (value) => `${value || ""}`.trim();

// Every item below reads taxTreatmentApplied/taxRateApplied/taxAmount off
// the OrderDetail row, not off the live Product/Company - those three
// columns are frozen once, at order creation (order.service.js#
// computeOrderTotals), already resolved against both the product's
// classification and the company's VAT responsibility at that moment. This
// is what stops a later product tax-rate edit, or a company's VAT status
// changing, from silently rewriting the tax on a document already sold.
//
// "exento" (ET art. 477/478/481) still carries the VAT tax code, just at a
// 0% rate - unlike "excluido" (art. 424/476), which drops the tax code
// entirely.
const taxesForItem = (item) => {
    if (item.taxTreatmentApplied === "excluded") return [{ is_excluded: true }];
    const rate = item.taxTreatmentApplied === "exempt" ? "0.00" : money(item.taxRateApplied);
    return [{ code: item.product.taxCode, rate }];
};

// A financial-only credit note (discount/price_adjustment/other) has no
// specific OrderDetail behind it - the customer keeps the goods, there's
// just a monetary amount and an optional applicable tax rate. Rather than
// writing separate item-building logic per provider, this fabricates one
// object matching the exact shape taxesForItem/buildAlanubeItems/
// buildItcycleLines already consume (an OrderDetail joined with its
// product), so all three keep working completely unchanged.
const buildFinancialCreditNoteDetail = ({ amount, taxRate, description }) => {
    const rate = Number(taxRate) || 0;
    const value = Number(amount) || 0;
    const taxAmount = rate > 0 ? Number(((value * rate) / 100).toFixed(2)) : 0;
    return {
        quantity: 1,
        unitcost: value,
        total: value,
        taxTreatmentApplied: rate > 0 ? "taxed" : "excluded",
        taxRateApplied: rate,
        taxAmount,
        product: {
            productCode: "AJUSTE",
            productName: description || "Ajuste financiero",
            unitMeasureCode: "94",
            standardCode: "999",
            taxCode: "01",
        },
    };
};

// The official Factus V2 collection sends numbering_range_id as a bare JSON
// number for bills/credit notes created against legacy numeric ranges (e.g.
// 389), but some other document types (payrolls) show ULID-style string IDs
// - normalize numeric-looking values to a real number and leave anything
// else (e.g. a ULID) as a string, since we can't assume every account's
// ranges are numeric.
const toNumberingRangeId = (value) => {
    const trimmed = text(value);
    return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
};

const normalizeProviderStatus = (value) => {
    const status = text(value).toLowerCase();
    if (["accepted", "approved", "valid", "success", "issued"].includes(status)) return "accepted";
    if (["rejected", "declined", "invalid"].includes(status)) return "rejected";
    if (["cancelled", "canceled", "void"].includes(status)) return "cancelled";
    return "submitted";
};

const pickFactusEnvelope = (raw) => raw?.data || raw?.result || raw || {};
const mapFactusResponse = (raw) => {
    const envelope = pickFactusEnvelope(raw);
    const bill = envelope.bill || envelope.document || envelope;
    return {
        externalId: text(bill.id || bill.uuid || bill.document_id || bill.track_id) || null,
        invoiceNumber: text(bill.number || bill.invoice_number || bill.consecutive) || null,
        cufe: text(bill.cufe || bill.cufe_code) || null,
        qrUrl: text(bill.qr_url || bill.qrUrl) || null,
        pdfUrl: text(bill.pdf_url || bill.pdfUrl) || null,
        xmlUrl: text(bill.xml_url || bill.xmlUrl) || null,
        status: normalizeProviderStatus(bill.status || bill.state || raw?.status || raw?.state),
        rawResponse: raw,
    };
};

const mapFactusCreditNoteResponse = (raw) => {
    const envelope = pickFactusEnvelope(raw);
    const note = envelope.credit_note || envelope.document || envelope.bill || envelope;
    return {
        externalId: text(note.id || note.uuid || note.document_id || note.track_id) || null,
        creditNoteNumber: text(note.number || note.credit_note_number || note.consecutive) || null,
        cufe: text(note.cufe || note.cude || note.cufe_code) || null,
        pdfUrl: text(note.pdf_url || note.pdfUrl) || null,
        xmlUrl: text(note.xml_url || note.xmlUrl) || null,
        status: normalizeProviderStatus(note.status || note.state || raw?.status || raw?.state),
        rawResponse: raw,
    };
};

const serializeCreditNote = (note) => !note ? null : ({
    id: note.id, invoiceId: note.invoiceId, correctionConceptCode: note.correctionConceptCode,
    referenceCode: note.referenceCode, status: note.status, externalId: note.externalId,
    creditNoteNumber: note.creditNoteNumber, cufe: note.cufe, pdfUrl: note.pdfUrl, xmlUrl: note.xmlUrl,
    certificateId: note.certificateId, certificateProvider: note.certificateProvider,
    observation: note.observation, errorMessage: note.errorMessage, issuedAt: note.issuedAt,
    localEffectStatus: note.localEffectStatus, localEffectError: note.localEffectError,
    localEffectAttempts: note.localEffectAttempts, localEffectAppliedAt: note.localEffectAppliedAt,
    createdAt: note.createdAt, updatedAt: note.updatedAt,
});

const canManageOrder = (order, userId, role) => role === "admin" || order.createdById === userId;

const fiscalErrorsForOrder = (order) => {
    const errors = [];
    const company = order.createdBy?.company;
    const customer = order.customer;
    if (!company?.electronicInvoicingEnabled) errors.push("company.electronicInvoicingEnabled must be enabled");
    if (!company?.vatResponsible || company.vatResponsible === "unset") {
        errors.push("company.vatResponsible must be set to responsible or not_responsible before issuing a DIAN document (ET art. 437)");
    }
    if (!text(company?.factusNumberingRangeId)) errors.push("company.factusNumberingRangeId is required");
    for (const field of ["identificationDocumentCode", "identification", "legalOrganizationCode", "tributeCode", "municipalityCode"]) {
        if (!text(customer?.[field])) errors.push(`customer.${field} is required`);
    }
    if (!order.orderDetails?.length) errors.push("order must have at least one item");
    for (const item of order.orderDetails || []) {
        const label = item.product?.productCode || item.productId;
        if (!text(item.product?.unitMeasureCode)) errors.push(`product ${label}: unitMeasureCode is required`);
        if (!text(item.product?.standardCode)) errors.push(`product ${label}: standardCode is required`);
        if (item.taxTreatmentApplied !== "excluded" && !text(item.product?.taxCode)) {
            errors.push(`product ${label}: taxCode is required`);
        }
    }
    return errors;
};

const buildFactusPayload = (order) => {
    const errors = fiscalErrorsForOrder(order);
    if (errors.length) throw new ApiError(422, "Fiscal data is incomplete for Factus V2", errors);

    const company = order.createdBy.company;
    const customer = order.customer;
    const referenceCode = order.invoiceNo;
    const customerPayload = {
        identification_document_code: customer.identificationDocumentCode,
        identification: customer.identification,
        address: customer.address || undefined,
        email: customer.email || undefined,
        phone: customer.phone || undefined,
        legal_organization_code: customer.legalOrganizationCode,
        tribute_code: customer.tributeCode,
        country_code: normalizeCountryCode(customer.countryCode) || "CO",
        municipality_code: customer.municipalityCode,
    };
    if (customer.legalOrganizationCode === "1") {
        customerPayload.company = customer.name;
        customerPayload.trade_name = customer.storeName || customer.name;
    } else {
        customerPayload.names = customer.name;
    }

    return {
        reference_code: referenceCode,
        document: company.factusDocumentType,
        numbering_range_id: toNumberingRangeId(company.factusNumberingRangeId),
        operation_type: company.factusOperationType,
        send_email: false,
        payment_details: [{
            payment_form: company.factusPaymentForm,
            payment_method_code: company.factusPaymentMethodCode,
            reference_code: referenceCode,
            amount: money(order.total),
        }],
        cash_rounding_amount: "0.00",
        observation: `Orden Ohnix ${referenceCode}`,
        customer: customerPayload,
        items: order.orderDetails.map((item) => ({
            code_reference: item.product.productCode || item.productId,
            name: item.product.productName,
            quantity: Number(item.quantity).toFixed(2),
            discount_rate: "0.00",
            price: money(item.unitcost),
            unit_measure_code: item.product.unitMeasureCode,
            standard_code: item.product.standardCode,
            taxes: taxesForItem(item),
        })),
    };
};

// ---------------------------------------------------------------------------
// Alanube (Alegra e-provider) mapping. UNVERIFIED against a live sandbox
// response as of 2026-08-05 (no Alanube credentials issued yet) - built from
// developer.alanube.co/v1.0-COL's published schemas. Before relying on this
// in production, confirm at least: identificationType/organizationType/
// taxCode.id values match Ohnix's DIAN-catalog customer fields 1:1 (they
// appear to, since Factus's identification_document_code/legal_organization_
// code/tribute_code already use DIAN's own catalogs), and that
// customer.address.city really expects municipalityCode as sent (docs only
// describe it as "city", not explicitly the DIVIPOLA code).
const buildAlanubeCustomerPayload = (customer) => {
    const organizationType = customer.legalOrganizationCode === "1" ? 1 : 2;
    const payload = {
        name: customer.name,
        organizationType,
        identificationType: customer.identificationDocumentCode,
        identificationNumber: customer.identification,
        taxCode: customer.tributeCode ? { id: customer.tributeCode } : undefined,
        email: customer.email || undefined,
        phone: customer.phone || undefined,
        address: {
            address: customer.address || "N/A",
            city: text(customer.municipalityCode),
        },
    };
    if (organizationType === 1) payload.tradeName = customer.storeName || customer.name;
    return payload;
};

const buildAlanubeItems = (orderDetails) => orderDetails.map((item) => {
    const quantity = toNumber(item.quantity);
    const price = toNumber(item.unitcost);
    const subtotal = toNumber(quantity * price);
    const taxAmount = toNumber(item.taxAmount);
    return {
        code: item.product.productCode || item.productId,
        standardCode: { identificationId: "999", id: item.product.standardCode },
        description: item.product.productName,
        price,
        quantity,
        unitCode: item.product.unitMeasureCode,
        subtotal,
        taxAmount,
        total: toNumber(subtotal + taxAmount),
        taxes: item.taxTreatmentApplied === "excluded"
            ? []
            : [{ taxCode: item.product.taxCode, taxAmount, taxPercentage: money(item.taxRateApplied) }],
    };
});

const buildAlanubeTotals = (items) => {
    const grossTotal = toNumber(items.reduce((sum, item) => sum + item.subtotal, 0));
    const taxTotal = toNumber(items.reduce((sum, item) => sum + item.taxAmount, 0));
    return {
        grossTotal,
        taxableTotal: grossTotal,
        taxTotal,
        discountTotal: 0,
        chargeTotal: 0,
        advanceTotal: 0,
        payableTotal: toNumber(grossTotal + taxTotal),
        currencyCode: "COP",
    };
};

const buildAlanubePayments = (company) => [{
    paymentForm: company.factusPaymentForm === "2" ? "2" : "1",
    paymentMethod: company.factusPaymentMethodCode,
}];

const alanubeFiscalErrors = (order) => {
    const errors = [];
    const company = order.createdBy?.company;
    const customer = order.customer;
    if (!company?.electronicInvoicingEnabled) errors.push("company.electronicInvoicingEnabled must be enabled");
    if (!company?.vatResponsible || company.vatResponsible === "unset") {
        errors.push("company.vatResponsible must be set to responsible or not_responsible before issuing a DIAN document (ET art. 437)");
    }
    if (!text(company?.alanubeCompanyId)) errors.push("company.alanubeCompanyId is required - register the company with Alanube first");
    if (!company?.alanubeInvoiceResolution?.resolutionNumber) errors.push("company.alanubeInvoiceResolution is required");
    for (const field of ["identificationDocumentCode", "identification", "legalOrganizationCode", "tributeCode", "municipalityCode"]) {
        if (!text(customer?.[field])) errors.push(`customer.${field} is required`);
    }
    if (!order.orderDetails?.length) errors.push("order must have at least one item");
    for (const item of order.orderDetails || []) {
        const label = item.product?.productCode || item.productId;
        if (!text(item.product?.unitMeasureCode)) errors.push(`product ${label}: unitMeasureCode is required`);
        if (!text(item.product?.standardCode)) errors.push(`product ${label}: standardCode is required`);
        if (item.taxTreatmentApplied !== "excluded" && !text(item.product?.taxCode)) {
            errors.push(`product ${label}: taxCode is required`);
        }
    }
    return errors;
};

// Claims the next document number for a company inside a resolution's
// [minNumber, maxNumber] range, persisting the counter in the same
// transaction the invoice/credit-note record is written in so two concurrent
// issuances never get the same number.
const claimAlanubeNumber = async (tx, { companyId, counterField, resolution }) => {
    if (!resolution?.minNumber) throw new ApiError(422, "A numbering resolution with minNumber/maxNumber is required");
    const company = await tx.company.findUnique({ where: { id: companyId }, select: { [counterField]: true } });
    const next = company[counterField] ?? Number(resolution.minNumber);
    if (next > Number(resolution.maxNumber)) {
        throw new ApiError(409, "Alanube numbering range exhausted for this company - request a new DIAN resolution");
    }
    await tx.company.update({ where: { id: companyId }, data: { [counterField]: next + 1 } });
    return next;
};

const buildAlanubePayload = (order, { number }) => {
    const errors = alanubeFiscalErrors(order);
    if (errors.length) throw new ApiError(422, "Fiscal data is incomplete for Alanube", errors);

    const company = order.createdBy.company;
    const resolution = company.alanubeInvoiceResolution;
    const items = buildAlanubeItems(order.orderDetails);

    return {
        documentType: "01",
        number,
        resolution: {
            resolutionNumber: resolution.resolutionNumber,
            prefix: resolution.prefix,
            minNumber: Number(resolution.minNumber),
            maxNumber: Number(resolution.maxNumber),
            startDate: resolution.startDate,
            endDate: resolution.endDate,
            technicalKey: resolution.technicalKey,
        },
        company: { id: company.alanubeCompanyId },
        customer: buildAlanubeCustomerPayload(order.customer),
        items,
        totalAmounts: buildAlanubeTotals(items),
        payments: buildAlanubePayments(company),
    };
};

const pickAlanubeEnvelope = (raw) => raw?.data || raw || {};

const normalizeAlanubeStatus = (status, legalStatus) => {
    const ls = text(legalStatus).toUpperCase();
    if (["ACCEPTED", "ACCEPTED_WITH_OBSERVATIONS"].includes(ls)) return "accepted";
    if (ls === "REJECTED") return "rejected";
    if (text(status).toUpperCase() === "FAILED") return "rejected";
    return "submitted";
};

const mapAlanubeResponse = (raw) => {
    const doc = pickAlanubeEnvelope(raw);
    return {
        externalId: text(doc.id) || null,
        invoiceNumber: text(doc.fullNumber || doc.number) || null,
        cufe: text(doc.cufe || doc.cude) || null,
        qrUrl: text(doc.qrCodeContent) || null,
        pdfUrl: text(doc.pdfFileName) || null,
        xmlUrl: text(doc.xmlFileName) || null,
        status: normalizeAlanubeStatus(doc.status, doc.legalStatus),
        rawResponse: raw,
    };
};

const buildAlanubeCreditNotePayload = (order, invoice, company, { conceptCode, observation, items, amount, taxRate }, number) => {
    const productsByOrderDetailId = new Map((order.orderDetails || []).map((detail) => [detail.id, detail]));
    // Restock concepts: the caller-picked lines. Financial-only concepts
    // (no items): a single synthetic line from amount/taxRate - NOT the
    // whole order, which is what this used to silently fall back to (a real
    // bug: a "discount" credit note issued via Alanube with no items ended
    // up crediting the entire order).
    const sourceDetails = Array.isArray(items) && items.length
        ? items.map(({ orderDetailId, quantity }) => {
            const detail = productsByOrderDetailId.get(orderDetailId);
            return detail ? { ...detail, quantity: quantity || detail.quantity } : null;
        }).filter(Boolean)
        : amount != null
            ? [buildFinancialCreditNoteDetail({ amount, taxRate, description: observation })]
            : [];

    const lineItems = buildAlanubeItems(sourceDetails);
    const resolution = company.alanubeCreditNoteResolution || company.alanubeInvoiceResolution;

    return {
        documentType: "91",
        number,
        prefix: resolution?.prefix,
        conceptCode,
        company: { id: company.alanubeCompanyId },
        customer: buildAlanubeCustomerPayload(order.customer),
        items: lineItems,
        totalAmounts: buildAlanubeTotals(lineItems),
        payments: buildAlanubePayments(company),
        note: observation ? [observation] : undefined,
        // "Reference to original invoice with date, documentType, number,
        // prefix, and uuid" per Alanube's docs - mandatory for documentType
        // 91. uuid is the original invoice's cufe.
        associatedDocuments: [{
            documentType: "01",
            number: invoice.invoiceNumber,
            uuid: invoice.cufe,
            date: invoice.issuedAt ? invoice.issuedAt.toISOString().slice(0, 10) : undefined,
        }],
    };
};

const mapAlanubeCreditNoteResponse = (raw) => {
    const doc = pickAlanubeEnvelope(raw);
    return {
        externalId: text(doc.id) || null,
        creditNoteNumber: text(doc.fullNumber || doc.number) || null,
        cufe: text(doc.cude || doc.cufe) || null,
        pdfUrl: text(doc.pdfFileName) || null,
        xmlUrl: text(doc.xmlFileName) || null,
        status: normalizeAlanubeStatus(doc.status, doc.legalStatus),
        rawResponse: raw,
    };
};
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// itcycle-api-dian mapping. The supplier (emisor) profile is NOT built here -
// it lives entirely in itcycle-api-dian's own DianConfiguration, set once at
// provisioning time (registerCompanyWithItcycle below) - only the customer,
// line items, and totals are built per-request, matching the UBL-oriented
// InvoiceInput shape dian-kit expects (see itcycle-api-dian's
// dian-engine/packages/sdk-node/src/types.ts), not Factus/Alanube's flatter
// payload shape.
//
// KNOWN GAP: dian-kit's Address requires cityName/departmentCode/
// departmentName/postalZone, none of which Ohnix's Customer model stores
// today (only municipalityCode + free-text address) - departmentCode is
// derived from the DIVIPOLA prefix of municipalityCode, everything else
// falls back to a placeholder. Confirm against a real DIAN sandbox response
// before relying on this in production - same caveat this file already
// carries for the Alanube mapping above.
export const buildItcyclePartyAddress = (municipalityCode, streetAddress) => {
    const code = text(municipalityCode) || "11001";
    const departmentCode = code.slice(0, 2) || "11";
    return {
        street: streetAddress || "N/A",
        cityCode: code,
        cityName: code,
        departmentCode,
        departmentName: departmentCode,
        countryCode: "CO",
        postalZone: "000000",
    };
};

// Named "CustomerParty" for the sales-side call sites - reused unchanged for
// Documento Soporte, where it's fed a Supplier (see purchaseSupportDocument.
// service.js), since it only reads generic name/identification/address
// fields, not anything Order/Customer-specific.
export const buildItcycleCustomerParty = (customer) => {
    const address = buildItcyclePartyAddress(customer.municipalityCode, customer.address);
    return {
        name: customer.name,
        identification: { number: customer.identification, type: customer.identificationDocumentCode },
        personType: customer.legalOrganizationCode,
        // Ohnix doesn't collect a separate DIAN fiscal-responsibility code for
        // customers - "R-99-PN" ("no aplica") is the same default dian-kit's
        // own basic-invoice.ts example uses for a generic buyer.
        fiscalResponsibilities: ["R-99-PN"],
        taxInfo: {
            registrationName: customer.name,
            companyId: { number: customer.identification, type: customer.identificationDocumentCode },
            taxLevelCode: "R-99-PN",
            taxScheme: { code: customer.tributeCode || "01" },
            address,
        },
        address,
        email: customer.email || undefined,
    };
};

// Consumes generic {quantity, unitcost, taxTreatmentApplied, taxRateApplied,
// taxAmount, product:{unitMeasureCode, productName, taxCode}} rows - reused
// unchanged for PurchaseDetail (see purchaseSupportDocument.service.js),
// which carries the exact same field set/names as OrderDetail.
export const buildItcycleLines = (orderDetails) => orderDetails.map((item, index) => {
    const quantity = toNumber(item.quantity);
    const price = toNumber(item.unitcost);
    const lineExtensionAmount = toNumber(quantity * price);
    const taxAmount = toNumber(item.taxAmount);
    return {
        id: `${index + 1}`,
        quantity,
        unitCode: item.product.unitMeasureCode,
        description: item.product.productName,
        price,
        lineExtensionAmount,
        // dian-kit's own InvoiceLineSchema requires >=1 entry here
        // unconditionally (z.array(TaxTotalSchema).min(1)) - a "bien
        // excluido" (taxTreatmentApplied "excluded") is still IVA at 0%,
        // just not the same as omitting the tax block entirely. An empty
        // array here isn't "no tax to declare", it's an invalid document -
        // confirmed by DIAN habilitación runs failing every "excluded" line
        // with "lines[0].taxTotals: Too small: expected array to have >=1
        // items" before this ever reached DIAN's own server.
        taxTotals: [{
            taxAmount,
            subtotals: [{
                taxableAmount: lineExtensionAmount,
                taxAmount,
                percent: toNumber(item.taxRateApplied),
                taxScheme: { code: item.product.taxCode },
            }],
        }],
    };
});

// Was `buildItcycleTotals(order, lines)`, using order.total for
// payableAmount - correct for a full invoice (every line IS the order) but
// wrong for a credit note built from a subset of lines (or a single
// synthetic financial-only line), where it silently reported the whole
// order's total instead of the credit note's own. taxInclusiveAmount below
// is already derived purely from `lines`, so payableAmount now just reuses
// that instead of taking a second, inconsistent value from `order` - self-
// consistent for both callers (a full invoice's lines already sum to
// order.total anyway).
//
// Tax subtotals are grouped by (taxScheme.code, percent) instead of blended
// into one fake "effective rate" - DIAN validates TaxAmount = TaxableAmount x
// Percent against its own rate catalog per cac:TaxSubtotal, so an order
// mixing 19% and 5% lines used to produce one invented ~12% subtotal that
// fails that check outright (and silently fed a wrong value into the CUFE
// input too, since only taxTotals[0] is used there). One cac:TaxTotal per
// distinct tax code (IVA/INC/ICA), each holding one cac:TaxSubtotal per
// distinct rate within that code - correct for the common single-rate case
// and for any future multi-rate/multi-tax-type order alike.
export const buildItcycleTotals = (lines) => {
    const lineExtensionAmount = toNumber(lines.reduce((sum, l) => sum + l.lineExtensionAmount, 0));

    const subtotalsByCode = new Map();
    for (const line of lines) {
        for (const subtotal of line.taxTotals[0]?.subtotals || []) {
            const code = subtotal.taxScheme.code;
            const key = `${code}|${subtotal.percent}`;
            const existing = subtotalsByCode.get(key);
            if (existing) {
                existing.taxableAmount = toNumber(existing.taxableAmount + subtotal.taxableAmount);
                existing.taxAmount = toNumber(existing.taxAmount + subtotal.taxAmount);
            } else {
                subtotalsByCode.set(key, { ...subtotal });
            }
        }
    }

    const byCode = new Map();
    for (const subtotal of subtotalsByCode.values()) {
        const code = subtotal.taxScheme.code;
        if (!byCode.has(code)) byCode.set(code, []);
        byCode.get(code).push(subtotal);
    }
    const taxTotals = [...byCode.values()].map((subtotals) => ({
        taxAmount: toNumber(subtotals.reduce((sum, s) => sum + s.taxAmount, 0)),
        subtotals,
    }));
    const taxTotal = toNumber(taxTotals.reduce((sum, t) => sum + t.taxAmount, 0));
    const taxInclusiveAmount = toNumber(lineExtensionAmount + taxTotal);

    return {
        taxTotals,
        legalMonetaryTotal: {
            lineExtensionAmount,
            taxExclusiveAmount: lineExtensionAmount,
            taxInclusiveAmount,
            allowanceTotalAmount: 0,
            chargeTotalAmount: 0,
            prepaidAmount: 0,
            payableAmount: taxInclusiveAmount,
        },
    };
};

// Same customer/product checks fiscalErrorsForOrder does, minus
// company.factusNumberingRangeId (Factus-specific - itcycle-api-dian's
// numbering lives entirely in its own database, already validated there by
// loadDianConfig at issuance time). company.itcycleCompanyId/
// itcycleApiKeyCiphertext are checked by the caller before this ever runs.
const itcycleFiscalErrors = (order) => {
    const errors = [];
    const company = order.createdBy?.company;
    const customer = order.customer;
    if (!company?.electronicInvoicingEnabled) errors.push("company.electronicInvoicingEnabled must be enabled");
    if (!company?.vatResponsible || company.vatResponsible === "unset") {
        errors.push("company.vatResponsible must be set to responsible or not_responsible before issuing a DIAN document (ET art. 437)");
    }
    for (const field of ["identificationDocumentCode", "identification", "legalOrganizationCode", "tributeCode", "municipalityCode"]) {
        if (!text(customer?.[field])) errors.push(`customer.${field} is required`);
    }
    if (!order.orderDetails?.length) errors.push("order must have at least one item");
    for (const item of order.orderDetails || []) {
        const label = item.product?.productCode || item.productId;
        if (!text(item.product?.unitMeasureCode)) errors.push(`product ${label}: unitMeasureCode is required`);
        if (!text(item.product?.standardCode)) errors.push(`product ${label}: standardCode is required`);
        if (item.taxTreatmentApplied !== "excluded" && !text(item.product?.taxCode)) {
            errors.push(`product ${label}: taxCode is required`);
        }
    }
    return errors;
};

// itcycle-api-dian (via dian-kit) defaults every send() to the PRODUCTION
// method (SendBillSync) unless told otherwise - DIAN's own sandbox rejects
// that outright for a company still going through habilitación ("En
// proceso"), which only accepts SendTestSetAsync + the exact testSetId DIAN
// issued for that qualification round. company.itcycleTestSetId is null once
// DIAN approves the software, so this naturally falls back to the default
// production method with no further change needed at that point.
export const buildItcycleSendOptions = (company) =>
    text(company?.itcycleTestSetId) ? { method: "SendTestSetAsync", testSetId: company.itcycleTestSetId } : undefined;

// Retenciones (ReteFuente/ReteICA/ReteIVA - TaxCode 06/07/05) - a flat rate
// configured per customer (Customer.withholdingIncomePercent/
// withholdingIcaPercent/withholdingVatPercent - named after
// WithholdingTaxType.income/ica/vat, the same enum PurchaseRetention/
// WithholdingConcept use for the opposite direction: what Ohnix withholds
// paying a supplier, vs. this - what a customer withholds paying Ohnix), set
// only for known self-withholding-agent buyers ("agente autorretenedor");
// most customers have none configured, in which case this returns an empty
// array and the document carries no withholding at all. Deliberately a flat
// configured rate, not an automatic DIAN concept/UVT-threshold engine -
// those depend on transaction concept and per-period thresholds this system
// doesn't model, and unlike PurchaseRetention this never posts a ChartAccount
// journal entry of Ohnix's own - what the customer withholds is the
// customer's bookkeeping, not Ohnix's.
//
// withholdingIncome/withholdingIca apply to the pre-tax sale amount
// (lineExtensionAmount, i.e. WithholdingBaseType.subtotal); withholdingVat
// applies to the IVA amount itself (WithholdingBaseType.vat), not the sale
// amount - see itcycleFiscalErrors' sibling comment for why these three live
// on Customer rather than Order (a rate is a property of WHO you're selling
// to, not of any one sale).
export const buildItcycleWithholdingTotals = (customer, legalMonetaryTotal, taxTotals) => {
    // Plain Number(), not toNumber() - toNumber truncates to 2 decimals for
    // MONEY amounts, but a real ICA rate is routinely more precise than that
    // (e.g. 0.966%, 0.414%) - rounding the rate itself would silently change
    // it to a different, wrong percentage before it's ever multiplied by
    // anything.
    const incomePercent = customer?.withholdingIncomePercent != null ? Number(customer.withholdingIncomePercent) : null;
    const icaPercent = customer?.withholdingIcaPercent != null ? Number(customer.withholdingIcaPercent) : null;
    const vatPercent = customer?.withholdingVatPercent != null ? Number(customer.withholdingVatPercent) : null;
    if (!incomePercent && !icaPercent && !vatPercent) return [];

    const saleBase = legalMonetaryTotal.lineExtensionAmount;
    const ivaBase = taxTotals
        .filter((t) => t.subtotals.some((s) => s.taxScheme.code === "01"))
        .reduce((sum, t) => sum + t.taxAmount, 0);

    const withholdingTotals = [];
    const addWithholding = (percent, code, name, base) => {
        if (!percent || !base) return;
        const amount = toNumber(base * (percent / 100));
        withholdingTotals.push({ taxAmount: amount, subtotals: [{ taxableAmount: base, taxAmount: amount, percent, taxScheme: { code, name } }] });
    };
    addWithholding(incomePercent, "06", "ReteRenta", saleBase);
    addWithholding(icaPercent, "07", "ReteICA", saleBase);
    addWithholding(vatPercent, "05", "ReteIVA", ivaBase);
    return withholdingTotals;
};

const buildItcyclePayload = (order) => {
    const errors = itcycleFiscalErrors(order);
    if (errors.length) throw new ApiError(422, "Fiscal data is incomplete for itcycle-api-dian", errors);

    const lines = buildItcycleLines(order.orderDetails);
    const { taxTotals, legalMonetaryTotal } = buildItcycleTotals(lines);
    const withholdingTaxTotals = buildItcycleWithholdingTotals(order.customer, legalMonetaryTotal, taxTotals);
    const now = new Date();

    return {
        issueDate: now.toISOString(),
        issueTime: now.toISOString(),
        customer: buildItcycleCustomerParty(order.customer),
        lines,
        taxTotals,
        ...(withholdingTaxTotals.length ? { withholdingTaxTotals } : {}),
        legalMonetaryTotal,
        // "10" = Contado, "30" = Transferencia - same values Alanube's
        // buildAlanubePayments already sends for company.factusPaymentMethodCode.
        paymentMeans: { paymentForm: "1", paymentMethod: order.createdBy.company.factusPaymentMethodCode || "10" },
    };
};

// itcycle-api-dian's own Invoice.status values (see its Invoice model):
// PENDING/PROCESSING/SENT are all still in flight from Ohnix's point of view.
export const normalizeItcycleStatus = (status) => {
    const value = text(status).toUpperCase();
    if (value === "ACCEPTED") return "accepted";
    if (value === "REJECTED") return "rejected";
    if (value === "ERROR") return "error";
    if (value === "CONTINGENCY") return "contingency";
    return "submitted";
};

const mapItcycleResponse = (raw) => ({
    externalId: text(raw?.id) || null,
    invoiceNumber: text(raw?.invoiceNumber) || null,
    cufe: text(raw?.cufe) || null,
    // itcycle-api-dian doesn't generate qrUrl/pdfUrl/xmlUrl (it stores the
    // signed XML internally, see its DocumentXmlStore) - null here is
    // accurate, not a missing mapping, same as any other provider gap.
    qrUrl: null,
    pdfUrl: null,
    xmlUrl: null,
    status: normalizeItcycleStatus(raw?.status),
    // Present on itcycle-api-dian's response via its own `include: {
    // certificate: true }` - a company can have certificates from more than
    // one provider active at once (see certificateProviderOverride).
    certificateId: text(raw?.certificateId) || null,
    certificateProvider: text(raw?.certificate?.provider) || null,
    rawResponse: raw,
});

const buildItcycleCreditNotePayload = (order, { conceptCode, observation, items, amount, taxRate }) => {
    const productsByOrderDetailId = new Map((order.orderDetails || []).map((detail) => [detail.id, detail]));
    // Same fallback fix as buildAlanubeCreditNotePayload - a financial-only
    // concept with no items now produces a single synthetic line instead of
    // silently crediting the whole order.
    const sourceDetails = Array.isArray(items) && items.length
        ? items.map(({ orderDetailId, quantity }) => {
            const detail = productsByOrderDetailId.get(orderDetailId);
            return detail ? { ...detail, quantity: quantity || detail.quantity } : null;
        }).filter(Boolean)
        : amount != null
            ? [buildFinancialCreditNoteDetail({ amount, taxRate, description: observation })]
            : [];

    const lines = buildItcycleLines(sourceDetails);
    const { taxTotals, legalMonetaryTotal } = buildItcycleTotals(lines);
    const withholdingTaxTotals = buildItcycleWithholdingTotals(order.customer, legalMonetaryTotal, taxTotals);
    const now = new Date();

    return {
        document: {
            issueDate: now.toISOString(),
            issueTime: now.toISOString(),
            customer: buildItcycleCustomerParty(order.customer),
            lines,
            taxTotals,
            ...(withholdingTaxTotals.length ? { withholdingTaxTotals } : {}),
            legalMonetaryTotal,
            paymentMeans: { paymentForm: "1", paymentMethod: order.createdBy.company.factusPaymentMethodCode || "10" },
            notes: observation ? [observation] : undefined,
        },
        discrepancyResponse: {
            // DIAN correction-concept catalog (CREDIT_NOTE_CONCEPT_CODES above)
            // matches itcycle-api-dian's own discrepancyResponse.responseCode 1:1
            // - both ultimately encode the same DIAN Anexo Tecnico codes.
            responseCode: conceptCode,
            description: observation || "Nota credito Ohnix",
        },
    };
};

const mapItcycleCreditNoteResponse = (raw) => ({
    externalId: text(raw?.id) || null,
    creditNoteNumber: text(raw?.noteNumber) || null,
    cufe: text(raw?.cufe) || null,
    pdfUrl: null,
    xmlUrl: null,
    status: normalizeItcycleStatus(raw?.status),
    certificateId: text(raw?.certificateId) || null,
    certificateProvider: text(raw?.certificate?.provider) || null,
    rawResponse: raw,
});

/**
 * Provisions a new Company end-to-end in itcycle-api-dian (create company ->
 * DIAN configuration -> numbering resolution(s) -> certificate -> API key),
 * then stores only the itcycle-side companyId and the encrypted API key on
 * Ohnix's own Company row. The certificate .p12/password and the raw API key
 * are forwarded once and never persisted in Ohnix - see secretEncryption.js
 * and itcycle-api-dian's own EncryptedFileCertificateSecretStore.
 */
export const registerCompanyWithItcycle = async ({ companyId, dianConfiguration, supplierProfile, numberingResolutions, certificate }) => {
    if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian is not configured for this environment");
    // Each Ohnix client is its own "facturador electrónico" before the DIAN -
    // every company registers its OWN softwareId/PIN/technicalKey (obtained
    // from its own DIAN habilitación), never a value shared across companies.
    // See ElectronicInvoicingSettings.jsx's software step and the compliance
    // discussion that led to this: reusing one habilitación across different
    // companies' NITs is the Proveedor Tecnológico modality, which Ohnix has
    // not registered for.
    if (!text(dianConfiguration?.softwareId) || !text(dianConfiguration?.softwarePin)) {
        throw new ApiError(422, "La configuración DIAN de tu empresa (softwareId/softwarePin) es obligatoria.");
    }

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new ApiError(404, "Company not found");
    if (normalizeCountryCode(company.countryCode) !== "CO") {
        throw new ApiError(422, "Electronic invoicing with DIAN requires a company configured in Colombia");
    }
    if (!text(company.taxIdentification)) {
        throw new ApiError(422, "company.taxIdentification (NIT) is required before provisioning with itcycle-api-dian");
    }

    const dv = text(company.taxIdentificationDv) || computeNitCheckDigit(company.taxIdentification);

    let itcycleCompany;
    try {
        itcycleCompany = await provisionItcycleCompany({
            name: company.legalName || company.name,
            nit: company.taxIdentification,
            dv,
            personType: "1",
        });
        await setItcycleDianConfiguration({ companyId: itcycleCompany.id, ...dianConfiguration, supplierProfile });
        for (const resolution of numberingResolutions || []) {
            await createItcycleNumberingResolution({ companyId: itcycleCompany.id, ...resolution });
        }
        if (certificate) {
            await uploadItcycleCertificate({ companyId: itcycleCompany.id, ...certificate });
        }
        const rawApiKey = await createItcycleApiKey({ companyId: itcycleCompany.id, label: `Ohnix - ${company.name}` });
        if (!rawApiKey) throw new Error("itcycle-api-dian did not return an API key");

        const updated = await prisma.company.update({
            where: { id: companyId },
            data: {
                taxIdentificationDv: dv,
                itcycleCompanyId: itcycleCompany.id,
                dianSoftwareId: dianConfiguration.softwareId,
                itcycleApiKeyCiphertext: encryptSecret(rawApiKey),
                electronicInvoicingProvider: ITCYCLE_PROVIDER,
                // Provisioning the DIAN tenant and being able to issue are
                // different milestones. A FirmaPass certificate is issued
                // asynchronously, and a sandbox setup can deliberately be
                // created without one. Do not expose issuance until a
                // usable certificate has been installed; self-service then
                // activates it explicitly once FirmaPass reports ACTIVE.
                electronicInvoicingEnabled: Boolean(certificate),
            },
        });

        return { companyId: updated.id, itcycleCompanyId: updated.itcycleCompanyId };
    } catch (error) {
        const providerPayload = error instanceof ItcycleDianError ? error.payload : null;
        throw new ApiError(502, error.message || "Failed to provision company with itcycle-api-dian", providerPayload ? [providerPayload] : undefined);
    }
};

/**
 * Registers ONE additional itcycle-api-dian numbering resolution (e.g.
 * documentType "05" for Documento Soporte) for an already-provisioned
 * company, without going through registerCompanyWithItcycle's full
 * orchestration. Deliberately separate: createNumberingResolution on
 * itcycle-api-dian's side is NOT idempotent (unlike createCompany/
 * setDianConfiguration), so re-running the full wizard would silently
 * create a duplicate "01" resolution every time - this action only ever
 * adds the one resolution the caller asks for.
 */
export const addItcycleNumberingResolutionForCompany = async ({ companyId, documentType, prefix, resolutionNumber, startNumber, endNumber, startDate, endDate }) => {
    if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian is not configured for this environment");

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new ApiError(404, "Company not found");
    if (!text(company.itcycleCompanyId)) {
        throw new ApiError(422, "Company must be provisioned with itcycle-api-dian before adding a numbering resolution");
    }

    try {
        return await createItcycleNumberingResolution({ companyId: company.itcycleCompanyId, documentType, prefix, resolutionNumber, startNumber, endNumber, startDate, endDate });
    } catch (error) {
        const providerPayload = error instanceof ItcycleDianError ? error.payload : null;
        throw new ApiError(502, error.message || "Failed to add numbering resolution with itcycle-api-dian", providerPayload ? [providerPayload] : undefined);
    }
};

// Self-service correction, restricted to "91"/"92" (nota crédito/débito) -
// unlike "01"/"05", DIAN never issues or validates those two, so fixing a
// typo here can't desync anything DIAN itself has on record (see
// NumberingResolutionForm's autoAssignPrefix comment in
// ElectronicInvoicingSettings.jsx). itcycle-api-dian's own
// updateNumberingResolution additionally refuses this once any document has
// claimed a number from the resolution - that failure surfaces as-is here.
export const updateItcycleNumberingResolutionForCompany = async ({ companyId, resolutionId, prefix, resolutionNumber, startNumber, endNumber, startDate, endDate }) => {
    if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian is not configured for this environment");

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new ApiError(404, "Company not found");
    if (!text(company.itcycleCompanyId)) {
        throw new ApiError(422, "Company must be provisioned with itcycle-api-dian before editing a numbering resolution");
    }

    let readiness;
    try {
        readiness = await getCompanyDianReadiness({ companyId });
    } catch (error) {
        throw new ApiError(502, error.message || "Failed to verify the numbering resolution with itcycle-api-dian");
    }
    const resolution = (readiness?.resolutions || []).find((r) => r.id === resolutionId);
    if (!resolution) throw new ApiError(404, "Numbering resolution not found");
    if (resolution.documentType !== "91" && resolution.documentType !== "92") {
        throw new ApiError(403, "Solo las resoluciones de nota crédito/débito se pueden editar aquí - las de factura o documento soporte quedaron registradas ante la DIAN y requieren soporte.");
    }

    try {
        return await updateItcycleNumberingResolution({ companyId: company.itcycleCompanyId, resolutionId, prefix, resolutionNumber, startNumber, endNumber, startDate, endDate });
    } catch (error) {
        const providerPayload = error instanceof ItcycleDianError ? error.payload : null;
        throw new ApiError(502, error.message || "Failed to update numbering resolution with itcycle-api-dian", providerPayload ? [providerPayload] : undefined);
    }
};
// ---------------------------------------------------------------------------

const getOrderWithRelations = (orderId) => prisma.order.findFirst({
    where: { OR: [{ id: orderId }, { legacyMongoId: orderId }] },
    include: {
        customer: true,
        orderDetails: { include: { product: true } },
        createdBy: { select: { id: true, companyId: true, company: true } },
        electronicInvoice: { include: { events: { orderBy: { createdAt: "asc" } } } },
    },
});

const serializeEvent = (event) => ({
    id: event.id,
    eventType: event.eventType,
    status: event.status,
    createdAt: event.createdAt,
});

const serialize = (invoice) => !invoice ? null : ({
    id: invoice.id, orderId: invoice.orderId, countryCode: invoice.countryCode,
    provider: invoice.provider, status: invoice.status, referenceCode: invoice.referenceCode,
    externalId: invoice.externalId, invoiceNumber: invoice.invoiceNumber, cufe: invoice.cufe,
    qrUrl: invoice.qrUrl, pdfUrl: invoice.pdfUrl, xmlUrl: invoice.xmlUrl,
    certificateId: invoice.certificateId, certificateProvider: invoice.certificateProvider,
    errorMessage: invoice.errorMessage, issuedAt: invoice.issuedAt,
    createdAt: invoice.createdAt, updatedAt: invoice.updatedAt,
    events: Array.isArray(invoice.events) ? invoice.events.map(serializeEvent) : undefined,
});

export const getElectronicInvoiceForOrder = async ({ orderId, requesterUserId, requesterRole }) => {
    const order = await getOrderWithRelations(orderId);
    if (!order) throw new ApiError(404, "Order not found");
    if (!canManageOrder(order, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to access this order");
    return { orderId: order.id, invoiceNo: order.invoiceNo, companyCountryCode: normalizeCountryCode(order.createdBy?.company?.countryCode), electronicInvoice: serialize(order.electronicInvoice) };
};

// Everything electronicInvoicePdf.service.js's renderElectronicInvoicePdf
// needs, pre-authorized. itcycle-only for now: Alanube/Factus never
// populated a local pdfUrl either, but per project decision those two are
// legacy/never-launched (see project memory) - not worth building this for.
export const getElectronicInvoicePdfContext = async ({ orderId, requesterUserId, requesterRole }) => {
    const order = await getOrderWithRelations(orderId);
    if (!order) throw new ApiError(404, "Order not found");
    if (!canManageOrder(order, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to access this order");
    const invoice = order.electronicInvoice;
    if (!invoice || invoice.provider !== ITCYCLE_PROVIDER) {
        throw new ApiError(404, "This order has no itcycle-api-dian electronic invoice");
    }
    if (!invoice.cufe || !invoice.invoiceNumber) {
        throw new ApiError(409, "This invoice has not been assigned a CUFE/number yet - it cannot be represented graphically");
    }
    return { order, invoice, company: order.createdBy.company };
};

export const listElectronicInvoices = async ({ requesterUserId, requesterRole, status, search }) => {
    const requester = await prisma.user.findUnique({
        where: { id: requesterUserId },
        select: { company: { select: { countryCode: true } } },
    });
    if (normalizeCountryCode(requester?.company?.countryCode) !== "CO") {
        throw new ApiError(404, "Electronic invoicing is available only for Colombia companies");
    }
    const where = {
        ...(requesterRole === "admin" ? {} : { order: { createdById: requesterUserId } }),
        ...(status ? { status } : {}),
        ...(search ? { OR: [
            { referenceCode: { contains: search, mode: "insensitive" } },
            { invoiceNumber: { contains: search, mode: "insensitive" } },
            { cufe: { contains: search, mode: "insensitive" } },
        ] } : {}),
    };
    const invoices = await prisma.electronicInvoice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
            order: { select: { invoiceNo: true, total: true, customer: { select: { name: true } } } },
            events: { orderBy: { createdAt: "asc" } },
        },
    });
    return invoices.map((invoice) => ({ ...serialize(invoice), order: invoice.order ? { invoiceNo: invoice.order.invoiceNo, total: Number(invoice.order.total), customerName: invoice.order.customer?.name || null } : null }));
};

const claimInvoice = async ({ order, payload, provider }) => {
    const existing = order.electronicInvoice;
    if (existing && (TERMINAL_STATUSES.includes(existing.status) || ["submitted", "issuing"].includes(existing.status))) return { invoice: existing, claimed: false };
    const data = {
        countryCode: "CO", provider, status: "issuing", rawRequest: payload,
        fiscalSnapshot: { company: order.createdBy.company, customer: order.customer, items: order.orderDetails },
        errorMessage: null,
    };
    if (existing) {
        const result = await prisma.electronicInvoice.updateMany({ where: { id: existing.id, status: { in: ["draft", "error", "rejected"] } }, data });
        if (!result.count) return { invoice: await prisma.electronicInvoice.findUnique({ where: { id: existing.id } }), claimed: false };
        const invoice = await prisma.electronicInvoice.findUnique({ where: { id: existing.id } });
        await prisma.electronicInvoiceEvent.create({ data: { electronicInvoiceId: invoice.id, eventType: "issuance_claimed", status: "issuing", payload } });
        return { invoice, claimed: true };
    }
    try {
        const invoice = await prisma.electronicInvoice.create({ data: { orderId: order.id, companyId: order.createdBy.company.id, referenceCode: order.invoiceNo, ...data } });
        await prisma.electronicInvoiceEvent.create({ data: { electronicInvoiceId: invoice.id, eventType: "issuance_claimed", status: "issuing", payload } });
        return { invoice, claimed: true };
    } catch (error) {
        if (error.code !== "P2002") throw error;
        return { invoice: await prisma.electronicInvoice.findUnique({ where: { orderId: order.id } }), claimed: false };
    }
};

export const issueElectronicInvoiceForOrder = async ({ orderId, requesterUserId, requesterRole, trigger = "manual" }) => {
    const order = await getOrderWithRelations(orderId);
    if (!order) throw new ApiError(404, "Order not found");
    if (!canManageOrder(order, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to issue this order invoice");
    if (order.orderStatus !== "completed") throw new ApiError(409, "Electronic invoicing is only available for completed orders");
    if (normalizeCountryCode(order.createdBy?.company?.countryCode) !== "CO") throw new ApiError(409, "Electronic invoicing requires an explicitly configured Colombia company");
    // Gated on the order owner's plan (not the requester's) - an admin
    // issuing on someone's behalf still costs that company's Alanube usage.
    await ensureElectronicInvoicingPlan(order.createdById);

    const company = order.createdBy.company;
    const provider = providerFor(company);

    if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian integration is not configured for this environment");
    if (!text(company.itcycleCompanyId) || !text(company.itcycleApiKeyCiphertext)) {
        throw new ApiError(422, "This company has not been provisioned with itcycle-api-dian yet");
    }
    const apiKey = decryptSecret(company.itcycleApiKeyCiphertext);
    const invoicePayload = buildItcyclePayload(order);
    const claim = await claimInvoice({ order, payload: invoicePayload, provider });
    const submit = () => createItcycleInvoice({ apiKey, internalReference: order.invoiceNo, invoice: invoicePayload, send: buildItcycleSendOptions(company) }).then(mapItcycleResponse);

    if (!claim.claimed) return { reused: true, trigger, countryCode: "CO", invoice: serialize(claim.invoice) };
    try {
        const mapped = await submit();
        const invoice = await prisma.$transaction(async (tx) => {
            const updated = await tx.electronicInvoice.update({ where: { id: claim.invoice.id }, data: { ...mapped, errorMessage: null, issuedAt: mapped.status === "accepted" ? new Date() : null } });
            await tx.electronicInvoiceEvent.create({ data: { electronicInvoiceId: updated.id, eventType: "provider_response", status: updated.status, payload: mapped.rawResponse } });
            return updated;
        });
        return { reused: false, trigger, countryCode: "CO", invoice: serialize(invoice) };
    } catch (error) {
        const providerPayload = error instanceof FactusError || error instanceof AlanubeError || error instanceof ItcycleDianError ? error.payload : null;
        const invoice = await prisma.$transaction(async (tx) => {
            const updated = await tx.electronicInvoice.update({ where: { id: claim.invoice.id }, data: { status: "error", rawResponse: providerPayload, errorMessage: error.message || `Unknown ${provider} error` } });
            await tx.electronicInvoiceEvent.create({ data: { electronicInvoiceId: updated.id, eventType: "provider_error", status: "error", payload: providerPayload } });
            return updated;
        });
        throw new ApiError(502, invoice.errorMessage);
    }
};

export const syncElectronicInvoiceStatus = async ({ orderId, requesterUserId, requesterRole }) => {
    const order = await getOrderWithRelations(orderId);
    if (!order) throw new ApiError(404, "Order not found");
    if (!canManageOrder(order, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to access this order");

    const invoice = order.electronicInvoice;
    if (!invoice) throw new ApiError(404, "This order has no electronic invoice to sync");
    // "contingency" is itcycle-only (see the branch below) - included here so
    // the sync/retry-send button in the UI can actually resolve it.
    if (!["issuing", "submitted", "contingency"].includes(invoice.status)) {
        throw new ApiError(409, `Electronic invoice status "${invoice.status}" cannot be synced`);
    }
    const provider = invoice.provider;
    if (provider !== ITCYCLE_PROVIDER) {
        throw new ApiError(409, "Los documentos históricos de proveedores heredados son de solo lectura.", [], "", "unsupported_legacy_einvoicing_provider");
    }

    try {
        if (!invoice.externalId) throw new ApiError(409, "This invoice does not have a provider id yet");
        if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian integration is not configured for this environment");
        const company = order.createdBy.company;
        if (!text(company.itcycleApiKeyCiphertext)) throw new ApiError(422, "This company has not been provisioned with itcycle-api-dian yet");
        const apiKey = decryptSecret(company.itcycleApiKeyCiphertext);
        const mapped = invoice.status === "contingency"
            ? mapItcycleResponse(await retryItcycleInvoiceSend({ apiKey, id: invoice.externalId, send: buildItcycleSendOptions(company) }))
            : mapItcycleResponse(await getItcycleInvoiceStatus({ apiKey, id: invoice.externalId }));
        const updated = await prisma.$transaction(async (tx) => {
            const updatedInvoice = await tx.electronicInvoice.update({
                where: { id: invoice.id },
                data: {
                    ...mapped,
                    errorMessage: mapped.status === "rejected" ? "Invoice rejected by provider" : null,
                    issuedAt: mapped.status === "accepted" ? new Date() : invoice.issuedAt,
                },
            });
            await tx.electronicInvoiceEvent.create({ data: { electronicInvoiceId: updatedInvoice.id, eventType: "manual_sync", status: updatedInvoice.status, payload: mapped.rawResponse } });
            return updatedInvoice;
        });
        return { invoice: serialize(updated) };
    } catch (error) {
        const providerPayload = error instanceof FactusError || error instanceof AlanubeError || error instanceof ItcycleDianError ? error.payload : null;
        await prisma.electronicInvoiceEvent.create({
            data: {
                electronicInvoiceId: invoice.id,
                eventType: "manual_sync_error",
                status: invoice.status,
                payload: providerPayload || { message: error.message },
            },
        });
        throw new ApiError(502, error.message || `Failed to sync invoice status with ${provider}`);
    }
};

const buildCreditNotePayload = (order, invoice, company, { conceptCode, observation, items, amount, taxRate }) => {
    const referenceCode = `${invoice.referenceCode}-CN-${Date.now().toString(36).toUpperCase()}`;
    const productsByOrderDetailId = new Map(
        (order.orderDetails || []).map((detail) => [detail.id, detail])
    );

    const payload = {
        reference_code: referenceCode,
        // Per the official Factus V2 Postman collection, a credit note links
        // to the original invoice via "bill_number" - there is no bill_id or
        // reference-code based lookup.
        bill_number: invoice.invoiceNumber,
        // DIAN's UBL customization ID catalog for credit notes (Anexo
        // Tecnico Factura Electronica de Venta, Resolucion 000012 de 2021):
        // "20" = credit note that references an electronic invoice. Every
        // credit note Ohnix issues is against an already-accepted
        // electronic invoice (enforced above), so "20" is the only value
        // that ever applies here - it is not a per-request choice, unlike
        // correction_concept_code. Confirmed against the official Factus
        // Postman collection's own example, which always sends "20".
        customization_id: "20",
        numbering_range_id: toNumberingRangeId(company.factusCreditNoteNumberingRangeId),
        correction_concept_code: conceptCode,
        payment_method_code: company.factusPaymentMethodCode,
        observation: observation || `Nota credito Ohnix ${referenceCode}`,
    };

    // Restock concepts build from the caller-picked lines, same as before.
    // Financial-only concepts (no items) now send a single synthetic line
    // from amount/taxRate instead of leaving payload.items unset entirely -
    // Factus's real API requirement for at least one credit-note item was
    // never actually confirmed either way, so a real line is the safer path
    // regardless.
    const sourceDetails = Array.isArray(items) && items.length
        ? items.map(({ orderDetailId, quantity }) => {
            const detail = productsByOrderDetailId.get(orderDetailId);
            return detail ? { ...detail, quantity: quantity || detail.quantity } : null;
        }).filter(Boolean)
        : amount != null
            ? [buildFinancialCreditNoteDetail({ amount, taxRate, description: observation })]
            : [];

    if (sourceDetails.length) {
        payload.items = sourceDetails.map((detail) => ({
            code_reference: detail.product.productCode || detail.productId,
            name: detail.product.productName,
            quantity: Number(detail.quantity).toFixed(2),
            price: money(detail.unitcost),
            unit_measure_code: detail.product.unitMeasureCode,
            standard_code: detail.product.standardCode,
            taxes: taxesForItem(detail),
        }));
    }

    return payload;
};

// Mirrors order.service.js#processReturn's stock-crediting step exactly
// (same optimistic claim on OrderDetail, same "fully returned" check to
// flip the order to "returned"), but triggered by an accepted credit note
// instead of a direct user action - see the try/catch around this call in
// issueCreditNoteForInvoice for why a failure here doesn't fail the whole
// request. `items` here is the same { orderDetailId, quantity } shape the
// caller already validated against each line's pending quantity before the
// document was ever sent to the provider.
const applyCreditNoteRestock = async ({ order, items, creditNoteId, userId }) => {
    const detailById = new Map(order.orderDetails.map((d) => [d.id, d]));

    const { lines, orderFullyReturned } = await prisma.$transaction(async (tx) => {
        const lines = [];
        const journalLines = [];

        for (const { orderDetailId, quantity } of items) {
            const detail = detailById.get(orderDetailId);
            const qty = Number(quantity);

            const costing = await creditLocationStockWithCost(tx, {
                productId: detail.product.id,
                pointOfSaleId: order.pointOfSaleId,
                quantity: qty,
                incomingUnitCost: Number(detail.costBasisApplied ?? detail.product.buyingPrice),
            });

            await recordStockMovement(tx, {
                productId: detail.product.id,
                accountId: detail.product.createdById,
                pointOfSaleId: order.pointOfSaleId,
                delta: qty,
                balanceAfter: costing.balanceAfter,
                unitCostApplied: costing.unitCostApplied,
                valueDelta: costing.valueDelta,
                valueBalanceAfter: costing.valueBalanceAfter,
                sourceType: "credit_note_restock",
                sourceId: creditNoteId,
                createdById: userId,
            });

            const refundNow = qty * Number(detail.unitcost);

            // Same optimistic claim as processReturn - the pending-quantity
            // read that fed the pre-submission validation predates this
            // transaction (and predates the real provider round-trip), so it
            // can't by itself stop a concurrent return on the same line.
            const detailClaim = await tx.orderDetail.updateMany({
                where: { id: detail.id, returnedQuantity: detail.returnedQuantity },
                data: {
                    returnDate: new Date(),
                    returnedQuantity: { increment: qty },
                    refundAmount: { increment: refundNow },
                },
            });

            if (detailClaim.count === 0) {
                throw new ApiError(
                    409,
                    `"${detail.product.productName}" was returned by another request after this credit note's document was already issued.`
                );
            }

            lines.push({ order_detail_id: orderDetailId, returned_now: qty, refund_now: refundNow });
            // Pushed only after the claim above succeeds, same reasoning as
            // order.service.js's return/cancellation branches.
            journalLines.push({
                quantity: qty,
                unitcost: detail.unitcost,
                taxRateApplied: detail.taxRateApplied,
                costBasisApplied: detail.costBasisApplied ?? detail.product.buyingPrice,
            });
        }

        const allDetails = await tx.orderDetail.findMany({
            where: { orderId: order.id },
            select: { quantity: true, returnedQuantity: true },
        });
        const orderFullyReturned = allDetails.every((d) => d.returnedQuantity === d.quantity);

        if (orderFullyReturned) {
            await tx.order.updateMany({
                where: { id: order.id, orderStatus: "completed" },
                data: { orderStatus: "returned", updatedById: userId },
            });
        }

        // Posted inside this same tx, alongside the stock restock above -
        // both commit or both roll back together, keeping stock and the
        // ledger in sync with each other even if this local effect fails
        // (the outer try/catch around this whole function already tolerates
        // that without invalidating the DIAN document itself - see this
        // function's own header comment, unchanged by this).
        await postOrderReturnJournalEntry(tx, {
            accountId: order.createdById,
            createdById: userId,
            sourceType: "credit_note_restock",
            sourceId: creditNoteId,
            entryDate: new Date(),
            description: "Nota crédito con devolución de mercancía",
            lines: journalLines,
            thirdParty: buildAccountingThirdParty("customer", order.customer),
            pointOfSaleId: order.pointOfSaleId,
        });

        return { lines, orderFullyReturned };
    });

    return {
        applied: true,
        order_fully_returned: orderFullyReturned,
        total_refund_amount: lines.reduce((sum, l) => sum + l.refund_now, 0),
        lines,
    };
};

// Financial-only credit note (discount/price_adjustment/other) - no stock or
// OrderDetail effect at all (the customer keeps the goods), just the
// accounting side: reuses postOrderReturnJournalEntry (Fase 4b) unchanged,
// passing no buyingPrice so its Inventarios/Costo de ventas lines net to
// zero and get dropped by recordJournalEntry, leaving only Cr Clientes /
// Dr Ingresos / Dr IVA generado - exactly what a pure financial adjustment
// should post. Same "own transaction, own try/catch at the caller" pattern
// as applyCreditNoteRestock, for the same reason: the DIAN document is
// already real by the time this runs.
const postFinancialCreditNoteJournalEntry = async ({ order, amount, taxRate, creditNoteId, userId }) => {
    await prisma.$transaction((tx) =>
        postOrderReturnJournalEntry(tx, {
            accountId: order.createdById,
            createdById: userId,
            sourceType: "credit_note_financial",
            sourceId: creditNoteId,
            entryDate: new Date(),
            description: "Nota crédito financiera",
            lines: [{ quantity: 1, unitcost: amount, taxRateApplied: taxRate || 0 }],
            thirdParty: buildAccountingThirdParty("customer", order.customer),
            pointOfSaleId: order.pointOfSaleId,
        })
    );
    return { applied: true };
};

export const calculateCreditNoteRemainingBase = ({ orderDetails = [], acceptedCreditNotes = [] }) => {
    const remainingByRate = new Map();
    const detailById = new Map(orderDetails.map((detail) => [detail.id, detail]));

    // returnedQuantity is the local source of truth for completed physical
    // returns, including successfully applied restock credit notes.
    for (const detail of orderDetails) {
        const rate = toNumber(detail.taxRateApplied);
        const remainingQuantity = Math.max(Number(detail.quantity) - Number(detail.returnedQuantity || 0), 0);
        const base = toNumber(remainingQuantity * Number(detail.unitcost));
        remainingByRate.set(rate, toNumber((remainingByRate.get(rate) || 0) + base));
    }

    for (const note of acceptedCreditNotes) {
        const payload = note.localEffectPayload;
        if (!payload) continue;

        if (payload.kind === "financial") {
            const rate = toNumber(payload.taxRate);
            remainingByRate.set(rate, toNumber(Math.max((remainingByRate.get(rate) || 0) - Number(payload.amount || 0), 0)));
            continue;
        }

        // An accepted restock note whose local effect is still pending/failed
        // has already reduced the fiscal invoice but is not reflected in
        // returnedQuantity yet. Subtract it here exactly once.
        if (payload.kind === "restock" && note.localEffectStatus !== "applied") {
            for (const item of payload.items || []) {
                const detail = detailById.get(item.orderDetailId);
                if (!detail) continue;
                const rate = toNumber(detail.taxRateApplied);
                const base = toNumber(Number(item.quantity || 0) * Number(detail.unitcost));
                remainingByRate.set(rate, toNumber(Math.max((remainingByRate.get(rate) || 0) - base, 0)));
            }
        }
    }

    return Object.fromEntries([...remainingByRate.entries()].map(([rate, base]) => [String(rate), base]));
};

const updateCreditNoteLocalEffect = async (creditNoteId, { status, error = null, appliedAt = null }) => {
    try {
        return await prisma.electronicCreditNote.update({
            where: { id: creditNoteId },
            data: {
                localEffectStatus: status,
                localEffectError: error,
                localEffectAppliedAt: appliedAt,
                localEffectAttempts: { increment: 1 },
            },
        });
    } catch (stateError) {
        // Never let a failure recording the local-effect state fall into the
        // provider catch below and relabel an already accepted DIAN document
        // as a fiscal error. A still-pending row remains discoverable/retryable.
        console.error("[credit-note] failed to persist local effect state:", {
            creditNoteId,
            status,
            message: stateError?.message || stateError,
        });
        return null;
    }
};

export const issueCreditNoteForInvoice = async ({ orderId, requesterUserId, requesterRole, conceptCode, observation, items, amount, taxRate }) => {
    if (!text(conceptCode)) throw new ApiError(400, "conceptCode is required to issue a credit note");

    const order = await getOrderWithRelations(orderId);
    if (!order) throw new ApiError(404, "Order not found");
    if (!canManageOrder(order, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to issue a credit note for this order");

    const invoice = order.electronicInvoice;
    if (!invoice) throw new ApiError(404, "This order has no electronic invoice");
    if (invoice.status !== "accepted") throw new ApiError(409, "A credit note can only be issued for an accepted electronic invoice");
    if (!invoice.invoiceNumber) throw new ApiError(409, "This invoice does not have a provider bill number yet");
    await ensureElectronicInvoicingPlan(order.createdById);

    const acceptedCreditNotes = await prisma.electronicCreditNote.findMany({
        where: { invoiceId: invoice.id, status: "accepted" },
        select: { localEffectPayload: true, localEffectStatus: true },
    });
    if (acceptedCreditNotes.some((note) => !note.localEffectPayload)) {
        throw new ApiError(
            409,
            "This invoice has historical credit notes without a normalized balance payload and requires reconciliation before another note can be issued",
            [],
            "",
            "credit_note_history_requires_reconciliation"
        );
    }

    // Validated before anything is sent to the provider - a doomed-to-fail
    // restock should never let a real DIAN document go out first. Only
    // concepts that mean goods are physically coming back require items;
    // the other three (discount/price_adjustment/other) instead require a
    // monetary amount - there's no OrderDetail behind them, so a flat amount
    // (+ optional applicable tax rate) is the only way to know what the
    // note is worth (see buildFinancialCreditNoteDetail).
    if (RESTOCK_CONCEPT_CODES.includes(conceptCode)) {
        if (!Array.isArray(items) || items.length === 0) {
            throw new ApiError(
                400,
                "At least one return line is required for this credit note concept",
                [],
                "",
                "credit_note_items_required"
            );
        }

        const detailIds = items.map((l) => l.orderDetailId?.toString()).filter(Boolean);
        const uniqueDetailIds = [...new Set(detailIds)];
        if (detailIds.length !== items.length || uniqueDetailIds.length !== detailIds.length) {
            throw new ApiError(400, "Duplicate or missing orderDetailId in credit note items");
        }

        const detailById = new Map(order.orderDetails.map((d) => [d.id, d]));
        const fiscallyCreditedPendingByDetail = new Map();
        for (const note of acceptedCreditNotes) {
            const payload = note.localEffectPayload;
            if (payload?.kind !== "restock" || note.localEffectStatus === "applied") continue;
            for (const line of payload.items || []) {
                fiscallyCreditedPendingByDetail.set(
                    line.orderDetailId,
                    Number(fiscallyCreditedPendingByDetail.get(line.orderDetailId) || 0) + Number(line.quantity || 0)
                );
            }
        }
        const insufficientItems = [];
        for (const line of items) {
            const detail = detailById.get(line.orderDetailId);
            if (!detail) {
                throw new ApiError(400, "One or more credit note items do not belong to this order");
            }
            const quantity = Number(line.quantity);
            if (!Number.isInteger(quantity) || quantity < 1) {
                throw new ApiError(400, "Quantity must be a positive integer for every credit note item");
            }
            const pending = detail.quantity - detail.returnedQuantity - Number(fiscallyCreditedPendingByDetail.get(detail.id) || 0);
            if (quantity > pending) {
                insufficientItems.push({
                    order_detail_id: detail.id,
                    product_id: toExternalId(detail.product),
                    product_name: detail.product.productName,
                    requested: quantity,
                    available: Math.max(pending, 0),
                    reason: "exceeds_pending_quantity",
                });
            }
        }

        if (insufficientItems.length > 0) {
            throw new ApiError(
                422,
                "One or more credit note items exceed what can be returned",
                insufficientItems
            );
        }
    } else {
        const normalizedAmount = Number(amount);
        const normalizedTaxRate = Number(taxRate || 0);
        if (!(normalizedAmount > 0)) {
            throw new ApiError(400, "A positive amount is required for this credit note concept", [], "", "credit_note_amount_required");
        }
        if (!Number.isFinite(normalizedTaxRate) || normalizedTaxRate < 0 || normalizedTaxRate > 100) {
            throw new ApiError(400, "taxRate must be between 0 and 100", [], "", "credit_note_tax_rate_invalid");
        }

        const remainingByRate = calculateCreditNoteRemainingBase({
            orderDetails: order.orderDetails,
            acceptedCreditNotes,
        });
        const availableBase = Number(remainingByRate[String(toNumber(normalizedTaxRate))] || 0);
        if (toNumber(normalizedAmount) > availableBase) {
            throw new ApiError(
                422,
                "The financial credit note exceeds the remaining creditable base for this tax rate",
                [{ tax_rate: toNumber(normalizedTaxRate), requested_base: toNumber(normalizedAmount), available_base: availableBase }],
                "",
                "credit_note_amount_exceeds_remaining_base"
            );
        }
    }

    const company = order.createdBy.company;
    const provider = invoice.provider;

    // Ohnix is registered and operated exclusively as software propio through
    // itcycle-api-dian. Legacy provider rows may still exist in old databases,
    // but no new fiscal document may branch into those dormant integrations.
    if (provider !== ITCYCLE_PROVIDER) {
        throw new ApiError(409, "Ohnix solo admite notas crédito mediante software propio (itcycle-api-dian).", [], "", "unsupported_legacy_einvoicing_provider");
    }

    const localEffectPayload = RESTOCK_CONCEPT_CODES.includes(conceptCode)
        ? {
              kind: "restock",
              items: items.map((item) => ({ orderDetailId: item.orderDetailId, quantity: Number(item.quantity) })),
          }
        : { kind: "financial", amount: toNumber(amount), taxRate: toNumber(taxRate || 0) };

    let payload;
    let submit;
    if (provider === FACTUS_PROVIDER) {
        if (!isFactusConfigured()) throw new ApiError(503, "Factus integration is not configured for this environment");
        if (!text(company?.factusCreditNoteNumberingRangeId)) {
            // Factus requires a dedicated numbering range per document type
            // (invoices = document code 21, credit notes = 22) - they cannot
            // share company.factusNumberingRangeId.
            throw new ApiError(422, "company.factusCreditNoteNumberingRangeId is required to issue credit notes");
        }
        payload = buildCreditNotePayload(order, invoice, company, { conceptCode, observation, items, amount, taxRate });
        submit = () => createFactusCreditNote({ payload }).then(mapFactusCreditNoteResponse);
    } else if (provider === ITCYCLE_PROVIDER) {
        if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian integration is not configured for this environment");
        if (!text(company.itcycleApiKeyCiphertext)) throw new ApiError(422, "This company has not been provisioned with itcycle-api-dian yet");
        if (!invoice.externalId) throw new ApiError(409, "This invoice does not have an itcycle-api-dian invoice id yet");
        const apiKey = decryptSecret(company.itcycleApiKeyCiphertext);
        const creditNoteReferenceCode = `${invoice.referenceCode}-CN-${Date.now().toString(36).toUpperCase()}`;
        const itcyclePayload = buildItcycleCreditNotePayload(order, { conceptCode, observation, items, amount, taxRate });
        payload = { referenceCode: creditNoteReferenceCode, ...itcyclePayload };
        submit = () => createItcycleCreditNote({
            apiKey,
            internalReference: creditNoteReferenceCode,
            invoiceId: invoice.externalId,
            document: itcyclePayload.document,
            discrepancyResponse: itcyclePayload.discrepancyResponse,
            send: buildItcycleSendOptions(company),
        }).then(mapItcycleCreditNoteResponse);
    } else {
        if (!isAlanubeConfigured()) throw new ApiError(503, "Alanube integration is not configured for this environment");
        const resolution = company.alanubeCreditNoteResolution || company.alanubeInvoiceResolution;
        if (!resolution?.resolutionNumber) throw new ApiError(422, "company.alanubeCreditNoteResolution is required to issue credit notes");
        const number = await prisma.$transaction((tx) =>
            claimAlanubeNumber(tx, { companyId: company.id, counterField: "alanubeNextCreditNoteNumber", resolution })
        );
        payload = buildAlanubeCreditNotePayload(order, invoice, company, { conceptCode, observation, items, amount, taxRate }, number);
        submit = () => createAlanubeCreditNote({ payload }).then(mapAlanubeCreditNoteResponse);
    }

    let draft;
    try {
        draft = await prisma.electronicCreditNote.create({
            data: {
                invoiceId: invoice.id,
                correctionConceptCode: conceptCode,
                referenceCode: payload.reference_code || payload.referenceCode || `${invoice.referenceCode}-CN-${payload.number}`,
                status: "issuing",
                observation: payload.observation || observation,
                rawRequest: payload,
                localEffectPayload,
            },
        });
    } catch (error) {
        if (error?.code === "P2002") {
            throw new ApiError(409, "Another credit note for this invoice is already being processed", [], "", "credit_note_already_processing");
        }
        throw error;
    }

    try {
        const mapped = await submit();
        const updated = await prisma.$transaction(async (tx) => {
            const updatedNote = await tx.electronicCreditNote.update({
                where: { id: draft.id },
                data: {
                    ...mapped,
                    errorMessage: null,
                    issuedAt: mapped.status === "accepted" ? new Date() : null,
                    localEffectStatus: mapped.status === "accepted" ? "pending" : "not_applicable",
                },
            });
            await tx.electronicInvoiceEvent.create({
                data: { electronicInvoiceId: invoice.id, eventType: "credit_note_issued", status: invoice.status, payload: { creditNoteId: updatedNote.id, ...mapped.rawResponse } },
            });
            return updatedNote;
        });

        // Deliberately its own try/catch, separate from the tx above: by
        // this point the fiscal document already exists for real at
        // Alanube/Factus, so a failure applying the local stock effect (e.g.
        // the same line got returned through another path in the meantime)
        // must not make this request report the credit note itself as
        // failed - see applyCreditNoteRestock's own comment.
        let stockRestock = { applied: false, reason: "not_applicable" };
        if (RESTOCK_CONCEPT_CODES.includes(conceptCode) && mapped.status === "accepted") {
            try {
                stockRestock = await applyCreditNoteRestock({
                    order,
                    items,
                    creditNoteId: updated.id,
                    userId: requesterUserId,
                });
                await updateCreditNoteLocalEffect(updated.id, { status: "applied", appliedAt: new Date() });
            } catch (restockError) {
                console.error("[credit-note] stock restock failed after successful issuance:", {
                    creditNoteId: updated.id,
                    orderId: order.id,
                    message: restockError?.message || restockError,
                });
                stockRestock = { applied: false, reason: restockError?.message || "unknown_error" };
                await updateCreditNoteLocalEffect(updated.id, { status: "failed", error: restockError?.message || "unknown_error" });
            }
        } else if (mapped.status === "accepted") {
            // Financial-only concept (discount/price_adjustment/other) - no
            // stock effect, just the accounting side. Same tolerance as
            // above: the DIAN document is already real at this point, a
            // posting failure must not fail this response.
            try {
                await postFinancialCreditNoteJournalEntry({
                    order,
                    amount,
                    taxRate,
                    creditNoteId: updated.id,
                    userId: requesterUserId,
                });
                await updateCreditNoteLocalEffect(updated.id, { status: "applied", appliedAt: new Date() });
            } catch (postingError) {
                console.error("[credit-note] financial journal posting failed after successful issuance:", {
                    creditNoteId: updated.id,
                    orderId: order.id,
                    message: postingError?.message || postingError,
                });
                await updateCreditNoteLocalEffect(updated.id, { status: "failed", error: postingError?.message || "unknown_error" });
            }
        }

        const finalNote = await prisma.electronicCreditNote.findUniqueOrThrow({ where: { id: updated.id } });
        return { creditNote: serializeCreditNote(finalNote), stock_restock: stockRestock };
    } catch (error) {
        const providerPayload = error instanceof FactusError || error instanceof AlanubeError || error instanceof ItcycleDianError ? error.payload : null;
        const updated = await prisma.$transaction(async (tx) => {
            const updatedNote = await tx.electronicCreditNote.update({
                where: { id: draft.id },
                data: { status: "error", rawResponse: providerPayload, errorMessage: error.message || `Unknown ${provider} error` },
            });
            await tx.electronicInvoiceEvent.create({
                data: { electronicInvoiceId: invoice.id, eventType: "credit_note_error", status: invoice.status, payload: { creditNoteId: updatedNote.id, ...providerPayload } },
            });
            return updatedNote;
        });
        throw new ApiError(502, updated.errorMessage);
    }
};

export const listCreditNotesForInvoice = async ({ orderId, requesterUserId, requesterRole }) => {
    const order = await getOrderWithRelations(orderId);
    if (!order) throw new ApiError(404, "Order not found");
    if (!canManageOrder(order, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to access this order");

    const invoice = order.electronicInvoice;
    if (!invoice) return { creditNotes: [] };

    const creditNotes = await prisma.electronicCreditNote.findMany({
        where: { invoiceId: invoice.id },
        orderBy: { createdAt: "desc" },
    });

    return { creditNotes: creditNotes.map(serializeCreditNote) };
};

export const retryCreditNoteLocalEffect = async ({ orderId, creditNoteId, requesterUserId, requesterRole }) => {
    const order = await getOrderWithRelations(orderId);
    if (!order) throw new ApiError(404, "Order not found");
    if (!canManageOrder(order, requesterUserId, requesterRole)) {
        throw new ApiError(403, "You are not authorized to retry this credit note");
    }

    const invoice = order.electronicInvoice;
    if (!invoice) throw new ApiError(404, "This order has no electronic invoice");
    if (invoice.provider !== ITCYCLE_PROVIDER) {
        throw new ApiError(409, "Ohnix solo admite esta recuperación mediante software propio (itcycle-api-dian).", [], "", "unsupported_legacy_einvoicing_provider");
    }

    const creditNote = await prisma.electronicCreditNote.findFirst({
        where: { id: creditNoteId, invoiceId: invoice.id },
    });
    if (!creditNote) throw new ApiError(404, "Credit note not found for this order");
    if (creditNote.status !== "accepted") {
        throw new ApiError(409, "Only an accepted credit note can apply a local effect");
    }
    if (creditNote.localEffectStatus === "not_applicable") {
        throw new ApiError(409, "This credit note has no applicable local effect");
    }

    const payload = creditNote.localEffectPayload;
    if (!payload || !["restock", "financial"].includes(payload.kind)) {
        throw new ApiError(422, "This credit note has no recoverable local-effect payload", [], "", "credit_note_local_effect_payload_missing");
    }

    const sourceType = payload.kind === "restock" ? "credit_note_restock" : "credit_note_financial";
    const existingEntry = await prisma.journalEntry.findFirst({
        where: {
            sourceType,
            sourceId: creditNote.id,
            period: { createdById: order.createdById },
        },
        select: { id: true },
    });

    // The stock/detail changes and their journal entry commit in one
    // transaction. Therefore an existing entry proves the complete local
    // effect already committed; only its tracking row may have failed.
    if (existingEntry || creditNote.localEffectStatus === "applied") {
        if (creditNote.localEffectStatus !== "applied") {
            await updateCreditNoteLocalEffect(creditNote.id, { status: "applied", appliedAt: new Date() });
        }
        const current = await prisma.electronicCreditNote.findUniqueOrThrow({ where: { id: creditNote.id } });
        return { creditNote: serializeCreditNote(current), local_effect: { applied: true, already_applied: true } };
    }

    try {
        const localEffect = payload.kind === "restock"
            ? await applyCreditNoteRestock({
                  order,
                  items: payload.items,
                  creditNoteId: creditNote.id,
                  userId: requesterUserId,
              })
            : await postFinancialCreditNoteJournalEntry({
                  order,
                  amount: Number(payload.amount),
                  taxRate: Number(payload.taxRate || 0),
                  creditNoteId: creditNote.id,
                  userId: requesterUserId,
              });

        await updateCreditNoteLocalEffect(creditNote.id, { status: "applied", appliedAt: new Date() });
        const current = await prisma.electronicCreditNote.findUniqueOrThrow({ where: { id: creditNote.id } });
        return { creditNote: serializeCreditNote(current), local_effect: localEffect };
    } catch (error) {
        await updateCreditNoteLocalEffect(creditNote.id, { status: "failed", error: error?.message || "unknown_error" });
        if (error instanceof ApiError) throw error;
        throw new ApiError(500, "The credit note is accepted, but its local effect could not be applied", [], "", "credit_note_local_effect_failed");
    }
};

// Factus/Alanube implementation helpers above are retained temporarily only
// to interpret historical payload shapes while the legacy code is retired.
// No route, company setting, issuance or synchronization path can invoke
// either provider; Ohnix emits exclusively through itcycle-api-dian.
