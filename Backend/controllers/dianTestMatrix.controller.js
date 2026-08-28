import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
    startDianTestMatrixRun,
    getDianTestMatrixRun,
    listDianTestMatrixRuns,
    cancelDianTestMatrixRun,
} from "../services/dianTestMatrix.service.js";

export const startDianTestMatrixRunAdmin = asyncHandler(async (req, res) => {
    const { companyId, testSetId } = req.body || {};
    const data = await startDianTestMatrixRun({ companyId, testSetId, requesterUserId: req.user.id });
    return res.status(201).json(new ApiResponse(201, data, "DIAN test-matrix run started"));
});

export const getDianTestMatrixRunAdmin = asyncHandler(async (req, res) => {
    const data = await getDianTestMatrixRun({ runId: req.params.runId });
    return res.status(200).json(new ApiResponse(200, data, "DIAN test-matrix run retrieved"));
});

export const listDianTestMatrixRunsAdmin = asyncHandler(async (req, res) => {
    const { companyId } = req.query || {};
    const data = await listDianTestMatrixRuns({ companyId });
    return res.status(200).json(new ApiResponse(200, data, "DIAN test-matrix runs retrieved"));
});

export const cancelDianTestMatrixRunAdmin = asyncHandler(async (req, res) => {
    const data = await cancelDianTestMatrixRun({ runId: req.params.runId });
    return res.status(200).json(new ApiResponse(200, data, "DIAN test-matrix run cancellation requested"));
});
