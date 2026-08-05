import { prisma } from "../db/prisma.js";

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
