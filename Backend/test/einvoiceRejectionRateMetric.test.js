import test from "node:test";
import assert from "node:assert/strict";
import { writeEinvoiceRejectionRateMetric, METRIC_KEY } from "../services/metrics/einvoiceRejectionRate.metric.js";

const NOW = new Date("2026-09-15T00:00:00Z");
const inMonth = (monthsAgo, day = 10) => new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - monthsAgo, day));

const createFakeDb = (invoices) => {
    const written = [];
    return {
        // Mirrors what Prisma's real `where: { status: { in: [...] } }`
        // does - the production query never returns draft/cancelled rows in
        // the first place, so this fake shouldn't either.
        electronicInvoice: {
            findMany: async ({ where }) => invoices.filter((inv) => !where?.status?.in || where.status.in.includes(inv.status)),
        },
        metricSnapshot: {
            upsert: async ({ where, create }) => {
                written.push(create);
                return create;
            },
        },
        _written: written,
    };
};

test("writeEinvoiceRejectionRateMetric computes a monthly rejection rate from real invoice statuses", async () => {
    const invoices = [
        { status: "accepted", createdAt: inMonth(1) },
        { status: "accepted", createdAt: inMonth(1) },
        { status: "accepted", createdAt: inMonth(1) },
        { status: "rejected", createdAt: inMonth(1) },
        // draft/cancelled never reached DIAN - must not count toward the denominator.
        { status: "draft", createdAt: inMonth(1) },
        { status: "cancelled", createdAt: inMonth(1) },
    ];
    const db = createFakeDb(invoices);

    const result = await writeEinvoiceRejectionRateMetric({ accountId: "acct_1", db, now: NOW });
    assert.equal(result.monthsWritten, 1);
    assert.equal(db._written.length, 1);
    assert.equal(db._written[0].metricKey, METRIC_KEY);
    // 1 rejected out of 4 attempted (draft/cancelled excluded) = 25%.
    assert.equal(db._written[0].value, 25);
    assert.equal(db._written[0].metadata.attempted, 4);
    assert.equal(db._written[0].metadata.rejected, 1);
});

test("writeEinvoiceRejectionRateMetric skips a month with zero attempted invoices entirely - never writes a fake 0%", async () => {
    const db = createFakeDb([]);
    const result = await writeEinvoiceRejectionRateMetric({ accountId: "acct_1", db, now: NOW });
    assert.equal(result.monthsWritten, 0);
    assert.equal(db._written.length, 0);
});

test("writeEinvoiceRejectionRateMetric treats error the same as rejected", async () => {
    const invoices = [
        { status: "accepted", createdAt: inMonth(0) },
        { status: "error", createdAt: inMonth(0) },
    ];
    const db = createFakeDb(invoices);
    const result = await writeEinvoiceRejectionRateMetric({ accountId: "acct_1", db, now: NOW });
    assert.equal(result.monthsWritten, 1);
    assert.equal(db._written[0].value, 50);
});
