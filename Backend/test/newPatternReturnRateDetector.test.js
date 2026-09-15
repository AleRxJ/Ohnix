import test from "node:test";
import assert from "node:assert/strict";
import { computeNewPatterns, checkPrediction } from "../services/detectors/newPatternReturnRate.detector.js";

// Every order shares the same day-of-week (dates are 7 days apart) so the
// "day_of_week" dimension collapses to a single bucket whose rate always
// equals the overall baseline exactly - neutralizing it as a variable so
// only channel/customer_type/point_of_sale vary in this fixture.
let globalIndex = 0;
const nextOrderDate = () => new Date(Date.now() - globalIndex++ * 7 * 24 * 60 * 60 * 1000);

const buildGroup = ({ n, returnedCount, channel, customerType, pointOfSaleId }) =>
    Array.from({ length: n }, (_, i) => ({
        orderDate: nextOrderDate(),
        channel,
        pointOfSaleId,
        orderStatus: i < returnedCount ? "returned" : "completed",
        customer: { type: customerType },
    }));

// Three independently-clearing slices (channel=shopify, customer_type=vip,
// point_of_sale=pos2), ranked A > B > C by z-score, plus enough filler
// orders at a low baseline rate to reach MIN_ACCOUNT_ORDERS.
const buildFixtureOrders = () => [
    ...buildGroup({ n: 20, returnedCount: 10, channel: "shopify", customerType: "regular", pointOfSaleId: "pos1" }), // A: 50%
    ...buildGroup({ n: 20, returnedCount: 9, channel: "ohnix", customerType: "vip", pointOfSaleId: "pos1" }), // B: 45%
    ...buildGroup({ n: 20, returnedCount: 8, channel: "ohnix", customerType: "regular", pointOfSaleId: "pos2" }), // C: 40%
    ...buildGroup({ n: 150, returnedCount: 8, channel: "ohnix", customerType: "regular", pointOfSaleId: "pos1" }), // filler: ~5.3%
];

const createFixtureDb = () => {
    const orders = buildFixtureOrders();
    return {
        order: { findMany: async () => orders },
        pointOfSale: { findMany: async () => [{ id: "pos1", name: "Sede Principal" }, { id: "pos2", name: "Sede Norte" }] },
    };
};

test("computeNewPatterns finds all three independently-elevated slices as candidates", async () => {
    const db = createFixtureDb();
    const { candidates, findings } = await computeNewPatterns({ accountId: "acct_1", db });

    assert.equal(candidates.length, 3, "all three engineered slices should clear the per-slice thresholds");
    const dimensionKeys = candidates.map((c) => c.dimensionKey).sort();
    assert.deepEqual(dimensionKeys, ["channel", "customer_type", "point_of_sale"]);

    // MAX_FINDINGS caps what actually gets published to 2 - the weakest of
    // the three (point_of_sale, ranked by z) should be excluded from
    // `findings` but still present in `candidates`.
    assert.equal(findings.length, 2);
    assert.equal(findings.some((f) => f.dimensionKey === "point_of_sale"), false);
});

test("checkPrediction still recognizes a slice that cleared its own bar but fell out of the capped findings list", async () => {
    // Regression test for a real bug: checkPrediction used to search only
    // the capped `findings` (top 2 account-wide), so a prediction about the
    // 3rd-place slice was wrongly marked "incorrect" the moment a MORE
    // extreme pattern appeared elsewhere - even though the original slice's
    // return-rate gap never actually closed.
    const db = createFixtureDb();
    const prediction = {
        predictedData: {
            dimension_key: "point_of_sale",
            value: "pos2",
            slice_rate_pct_at_prediction: 40,
            baseline_rate_pct_at_prediction: 16.7,
        },
    };

    const result = await checkPrediction({ accountId: "acct_1", prediction, db });
    assert.equal(result.outcome, "correct");
    assert.equal(result.actualData.still_flagged, true);
});

test("checkPrediction reports incorrect when the named slice genuinely stops clearing the bar", async () => {
    const db = createFixtureDb();
    const prediction = {
        predictedData: {
            dimension_key: "channel",
            value: "some-channel-that-no-longer-exists",
            slice_rate_pct_at_prediction: 50,
            baseline_rate_pct_at_prediction: 16.7,
        },
    };

    const result = await checkPrediction({ accountId: "acct_1", prediction, db });
    assert.equal(result.outcome, "incorrect");
    assert.equal(result.actualData.still_flagged, false);
});

test("computeNewPatterns reports insufficient_history below MIN_ACCOUNT_ORDERS", async () => {
    const db = { order: { findMany: async () => [] }, pointOfSale: { findMany: async () => [] } };
    const result = await computeNewPatterns({ accountId: "acct_1", db });
    assert.deepEqual(result.findings, []);
    assert.equal(result.reason, "insufficient_history");
});
