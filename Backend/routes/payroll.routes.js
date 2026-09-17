import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";
import { requireActiveSubscription } from "../middleware/pricing.middleware.js";
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
import {
    getDocumentElectronicPayroll,
    issueDocumentElectronicPayroll,
    syncDocumentElectronicPayroll,
    issuePeriodElectronicPayroll,
} from "../controllers/electronicPayroll.controller.js";

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

// Nómina Electrónica (DIAN) - one submission per employee payslip, same
// requireActiveSubscription gating order.routes.js applies to its own
// electronic-invoice issue/sync (costs real money per DIAN document).
router.route("/documents/:documentId/electronic-payroll").get(requireModulePermission("payroll", "view"), getDocumentElectronicPayroll);
router.route("/documents/:documentId/electronic-payroll/issue").post(requireModulePermission("payroll", "edit"), requireActiveSubscription, issueDocumentElectronicPayroll);
router.route("/documents/:documentId/electronic-payroll/sync").post(requireModulePermission("payroll", "edit"), requireActiveSubscription, syncDocumentElectronicPayroll);
router.route("/periods/:id/electronic-payroll/issue-all").post(requireModulePermission("payroll", "edit"), requireActiveSubscription, issuePeriodElectronicPayroll);

router.route("/benefit-accruals").get(requireModulePermission("payroll", "view"), listEmployeeBenefitAccruals);
router.route("/benefit-settlements").post(requireModulePermission("payroll", "edit"), idempotent("payroll-benefit.settle"), settleEmployeeBenefit);

export default router;
