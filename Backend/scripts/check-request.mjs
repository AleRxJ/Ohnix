import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const requestId = process.argv[2];
if (!requestId) {
    console.error("Usage: node scripts/check-request.mjs <upgradeRequestId>");
    process.exit(1);
}

const request = await prisma.planUpgradeRequest.findUnique({
    where: { id: requestId },
});

console.log("REQUEST:", JSON.stringify(request, null, 2));

if (request?.userId) {
    const user = await prisma.user.findUnique({
        where: { id: request.userId },
        select: { id: true, email: true, username: true, tokenVersion: true, updatedAt: true },
    });
    console.log("USER:", JSON.stringify(user, null, 2));

    const subscription = await prisma.subscription.findUnique({
        where: { userId: request.userId },
    });
    console.log("SUBSCRIPTION:", JSON.stringify(subscription, null, 2));
}

await prisma.$disconnect();
