import test from "node:test";
import assert from "node:assert/strict";
import { getEnabledDimensionKeys } from "../services/discoveryDimensionConfig.service.js";
import { computeCrossFactorFindings } from "../services/detectors/crossFactorCorrelation.detector.js";

const REGISTRY = [
    { key: "a", defaultEnabled: true },
    { key: "b", defaultEnabled: true },
    { key: "c", defaultEnabled: false },
];

test("getEnabledDimensionKeys falls back to each registry entry's own defaultEnabled when no config row exists", async () => {
    const db = { discoveryDimensionConfig: { findMany: async () => [] } };
    const enabled = await getEnabledDimensionKeys({ detectorKey: "some_detector", registry: REGISTRY, db });
    assert.deepEqual([...enabled].sort(), ["a", "b"]);
});

test("getEnabledDimensionKeys lets a DB row turn on a dimension that defaults to off", async () => {
    const db = { discoveryDimensionConfig: { findMany: async () => [{ dimensionKey: "c", enabled: true }] } };
    const enabled = await getEnabledDimensionKeys({ detectorKey: "some_detector", registry: REGISTRY, db });
    assert.deepEqual([...enabled].sort(), ["a", "b", "c"]);
});

test("getEnabledDimensionKeys lets a DB row turn off a dimension that defaults to on", async () => {
    const db = { discoveryDimensionConfig: { findMany: async () => [{ dimensionKey: "a", enabled: false }] } };
    const enabled = await getEnabledDimensionKeys({ detectorKey: "some_detector", registry: REGISTRY, db });
    assert.deepEqual([...enabled].sort(), ["b"]);
});

// End-to-end through the real detector: month_of_year ships disabled by
// default (see DIMENSION_REGISTRY's own comment) - this proves flipping it
// on via a database row (no deploy, no code change) actually changes what
// the detector searches, using a fixture built the same way
// crossFactorCorrelationDetector.test.js's does.
let globalIndex = 0;
const nextOrderDate = (monthOffset) => {
    const d = new Date(Date.UTC(2026, monthOffset, 10 + (globalIndex++ % 15)));
    return d;
};

const buildGroup = ({ n, returnedCount, month, channel }) =>
    Array.from({ length: n }, (_, i) => ({
        orderDate: nextOrderDate(month),
        channel,
        pointOfSaleId: "pos1",
        orderStatus: i < returnedCount ? "returned" : "completed",
        customer: { type: "regular" },
    }));

test("computeCrossFactorFindings only searches month_of_year once a config row turns it on", async () => {
    // September (month 8) x channel=shopify: 80% returns - a genuine
    // interaction, but only findable if month_of_year is actually searched.
    const orders = [
        ...buildGroup({ n: 20, returnedCount: 16, month: 8, channel: "shopify" }),
        ...buildGroup({ n: 20, returnedCount: 2, month: 8, channel: "ohnix" }),
        ...buildGroup({ n: 20, returnedCount: 2, month: 3, channel: "shopify" }),
        ...buildGroup({ n: 140, returnedCount: 8, month: 3, channel: "ohnix" }),
    ];
    const pointOfSale = { findMany: async () => [{ id: "pos1", name: "Sede Principal" }] };

    const dbWithoutConfig = { order: { findMany: async () => orders }, pointOfSale, discoveryDimensionConfig: { findMany: async () => [] } };
    const { candidates: withoutConfig } = await computeCrossFactorFindings({ accountId: "acct_1", db: dbWithoutConfig });
    assert.equal(withoutConfig.some((c) => c.dimAKey === "month_of_year" || c.dimBKey === "month_of_year"), false, "month_of_year defaults to off");

    const dbWithConfig = {
        order: { findMany: async () => orders },
        pointOfSale,
        discoveryDimensionConfig: { findMany: async () => [{ dimensionKey: "month_of_year", enabled: true }] },
    };
    const { candidates: withConfig } = await computeCrossFactorFindings({ accountId: "acct_1", db: dbWithConfig });
    assert.ok(
        withConfig.some((c) => (c.dimAKey === "month_of_year" || c.dimBKey === "month_of_year") && (c.valueALabel === "septiembre" || c.valueBLabel === "septiembre")),
        "turning month_of_year on via a config row should surface the september x shopify interaction with no code change"
    );
});
