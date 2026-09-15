import test from "node:test";
import assert from "node:assert/strict";
import { computeDiscoveryScore, applyLearnedConfidence } from "../services/discoveryScoring.js";

test("computeDiscoveryScore clamps out-of-range inputs into 0-1", () => {
    const score = computeDiscoveryScore({ impact: 1.5, novelty: -0.2, urgency: "not-a-number", confidence: 2, reversibility: 0.5 });
    assert.equal(score.impactScore, 1);
    assert.equal(score.noveltyScore, 0);
    assert.equal(score.urgencyScore, 0);
    assert.equal(score.confidence, 1);
    assert.equal(score.reversibility, 0.5);
});

test("computeDiscoveryScore weighs impact and confidence over novelty", () => {
    const highImpactLowNovelty = computeDiscoveryScore({ impact: 1, novelty: 0, urgency: 0, confidence: 1, reversibility: 0 });
    const lowImpactHighNovelty = computeDiscoveryScore({ impact: 0, novelty: 1, urgency: 0, confidence: 0, reversibility: 0 });
    assert.ok(highImpactLowNovelty.priorityScore > lowImpactHighNovelty.priorityScore);
});

test("computeDiscoveryScore: higher reversibility lowers priority, all else equal", () => {
    const easilyReversible = computeDiscoveryScore({ impact: 0.5, novelty: 0.5, urgency: 0.5, confidence: 0.5, reversibility: 1 });
    const irreversible = computeDiscoveryScore({ impact: 0.5, novelty: 0.5, urgency: 0.5, confidence: 0.5, reversibility: 0 });
    assert.ok(irreversible.priorityScore > easilyReversible.priorityScore);
});

test("computeDiscoveryScore priority score never exceeds 10", () => {
    const maxed = computeDiscoveryScore({ impact: 1, novelty: 1, urgency: 1, confidence: 1, reversibility: 0 });
    assert.ok(maxed.priorityScore <= 10);
});

test("applyLearnedConfidence leaves confidence untouched with no pattern stats", () => {
    const result = applyLearnedConfidence({ confidence: 0.7, patternStats: null });
    assert.equal(result.confidence, 0.7);
    assert.equal(result.blended, false);
});

test("applyLearnedConfidence leaves confidence untouched below the trust threshold", () => {
    const result = applyLearnedConfidence({
        confidence: 0.7,
        patternStats: { totalPredictions: 2, correctPredictions: 2, currentConfidence: 0.9 },
    });
    assert.equal(result.confidence, 0.7);
    assert.equal(result.blended, false);
});

test("applyLearnedConfidence blends toward the learned rate once trust threshold is met", () => {
    // 5 predictions, 4 correct -> weight = min(0.4, 5/20) = 0.25
    const result = applyLearnedConfidence({
        confidence: 0.85,
        patternStats: { totalPredictions: 5, correctPredictions: 4, currentConfidence: 0.714 },
    });
    assert.equal(result.blended, true);
    assert.equal(result.weight, 0.25);
    assert.equal(result.confidence, Number((0.85 * 0.75 + 0.714 * 0.25).toFixed(3)));
});

test("applyLearnedConfidence caps the learned weight even with a long track record", () => {
    // 200 predictions would give a raw weight of 10 without the cap.
    const result = applyLearnedConfidence({
        confidence: 0.9,
        patternStats: { totalPredictions: 200, correctPredictions: 180, currentConfidence: 0.9 },
    });
    assert.equal(result.weight, 0.4);
});

test("applyLearnedConfidence clamps a learned confidence outside 0-1 (defensive against bad data)", () => {
    const result = applyLearnedConfidence({
        confidence: 0.5,
        patternStats: { totalPredictions: 10, correctPredictions: 10, currentConfidence: 1.4 },
    });
    assert.ok(result.confidence <= 1);
});
