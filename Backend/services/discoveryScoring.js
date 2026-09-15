// Turns a detector's raw signal strengths (each already 0-1) into the score
// fields Discovery stores. One place for the weighting formula so ranking
// logic isn't re-derived ad hoc wherever discoveries get listed - the same
// problem report.controller.js already has in miniature, with
// period-comparison and top-customers each rolling their own "what matters"
// logic independently.

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

// reversibility is "how easy to undo/fix if this turns out wrong or the
// user ignores it" - high reversibility should LOWER priority (an
// easily-corrected situation is less pressing to surface than an
// irreversible one), hence (1 - reversibility) below.
export const computeDiscoveryScore = ({ impact, novelty, urgency, confidence, reversibility }) => {
    const impactScore = clamp01(impact);
    const noveltyScore = clamp01(novelty);
    const urgencyScore = clamp01(urgency);
    const confidenceScore = clamp01(confidence);
    const reversibilityScore = clamp01(reversibility);

    // Max 10: impact and confidence carry the most weight on purpose - a
    // high-confidence, high-impact finding should always outrank a merely
    // novel or urgent-sounding one with weak evidence.
    const priorityScore = Number(
        (
            impactScore * 4 +
            urgencyScore * 2.5 +
            confidenceScore * 2 +
            noveltyScore * 1 +
            (1 - reversibilityScore) * 0.5
        ).toFixed(3)
    );

    return {
        impactScore,
        noveltyScore,
        urgencyScore,
        confidence: confidenceScore,
        reversibility: reversibilityScore,
        priorityScore,
    };
};

// Mission section 9: "Ohnix predijo... 68% terminaron en pérdida... Ohnix
// actualiza su confianza." DiscoveryPatternStats accumulates that track
// record (discoveryLearning.service.js) - this is where it actually feeds
// BACK into new detections, closing the loop instead of just accumulating
// numbers nobody reads. A detector's own fresh, situation-specific signal
// still dominates on purpose (MAX_LEARNED_WEIGHT caps how much the
// long-run track record can pull it) - a detector that's usually right
// shouldn't get to skip having real evidence for a specific new finding.
const MIN_PREDICTIONS_FOR_TRUST = 3;
const MAX_LEARNED_WEIGHT = 0.4;
// Reaches the cap once this many predictions have been checked - a
// detector doesn't need hundreds of data points to start counting, just
// enough that its accuracy isn't one lucky (or unlucky) guess.
const PREDICTIONS_FOR_MAX_WEIGHT = 20;

export const applyLearnedConfidence = ({ confidence, patternStats }) => {
    if (!patternStats || patternStats.totalPredictions < MIN_PREDICTIONS_FOR_TRUST) {
        return { confidence, blended: false };
    }

    const weight = Math.min(MAX_LEARNED_WEIGHT, patternStats.totalPredictions / PREDICTIONS_FOR_MAX_WEIGHT);
    const learnedConfidence = clamp01(Number(patternStats.currentConfidence));
    const freshConfidence = clamp01(confidence);
    const blendedConfidence = Number((freshConfidence * (1 - weight) + learnedConfidence * weight).toFixed(3));

    return {
        confidence: blendedConfidence,
        blended: true,
        freshConfidence,
        learnedConfidence,
        weight: Number(weight.toFixed(3)),
        totalPredictions: patternStats.totalPredictions,
        correctPredictions: patternStats.correctPredictions,
    };
};
