import { prisma } from "../db/prisma.js";
import { resolvePendingCertificateOrderPaymentStatus } from "../services/certificateOrder.service.js";

// Safety net for the same class of "a checkout payment never resolves on
// its own" gaps subscriptionReconcile.js#reconcileStuckPendingPayments
// closes for PlanUpgradeRequest: the customer just closes the tab, ePayco's
// confirmation webhook is delayed/lost/unreachable (it flat-out cannot
// reach a localhost/private dev backend, and can miss a Render cold start
// in prod), or nobody ever reloads a page that would otherwise self-heal it
// (getMyCertificateOrders -> getActiveCertificateEntitlement). Runs on the
// same interval as the subscription reconciliation (see server.js), so a
// stuck certificate payment self-clears within one cycle even with zero
// user interaction on the checkout/response pages - and
// resolvePendingCertificateOrderPaymentStatus's own 48h ceiling is still the
// final backstop if ePayco itself never gives a definitive answer.
export const reconcileStuckCertificateOrderPayments = async () => {
    const pendingOrders = await prisma.certificateOrder.findMany({
        where: { paymentStatus: "pending" },
    });

    if (!pendingOrders.length) {
        return { checked: 0, resolved: 0 };
    }

    let resolved = 0;
    for (const order of pendingOrders) {
        try {
            const result = await resolvePendingCertificateOrderPaymentStatus(order);
            if (result?.paymentStatus !== "pending") {
                resolved++;
            }
        } catch (error) {
            console.error("[certificate-order-reconcile] Failed to resolve pending order", {
                orderId: order.id,
                message: error?.message,
            });
        }
    }

    return { checked: pendingOrders.length, resolved };
};
