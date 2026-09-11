import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { decryptSecret } from "../utils/secretEncryption.js";
import { normalizeCountryCode } from "./companyCountry.service.js";
import { ensureUserSubscription, getEffectivePlan, getPlanFeatures } from "../middleware/pricing.middleware.js";
import { normalizeItcycleStatus } from "./electronicInvoicing.service.js";
import {
    createItcycleReceiptAcknowledgment,
    getItcycleReceiptAcknowledgmentStatus,
    ItcycleDianError,
    isItcycleConfigured,
} from "./itcycleDian.service.js";
import { addBusinessDays } from "../utils/businessDays.js";

// Buyer-side RADIAN acknowledgment events for a THIRD-PARTY supplier's own
// DIAN invoice (ET art. 616-1, Ley 2155 de 2021 art. 13) - distinct from and
// unrelated to purchaseSupportDocument.service.js's Documento Soporte
// (self-issued, for suppliers NOT obligated to invoice - the opposite
// precondition). PHASE 1: itcycle-api-dian only accepts these events in
// DIAN_SIMULATION_MODE - see that repo's
// receiptAcknowledgment.service.ts#assertSimulationOnly.

const text = (value) => `${value || ""}`.trim();

const TACITA_WINDOW_BUSINESS_DAYS = 3;

const STATUS_FIELD = {
    acuse: "acuseStatus",
    recepcion: "recepcionStatus",
    aceptacion_expresa: "aceptacionExpresaStatus",
    reclamo: "reclamoStatus",
};
const EXTERNAL_ID_FIELD = {
    acuse: "acuseExternalId",
    recepcion: "recepcionExternalId",
    aceptacion_expresa: "aceptacionExpresaExternalId",
    reclamo: "reclamoExternalId",
};
const SENT_AT_FIELD = {
    acuse: "acuseSentAt",
    recepcion: "recepcionSentAt",
    aceptacion_expresa: "aceptacionExpresaSentAt",
    reclamo: "reclamoSentAt",
};
const ITCYCLE_EVENT_TYPE = {
    acuse: "ACUSE_RECIBO",
    recepcion: "RECIBO_BIEN",
    aceptacion_expresa: "ACEPTACION_EXPRESA",
    reclamo: "RECLAMO",
};

const ensureElectronicInvoicingPlan = async (userId) => {
    const subscription = await ensureUserSubscription(userId);
    const effectivePlan = getEffectivePlan(subscription);
    if (!getPlanFeatures(effectivePlan).electronicInvoicing) {
        throw new ApiError(
            403,
            "Electronic invoicing is available starting on the Negocio plan. Upgrade to issue DIAN documents.",
            [],
            "",
            "electronic_invoicing_plan_required"
        );
    }
};

const canManagePurchase = (purchase, userId, role) => role === "admin" || purchase.createdById === userId;

const getPurchaseWithReceiptRelations = (purchaseId) => prisma.purchase.findFirst({
    where: { OR: [{ id: purchaseId }, { legacyMongoId: purchaseId }] },
    include: {
        supplier: true,
        createdBy: { select: { id: true, companyId: true, company: true } },
        receivedInvoiceReceipt: { include: { events: { orderBy: { createdAt: "asc" } } } },
    },
});

const serializeEvent = (event) => ({
    id: event.id,
    eventType: event.eventType,
    status: event.status,
    createdAt: event.createdAt,
});

const serialize = (receipt) => !receipt ? null : ({
    id: receipt.id,
    purchaseId: receipt.purchaseId,
    supplierInvoiceNumber: receipt.supplierInvoiceNumber,
    supplierCufe: receipt.supplierCufe,
    supplierIssuedAt: receipt.supplierIssuedAt,
    acuse: { status: receipt.acuseStatus, externalId: receipt.acuseExternalId, sentAt: receipt.acuseSentAt },
    recepcion: { status: receipt.recepcionStatus, externalId: receipt.recepcionExternalId, sentAt: receipt.recepcionSentAt },
    aceptacionExpresa: { status: receipt.aceptacionExpresaStatus, externalId: receipt.aceptacionExpresaExternalId, sentAt: receipt.aceptacionExpresaSentAt },
    reclamo: { status: receipt.reclamoStatus, externalId: receipt.reclamoExternalId, sentAt: receipt.reclamoSentAt, reason: receipt.reclamoReason },
    tacita: { deadlineAt: receipt.tacitaDeadlineAt, appliedAt: receipt.tacitaAppliedAt },
    errorMessage: receipt.errorMessage,
    createdAt: receipt.createdAt,
    updatedAt: receipt.updatedAt,
    events: Array.isArray(receipt.events) ? receipt.events.map(serializeEvent) : undefined,
});

export const getReceiptForPurchase = async ({ purchaseId, requesterUserId, requesterRole }) => {
    const purchase = await getPurchaseWithReceiptRelations(purchaseId);
    if (!purchase) throw new ApiError(404, "Purchase not found");
    if (!canManagePurchase(purchase, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to access this purchase");
    return {
        purchaseId: purchase.id,
        purchaseNo: purchase.purchaseNo,
        supplierIssuesElectronicInvoice: Boolean(purchase.supplier?.issuesElectronicInvoice),
        receipt: serialize(purchase.receivedInvoiceReceipt),
    };
};

export const listReceivedInvoiceReceipts = async ({ requesterUserId, requesterRole, search }) => {
    const requester = await prisma.user.findUnique({
        where: { id: requesterUserId },
        select: { company: { select: { countryCode: true } } },
    });
    if (normalizeCountryCode(requester?.company?.countryCode) !== "CO") {
        throw new ApiError(404, "Receipt acknowledgment is available only for Colombia companies");
    }
    const where = {
        ...(requesterRole === "admin" ? {} : { purchase: { createdById: requesterUserId } }),
        ...(search ? { OR: [
            { supplierInvoiceNumber: { contains: search, mode: "insensitive" } },
            { supplierCufe: { contains: search, mode: "insensitive" } },
        ] } : {}),
    };
    const receipts = await prisma.receivedInvoiceReceipt.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
            purchase: { select: { purchaseNo: true, supplier: { select: { name: true } } } },
            events: { orderBy: { createdAt: "asc" } },
        },
    });
    return receipts.map((receipt) => ({
        ...serialize(receipt),
        purchase: receipt.purchase ? { purchaseNo: receipt.purchase.purchaseNo, supplierName: receipt.purchase.supplier?.name || null } : null,
    }));
};

// CUFE's real algorithm/length is supplier-side (SHA-384/SHA-1 depending on
// era) - Ohnix cannot recompute or verify it, only sanity-check the shape
// (hex string, plausible length) so an obvious typo is caught early.
const looksLikeCufe = (value) => /^[0-9a-fA-F]{20,}$/.test(value);

export const recordSupplierInvoiceReference = async ({ purchaseId, requesterUserId, requesterRole, supplierInvoiceNumber, supplierCufe, supplierIssuedAt }) => {
    const purchase = await getPurchaseWithReceiptRelations(purchaseId);
    if (!purchase) throw new ApiError(404, "Purchase not found");
    if (!canManagePurchase(purchase, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to access this purchase");
    if (!purchase.supplier?.issuesElectronicInvoice) {
        throw new ApiError(409, "This supplier is not marked as issuing its own electronic invoice");
    }
    if (!text(supplierInvoiceNumber)) throw new ApiError(400, "supplierInvoiceNumber is required");
    if (!text(supplierCufe) || !looksLikeCufe(text(supplierCufe))) throw new ApiError(400, "supplierCufe is required and must look like a valid CUFE");

    const existing = purchase.receivedInvoiceReceipt;
    if (existing && existing.acuseStatus !== "draft") {
        throw new ApiError(409, "The supplier invoice reference cannot be changed once acknowledgment has started");
    }

    const data = {
        supplierInvoiceNumber: text(supplierInvoiceNumber),
        supplierCufe: text(supplierCufe),
        supplierIssuedAt: supplierIssuedAt ? new Date(supplierIssuedAt) : null,
    };

    const receipt = existing
        ? await prisma.receivedInvoiceReceipt.update({ where: { id: existing.id }, data })
        : await prisma.receivedInvoiceReceipt.create({
            data: {
                purchaseId: purchase.id,
                companyId: purchase.createdBy.company.id,
                countryCode: normalizeCountryCode(purchase.createdBy.company.countryCode) || "CO",
                createdById: requesterUserId,
                ...data,
            },
        });
    return serialize(receipt);
};

const claimEventStatus = async ({ receiptId, eventKey, guardValue }) => {
    const statusField = STATUS_FIELD[eventKey];
    const result = await prisma.receivedInvoiceReceipt.updateMany({
        where: { id: receiptId, [statusField]: guardValue },
        data: { [statusField]: "issuing" },
    });
    return result.count > 0;
};

const triggerEvent = async ({ purchaseId, requesterUserId, requesterRole, eventKey, guardValue, preconditions, description }) => {
    const purchase = await getPurchaseWithReceiptRelations(purchaseId);
    if (!purchase) throw new ApiError(404, "Purchase not found");
    if (!canManagePurchase(purchase, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to acknowledge this purchase's supplier invoice");
    if (purchase.purchaseStatus !== "completed") throw new ApiError(409, "Receipt acknowledgment is only available for completed purchases");
    if (normalizeCountryCode(purchase.createdBy?.company?.countryCode) !== "CO") throw new ApiError(409, "Receipt acknowledgment requires an explicitly configured Colombia company");
    if (purchase.createdBy?.company?.electronicInvoicingProvider !== "itcycle") {
        throw new ApiError(409, "Receipt acknowledgment is only available when the company's electronic invoicing provider is itcycle-api-dian");
    }
    if (!purchase.supplier?.issuesElectronicInvoice) {
        throw new ApiError(409, "This supplier is not marked as issuing its own electronic invoice");
    }
    const receipt = purchase.receivedInvoiceReceipt;
    if (!receipt) {
        throw new ApiError(409, "Record the supplier's invoice reference (CUFE) before acknowledging it");
    }
    preconditions?.(receipt);

    await ensureElectronicInvoicingPlan(purchase.createdById);

    const company = purchase.createdBy.company;
    if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian integration is not configured for this environment");
    if (!text(company.itcycleCompanyId) || !text(company.itcycleApiKeyCiphertext)) {
        throw new ApiError(422, "This company has not been provisioned with itcycle-api-dian yet");
    }

    const claimed = await claimEventStatus({ receiptId: receipt.id, eventKey, guardValue });
    if (!claimed) {
        const current = await prisma.receivedInvoiceReceipt.findUnique({ where: { id: receipt.id }, include: { events: { orderBy: { createdAt: "asc" } } } });
        return { reused: true, receipt: serialize(current) };
    }

    const apiKey = decryptSecret(company.itcycleApiKeyCiphertext);
    const internalReference = `${purchase.purchaseNo}-${ITCYCLE_EVENT_TYPE[eventKey]}`;

    try {
        const raw = await createItcycleReceiptAcknowledgment({
            apiKey,
            internalReference,
            eventType: ITCYCLE_EVENT_TYPE[eventKey],
            referencedCufe: receipt.supplierCufe,
            referencedInvoiceId: receipt.supplierInvoiceNumber,
            description,
        });
        const status = normalizeItcycleStatus(raw?.status);
        const sentAt = new Date();
        const updated = await prisma.$transaction(async (tx) => {
            const result = await tx.receivedInvoiceReceipt.update({
                where: { id: receipt.id },
                data: {
                    [STATUS_FIELD[eventKey]]: status,
                    [EXTERNAL_ID_FIELD[eventKey]]: text(raw?.id) || null,
                    [SENT_AT_FIELD[eventKey]]: sentAt,
                    errorMessage: null,
                },
                include: { events: { orderBy: { createdAt: "asc" } } },
            });
            await tx.receivedInvoiceReceiptEvent.create({
                data: { receivedInvoiceReceiptId: receipt.id, eventType: `${eventKey}_sent`, status, payload: raw },
            });
            return result;
        });
        return { reused: false, receipt: serialize(updated), sentAt };
    } catch (error) {
        const providerPayload = error instanceof ItcycleDianError ? error.payload : null;
        const updated = await prisma.$transaction(async (tx) => {
            const result = await tx.receivedInvoiceReceipt.update({
                where: { id: receipt.id },
                data: { [STATUS_FIELD[eventKey]]: "error", errorMessage: error.message || "Unknown itcycle-api-dian error" },
                include: { events: { orderBy: { createdAt: "asc" } } },
            });
            await tx.receivedInvoiceReceiptEvent.create({
                data: { receivedInvoiceReceiptId: receipt.id, eventType: `${eventKey}_error`, status: "error", payload: providerPayload },
            });
            return result;
        });
        throw new ApiError(502, updated.errorMessage);
    }
};

const ACCEPTED_LIKE = ["accepted", "contingency"];

export const triggerAcuseDeReciboForPurchase = async ({ purchaseId, requesterUserId, requesterRole }) => {
    let result = await triggerEvent({
        purchaseId, requesterUserId, requesterRole,
        eventKey: "acuse", guardValue: "draft",
        description: "Acuse de recibo de la factura electrónica",
    });
    // Chained, not a separate manual click - see receiptAcknowledgment
    // trigger design: both acuse and recepción are non-discretionary facts
    // true the moment a purchase is completed (stock already received).
    if (!result.reused && ACCEPTED_LIKE.includes(result.receipt.acuse.status)) {
        try {
            // Re-assign result so the caller sees the FINAL state (both acuse
            // and recepción, plus the tácita deadline recepción computes) -
            // without this, a caller of this exact endpoint would see a
            // stale "recepción still draft" snapshot even though it already
            // completed milliseconds later, and would need a second
            // GET .../receipt-acknowledgment call to see the true state.
            const chained = await triggerRecepcionDelBienForPurchase({ purchaseId, requesterUserId, requesterRole });
            result = chained;
        } catch (error) {
            // Never let a recepción failure hide that acuse itself succeeded -
            // same "swallow, don't block" reasoning as the purchase-completion
            // fire-and-forget trigger this is called from.
            console.warn("[receipt-acknowledgment] recepción auto-chain failed", { purchaseId, message: error?.message || error });
        }
    }
    return result;
};

export const triggerRecepcionDelBienForPurchase = async ({ purchaseId, requesterUserId, requesterRole }) => {
    const result = await triggerEvent({
        purchaseId, requesterUserId, requesterRole,
        eventKey: "recepcion", guardValue: "draft",
        description: "Recibo del bien y/o servicio",
        preconditions: (receipt) => {
            if (!ACCEPTED_LIKE.includes(receipt.acuseStatus)) {
                throw new ApiError(409, "Acuse de recibo must be accepted before recibo del bien/servicio can be sent");
            }
        },
    });
    if (!result.reused && ACCEPTED_LIKE.includes(result.receipt.recepcion.status) && result.sentAt) {
        const tacitaDeadlineAt = addBusinessDays(result.sentAt, TACITA_WINDOW_BUSINESS_DAYS);
        const updated = await prisma.receivedInvoiceReceipt.update({
            where: { id: result.receipt.id },
            data: { tacitaDeadlineAt },
            include: { events: { orderBy: { createdAt: "asc" } } },
        });
        result.receipt = serialize(updated);
    }
    return result;
};

export const triggerAceptacionExpresaForPurchase = async ({ purchaseId, requesterUserId, requesterRole }) => {
    const result = await triggerEvent({
        purchaseId, requesterUserId, requesterRole,
        eventKey: "aceptacion_expresa", guardValue: null,
        description: "Aceptación expresa de la factura electrónica",
        preconditions: (receipt) => {
            if (!ACCEPTED_LIKE.includes(receipt.recepcionStatus)) throw new ApiError(409, "Recibo del bien/servicio must be accepted first");
            if (receipt.reclamoStatus !== null) throw new ApiError(409, "A reclamo was already sent for this purchase - mutually exclusive with aceptación expresa");
            if (receipt.tacitaAppliedAt) throw new ApiError(409, "Aceptación tácita already applied - past the window for an explicit choice");
            if (receipt.tacitaDeadlineAt && new Date() >= receipt.tacitaDeadlineAt) throw new ApiError(409, "The 3 business day window has closed");
        },
    });
    if (!result.reused && ACCEPTED_LIKE.includes(result.receipt.aceptacionExpresa.status)) {
        const updated = await prisma.receivedInvoiceReceipt.update({
            where: { id: result.receipt.id },
            data: { tacitaDeadlineAt: null },
            include: { events: { orderBy: { createdAt: "asc" } } },
        });
        result.receipt = serialize(updated);
    }
    return result;
};

export const triggerReclamoForPurchase = async ({ purchaseId, requesterUserId, requesterRole, reason }) => {
    if (!text(reason) || text(reason).length < 10) {
        throw new ApiError(400, "reason is required (at least 10 characters) to file a reclamo");
    }
    const result = await triggerEvent({
        purchaseId, requesterUserId, requesterRole,
        eventKey: "reclamo", guardValue: null,
        description: text(reason),
        preconditions: (receipt) => {
            if (!ACCEPTED_LIKE.includes(receipt.recepcionStatus)) throw new ApiError(409, "Recibo del bien/servicio must be accepted first");
            if (receipt.aceptacionExpresaStatus !== null) throw new ApiError(409, "An aceptación expresa was already sent for this purchase - mutually exclusive with reclamo");
            if (receipt.tacitaAppliedAt) throw new ApiError(409, "Aceptación tácita already applied - past the window for a reclamo");
            if (receipt.tacitaDeadlineAt && new Date() >= receipt.tacitaDeadlineAt) throw new ApiError(409, "The 3 business day window has closed");
        },
    });
    if (!result.reused && ACCEPTED_LIKE.includes(result.receipt.reclamo.status)) {
        const updated = await prisma.receivedInvoiceReceipt.update({
            where: { id: result.receipt.id },
            data: { tacitaDeadlineAt: null, reclamoReason: text(reason) },
            include: { events: { orderBy: { createdAt: "asc" } } },
        });
        result.receipt = serialize(updated);
    }
    return result;
};

export const syncReceiptEventStatus = async ({ purchaseId, requesterUserId, requesterRole, eventType }) => {
    if (!STATUS_FIELD[eventType]) throw new ApiError(400, "eventType must be one of acuse, recepcion, aceptacion_expresa, reclamo");
    const purchase = await getPurchaseWithReceiptRelations(purchaseId);
    if (!purchase) throw new ApiError(404, "Purchase not found");
    if (!canManagePurchase(purchase, requesterUserId, requesterRole)) throw new ApiError(403, "You are not authorized to access this purchase");
    const receipt = purchase.receivedInvoiceReceipt;
    if (!receipt) throw new ApiError(404, "This purchase has no receipt acknowledgment to sync");
    const externalId = receipt[EXTERNAL_ID_FIELD[eventType]];
    if (!externalId) throw new ApiError(409, `No ${eventType} event has been sent yet for this purchase`);
    if (!isItcycleConfigured()) throw new ApiError(503, "itcycle-api-dian integration is not configured for this environment");
    const company = purchase.createdBy.company;
    if (!text(company.itcycleApiKeyCiphertext)) throw new ApiError(422, "This company has not been provisioned with itcycle-api-dian yet");
    const apiKey = decryptSecret(company.itcycleApiKeyCiphertext);

    const raw = await getItcycleReceiptAcknowledgmentStatus({ apiKey, id: externalId });
    const status = normalizeItcycleStatus(raw?.status);
    const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.receivedInvoiceReceipt.update({
            where: { id: receipt.id },
            data: { [STATUS_FIELD[eventType]]: status },
            include: { events: { orderBy: { createdAt: "asc" } } },
        });
        await tx.receivedInvoiceReceiptEvent.create({
            data: { receivedInvoiceReceiptId: receipt.id, eventType: `${eventType}_manual_sync`, status, payload: raw },
        });
        return result;
    });
    return { receipt: serialize(updated) };
};

// Purely local - itcycle-api-dian is never called for tácita (it's a legal
// fact of silence, not a document to transmit). Called daily by
// utils/receiptTacitaScheduler.js.
export const applyDueTacitaAcceptances = async () => {
    const now = new Date();
    const due = await prisma.receivedInvoiceReceipt.findMany({
        where: { tacitaDeadlineAt: { lte: now }, tacitaAppliedAt: null, reclamoStatus: null },
        select: { id: true },
    });
    let applied = 0;
    let skipped = 0;
    for (const row of due) {
        const result = await prisma.receivedInvoiceReceipt.updateMany({
            where: { id: row.id, tacitaAppliedAt: null },
            data: { tacitaAppliedAt: now },
        });
        if (result.count > 0) {
            await prisma.receivedInvoiceReceiptEvent.create({
                data: { receivedInvoiceReceiptId: row.id, eventType: "aceptacion_tacita_applied", status: null, payload: null },
            });
            applied += 1;
        } else {
            skipped += 1;
        }
    }
    return { checked: due.length, applied, skipped };
};
