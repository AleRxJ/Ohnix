// Backend/controllers/certificateOrderPayment.controller.js
//
// Public ePayco endpoints for CertificateOrder - registered directly in
// app.js (not behind verifyJWT) the same way subscription.controller.js's
// handleEpaycoConfirmation/handleEpaycoResponse are, since ePayco calls
// these itself (server-to-server confirmation) or redirects the customer's
// browser to them (response), neither of which carries an Ohnix session.

import { prisma } from "../db/prisma.js";
import {
    EPAYCO_STATE,
    isEpaycoCancelledResponse,
    isEpaycoTransactionApproved,
    parseEpaycoTestFlag,
} from "../services/epayco.service.js";
import { getCertificateOrderAmount, validateCertificateOrderEpaycoSignature } from "../services/certificateOrderPayment.service.js";
import { activateMyCertificateOrder, markMyCertificateOrderPaymentFailed } from "../services/certificateOrder.service.js";

/**
 * POST /api/v1/certificate-orders/payments/epayco/confirmation
 * Server-to-server callback - the ONLY trusted source of payment truth.
 * Same signature-validation/idempotency/amount-cross-check/always-200
 * pattern as subscription.controller.js#handleEpaycoConfirmation.
 */
export const handleCertificateOrderEpaycoConfirmation = async (req, res) => {
    try {
        const data = req.body || {};

        const refPayco = `${data.x_ref_payco || ""}`.trim();
        const transactionId = `${data.x_transaction_id || ""}`.trim();
        const amount = `${data.x_amount || ""}`.trim();
        const currencyCode = `${data.x_currency_code || ""}`.trim();
        const signature = `${data.x_signature || ""}`.trim();
        const stateCode = parseInt(`${data.x_cod_transaction_state || 0}`, 10);
        const responseText = `${data.x_response || ""}`.trim();
        const orderId = `${data.x_extra1 || ""}`.trim();
        const isTestPayment = parseEpaycoTestFlag(data.x_test_request);

        if (!orderId || !refPayco || !transactionId || !signature) {
            console.warn("[certificate-order-epayco-confirmation] Incomplete payload — ignoring", { orderId, refPayco, transactionId });
            return res.status(200).json({ success: false, message: "Incomplete payload" });
        }

        const signatureValid = validateCertificateOrderEpaycoSignature({ refPayco, transactionId, amount, currencyCode, signature });
        if (!signatureValid) {
            console.warn("[certificate-order-epayco-confirmation] Invalid signature for orderId:", orderId);
            return res.status(200).json({ success: false, message: "Invalid signature" });
        }

        const existingOrder = await prisma.certificateOrder.findUnique({
            where: { id: orderId },
            select: { id: true, paymentStatus: true, paymentSessionId: true, durationYears: true },
        });
        if (!existingOrder) {
            console.warn("[certificate-order-epayco-confirmation] Order not found:", orderId);
            return res.status(200).json({ success: false, message: "Order not found" });
        }

        // Idempotency guard
        if (existingOrder.paymentStatus === "paid") {
            return res.status(200).json({ success: true, message: "Already processed" });
        }

        if (refPayco && existingOrder.paymentSessionId !== refPayco) {
            await prisma.certificateOrder.updateMany({
                where: { id: orderId, paymentStatus: "pending" },
                data: { paymentSessionId: refPayco },
            });
        }

        if (isEpaycoTransactionApproved(stateCode)) {
            const expectedAmount = getCertificateOrderAmount(existingOrder.durationYears);
            const paidAmount = Math.round(Number(amount));
            const amountMatches = expectedAmount !== null && Math.abs(paidAmount - expectedAmount) <= 1;
            const currencyMatches = currencyCode.toUpperCase() === "COP";

            if (!amountMatches || !currencyMatches) {
                console.error("[certificate-order-epayco-confirmation] Amount/currency mismatch — refusing to activate", {
                    orderId, expectedAmount, paidAmount, currencyCode,
                });
                await prisma.certificateOrder.updateMany({
                    where: { id: orderId, paymentStatus: "pending" },
                    data: { paymentStatus: "amount_mismatch", ...(typeof isTestPayment === "boolean" ? { isTestPayment } : {}) },
                });
                return res.status(200).json({ success: false, message: "Amount mismatch" });
            }

            await activateMyCertificateOrder({
                orderId,
                paymentSessionId: refPayco,
                isTestPayment,
                paidAmount,
                paidCurrency: "cop",
            });
            console.log("[certificate-order-epayco-confirmation] Certificate order activated:", orderId);
        } else if (stateCode === EPAYCO_STATE.REJECTED || stateCode === EPAYCO_STATE.FAILED || stateCode === EPAYCO_STATE.REVERSED) {
            const paymentStatus = stateCode === EPAYCO_STATE.REJECTED ? "rejected" : "failed";
            await markMyCertificateOrderPaymentFailed({ orderId, paymentStatus, isTestPayment });
        } else if (stateCode === EPAYCO_STATE.EXPIRED || stateCode === EPAYCO_STATE.ABANDONED) {
            await markMyCertificateOrderPaymentFailed({ orderId, paymentStatus: "expired", isTestPayment });
        } else if (stateCode === EPAYCO_STATE.CANCELLED) {
            await markMyCertificateOrderPaymentFailed({ orderId, paymentStatus: "cancelled", isTestPayment });
        } else if (stateCode === EPAYCO_STATE.PENDING || stateCode === EPAYCO_STATE.RETAINED || stateCode === EPAYCO_STATE.STARTED) {
            console.log(`[certificate-order-epayco-confirmation] Non-terminal state ${stateCode} for orderId ${orderId} — waiting`);
        } else {
            const paymentStatus = isEpaycoCancelledResponse(responseText) ? "cancelled" : "failed";
            await markMyCertificateOrderPaymentFailed({ orderId, paymentStatus, isTestPayment });
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("[certificate-order-epayco-confirmation] Unexpected error", error);
        return res.status(200).json({ success: false, message: "Processing error" });
    }
};

/**
 * GET|POST /api/v1/certificate-orders/payments/epayco/response
 * Browser redirect only - NOT trusted for activation. x_extra1 carries the
 * certificateOrderId (also embedded as ?orderId= on the URL itself, same
 * belt-and-suspenders as subscription.controller.js#handleEpaycoResponse).
 *
 * Forwards ref_payco on to the frontend too - the on-page widget's onClosed
 * hook never fires for a redirect-based method (PSE, etc.), since the
 * browser fully navigates away to the bank and back through this exact
 * response URL instead of staying embedded - so this is the ONLY place
 * that redirect flow has to hand the real reference to
 * CertificateOrderPaymentResponse.jsx (same reasoning as
 * EpaycoResponseRedirect.jsx forwarding it for subscriptions).
 */
export const handleCertificateOrderEpaycoResponse = (req, res) => {
    const data = req.method === "POST" ? req.body || {} : req.query || {};
    const orderId = `${data.x_extra1 || data.extra1 || ""}`.trim() || `${req.query.orderId || ""}`.trim();
    const refPayco = `${data.x_ref_payco || data.ref_payco || ""}`.trim();
    const frontendBase = `${process.env.FRONTEND_URL || "https://ohnix.co"}`.replace(/\/$/, "");

    if (!orderId) {
        return res.redirect(`${frontendBase}/fiscal-setup`);
    }
    const refPaycoParam = refPayco ? `&ref_payco=${encodeURIComponent(refPayco)}` : "";
    return res.redirect(
        `${frontendBase}/fiscal-setup/certificate-payment-response?orderId=${encodeURIComponent(orderId)}${refPaycoParam}`
    );
};
