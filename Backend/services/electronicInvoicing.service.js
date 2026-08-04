import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { createFactusInvoice, FactusError, isFactusConfigured } from "./factus.service.js";
import { normalizeCountryCode } from "./companyCountry.service.js";

const FACTUS_PROVIDER = "factus";
const TERMINAL_STATUSES = ["accepted", "cancelled"];

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
        electronicInvoice: true,
    },
});

const serialize = (invoice) => !invoice ? null : ({
    id: invoice.id, orderId: invoice.orderId, countryCode: invoice.countryCode,
    provider: invoice.provider, status: invoice.status, referenceCode: invoice.referenceCode,
    externalId: invoice.externalId, invoiceNumber: invoice.invoiceNumber, cufe: invoice.cufe,
    qrUrl: invoice.qrUrl, pdfUrl: invoice.pdfUrl, xmlUrl: invoice.xmlUrl,
    errorMessage: invoice.errorMessage, issuedAt: invoice.issuedAt,
    createdAt: invoice.createdAt, updatedAt: invoice.updatedAt,
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
        include: { order: { select: { invoiceNo: true, total: true, customer: { select: { name: true } } } } },
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
        const invoice = await prisma.electronicInvoice.update({ where: { id: claim.invoice.id }, data: { ...mapped, errorMessage: null, issuedAt: mapped.status === "accepted" ? new Date() : null } });
        await prisma.electronicInvoiceEvent.create({ data: { electronicInvoiceId: invoice.id, eventType: "provider_response", status: invoice.status, payload: mapped.rawResponse } });
        return { reused: false, trigger, countryCode: "CO", invoice: serialize(invoice) };
    } catch (error) {
        const providerPayload = error instanceof FactusError ? error.payload : null;
        const invoice = await prisma.electronicInvoice.update({ where: { id: claim.invoice.id }, data: { status: "error", rawResponse: providerPayload, errorMessage: error.message || "Unknown Factus error" } });
        await prisma.electronicInvoiceEvent.create({ data: { electronicInvoiceId: invoice.id, eventType: "provider_error", status: "error", payload: providerPayload } });
        throw new ApiError(502, invoice.errorMessage);
    }
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
    const updated = await prisma.electronicInvoice.update({ where: { id: invoice.id }, data: { status, rawResponse: payload, errorMessage: status === "rejected" ? "Invoice rejected by provider" : null, issuedAt: status === "accepted" ? new Date() : undefined } });
    await prisma.electronicInvoiceEvent.create({ data: { electronicInvoiceId: updated.id, eventType: "webhook", status, payload } });
    return { updated: true, status };
};
