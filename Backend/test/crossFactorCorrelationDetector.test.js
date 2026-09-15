import test from "node:test";
import assert from "node:assert/strict";
import { computeCrossFactorFindings, checkPrediction } from "../services/detectors/crossFactorCorrelation.detector.js";

// Every order shares the same day-of-week (dates are 7 days apart) and the
// same point_of_sale, so those two dimensions carry no information on their
// own - any pair involving them should collapse back to whichever single
// dimension actually varies and get filtered out by the interaction-lift
// requirement, exactly like it would for an account where a given attribute
// genuinely doesn't matter.
let globalIndex = 0;
const nextOrderDate = () => new Date(Date.now() - globalIndex++ * 7 * 24 * 60 * 60 * 1000);

const buildGroup = ({ n, returnedCount, channel, customerType }) =>
    Array.from({ length: n }, (_, i) => ({
        orderDate: nextOrderDate(),
        channel,
        pointOfSaleId: "pos1",
        orderStatus: i < returnedCount ? "returned" : "completed",
        customer: { type: customerType },
    }));

// channel=shopify alone: 45% returns. customer_type=vip alone: 45% returns.
// Neither single condition is wildly above the ~14% baseline on its own -
// only their COMBINATION (shopify + vip, 80%) is the real story here, which
// is exactly the shape new_pattern_return_rate.detector.js (single-dimension
// only) cannot see.
const buildFixtureOrders = () => [
    ...buildGroup({ n: 20, returnedCount: 16, channel: "shopify", customerType: "vip" }), // the interaction: 80%
    ...buildGroup({ n: 20, returnedCount: 2, channel: "shopify", customerType: "regular" }), // 10%
    ...buildGroup({ n: 20, returnedCount: 2, channel: "ohnix", customerType: "vip" }), // 10%
    ...buildGroup({ n: 140, returnedCount: 8, channel: "ohnix", customerType: "regular" }), // filler baseline ~5.7%
];

const createFixtureDb = () => {
    const orders = buildFixtureOrders();
    return {
        order: { findMany: async () => orders },
        pointOfSale: { findMany: async () => [{ id: "pos1", name: "Sede Principal" }] },
    };
};

test("computeCrossFactorFindings flags the genuine channel x customer_type interaction and nothing else", async () => {
    const db = createFixtureDb();
    const { candidates, findings } = await computeCrossFactorFindings({ accountId: "acct_1", db });

    assert.equal(candidates.length, 1, "only the real interaction should clear the interaction-lift bar - pairs involving the constant dimensions must be filtered out");
    const [candidate] = candidates;
    assert.equal(candidate.dimAKey, "channel");
    assert.equal(candidate.dimBKey, "customer_type");
    assert.equal(candidate.valueA, "shopify");
    assert.equal(candidate.valueB, "vip");
    assert.equal(candidate.combinedRatePct, 80);
    assert.ok(candidate.interactionLift > 1.25, "combined rate must clearly beat the stronger of the two single-condition rates");

    assert.equal(findings.length, 1);
    assert.equal(findings[0].valueA, "shopify");
});

test("checkPrediction reports correct while the interaction still holds", async () => {
    const db = createFixtureDb();
    const prediction = {
        predictedData: {
            dim_a_key: "channel",
            value_a: "shopify",
            dim_b_key: "customer_type",
            value_b: "vip",
            combined_rate_pct_at_prediction: 80,
            baseline_rate_pct_at_prediction: 14,
        },
    };

    const result = await checkPrediction({ accountId: "acct_1", prediction, db });
    assert.equal(result.outcome, "correct");
    assert.equal(result.actualData.still_flagged, true);
});

test("checkPrediction reports incorrect once the combination stops standing out", async () => {
    // Same total volume, but now shopify+vip returns at the account's normal
    // rate - the interaction genuinely closed.
    const db = {
        order: {
            findMany: async () => [
                ...buildGroup({ n: 20, returnedCount: 3, channel: "shopify", customerType: "vip" }),
                ...buildGroup({ n: 20, returnedCount: 2, channel: "shopify", customerType: "regular" }),
                ...buildGroup({ n: 20, returnedCount: 2, channel: "ohnix", customerType: "vip" }),
                ...buildGroup({ n: 140, returnedCount: 8, channel: "ohnix", customerType: "regular" }),
            ],
        },
        pointOfSale: { findMany: async () => [{ id: "pos1", name: "Sede Principal" }] },
    };
    const prediction = {
        predictedData: {
            dim_a_key: "channel",
            value_a: "shopify",
            dim_b_key: "customer_type",
            value_b: "vip",
            combined_rate_pct_at_prediction: 80,
            baseline_rate_pct_at_prediction: 14,
        },
    };

    const result = await checkPrediction({ accountId: "acct_1", prediction, db });
    assert.equal(result.outcome, "incorrect");
    assert.equal(result.actualData.still_flagged, false);
});

test("computeCrossFactorFindings reports insufficient_history below MIN_ACCOUNT_ORDERS", async () => {
    const db = { order: { findMany: async () => [] }, pointOfSale: { findMany: async () => [] } };
    const result = await computeCrossFactorFindings({ accountId: "acct_1", db });
    assert.deepEqual(result.findings, []);
    assert.equal(result.reason, "insufficient_history");
});
