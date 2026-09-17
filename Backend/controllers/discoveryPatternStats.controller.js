// Admin-only, read-only view into DiscoveryPatternStats - the Fase 4
// learning loop's own track record per detector (see
// discoveryLearning.service.js). Exists so an admin can SEE the
// self-correction loop actually working (or not) instead of just trusting
// it runs - "X% aciertos de Y predicciones revisadas" is the same number
// applyLearnedConfidence (discoveryScoring.js) blends into every new
// finding from that detector.

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { prisma } from "../db/prisma.js";

export const listDiscoveryPatternStats = asyncHandler(async (req, res) => {
    const rows = await prisma.discoveryPatternStats.findMany({ orderBy: { detectorKey: "asc" } });

    const stats = rows.map((row) => ({
        detector_key: row.detectorKey,
        total_predictions: row.totalPredictions,
        correct_predictions: row.correctPredictions,
        incorrect_predictions: row.totalPredictions - row.correctPredictions,
        accuracy_pct: row.totalPredictions > 0 ? Number(((row.correctPredictions / row.totalPredictions) * 100).toFixed(1)) : null,
        current_confidence_pct: Number((Number(row.currentConfidence) * 100).toFixed(1)),
        updated_at: row.updatedAt,
    }));

    return res.status(200).json(new ApiResponse(200, stats, "Discovery pattern stats fetched successfully."));
});
