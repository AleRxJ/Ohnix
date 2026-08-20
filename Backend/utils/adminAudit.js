import { prisma } from "../db/prisma.js";

// Single write path for the admin audit trail (see AdminAuditLog in
// schema.prisma) - every consequential admin-panel action on a customer's
// billing/plan should call this. Deliberately best-effort: a logging
// failure must never block or fail the actual admin action it's describing,
// so this swallows its own errors after logging them server-side instead of
// throwing - the action already happened by the time this runs, and losing
// one audit row is a much smaller problem than a 500 on a cancel/extend
// that already succeeded.
export const logAdminAction = async ({ adminId, action, targetType, targetId, targetUserId, metadata }) => {
    if (!adminId || !action || !targetType) return;

    try {
        await prisma.adminAuditLog.create({
            data: {
                adminId,
                action,
                targetType,
                targetId: targetId || null,
                targetUserId: targetUserId || null,
                metadata: metadata || undefined,
            },
        });
    } catch (error) {
        console.error("[admin-audit] Failed to write audit log entry", {
            adminId,
            action,
            targetType,
            targetId,
            message: error?.message,
        });
    }
};
