import test from "node:test";
import assert from "node:assert/strict";
import { writeWarrantyClaimRateMetric, METRIC_KEY } from "../services/metrics/warrantyClaimRate.metric.js";

const NOW = new Date("2026-09-15T00:00:00Z");
const inMonth = (monthsAgo, day = 10) => new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - monthsAgo, day));

const createFakeDb = ({ orders = [], warranties = [] }) => {
    const written = [];
    return {
        order: {
            findMany: async ({ where }) => {
                const { orderStatus, orderDate } = where;
                return orders.filter(
                    (o) => orderStatus.in.includes(o.orderStatus) && o.orderDate >= orderDate.gte && o.orderDate < orderDate.lt
                );
            },
        },
        warranty: {
            findMany: async ({ where }) => {
                const { createdAt } = where;
                return warranties.filter((w) => w.createdAt >= createdAt.gte && w.createdAt < createdAt.lt);
            },
        },
        metricSnapshot: {
            upsert: async ({ create }) => {
                written.push(create);
                return create;
            },
        },
        _written: written,
    };
};

test("writeWarrantyClaimRateMetric computes claims / orders as a percentage", async () => {
    const db = createFakeDb({
        orders: [
            { orderDate: inMonth(1), orderStatus: "completed" },
            { orderDate: inMonth(1), orderStatus: "completed" },
            { orderDate: inMonth(1), orderStatus: "returned" },
            { orderDate: inMonth(1), orderStatus: "pending" }, // never a real sale, must not count
        ],
        warranties: [{ createdAt: inMonth(1) }],
    });

    const result = await writeWarrantyClaimRateMetric({ accountId: "acct_1", db, now: NOW });
    assert.equal(result.monthsWritten, 1);
    assert.equal(db._written[0].metricKey, METRIC_KEY);
    // 1 claim / 3 real orders = 33.33%
    assert.equal(db._written[0].value, 33.33);
    assert.equal(db._written[0].metadata.orders, 3);
    assert.equal(db._written[0].metadata.claims, 1);
});

test("writeWarrantyClaimRateMetric skips a month with no sales - never writes a fake rate", async () => {
    const db = createFakeDb({ orders: [], warranties: [{ createdAt: inMonth(0) }] });
    const result = await writeWarrantyClaimRateMetric({ accountId: "acct_1", db, now: NOW });
    assert.equal(result.monthsWritten, 0);
    assert.equal(db._written.length, 0);
});

test("writeWarrantyClaimRateMetric writes a real 0% for a month with sales but no claims", async () => {
    const db = createFakeDb({ orders: [{ orderDate: inMonth(0), orderStatus: "completed" }], warranties: [] });
    const result = await writeWarrantyClaimRateMetric({ accountId: "acct_1", db, now: NOW });
    assert.equal(result.monthsWritten, 1);
    assert.equal(db._written[0].value, 0);
});
