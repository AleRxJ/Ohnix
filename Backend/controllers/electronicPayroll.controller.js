import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
    getElectronicPayrollForDocument,
    issueElectronicPayrollForDocument,
    issueElectronicPayrollForPeriod,
    syncElectronicPayrollStatus,
    issueElectronicPayrollAdjustment,
    syncElectronicPayrollAdjustmentStatus,
} from "../services/electronicPayroll.service.js";

export const getDocumentElectronicPayroll = asyncHandler(async (req, res) => {
    const data = await getElectronicPayrollForDocument({
        documentId: req.params.documentId,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
    });
    return res.status(200).json(new ApiResponse(200, data, "Electronic payroll fetched successfully"));
});

export const issueDocumentElectronicPayroll = asyncHandler(async (req, res) => {
    const data = await issueElectronicPayrollForDocument({
        documentId: req.params.documentId,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
        trigger: "manual_api",
    });
    return res.status(200).json(new ApiResponse(200, data, "Electronic payroll sent successfully"));
});

export const syncDocumentElectronicPayroll = asyncHandler(async (req, res) => {
    const data = await syncElectronicPayrollStatus({
        documentId: req.params.documentId,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
    });
    return res.status(200).json(new ApiResponse(200, data, "Electronic payroll status synced successfully"));
});

export const issuePeriodElectronicPayroll = asyncHandler(async (req, res) => {
    const data = await issueElectronicPayrollForPeriod({
        periodId: req.params.id,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
    });
    return res.status(200).json(new ApiResponse(200, data, "Electronic payroll issuance started for the period"));
});

export const issueDocumentElectronicPayrollAdjustment = asyncHandler(async (req, res) => {
    const data = await issueElectronicPayrollAdjustment({
        documentId: req.params.documentId,
        adjustmentType: req.body?.adjustment_type,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
        trigger: "manual_api",
    });
    return res.status(200).json(new ApiResponse(200, data, "Electronic payroll adjustment sent successfully"));
});

export const syncDocumentElectronicPayrollAdjustment = asyncHandler(async (req, res) => {
    const data = await syncElectronicPayrollAdjustmentStatus({
        documentId: req.params.documentId,
        adjustmentId: req.params.adjustmentId,
        requesterUserId: req.user.prismaId,
        requesterRole: req.user.role,
    });
    return res.status(200).json(new ApiResponse(200, data, "Electronic payroll adjustment status synced successfully"));
});
