import { prisma } from "../db/prisma.js";

// Sentinel for account-level metrics (no single entity) - NOT null, because
// Postgres treats NULLs as distinct from each other in a unique index, which
// would silently defeat the @@unique on MetricSnapshot (see schema.prisma).
export const ACCOUNT_ENTITY_ID = "";

// The one piece of infrastructure the reporting layer never had: metrics
// over time. Every existing report (report.controller.js) computes on
// demand and throws the result away - detectors call this instead of
// re-scanning full ledger history on every run, and it doubles as the
// historical record a future "compare this month to 3 years ago" detector
// would need without ever having to backfill anything retroactively.
export const upsertMetricSnapshot = async ({
    accountId,
    entityType,
    entityId = ACCOUNT_ENTITY_ID,
    metricKey,
    periodStart,
    periodEnd,
    value,
    metadata,
    db = prisma,
}) => {
    return db.metricSnapshot.upsert({
        where: {
            accountId_entityType_entityId_metricKey_periodStart: {
                accountId,
                entityType,
                entityId,
                metricKey,
                periodStart,
            },
        },
        update: { periodEnd, value, metadata: metadata ?? undefined },
        create: { accountId, entityType, entityId, metricKey, periodStart, periodEnd, value, metadata: metadata ?? undefined },
    });
};

export const getMetricSeries = async ({ accountId, entityType, entityId = ACCOUNT_ENTITY_ID, metricKey, db = prisma }) => {
    return db.metricSnapshot.findMany({
        where: { accountId, entityType, entityId, metricKey },
        orderBy: { periodStart: "asc" },
    });
};

// Shared month-bucket convention: ANY module that wants its metric covered
// by trajectoryShift.detector.js's generic shift scan (see that file's
// "external metrics" pass) must write exactly one MetricSnapshot per
// calendar month, with periodStart = monthBounds(monthKey(...)).start -
// exported here (not redefined per-writer) so every writer and the reader
// agree on the exact same month boundaries with zero risk of drift.
export const monthKey = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

export const monthBounds = (key) => {
    const [y, m] = key.split("-").map(Number);
    return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
};
