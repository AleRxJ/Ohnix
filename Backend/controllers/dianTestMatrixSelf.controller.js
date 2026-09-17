import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
    startDianTestMatrixRun,
    getDianTestMatrixRun,
    listDianTestMatrixRuns,
    cancelDianTestMatrixRun,
    retryFailedDianTestMatrixDocuments,
} from "../services/dianTestMatrix.service.js";
import { ensureElectronicInvoicingPlan } from "../services/electronicInvoicing.service.js";
import { notifyAdminsDianProductionActivationRequested } from "../utils/dianTestMatrixNotifications.js";

// Self-service counterpart to dianTestMatrix.controller.js's *Admin
// functions - same "never accept a company id from the client" rule as
// companySelf.controller.js's own getOwnedCompanyOrThrow (kept as its own
// small copy here rather than an import, matching that file's own precedent
// of duplicating this one helper over adding a cross-controller coupling).
const getOwnedCompanyOrThrow = async (userId) => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
    if (!user?.companyId) {
        throw new ApiError(422, "Configura primero los datos de tu empresa antes de iniciar una prueba de habilitación.");
    }
    const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: { id: true } });
    if (!company) throw new ApiError(404, "Empresa no encontrada.");
    return company;
};

// getDianTestMatrixRun/cancelDianTestMatrixRun take only a runId, with no
// caller-scoping of their own (the admin controller trusts isAdmin for
// that). A self-service caller must never see or act on another company's
// run just by guessing/enumerating a runId - this is the one piece of new
// authorization logic this feature adds, and the single most important
// thing to verify by hand before shipping.
const getOwnedRunOrThrow = async (companyId, runId) => {
    const run = await getDianTestMatrixRun({ runId });
    if (run.companyId !== companyId) throw new ApiError(404, "Prueba de habilitación no encontrada.");
    return run;
};

export const startMyDianTestMatrixRun = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    await ensureElectronicInvoicingPlan(req.user.prismaId);
    const { testSetId, invoiceTarget, creditNoteTarget, debitNoteTarget } = req.body || {};
    // req.user.id (the real acting user), not req.user.prismaId (which
    // resolves to the account owner for a team member - but this route is
    // owner-only anyway, via blockTeamMembers) - matches the admin
    // controller's own requesterUserId: req.user.id.
    const data = await startDianTestMatrixRun({
        companyId: company.id,
        testSetId,
        requesterUserId: req.user.id,
        invoiceTarget,
        creditNoteTarget,
        debitNoteTarget,
    });
    return res.status(201).json(new ApiResponse(201, data, "Prueba de habilitación iniciada"));
});

export const retryMyFailedDianTestMatrixDocuments = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    await getOwnedRunOrThrow(company.id, req.params.runId);
    const data = await retryFailedDianTestMatrixDocuments({ runId: req.params.runId });
    return res.status(200).json(new ApiResponse(200, data, "Reintentando documentos fallidos"));
});

export const getMyDianTestMatrixRun = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const data = await getOwnedRunOrThrow(company.id, req.params.runId);
    return res.status(200).json(new ApiResponse(200, data, "Prueba de habilitación obtenida"));
});

export const listMyDianTestMatrixRuns = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const data = await listDianTestMatrixRuns({ companyId: company.id });
    return res.status(200).json(new ApiResponse(200, data, "Historial de pruebas de habilitación"));
});

export const cancelMyDianTestMatrixRun = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    await getOwnedRunOrThrow(company.id, req.params.runId);
    const data = await cancelDianTestMatrixRun({ runId: req.params.runId });
    return res.status(200).json(new ApiResponse(200, data, "Cancelación solicitada"));
});

// Does NOT flip environment - DIAN approves habilitación on their own
// portal, which neither Ohnix nor itcycle-api-dian can verify by API. This
// just notifies admins with the company/testSetId/result already filled in,
// so the actual SANDBOX -> PRODUCTION change (itcycle-api-dian's admin-only
// PUT dian-configuration) is a review-and-click instead of a cold ticket.
export const requestMyDianProductionActivation = asyncHandler(async (req, res) => {
    const company = await getOwnedCompanyOrThrow(req.user.prismaId);
    const run = await getOwnedRunOrThrow(company.id, req.params.runId);
    if (run.status !== "completed" || !run.passResult) {
        throw new ApiError(422, "Solo puedes solicitar la activación de Producción después de una prueba de habilitación aprobada.");
    }
    const companyRow = await prisma.company.findUnique({ where: { id: company.id }, select: { name: true } });
    await notifyAdminsDianProductionActivationRequested({ run, company: companyRow, requestedByUser: req.user });
    return res.status(200).json(new ApiResponse(200, { requested: true }, "Solicitud enviada al equipo de Ohnix"));
});
