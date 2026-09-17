import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";
import {
    createPayrollPeriod,
    listPayrollPeriods,
    getPayrollPeriod,
    updateDocumentWorkedDays,
    calculatePayrollPeriod,
    approvePayrollPeriod,
    payPayrollPeriod,
    cancelPayrollPeriod,
    listEmployeeBenefitAccruals,
    settleEmployeeBenefit,
    listPayrollLegalParameters,
    upsertPayrollLegalParameters,
    getPayslipPdf,
} from "../controllers/payroll.controller.js";

const router = Router();

router.use(verifyJWT);

// PayrollLegalParameter is a platform-wide table (SMLMV/UVT/auxilio de
// transporte set by the government each year) - readable by anyone with
// payroll access, writable only by a platform admin, same split
// systemSettings.routes.js uses for its own global config.
router
    .route("/legal-parameters")
    .get(requireModulePermission("payroll", "view"), listPayrollLegalParameters)
    .post(isAdmin, upsertPayrollLegalParameters);

router
    .route("/periods")
    .get(requireModulePermission("payroll", "view"), listPayrollPeriods)
    .post(requireModulePermission("payroll", "edit"), idempotent("payroll-period.create"), createPayrollPeriod);

router.route("/periods/:id").get(requireModulePermission("payroll", "view"), getPayrollPeriod);
router.route("/periods/:id/calculate").patch(requireModulePermission("payroll", "edit"), idempotent("payroll-period.calculate"), calculatePayrollPeriod);
router.route("/periods/:id/approve").patch(requireModulePermission("payroll", "edit"), idempotent("payroll-period.approve"), approvePayrollPeriod);
router.route("/periods/:id/pay").patch(requireModulePermission("payroll", "edit"), idempotent("payroll-period.pay"), payPayrollPeriod);
router.route("/periods/:id/cancel").patch(requireModulePermission("payroll", "edit"), idempotent("payroll-period.cancel"), cancelPayrollPeriod);

router.route("/documents/:documentId/worked-days").patch(requireModulePermission("payroll", "edit"), updateDocumentWorkedDays);
router.route("/documents/:documentId/payslip.pdf").get(requireModulePermission("payroll", "view"), getPayslipPdf);

router.route("/benefit-accruals").get(requireModulePermission("payroll", "view"), listEmployeeBenefitAccruals);
router.route("/benefit-settlements").post(requireModulePermission("payroll", "edit"), idempotent("payroll-benefit.settle"), settleEmployeeBenefit);

export default router;
