// Backend/services/certificateOrder.service.js
//
// Business logic for CertificateOrder - the one-off Viafirma
// digital-certificate purchase that gates companySelf.controller.js's
// createMyViafirmaRequest (DIAN requires the certificate be paid for; see
// the CertificateOrder model's own doc comment in schema.prisma for why
// this isn't folded into PlanUpgradeRequest).

import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import {
    generateCertificateOrderReference,
    getCertificateOrderAmount,
    isEpaycoConfiguredForCertificateOrders,
} from "./certificateOrderPayment.service.js";
import {
    EPAYCO_STATE,
    isEpaycoCancelledResponse,
    isEpaycoTransactionApproved,
    parseEpaycoTestFlag,
    queryEpaycoTransaction,
} from "./epayco.service.js";

const VALID_DURATIONS = [1, 2];

// A pending order (created but not yet paid) never expires or gets
// cancelled server-side - the customer can always resume the same checkout
// session (paymentSessionId is stable once set), same as
// PlanUpgradeRequest's "awaiting_checkout" state. Reusing it instead of
// creating a new row every time the paywall renders keeps
// getMyCertificateOrders from accumulating one abandoned row per page visit.
export const createOrReuseMyCertificateOrder = async ({ companyId, requestedByUserId, durationYears }) => {
    if (!isEpaycoConfiguredForCertificateOrders()) {
        throw new ApiError(503, "ePayco is not configured on this server");
    }
    if (!VALID_DURATIONS.includes(durationYears)) {
        throw new ApiError(400, "durationYears must be 1 or 2");
    }

    const existingPending = await prisma.certificateOrder.findFirst({
        where: { companyId, paymentStatus: "pending", durationYears },
        orderBy: { createdAt: "desc" },
    });
    if (existingPending) return existingPending;

    const amount = getCertificateOrderAmount(durationYears);
    if (!amount) {
        throw new ApiError(
            500,
            `Certificate order amount is not configured for durationYears=${durationYears}. ` +
                "Set EPAYCO_AMOUNT_CERTIFICATE_1_YEAR_COP / EPAYCO_AMOUNT_CERTIFICATE_2_YEARS_COP."
        );
    }

    const order = await prisma.certificateOrder.create({
        data: { companyId, requestedByUserId, durationYears, amount, currency: "COP", paymentStatus: "pending" },
    });

    const reference = generateCertificateOrderReference(order.id);
    return prisma.certificateOrder.update({ where: { id: order.id }, data: { paymentSessionId: reference } });
};

export const listMyCertificateOrders = ({ companyId }) =>
    prisma.certificateOrder.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });

const addYears = (date, years) => {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() + years);
    return result;
};

// Idempotency guard mirrors closeApprovedRequestAndActivatePlan's WHERE-clause
// claim pattern: only ever transitions a "pending" row, so a duplicated
// confirmation webhook is a silent no-op on the second delivery.
export const activateMyCertificateOrder = async ({ orderId, paymentSessionId, isTestPayment, paidAmount, paidCurrency }) => {
    const order = await prisma.certificateOrder.findUnique({ where: { id: orderId } });
    if (!order || order.paymentStatus !== "pending") return null;

    const paidAt = new Date();
    const entitlementEndsAt = addYears(paidAt, order.durationYears);

    const { count } = await prisma.certificateOrder.updateMany({
        where: { id: orderId, paymentStatus: "pending" },
        data: {
            paymentStatus: "paid",
            paymentSessionId: paymentSessionId || order.paymentSessionId,
            paidAt,
            paidAmount,
            paidCurrency,
            ...(typeof isTestPayment === "boolean" ? { isTestPayment } : {}),
            entitlementStartsAt: paidAt,
            entitlementEndsAt,
        },
    });
    return count > 0;
};

export const markMyCertificateOrderPaymentFailed = ({ orderId, paymentStatus, isTestPayment }) =>
    prisma.certificateOrder.updateMany({
        where: { id: orderId, paymentStatus: "pending" },
        data: { paymentStatus, ...(typeof isTestPayment === "boolean" ? { isTestPayment } : {}) },
    });

// A pending order with NO confirmation the provider has actually seen a
// real payment in flight is no longer trusted past this ceiling - same
// reasoning/value as subscription.controller.js#PENDING_PAYMENT_TIMEOUT_MS.
const PENDING_ORDER_TIMEOUT_MS = 48 * 60 * 60 * 1000; // 48h

// The single source of truth for "is this pending CertificateOrder actually
// still pending" - re-verifies directly against ePayco's authenticated
// transaction-query API and writes back whatever it finds, instead of
// trusting a paymentStatus column that would otherwise only ever move off
// "pending" via the confirmation webhook. That webhook is server-to-server
// (ePayco calling this backend directly) and simply cannot reach a
// localhost/private dev server at all, and can also miss a Render cold
// start in production - without this, a genuinely-paid order sits stuck
// forever. Mirrors subscription.controller.js#resolvePendingPaymentStatus's
// ePayco branch (Stripe isn't a payment option here, so that branch is
// omitted entirely).
export const resolvePendingCertificateOrderPaymentStatus = async (order) => {
    if (!order || order.paymentStatus !== "pending" || !order.paymentSessionId) return order;

    const pendingSinceMs = new Date(order.updatedAt || order.createdAt).getTime();
    const isStale = Number.isFinite(pendingSinceMs) && Date.now() - pendingSinceMs > PENDING_ORDER_TIMEOUT_MS;
    let verifiedStillProcessing = false;

    try {
        const transaction = await queryEpaycoTransaction(order.paymentSessionId);
        const txData = transaction?.data || transaction || {};
        const stateCode = parseInt(
            `${txData.x_cod_transaction_state ?? txData.cod_respuesta ?? txData.estado_codigo ?? 0}`,
            10
        );
        const responseText = `${txData.x_response ?? txData.response ?? txData.estado ?? ""}`.trim().toLowerCase();
        const isTestPayment = parseEpaycoTestFlag(txData.x_test_request ?? txData.test_request);
        const approved =
            isEpaycoTransactionApproved(stateCode) ||
            (stateCode === 0 && ["aceptada", "accepted", "approved"].includes(responseText));

        if (approved) {
            const paidAmount = Number(txData.x_amount ?? txData.valor ?? txData.amount ?? 0);
            const currencyCode = `${txData.x_currency_code ?? txData.moneda ?? txData.currency ?? ""}`.toUpperCase();
            const expectedAmount = getCertificateOrderAmount(order.durationYears);
            const amountOk = expectedAmount !== null && Math.abs(Math.round(paidAmount) - expectedAmount) <= 1;
            const currencyOk = currencyCode === "COP";

            if (!amountOk || !currencyOk) {
                console.error("[certificate-order-reconcile] Amount/currency mismatch — refusing to activate", {
                    orderId: order.id, expectedAmount, paidAmount, currencyCode,
                });
                await markMyCertificateOrderPaymentFailed({ orderId: order.id, paymentStatus: "amount_mismatch", isTestPayment });
                return { ...order, paymentStatus: "amount_mismatch" };
            }

            await activateMyCertificateOrder({
                orderId: order.id,
                paymentSessionId: order.paymentSessionId,
                isTestPayment,
                paidAmount: Math.round(paidAmount),
                paidCurrency: "cop",
            });
            return { ...order, paymentStatus: "paid" };
        }

        const TERMINAL_FAILED_STATES = new Set([
            EPAYCO_STATE.REJECTED,
            EPAYCO_STATE.FAILED,
            EPAYCO_STATE.REVERSED,
            EPAYCO_STATE.EXPIRED,
            EPAYCO_STATE.ABANDONED,
            EPAYCO_STATE.CANCELLED,
        ]);

        if (TERMINAL_FAILED_STATES.has(stateCode)) {
            let paymentStatus;
            if (stateCode === EPAYCO_STATE.EXPIRED || stateCode === EPAYCO_STATE.ABANDONED) paymentStatus = "expired";
            else if (stateCode === EPAYCO_STATE.REJECTED) paymentStatus = "rejected";
            else if (stateCode === EPAYCO_STATE.CANCELLED) paymentStatus = "cancelled";
            else paymentStatus = "failed";
            await markMyCertificateOrderPaymentFailed({ orderId: order.id, paymentStatus, isTestPayment });
            return { ...order, paymentStatus };
        }

        const NON_TERMINAL_STATES = new Set([EPAYCO_STATE.PENDING, EPAYCO_STATE.RETAINED, EPAYCO_STATE.STARTED]);

        if (stateCode !== 0 && !NON_TERMINAL_STATES.has(stateCode)) {
            const paymentStatus = isEpaycoCancelledResponse(responseText) ? "cancelled" : "failed";
            await markMyCertificateOrderPaymentFailed({ orderId: order.id, paymentStatus, isTestPayment });
            return { ...order, paymentStatus };
        }

        if (stateCode === EPAYCO_STATE.PENDING || stateCode === EPAYCO_STATE.RETAINED) {
            verifiedStillProcessing = true;
        }
    } catch (error) {
        console.warn("[certificate-order-reconcile] Provider verification failed, relying on timeout only", {
            orderId: order.id, message: error?.message,
        });
    }

    if (verifiedStillProcessing) return order;

    if (isStale) {
        await markMyCertificateOrderPaymentFailed({ orderId: order.id, paymentStatus: "expired" });
        return { ...order, paymentStatus: "expired" };
    }

    return order;
};

// Resolving every pending order for the company before checking for an
// active entitlement is what makes "merely reloading the page" self-heal a
// payment whose confirmation webhook never arrived - same reasoning as
// subscription.controller.js#resolvePendingPaymentStatus's own doc comment.
export const getActiveCertificateEntitlement = async ({ companyId }) => {
    const pendingOrders = await prisma.certificateOrder.findMany({ where: { companyId, paymentStatus: "pending" } });
    await Promise.all(pendingOrders.map((order) => resolvePendingCertificateOrderPaymentStatus(order).catch(() => {})));

    return prisma.certificateOrder.findFirst({
        where: { companyId, paymentStatus: "paid", entitlementEndsAt: { gt: new Date() } },
        orderBy: { entitlementEndsAt: "desc" },
    });
};

// The actual gate - called from companySelf.controller.js#createMyViafirmaRequest
// before a Viafirma request is ever created. "certificate_payment_required" is
// translated client-side (see ViafirmaSelfService.jsx's *_CODE_MESSAGES map),
// same convention as ensureElectronicInvoicingPlan's plan gate.
export const requireActiveCertificateEntitlement = async ({ companyId }) => {
    const entitlement = await getActiveCertificateEntitlement({ companyId });
    if (!entitlement) {
        throw new ApiError(
            402,
            "A paid certificate entitlement is required before requesting a Viafirma certificate. " +
                "This is mandatory for DIAN electronic invoicing.",
            [],
            "",
            "certificate_payment_required"
        );
    }
    return entitlement;
};
