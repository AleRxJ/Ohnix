import test from "node:test";
import assert from "node:assert/strict";
import { getAgingBucket, summarizeAging } from "../utils/accountAging.js";

test("aging buckets preserve every due-date boundary", () => {
    assert.equal(getAgingBucket(null), "unscheduled");
    assert.equal(getAgingBucket(-1), "not_due");
    assert.equal(getAgingBucket(0), "not_due");
    assert.equal(getAgingBucket(1), "days_1_30");
    assert.equal(getAgingBucket(30), "days_1_30");
    assert.equal(getAgingBucket(31), "days_31_60");
    assert.equal(getAgingBucket(60), "days_31_60");
    assert.equal(getAgingBucket(61), "days_61_90");
    assert.equal(getAgingBucket(90), "days_61_90");
    assert.equal(getAgingBucket(91), "over_90");
});

test("aging summary rounds each bucket independently", () => {
    assert.deepEqual(summarizeAging([
        { aging_bucket: "days_1_30", pending: 10.005 },
        { aging_bucket: "days_1_30", pending: 5.005 },
        { aging_bucket: "unscheduled", pending: 7 },
    ]), { not_due: 0, days_1_30: 15.01, days_31_60: 0, days_61_90: 0, over_90: 0, unscheduled: 7 });
});
