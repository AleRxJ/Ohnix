import { prisma } from "../db/prisma.js";

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

    const requestsToFix = approvedRequests.filter((request) => {
        const subscription = subscriptionByUserId[request.userId];
        if (!subscription) {
            return false;
        }

        return (
            subscription.plan === request.targetPlan &&
            subscription.status === "active"
        );
    });

    for (const request of requestsToFix) {
        await prisma.subscription.update({
            where: { userId: request.userId },
            data: {
                plan: request.currentPlan,
                status: "active",
                endsAt: null,
            },
        });
    }

    return {
        checked: approvedRequests.length,
        fixed: requestsToFix.length,
    };
};