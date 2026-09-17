import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { decryptSecret } from "../utils/secretEncryption.js";
import { normalizeCountryCode } from "./companyCountry.service.js";
import { ensureUserSubscription, getEffectivePlan, getPlanFeatures } from "../middleware/pricing.middleware.js";
import {
    buildItcycleCustomerParty,
    buildItcycleLines,
    buildItcycleSendOptions,
    buildItcycleTotals,
    normalizeItcycleStatus,
} from "./electronicInvoicing.service.js";
import {
    createItcycleSupportDocument,
    getItcycleSupportDocumentStatus,
    retryItcycleSupportDocumentSend,
    ItcycleDianError,
    isItcycleConfigured,
} from "./itcycleDian.service.js";

// Purchase-side mirror of electronicInvoicing.service.js's Order/
// ElectronicInvoice orchestration, for Documento Soporte (DIAN type "05") -
// itcycle-api-dian only, no Factus/Alanube equivalent, so this file has no
// provider branching at all (unlike issueElectronicInvoiceForOrder).

const text = (value) => `${value || ""}`.trim();
const toNumber = (value) => {
    const result = Number(value);
    return Number.isFinite(result) ? Number(result.toFixed(2)) : 0;
};

const TERMINAL_STATUSES = ["accepted", "cancelled"];

const ensureElectronicInvoicingPlan = async (userId) => {
    const subscription = await ensureUserSubscription(userId);
    const effectivePlan = getEffectivePlan(subscription);
    if (!getPlanFeatures(effectivePlan).electronicInvoicing) {
        throw new ApiError(
            403,
            "Electronic invoicing is available starting on the Negocio plan. Upgrade to issue DIAN documents.",
            [],
            "",
            // Same code as electronicInvoicing.service.js's copy of this
            // check - PurchaseSupportDocuments.jsx translates it via
            // resolveApiErrorMessage instead of showing it raw.
            "electronic_invoicing_plan_required"
        );
    }
};

const canManagePurchase = (purchase, userId, role) => role === "admin" || purchase.createdById === userId;

const getPurchaseWithRelations = (purchaseId) => prisma.purchase.findFirst({
    where: { OR: [{ id: purchaseId }, { legacyMongoId: purchaseId }] },
    include: {
        supplier: true,
        purchaseDetails: { include: { product: true } },
        createdBy: { select: { id: true, companyId: true, company: true } },
        purchaseSupportDocument: { include: { events: { orderBy: { createdAt: "asc" } } } },
    },
});

const serializeEvent = (event) => ({
    id: event.id,
    eventType: event.eventType,
    status: event.status,
    createdAt: event.createdAt,
});

const serialize = (doc) => !doc ? null : ({
    id: doc.id, purchaseId: doc.purchaseId, countryCode: doc.countryCode,
    provider: doc.provider, status: doc.status, referenceCode: doc.referenceCode,
    externalId: doc.externalId, documentNumber: doc.documentNumber, cufe: doc.cufe,
    pdfUrl: doc.pdfUrl, xmlUrl: doc.xmlUrl,
    certificateId: doc.certificateId, certificateProvider: doc.certificateProvider, certificateIdentifier: doc.certificateIdentifier,
    errorMessage: doc.errorMessage, issuedAt: doc.issuedAt,
    createdAt: doc.createdAt, updatedAt: doc.updatedAt,
    events: Array.isArray(doc.events) ? doc.events.map(serializeEvent) : undefined,
});

// Same field set itcycleFiscalErrors (electronicInvoicing.service.js) checks
// on order.customer, checked here against purchase.supplier instead -
// company.factusNumberingRangeId is deliberately not checked (Factus-
// specific, this feature is itcycle-only).
const itcycleFiscalErrorsForPurchase = (purchase) => {
    const errors = [];
    const company = purchase.createdBy?.company;
    const supplier = purchase.supplier;
    if (!company?.electronicInvoicingEnabled) errors.push("company.electronicInvoicingEnabled must be enabled");
    if (!company?.vatResponsible || company.vatResponsible === "unset") {
        errors.push("company.vatResponsible must be set to responsible or not_responsible before issuing a DIAN document (ET art. 437)");
    }
    for (const field of ["identificationDocumentCode", "identification", "legalOrganizationCode", "tributeCode", "municipalityCode"]) {
        if (!text(supplier?.[field])) errors.push(`supplier.${field} is required`);
    }
    if (!purchase.purchaseDetails?.length) errors.push("purchase must have at least one item");
    for (const item of purchase.purchaseDetails || []) {
        const label = item.product?.productCode || item.productId;
        if (!text(item.product?.unitMeasureCode)) errors.push(`product ${label}: unitMeasureCode is required`);
        if (!text(item.product?.standardCode)) errors.push(`product ${label}: standardCode is required`);
        if (item.taxTreatmentApplied !== "excluded" && !text(item.product?.taxCode)) {
            errors.push(`product ${label}: taxCode is required`);
        }
    }
    return errors;
};

// IMPORTANT - party roles are reversed for Documento Soporte: itcycle-api-dian
// expects the real-world SELLER's identity in the `customer` slot (the
// company registered with itcycle-api-dian plays the real-world BUYER role,
// landing server-side in AccountingSupplierParty - nothing Ohnix needs to do
// about that side). buildItcycleCustomerParty is fed purchase.supplier here
// on purpose, not the buying company - this is correct, not a bug, even
// though the field is still literally named "customer". See itcycle-api-
// dian's own SupportDocumentInput doc comment for the DIAN technical-annex
// rationale.
const buildSupportDocumentPayload = (purchase) => {
    const errors = itcycleFiscalErrorsForPurchase(purchase);
    if (errors.length) throw new ApiError(422, "Fiscal data is incomplete for itcycle-api-dian", errors);

    const lines = buildItcycleLines(purchase.purchaseDetails);
    const { taxTotals, legalMonetaryTotal } = buildItcycleTotals(lines);
    const now = new Date();

    return {
        issueDate: now.toISOString(),
        issueTime: now.toISOString(),
        customer: buildItcycleCustomerParty(purchase.supplier),
        lines,
        taxTotals,
        legalMonetaryTotal,
        paymentMeans: { paymentForm: "1", paymentMethod: purchase.createdBy.company.factusPaymentMethodCode || "10" },
    };
};

const mapSupportDocumentResponse = (raw) => ({
    externalId: text(raw?.id) || null,
    documentNumber: text(raw?.documentNumber) || null,
    cufe: text(raw?.cufe) || null,
    pdfUrl: null,
    xmlUrl: null,
    status: normalizeItcycleStatus(raw?.status),
    certificateId: text(raw?.certificateId) || null,
    certificateProvider: text(raw?.certificate?.provider) || null,
    certificateIdentifier: text(raw?.certificate?.certificateIdentifier) || null,
    rawResponse: raw,
});

export const getSupportDocumentForPurchase = async ({ purchaseId, requesterUserId, requesterRole }) => {
    const purchase = await getPurchaseWithRelations(purchaseId);
    if (!purchase) throw new ApiError(404, "Purchase not found");
    if (!canManagePurchase(purchase, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to access this purchase");
    return {
        purchaseId: purchase.id,
        purchaseNo: purchase.purchaseNo,
        companyCountryCode: normalizeCountryCode(purchase.createdBy?.company?.countryCode),
        supportDocument: serialize(purchase.purchaseSupportDocument),
    };
};

export const listSupportDocuments = async ({ requesterUserId, requesterRole, status, search }) => {
    const requester = await prisma.user.findUnique({
        where: { id: requesterUserId },
        select: { company: { select: { countryCode: true } } },
    });
    if (normalizeCountryCode(requester?.company?.countryCode) !== "CO") {
        throw new ApiError(404, "Documento Soporte is available only for Colombia companies");
    }
    const where = {
        ...(requesterRole === "admin" ? {} : { purchase: { createdById: requesterUserId } }),
        ...(status ? { status } : {}),
        ...(search ? { OR: [
            { referenceCode: { contains: search, mode: "insensitive" } },
            { documentNumber: { contains: search, mode: "insensitive" } },
            { cufe: { contains: search, mode: "insensitive" } },
        ] } : {}),
    };
    const docs = await prisma.purchaseSupportDocument.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
            purchase: { select: { purchaseNo: true, supplier: { select: { name: true } } } },
            events: { orderBy: { createdAt: "asc" } },
        },
    });
    return docs.map((doc) => ({ ...serialize(doc), purchase: doc.purchase ? { purchaseNo: doc.purchase.purchaseNo, supplierName: doc.purchase.supplier?.name || null } : null }));
};

const claimSupportDocument = async ({ purchase, payload }) => {
    const existing = purchase.purchaseSupportDocument;
    if (existing && (TERMINAL_STATUSES.includes(existing.status) || ["submitted", "issuing"].includes(existing.status))) return { doc: existing, claimed: false };
    const data = {
        countryCode: "CO", provider: "itcycle", status: "issuing", rawRequest: payload,
        fiscalSnapshot: { company: purchase.createdBy.company, supplier: purchase.supplier, items: purchase.purchaseDetails },
        errorMessage: null,
    };
    if (existing) {
        const result = await prisma.purchaseSupportDocument.updateMany({ where: { id: existing.id, status: { in: ["draft", "error", "rejected"] } }, data });
        if (!result.count) return { doc: await prisma.purchaseSupportDocument.findUnique({ where: { id: existing.id } }), claimed: false };
        const doc = await prisma.purchaseSupportDocument.findUnique({ where: { id: existing.id } });
        await prisma.purchaseSupportDocumentEvent.create({ data: { purchaseSupportDocumentId: doc.id, eventType: "issuance_claimed", status: "issuing", payload } });
        return { doc, claimed: true };
    }
    try {
        const doc = await prisma.purchaseSupportDocument.create({ data: { purchaseId: purchase.id, companyId: purchase.createdBy.company.id, referenceCode: purchase.purchaseNo, ...data } });
        await prisma.purchaseSupportDocumentEvent.create({ data: { purchaseSupportDocumentId: doc.id, eventType: "issuance_claimed", status: "issuing", payload } });
        return { doc, claimed: true };
    } catch (error) {
        if (error.code !== "P2002") throw error;
        return { doc: await prisma.purchaseSupportDocument.findUnique({ where: { purchaseId: purchase.id } }), claimed: false };
    }
};

export const issueSupportDocumentForPurchase = async ({ purchaseId, requesterUserId, requesterRole, trigger = "manual" }) => {
    const purchase = await getPurchaseWithRelations(purchaseId);
    if (!purchase) throw new ApiError(404, "Purchase not found");
    if (!canManagePurchase(purchase, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to issue this purchase's support document");
    if (purchase.purchaseStatus !== "completed") throw new ApiError(409, "Documento Soporte is only available for completed purchases");
    if (normalizeCountryCode(purchase.createdBy?.company?.countryCode) !== "CO") throw new ApiError(409, "Documento Soporte requires an explicitly configured Colombia company");
    if (purchase.createdBy?.company?.electronicInvoicingProvider !== "itcycle") {
        throw new ApiError(409, "Documento Soporte is only available when the company's electronic invoicing provider is itcycle-api-dian");
    }
    if (!purchase.supplier?.notObligatedToInvoice) {
        throw new ApiError(409, "This supplier is not marked as not-obligated-to-invoice — no Documento Soporte is needed");
    }
    // Gated on the purchase owner's plan (not the requester's) - same
    // reasoning as issueElectronicInvoiceForOrder.
    await ensureElectronicInvoicingPlan(purchase.createdById);

    const company = purchase.createdBy.company;
    if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian integration is not configured for this environment");
    if (!text(company.itcycleCompanyId) || !text(company.itcycleApiKeyCiphertext)) {
        throw new ApiError(422, "This company has not been provisioned with itcycle-api-dian yet");
    }

    const apiKey = decryptSecret(company.itcycleApiKeyCiphertext);
    const document = buildSupportDocumentPayload(purchase);
    const claim = await claimSupportDocument({ purchase, payload: document });

    if (!claim.claimed) return { reused: true, trigger, countryCode: "CO", supportDocument: serialize(claim.doc) };
    try {
        const mapped = await createItcycleSupportDocument({ apiKey, internalReference: purchase.purchaseNo, document, send: buildItcycleSendOptions(company) }).then(mapSupportDocumentResponse);
        const doc = await prisma.$transaction(async (tx) => {
            const updated = await tx.purchaseSupportDocument.update({ where: { id: claim.doc.id }, data: { ...mapped, errorMessage: null, issuedAt: mapped.status === "accepted" ? new Date() : null } });
            await tx.purchaseSupportDocumentEvent.create({ data: { purchaseSupportDocumentId: updated.id, eventType: "provider_response", status: updated.status, payload: mapped.rawResponse } });
            return updated;
        });
        return { reused: false, trigger, countryCode: "CO", supportDocument: serialize(doc) };
    } catch (error) {
        const providerPayload = error instanceof ItcycleDianError ? error.payload : null;
        const doc = await prisma.$transaction(async (tx) => {
            const updated = await tx.purchaseSupportDocument.update({ where: { id: claim.doc.id }, data: { status: "error", rawResponse: providerPayload, errorMessage: error.message || "Unknown itcycle-api-dian error" } });
            await tx.purchaseSupportDocumentEvent.create({ data: { purchaseSupportDocumentId: updated.id, eventType: "provider_error", status: "error", payload: providerPayload } });
            return updated;
        });
        throw new ApiError(502, doc.errorMessage);
    }
};

export const syncSupportDocumentStatus = async ({ purchaseId, requesterUserId, requesterRole }) => {
    const purchase = await getPurchaseWithRelations(purchaseId);
    if (!purchase) throw new ApiError(404, "Purchase not found");
    if (!canManagePurchase(purchase, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to access this purchase");

    const doc = purchase.purchaseSupportDocument;
    if (!doc) throw new ApiError(404, "This purchase has no Documento Soporte to sync");
    if (!["issuing", "submitted", "contingency"].includes(doc.status)) {
        throw new ApiError(409, `Documento Soporte status "${doc.status}" cannot be synced`);
    }
    if (!doc.externalId) throw new ApiError(409, "This document does not have a provider id yet");
    if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian integration is not configured for this environment");
    const company = purchase.createdBy.company;
    if (!text(company.itcycleApiKeyCiphertext)) throw new ApiError(422, "This company has not been provisioned with itcycle-api-dian yet");
    const apiKey = decryptSecret(company.itcycleApiKeyCiphertext);

    try {
        // Same two-meanings-of-sync split as syncElectronicInvoiceStatus:
        // CONTINGENCY means a real resend, anything else is a status poll.
        const mapped = doc.status === "contingency"
            ? mapSupportDocumentResponse(await retryItcycleSupportDocumentSend({ apiKey, id: doc.externalId, send: buildItcycleSendOptions(company) }))
            : mapSupportDocumentResponse(await getItcycleSupportDocumentStatus({ apiKey, id: doc.externalId }));

        const updated = await prisma.$transaction(async (tx) => {
            const updatedDoc = await tx.purchaseSupportDocument.update({
                where: { id: doc.id },
                data: {
                    ...mapped,
                    errorMessage: mapped.status === "rejected" ? "Document rejected by provider" : null,
                    issuedAt: mapped.status === "accepted" ? new Date() : doc.issuedAt,
                },
            });
            await tx.purchaseSupportDocumentEvent.create({ data: { purchaseSupportDocumentId: updatedDoc.id, eventType: "manual_sync", status: updatedDoc.status, payload: mapped.rawResponse } });
            return updatedDoc;
        });
        return { supportDocument: serialize(updated) };
    } catch (error) {
        const providerPayload = error instanceof ItcycleDianError ? error.payload : null;
        await prisma.purchaseSupportDocumentEvent.create({
            data: {
                purchaseSupportDocumentId: doc.id,
                eventType: "manual_sync_error",
                status: doc.status,
                payload: providerPayload || { message: error.message },
            },
        });
        throw new ApiError(502, error.message || "Failed to sync Documento Soporte status with itcycle-api-dian");
    }
};
