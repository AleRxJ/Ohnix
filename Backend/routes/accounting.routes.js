import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { enforcePlanFeature } from "../middleware/pricing.middleware.js";
import {
    listChartOfAccounts,
    createChartOfAccount,
    setChartOfAccountActive,
    getAccountLedger,
    listJournalEntries,
    getJournalEntry,
    listAccountingPeriods,
    closeAccountingPeriod,
    getAccountingPeriodCloseReadiness,
    reopenAccountingPeriod,
    listFiscalYearClosures,
    getFiscalYearCloseReadiness,
    closeFiscalYear,
    reopenFiscalYear,
    getIncomeStatement,
    getIncomeStatementComparison,
    getBalanceSheet,
    getTrialBalance,
    getAccountingStatus,
    createManualVoucher,
    updateManualVoucher,
    listManualVouchers,
    getManualVoucher,
    postManualVoucher,
    voidManualVoucher,
    listThirdPartyBalances,
    getThirdPartyMovements,
    listWithholdingConcepts,
    createWithholdingConcept,
    setWithholdingConceptActive,
    previewWithholdings,
    getWithholdingReport,
    getWithholdingCertificate,
    downloadWithholdingCertificate,
    listCostCenters,
    createCostCenter,
    updateCostCenter,
    getCostCenterLedger,
    assignLocationCostCenter,
    listRecurringExpenseTemplates,
    createRecurringExpenseTemplate,
    updateRecurringExpenseTemplate,
    runRecurringExpenseTemplateNow,
    getBudgetReport,
    saveBudgets,
    getAnnualBudgetReport,
    distributeAnnualBudget,
    copyAnnualBudget,
    deleteBudget,
    createOpeningBalance,
    listAccountingAudit,
    reverseJournalEntry,
} from "../controllers/accounting.controller.js";

const router = Router();

router.use(verifyJWT);
// Automated accounting is Escala's differentiator (see pricing.middleware.js's
// PLAN_FEATURES) - gated once here for the whole module rather than per
// route, unlike electronicInvoicing (which needs a service-level check
// because it costs money per document, not per page view).
router.use(enforcePlanFeature("accounting"));

router.route("/chart-of-accounts")
    .get(requireModulePermission("accounting", "view"), listChartOfAccounts)
    .post(requireModulePermission("accounting", "edit"), createChartOfAccount);
router.route("/chart-of-accounts/:id/ledger").get(requireModulePermission("accounting", "view"), getAccountLedger);
router.route("/chart-of-accounts/:id/active").patch(requireModulePermission("accounting", "edit"), setChartOfAccountActive);
router.route("/status").get(requireModulePermission("accounting", "view"), getAccountingStatus);
router.route("/cost-centers")
    .get(requireModulePermission("accounting", "view"), listCostCenters)
    .post(requireModulePermission("accounting", "edit"), createCostCenter);
router.route("/cost-centers/:id")
    .patch(requireModulePermission("accounting", "edit"), updateCostCenter);
router.route("/cost-centers/:id/ledger")
    .get(requireModulePermission("accounting", "view"), getCostCenterLedger);
router.route("/cost-centers/location/:pointOfSaleId")
    .patch(requireModulePermission("accounting", "admin"), assignLocationCostCenter);

router.route("/recurring-expenses")
    .get(requireModulePermission("accounting", "view"), listRecurringExpenseTemplates)
    .post(requireModulePermission("accounting", "edit"), createRecurringExpenseTemplate);
router.route("/recurring-expenses/:id")
    .patch(requireModulePermission("accounting", "edit"), updateRecurringExpenseTemplate);
router.route("/recurring-expenses/:id/run")
    .post(requireModulePermission("accounting", "edit"), runRecurringExpenseTemplateNow);

router.route("/budgets")
    .get(requireModulePermission("accounting", "view"), getBudgetReport)
    .put(requireModulePermission("accounting", "edit"), saveBudgets);
router.route("/budgets/:id")
    .delete(requireModulePermission("accounting", "edit"), deleteBudget);
router.get("/budgets-annual", requireModulePermission("accounting", "view"), getAnnualBudgetReport);
router.post("/budgets-annual/distribute", requireModulePermission("accounting", "edit"), distributeAnnualBudget);
router.post("/budgets-annual/copy", requireModulePermission("accounting", "edit"), copyAnnualBudget);

router.route("/journal-entries").get(requireModulePermission("accounting", "view"), listJournalEntries);
router.route("/journal-entries/:id").get(requireModulePermission("accounting", "view"), getJournalEntry);
router.post("/journal-entries/:id/reverse", requireModulePermission("accounting", "admin"), reverseJournalEntry);

router.route("/manual-vouchers")
    .get(requireModulePermission("accounting", "view"), listManualVouchers)
    .post(requireModulePermission("accounting", "edit"), createManualVoucher);
router.post("/opening-balance", requireModulePermission("accounting", "admin"), createOpeningBalance);
router.get("/audit", requireModulePermission("accounting", "view"), listAccountingAudit);
router.route("/manual-vouchers/:id")
    .get(requireModulePermission("accounting", "view"), getManualVoucher)
    .put(requireModulePermission("accounting", "edit"), updateManualVoucher);
router.route("/manual-vouchers/:id/post")
    .post(requireModulePermission("accounting", "edit"), postManualVoucher);
router.route("/manual-vouchers/:id/void")
    .post(requireModulePermission("accounting", "admin"), voidManualVoucher);

router.route("/third-parties").get(requireModulePermission("accounting", "view"), listThirdPartyBalances);
router.route("/third-parties/:type/:id").get(requireModulePermission("accounting", "view"), getThirdPartyMovements);

router.route("/withholding-concepts")
    .get(requireModulePermission("accounting", "view"), listWithholdingConcepts)
    .post(requireModulePermission("accounting", "admin"), createWithholdingConcept);
router.route("/withholding-concepts/preview")
    .post(requireModulePermission("accounting", "edit"), previewWithholdings);
router.route("/withholding-concepts/:id/active")
    .patch(requireModulePermission("accounting", "admin"), setWithholdingConceptActive);
router.route("/reports/withholdings")
    .get(requireModulePermission("accounting", "view"), getWithholdingReport);
router.route("/reports/withholdings/certificates/:supplierId")
    .get(requireModulePermission("accounting", "view"), getWithholdingCertificate);
router.route("/reports/withholdings/certificates/:supplierId/pdf")
    .get(requireModulePermission("accounting", "view"), downloadWithholdingCertificate);

router.route("/reports/income-statement").get(requireModulePermission("accounting", "view"), getIncomeStatement);
router.route("/reports/income-statement/comparison").get(requireModulePermission("accounting", "view"), getIncomeStatementComparison);
router.route("/reports/balance-sheet").get(requireModulePermission("accounting", "view"), getBalanceSheet);
router.route("/reports/trial-balance").get(requireModulePermission("accounting", "view"), getTrialBalance);

router.route("/periods").get(requireModulePermission("accounting", "view"), listAccountingPeriods);
// Closing a period is a business-consequential action (blocks all further
// postings into that month), not routine data entry - gated at "admin"
// rather than "edit", unlike the rest of this module's read-only surface.
router.route("/periods/:id/close").post(requireModulePermission("accounting", "admin"), closeAccountingPeriod);
router.route("/periods/:id/close-readiness").get(requireModulePermission("accounting", "view"), getAccountingPeriodCloseReadiness);
router.route("/periods/:id/reopen").post(requireModulePermission("accounting", "admin"), reopenAccountingPeriod);

router.route("/fiscal-years").get(requireModulePermission("accounting", "view"), listFiscalYearClosures);
router.route("/fiscal-years/:year/close-readiness").get(requireModulePermission("accounting", "view"), getFiscalYearCloseReadiness);
// Same "admin" gate as /periods/:id/close - closing a fiscal year is even
// more consequential (it locks every one of that year's months for good and
// reclassifies a whole year's equity), not routine data entry.
router.route("/fiscal-years/:year/close").post(requireModulePermission("accounting", "admin"), closeFiscalYear);
router.route("/fiscal-years/:year/reopen").post(requireModulePermission("accounting", "admin"), reopenFiscalYear);

export default router;
