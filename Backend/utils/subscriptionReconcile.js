import { prisma } from "../db/prisma.js";
import { resolvePendingPaymentStatus, UPGRADE_REQUEST_SELECT } from "../controllers/subscription.controller.js";

// Closes "approved" upgrade requests whose target plan the user's
// subscription already reflects (e.g. left behind by an older activation
// path that updated the subscription but never closed the request).
//
// This used to instead revert the subscription back to request.currentPlan
// whenever it found this situation - which is backwards: the subscription
// already matching the target plan means the upgrade succeeded, so
// reverting it would downgrade a customer who paid correctly. It now only
// closes the stale request to match reality and never touches the
// subscription itself.
export const reconcileLegacyApprovedRequests = async () => {
    const approvedRequests = await prisma.planUpgradeRequest.findMany({
        where: { status: "approved" },
        select: {
            id: true,
            userId: true,
            currentPlan: true,
            targetPlan: true,
        },
    });

    if (!approvedRequests.length) {
        return { checked: 0, fixed: 0 };
    }

    const userIds = [...new Set(approvedRequests.map((item) => item.userId))];
    const subscriptions = await prisma.subscription.findMany({
        where: {
            userId: { in: userIds },
        },
        select: {
            userId: true,
            plan: true,
            status: true,
        },
    });

    const subscriptionByUserId = Object.fromEntries(
        subscriptions.map((item) => [item.userId, item])
    );

    const requestsToClose = approvedRequests.filter((request) => {
        const subscription = subscriptionByUserId[request.userId];
        if (!subscription) {
            return false;
        }

        return (
            subscription.plan === request.targetPlan &&
            subscription.status === "active"
        );
    });

    for (const request of requestsToClose) {
        await prisma.planUpgradeRequest.update({
            where: { id: request.id },
            data: {
                status: "closed",
                paymentStatus: "paid",
            },
        });
    }

    return {
        checked: approvedRequests.length,
        fixed: requestsToClose.length,
    };
};

// Safety net for the common ways a checkout payment never resolves on its
// own: the user just closes the checkout tab (Stripe's cancel_url and
// ePayco's failed-state redirect both only touch the frontend, never the
// DB), a webhook is delayed/lost/misconfigured, or the customer simply
// never comes back to trigger one of the read paths that also now
// self-heal (checkout-status, the verify-activate/epayco-verify
// fallbacks). Without this, a request could stay stuck at paymentStatus
// "pending" forever if nobody ever loads a page that checks it again.
// Runs on the same interval as reconcileLegacyApprovedRequests (see
// server.js), so worst case a stuck payment self-clears within one cycle
// (default: 15 minutes) even with zero user interaction - and
// resolvePendingPaymentStatus's own 48h ceiling still applies as the final
// backstop if the provider itself never gives a definitive answer.
export const reconcileStuckPendingPayments = async () => {
    const pendingRequests = await prisma.planUpgradeRequest.findMany({
        where: { status: "approved", paymentStatus: "pending" },
        select: UPGRADE_REQUEST_SELECT,
    });

    if (!pendingRequests.length) {
        return { checked: 0, resolved: 0 };
    }

    let resolved = 0;
    for (const request of pendingRequests) {
        try {
            const result = await resolvePendingPaymentStatus(request);
            if (result?.paymentStatus !== "pending") {
                resolved++;
            }
        } catch (error) {
            console.error("[payment-reconcile] Failed to resolve pending payment", {
                requestId: request.id,
                message: error?.message,
            });
        }
    }

    return { checked: pendingRequests.length, resolved };
};
