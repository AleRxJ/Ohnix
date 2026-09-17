import { prisma } from "../db/prisma.js";

export const listAccountingAudit = async ({ accountId, from, to, entityType, action, actorId }) => {
    const rows = await prisma.accountingConfigAudit.findMany({
        where: {
            accountId,
            ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
            ...(entityType ? { entityType } : {}),
            ...(action ? { action } : {}),
            ...(actorId ? { actorId } : {}),
        },
        include: { actor: { select: { id: true, username: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 500,
    });
    return rows.map((row) => ({
        _id: row.id,
        entity_type: row.entityType,
        entity_id: row.entityId,
        action: row.action,
        before: row.before,
        after: row.after,
        created_at: row.createdAt,
        actor: row.actor ? { _id: row.actor.id, username: row.actor.username, email: row.actor.email } : null,
    }));
};
