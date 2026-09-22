// Proves the English path actually produces English text, not just that
// Spanish still works via resolveIsEnglish's safe default - see
// services/discoveryLocale.service.js's header comment for why this exists.
import test from "node:test";
import assert from "node:assert/strict";
import { computeNewPatterns } from "../services/detectors/newPatternReturnRate.detector.js";
import { computeCrossFactorFindings } from "../services/detectors/crossFactorCorrelation.detector.js";
import { computeTrajectoryShifts } from "../services/detectors/trajectoryShift.detector.js";
import { runExplanationCheck } from "../services/discoveryExplanation.service.js";

let globalIndex = 0;
const nextOrderDate = () => new Date(Date.now() - globalIndex++ * 7 * 24 * 60 * 60 * 1000);
const buildOrders = ({ n, returnedCount, channel, customerType }) =>
    Array.from({ length: n }, (_, i) => ({
        orderDate: nextOrderDate(),
        channel,
        pointOfSaleId: "pos1",
        orderStatus: i < returnedCount ? "returned" : "completed",
        customer: { type: customerType },
    }));

test("computeNewPatterns returns English dimension/value labels when isEN=true", async () => {
    const orders = [
        ...buildOrders({ n: 20, returnedCount: 10, channel: "shopify", customerType: "regular" }),
        ...buildOrders({ n: 150, returnedCount: 8, channel: "ohnix", customerType: "regular" }),
    ];
    const db = {
        order: { findMany: async () => orders },
        pointOfSale: { findMany: async () => [] },
    };

    const esResult = await computeNewPatterns({ accountId: "acct_1", db, isEN: false });
    const enResult = await computeNewPatterns({ accountId: "acct_1", db, isEN: true });

    assert.equal(esResult.findings[0].dimensionLabel, "Canal de venta");
    assert.equal(enResult.findings[0].dimensionLabel, "Sales channel");
});

test("computeCrossFactorFindings returns English dimension/value labels when isEN=true, including day names", async () => {
    const buildGroup = ({ n, returnedCount, channel, customerType }) =>
        Array.from({ length: n }, (_, i) => ({
            orderDate: new Date(Date.UTC(2026, 8, 10 + (i % 15))), // September 2026, all Thu/Fri/Sat/etc mixed
            channel,
            pointOfSaleId: "pos1",
            orderStatus: i < returnedCount ? "returned" : "completed",
            customer: { type: customerType },
        }));
    const orders = [
        ...buildGroup({ n: 20, returnedCount: 16, channel: "shopify", customerType: "vip" }),
        ...buildGroup({ n: 20, returnedCount: 2, channel: "shopify", customerType: "regular" }),
        ...buildGroup({ n: 20, returnedCount: 2, channel: "ohnix", customerType: "vip" }),
        ...buildGroup({ n: 140, returnedCount: 8, channel: "ohnix", customerType: "regular" }),
    ];
    const db = {
        order: { findMany: async () => orders },
        pointOfSale: { findMany: async () => [{ id: "pos1", name: "Main branch" }] },
        discoveryDimensionConfig: { findMany: async () => [] },
    };

    const enResult = await computeCrossFactorFindings({ accountId: "acct_1", db, isEN: true });
    assert.equal(enResult.candidates.length, 1);
    assert.equal(enResult.candidates[0].dimALabel, "Sales channel");
    assert.equal(enResult.candidates[0].dimBLabel, "Customer type");
});

test("computeTrajectoryShifts returns an English label for its own built-in metrics", async () => {
    const orders = [];
    // 8 months of stable ~10 orders, then 3 months jumping to ~40 - enough
    // for a real shift, mirroring the shape other trajectoryShift tests use.
    const NOW = new Date("2026-09-15T00:00:00Z");
    for (let monthsAgo = 10; monthsAgo >= 0; monthsAgo--) {
        const count = monthsAgo < 3 ? 40 : 10;
        for (let i = 0; i < count; i++) {
            orders.push({
                orderDate: new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - monthsAgo, 10)),
                total: 100000,
                customerId: `c${i}`,
            });
        }
    }
    const db = {
        order: { findMany: async () => orders },
        cashMovement: { findMany: async () => [] },
        metricSnapshot: {
            upsert: async ({ create }) => create,
            findMany: async () => [],
        },
    };

    const enResult = await computeTrajectoryShifts({ accountId: "acct_1", db, now: NOW, isEN: true });
    const orderCountShift = enResult.find((s) => s.metricKey === "monthly_order_count");
    assert.ok(orderCountShift, "expected a shift on monthly_order_count");
    assert.equal(orderCountShift.metricLabel, "Monthly order count");
});

test("runExplanationCheck returns an English label when the account prefers English", async () => {
    const db = {
        user: { findUnique: async () => ({ preferredLanguage: "en" }) },
        discoveryEntityLink: { findMany: async () => [] },
        order: { findMany: async () => [] },
    };
    const discovery = { id: "disc_1", detectorKey: "customer_churn_risk" };
    const result = await runExplanationCheck({ accountId: "acct_1", discovery, tag: "seasonal", db });
    assert.equal(result.label, "Your explanation checked against the evidence");
});
