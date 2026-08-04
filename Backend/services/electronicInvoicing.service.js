import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import {
    createFactusInvoice,
    createFactusCreditNote,
    getFactusInvoiceStatus,
    FactusError,
    isFactusConfigured,
} from "./factus.service.js";
import { normalizeCountryCode } from "./companyCountry.service.js";

const FACTUS_PROVIDER = "factus";
const TERMINAL_STATUSES = ["accepted", "cancelled"];

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
        numbering_range_id: company.factusNumberingRangeId,
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

const claimInvoice = async ({ order, payload }) => {
    const existing = order.electronicInvoice;
    if (existing && (TERMINAL_STATUSES.includes(existing.status) || ["submitted", "issuing"].includes(existing.status))) return { invoice: existing, claimed: false };
    const data = {
        countryCode: "CO", provider: FACTUS_PROVIDER, status: "issuing", rawRequest: payload,
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
    if (!isFactusConfigured()) throw new ApiError(503, "Factus integration is not configured for this environment");
    const payload = buildFactusPayload(order);
    const claim = await claimInvoice({ order, payload });
    if (!claim.claimed) return { reused: true, trigger, countryCode: "CO", invoice: serialize(claim.invoice) };
    try {
        const mapped = mapFactusResponse(await createFactusInvoice({ payload }));
        const invoice = await prisma.$transaction(async (tx) => {
            const updated = await tx.electronicInvoice.update({ where: { id: claim.invoice.id }, data: { ...mapped, errorMessage: null, issuedAt: mapped.status === "accepted" ? new Date() : null } });
            await tx.electronicInvoiceEvent.create({ data: { electronicInvoiceId: updated.id, eventType: "provider_response", status: updated.status, payload: mapped.rawResponse } });
            return updated;
        });
        return { reused: false, trigger, countryCode: "CO", invoice: serialize(invoice) };
    } catch (error) {
        const providerPayload = error instanceof FactusError ? error.payload : null;
        const invoice = await prisma.$transaction(async (tx) => {
            const updated = await tx.electronicInvoice.update({ where: { id: claim.invoice.id }, data: { status: "error", rawResponse: providerPayload, errorMessage: error.message || "Unknown Factus error" } });
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
    if (!invoice.invoiceNumber) {
        throw new ApiError(409, "This invoice does not have a provider invoice number yet");
    }
    if (!isFactusConfigured()) throw new ApiError(503, "Factus integration is not configured for this environment");

    try {
        const mapped = mapFactusResponse(await getFactusInvoiceStatus({ invoiceNumber: invoice.invoiceNumber }));
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
        const providerPayload = error instanceof FactusError ? error.payload : null;
        await prisma.electronicInvoiceEvent.create({
            data: {
                electronicInvoiceId: invoice.id,
                eventType: "manual_sync_error",
                status: invoice.status,
                payload: providerPayload || { message: error.message },
            },
        });
        throw new ApiError(502, error.message || "Failed to sync invoice status with Factus");
    }
};

const buildCreditNotePayload = (order, invoice, company, { conceptCode, observation, items }) => {
    const referenceCode = `${invoice.referenceCode}-CN-${Date.now().toString(36).toUpperCase()}`;
    const productsByOrderDetailId = new Map(
        (order.orderDetails || []).map((detail) => [detail.id, detail])
    );

    const payload = {
        reference_code: referenceCode,
        bill_id: invoice.externalId || undefined,
        // Factus links a credit note to the original invoice via its provider
        // number/reference - both are sent so either lookup strategy works.
        invoice_reference_code: invoice.referenceCode,
        invoice_number: invoice.invoiceNumber || undefined,
        numbering_range_id: company.factusNumberingRangeId,
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
    if (!isFactusConfigured()) throw new ApiError(503, "Factus integration is not configured for this environment");

    const company = order.createdBy.company;
    const payload = buildCreditNotePayload(order, invoice, company, { conceptCode, observation, items });

    const draft = await prisma.electronicCreditNote.create({
        data: {
            invoiceId: invoice.id,
            correctionConceptCode: conceptCode,
            referenceCode: payload.reference_code,
            status: "issuing",
            observation: payload.observation,
            rawRequest: payload,
        },
    });

    try {
        const mapped = mapFactusCreditNoteResponse(await createFactusCreditNote({ payload }));
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
        const providerPayload = error instanceof FactusError ? error.payload : null;
        const updated = await prisma.$transaction(async (tx) => {
            const updatedNote = await tx.electronicCreditNote.update({
                where: { id: draft.id },
                data: { status: "error", rawResponse: providerPayload, errorMessage: error.message || "Unknown Factus error" },
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

const validateFactusWebhookSecret = (headers) => {
    const expected = text(process.env.FACTUS_WEBHOOK_SECRET);
    const incoming = text(headers["x-factus-secret"] || headers["x-webhook-secret"]);
    return Boolean(expected && incoming && expected === incoming);
};

export const processFactusWebhook = async ({ payload = {}, headers = {} }) => {
    if (!validateFactusWebhookSecret(headers)) throw new ApiError(401, "Factus webhook authentication is not configured or is invalid");
    const data = pickFactusEnvelope(payload);
    const externalId = text(data.id || data.document_id || data.invoice_id || data.track_id);
    const invoiceNo = text(data.number || data.invoice_number);
    if (!externalId && !invoiceNo) return { updated: false, reason: "missing_external_reference" };
    const invoice = await prisma.electronicInvoice.findFirst({ where: { OR: [...(externalId ? [{ externalId }] : []), ...(invoiceNo ? [{ invoiceNumber: invoiceNo }] : [])] } });
    if (!invoice) return { updated: false, reason: "invoice_not_found" };
    const status = normalizeProviderStatus(data.status || data.state || payload.status || payload.state);
    if (TERMINAL_STATUSES.includes(invoice.status) && invoice.status !== status) return { updated: false, reason: "terminal_status" };
    await prisma.$transaction(async (tx) => {
        const updated = await tx.electronicInvoice.update({ where: { id: invoice.id }, data: { status, rawResponse: payload, errorMessage: status === "rejected" ? "Invoice rejected by provider" : null, issuedAt: status === "accepted" ? new Date() : undefined } });
        await tx.electronicInvoiceEvent.create({ data: { electronicInvoiceId: updated.id, eventType: "webhook", status, payload } });
    });
    return { updated: true, status };
};
