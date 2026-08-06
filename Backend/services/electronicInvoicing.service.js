import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import {
    createFactusInvoice,
    createFactusCreditNote,
    getFactusInvoiceStatus,
    FactusError,
    isFactusConfigured,
} from "./factus.service.js";
import {
    createAlanubeCompany,
    createAlanubeTestSet,
    createAlanubeInvoice,
    createAlanubeCreditNote,
    getAlanubeInvoiceStatus,
    AlanubeError,
    isAlanubeConfigured,
} from "./alanube.service.js";
import { computeNitCheckDigit } from "../utils/nit.util.js";
import { normalizeCountryCode } from "./companyCountry.service.js";

const FACTUS_PROVIDER = "factus";
const ALANUBE_PROVIDER = "alanube";
// Sandbox test-set id published in Alanube's onboarding guide - swap for the
// real DIAN-issued id once habilitación is completed in production.
const ALANUBE_SANDBOX_TEST_SET_ID = "a70562e0-631e-4ceb-aa65-36887b57dc17";
const TERMINAL_STATUSES = ["accepted", "cancelled"];

const providerFor = (company) => (company?.electronicInvoicingProvider === FACTUS_PROVIDER ? FACTUS_PROVIDER : ALANUBE_PROVIDER);

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

const toNumber = (value) => {
    const result = Number(value);
    return Number.isFinite(result) ? Number(result.toFixed(2)) : 0;
};
const money = (value) => toNumber(value).toFixed(2);
const text = (value) => `${value || ""}`.trim();

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
    observation: note.observation, errorMessage: note.errorMessage, issuedAt: note.issuedAt,
    createdAt: note.createdAt, updatedAt: note.updatedAt,
});

const canManageOrder = (order, userId, role) => role === "admin" || order.createdById === userId;

const fiscalErrorsForOrder = (order) => {
    const errors = [];
    const company = order.createdBy?.company;
    const customer = order.customer;
    if (!company?.electronicInvoicingEnabled) errors.push("company.electronicInvoicingEnabled must be enabled");
    if (!text(company?.factusNumberingRangeId)) errors.push("company.factusNumberingRangeId is required");
    for (const field of ["identificationDocumentCode", "identification", "legalOrganizationCode", "tributeCode", "municipalityCode"]) {
        if (!text(customer?.[field])) errors.push(`customer.${field} is required`);
    }
    if (!order.orderDetails?.length) errors.push("order must have at least one item");
    for (const item of order.orderDetails || []) {
        const label = item.product?.productCode || item.productId;
        if (!text(item.product?.unitMeasureCode)) errors.push(`product ${label}: unitMeasureCode is required`);
        if (!text(item.product?.standardCode)) errors.push(`product ${label}: standardCode is required`);
        if (!item.product?.isTaxExcluded && (!text(item.product?.taxCode) || item.product?.taxRate === null)) {
            errors.push(`product ${label}: taxCode and taxRate are required`);
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
            taxes: item.product.isTaxExcluded
                ? [{ is_excluded: true }]
                : [{ code: item.product.taxCode, rate: money(item.product.taxRate) }],
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

const buildAlanubeItems = (order) => order.orderDetails.map((item) => {
    const quantity = toNumber(item.quantity);
    const price = toNumber(item.unitcost);
    const subtotal = toNumber(quantity * price);
    const taxRate = item.product.isTaxExcluded ? 0 : toNumber(item.product.taxRate);
    const taxAmount = item.product.isTaxExcluded ? 0 : toNumber((subtotal * taxRate) / 100);
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
        taxes: item.product.isTaxExcluded
            ? []
            : [{ taxCode: item.product.taxCode, taxAmount, taxPercentage: money(taxRate) }],
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
        if (!item.product?.isTaxExcluded && (!text(item.product?.taxCode) || item.product?.taxRate === null)) {
            errors.push(`product ${label}: taxCode and taxRate are required`);
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
    const items = buildAlanubeItems(order);

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

const buildAlanubeCreditNotePayload = (order, invoice, company, { conceptCode, observation, items }, number) => {
    const productsByOrderDetailId = new Map((order.orderDetails || []).map((detail) => [detail.id, detail]));
    const sourceDetails = Array.isArray(items) && items.length
        ? items.map(({ orderDetailId, quantity }) => {
            const detail = productsByOrderDetailId.get(orderDetailId);
            return detail ? { ...detail, quantity: quantity || detail.quantity } : null;
        }).filter(Boolean)
        : order.orderDetails;

    const lineItems = buildAlanubeItems({ orderDetails: sourceDetails });
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

    const company = order.createdBy.company;
    const provider = providerFor(company);

    let claim;
    let submit;
    if (provider === FACTUS_PROVIDER) {
        if (!isFactusConfigured()) throw new ApiError(503, "Factus integration is not configured for this environment");
        const payload = buildFactusPayload(order);
        claim = await claimInvoice({ order, payload, provider });
        submit = () => createFactusInvoice({ payload }).then(mapFactusResponse);
    } else {
        if (!isAlanubeConfigured()) throw new ApiError(503, "Alanube integration is not configured for this environment");
        const resolution = company.alanubeInvoiceResolution;
        const number = await prisma.$transaction((tx) =>
            claimAlanubeNumber(tx, { companyId: company.id, counterField: "alanubeNextInvoiceNumber", resolution })
        );
        const payload = buildAlanubePayload(order, { number });
        claim = await claimInvoice({ order, payload, provider });
        submit = () => createAlanubeInvoice({ payload }).then(mapAlanubeResponse);
    }

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
        const providerPayload = error instanceof FactusError || error instanceof AlanubeError ? error.payload : null;
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
    if (!["issuing", "submitted"].includes(invoice.status)) {
        throw new ApiError(409, `Electronic invoice status "${invoice.status}" cannot be synced`);
    }
    const provider = invoice.provider;

    try {
        let mapped;
        if (provider === FACTUS_PROVIDER) {
            if (!invoice.invoiceNumber) throw new ApiError(409, "This invoice does not have a provider invoice number yet");
            if (!isFactusConfigured()) throw new ApiError(503, "Factus integration is not configured for this environment");
            mapped = mapFactusResponse(await getFactusInvoiceStatus({ invoiceNumber: invoice.invoiceNumber }));
        } else {
            if (!invoice.externalId) throw new ApiError(409, "This invoice does not have a provider id yet");
            if (!isAlanubeConfigured()) throw new ApiError(503, "Alanube integration is not configured for this environment");
            mapped = mapAlanubeResponse(await getAlanubeInvoiceStatus({ invoiceId: invoice.externalId }));
        }
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
        const providerPayload = error instanceof FactusError || error instanceof AlanubeError ? error.payload : null;
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

const buildCreditNotePayload = (order, invoice, company, { conceptCode, observation, items }) => {
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

    if (Array.isArray(items) && items.length) {
        payload.items = items
            .map(({ orderDetailId, quantity }) => {
                const detail = productsByOrderDetailId.get(orderDetailId);
                if (!detail) return null;
                return {
                    code_reference: detail.product.productCode || detail.productId,
                    name: detail.product.productName,
                    quantity: Number(quantity || detail.quantity).toFixed(2),
                    price: money(detail.unitcost),
                    unit_measure_code: detail.product.unitMeasureCode,
                    standard_code: detail.product.standardCode,
                    taxes: detail.product.isTaxExcluded
                        ? [{ is_excluded: true }]
                        : [{ code: detail.product.taxCode, rate: money(detail.product.taxRate) }],
                };
            })
            .filter(Boolean);
    }

    return payload;
};

export const issueCreditNoteForInvoice = async ({ orderId, requesterUserId, requesterRole, conceptCode, observation, items }) => {
    if (!text(conceptCode)) throw new ApiError(400, "conceptCode is required to issue a credit note");

    const order = await getOrderWithRelations(orderId);
    if (!order) throw new ApiError(404, "Order not found");
    if (!canManageOrder(order, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to issue a credit note for this order");

    const invoice = order.electronicInvoice;
    if (!invoice) throw new ApiError(404, "This order has no electronic invoice");
    if (invoice.status !== "accepted") throw new ApiError(409, "A credit note can only be issued for an accepted electronic invoice");
    if (!invoice.invoiceNumber) throw new ApiError(409, "This invoice does not have a provider bill number yet");

    const company = order.createdBy.company;
    const provider = invoice.provider;

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
        payload = buildCreditNotePayload(order, invoice, company, { conceptCode, observation, items });
        submit = () => createFactusCreditNote({ payload }).then(mapFactusCreditNoteResponse);
    } else {
        if (!isAlanubeConfigured()) throw new ApiError(503, "Alanube integration is not configured for this environment");
        const resolution = company.alanubeCreditNoteResolution || company.alanubeInvoiceResolution;
        if (!resolution?.resolutionNumber) throw new ApiError(422, "company.alanubeCreditNoteResolution is required to issue credit notes");
        const number = await prisma.$transaction((tx) =>
            claimAlanubeNumber(tx, { companyId: company.id, counterField: "alanubeNextCreditNoteNumber", resolution })
        );
        payload = buildAlanubeCreditNotePayload(order, invoice, company, { conceptCode, observation, items }, number);
        submit = () => createAlanubeCreditNote({ payload }).then(mapAlanubeCreditNoteResponse);
    }

    const draft = await prisma.electronicCreditNote.create({
        data: {
            invoiceId: invoice.id,
            correctionConceptCode: conceptCode,
            referenceCode: payload.reference_code || `${invoice.referenceCode}-CN-${payload.number}`,
            status: "issuing",
            observation: payload.observation || observation,
            rawRequest: payload,
        },
    });

    try {
        const mapped = await submit();
        const updated = await prisma.$transaction(async (tx) => {
            const updatedNote = await tx.electronicCreditNote.update({
                where: { id: draft.id },
                data: { ...mapped, errorMessage: null, issuedAt: mapped.status === "accepted" ? new Date() : null },
            });
            await tx.electronicInvoiceEvent.create({
                data: { electronicInvoiceId: invoice.id, eventType: "credit_note_issued", status: invoice.status, payload: { creditNoteId: updatedNote.id, ...mapped.rawResponse } },
            });
            return updatedNote;
        });
        return { creditNote: serializeCreditNote(updated) };
    } catch (error) {
        const providerPayload = error instanceof FactusError || error instanceof AlanubeError ? error.payload : null;
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

// Step 1+2 of Alanube's company onboarding in one call: registers the
// company (POST /companies) and immediately enables it for invoice emission
// against a test set (POST /test-sets). Uses Alanube/Alegra's shared digital
// certificate (useAlegraCertificate: true) so client companies don't need to
// buy or upload their own. Admin-only since it writes company.alanubeCompanyId.
export const registerCompanyWithAlanube = async ({ companyId, requesterRole }) => {
    if (requesterRole !== "admin") throw new ApiError(403, "Only admins can register a company with Alanube");
    if (!isAlanubeConfigured()) throw new ApiError(503, "Alanube integration is not configured for this environment");

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new ApiError(404, "Company not found");
    if (!text(company.taxIdentification)) {
        throw new ApiError(422, "company.taxIdentification (NIT) is required before registering with Alanube");
    }

    const dv = text(company.taxIdentificationDv) || computeNitCheckDigit(company.taxIdentification);

    let created;
    try {
        created = await createAlanubeCompany({
            payload: {
                name: company.legalName || company.name,
                tradeName: company.name,
                identification: company.taxIdentification,
                dv,
                useAlegraCertificate: true,
            },
        });
    } catch (error) {
        const providerPayload = error instanceof AlanubeError ? error.payload : null;
        throw new ApiError(502, error.message || "Failed to register company with Alanube", providerPayload ? [providerPayload] : undefined);
    }

    const alanubeCompanyId = text(created?.id || created?.data?.id);
    if (!alanubeCompanyId) throw new ApiError(502, "Alanube did not return a company id");

    const testSetId = text(company.alanubeTestSetId) || ALANUBE_SANDBOX_TEST_SET_ID;
    try {
        await createAlanubeTestSet({ companyId: alanubeCompanyId, type: "invoices", governmentId: testSetId });
    } catch (error) {
        const providerPayload = error instanceof AlanubeError ? error.payload : null;
        throw new ApiError(502, error.message || "Company was created in Alanube but enabling the invoice test set failed", providerPayload ? [providerPayload] : undefined);
    }

    const updated = await prisma.company.update({
        where: { id: companyId },
        data: { taxIdentificationDv: dv, alanubeCompanyId, alanubeTestSetId: testSetId },
    });

    return {
        companyId: updated.id,
        alanubeCompanyId: updated.alanubeCompanyId,
        alanubeTestSetId: updated.alanubeTestSetId,
        taxIdentificationDv: updated.taxIdentificationDv,
    };
};

// Removed processFactusWebhook/validateFactusWebhookSecret on 2026-08-04:
// the official Factus V2 Postman collection has no webhook/event-push
// endpoints anywhere, and every document creation call ("Crear y validar")
// responds synchronously with the final validation result in the same HTTP
// response body (handled by issueElectronicInvoiceForOrder/
// issueCreditNoteForInvoice already). Status can also be re-checked on
// demand via syncElectronicInvoiceStatus (GET /v2/bills/:number). If Factus
// support ever confirms a real async webhook feature exists, reintroduce
// this pair of functions plus the app.js route and FACTUS_WEBHOOK_SECRET.
