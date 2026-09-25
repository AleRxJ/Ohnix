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
    listFinancialStatementNotes,
    createFinancialStatementNote,
    updateFinancialStatementNote,
    deleteFinancialStatementNote,
    getIncomeStatement,
    getIncomeStatementComparison,
    getCashFlowStatement,
    getBalanceSheet,
    getEquityChangesStatement,
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
    getExogenaReport,
    getWithholdingCertificate,
    downloadWithholdingCertificate,
    getRentaDeclaration,
    downloadRentaDeclarationPdf,
    listCostCenters,
    createCostCenter,
    updateCostCenter,
    getCostCenterLedger,
    assignLocationCostCenter,
    listRecurringExpenseTemplates,
    createRecurringExpenseTemplate,
    updateRecurringExpenseTemplate,
    runRecurringExpenseTemplateNow,
    listFixedAssets,
    createFixedAsset,
    updateFixedAsset,
    disposeFixedAsset,
    runFixedAssetDepreciationNow,
    listRecurringJournalTemplates,
    createRecurringJournalTemplate,
    updateRecurringJournalTemplate,
    runRecurringJournalTemplateNow,
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
import { listVatSettlements, previewVatSettlement, settleVatPeriod, voidVatSettlement, payVatSettlement } from "../controllers/vatSettlement.controller.js";
import { listPrepaidExpenses, createPrepaidExpense, updatePrepaidExpense, runPrepaidAmortizationNow, cancelPrepaidExpense } from "../controllers/prepaidExpense.controller.js";
import * as phase3 from "../controllers/accountingPhase3.controller.js";

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

router.route("/fixed-assets")
    .get(requireModulePermission("accounting", "view"), listFixedAssets)
    .post(requireModulePermission("accounting", "edit"), createFixedAsset);
router.route("/fixed-assets/:id")
    .patch(requireModulePermission("accounting", "edit"), updateFixedAsset);
router.route("/fixed-assets/:id/run")
    .post(requireModulePermission("accounting", "edit"), runFixedAssetDepreciationNow);
// Disposing is business-consequential (stops depreciation for good) - same
// "admin" gate as closing a period, not routine data entry.
router.route("/fixed-assets/:id/dispose")
    .post(requireModulePermission("accounting", "admin"), disposeFixedAsset);

// Diferidos - same permission split as fixed assets: registering and
// amortizing is "edit"; cancelling (expenses the whole remainder at once)
// is "admin", like disposing an asset.
router.route("/prepaid-expenses")
    .get(requireModulePermission("accounting", "view"), listPrepaidExpenses)
    .post(requireModulePermission("accounting", "edit"), createPrepaidExpense);
router.route("/prepaid-expenses/:id")
    .patch(requireModulePermission("accounting", "edit"), updatePrepaidExpense);
router.post("/prepaid-expenses/:id/run", requireModulePermission("accounting", "edit"), runPrepaidAmortizationNow);
router.post("/prepaid-expenses/:id/cancel", requireModulePermission("accounting", "admin"), cancelPrepaidExpense);

// Deterioro de cartera - posting the adjustment is "admin" (it moves the
// P&L by an estimate), previewing is "view".
router.get("/receivable-impairment/runs", requireModulePermission("accounting", "view"), phase3.listImpairmentRuns);
router.post("/receivable-impairment/preview", requireModulePermission("accounting", "view"), phase3.previewImpairment);
router.post("/receivable-impairment/run", requireModulePermission("accounting", "admin"), phase3.runImpairment);

// Obligaciones financieras - same split as fixed assets.
router.route("/financial-obligations")
    .get(requireModulePermission("accounting", "view"), phase3.listFinancialObligations)
    .post(requireModulePermission("accounting", "edit"), phase3.createFinancialObligation);
router.post("/financial-obligations/schedule-preview", requireModulePermission("accounting", "view"), phase3.previewObligationSchedule);
router.post("/financial-obligations/:id/pay", requireModulePermission("accounting", "edit"), phase3.payObligationInstallment);

// Kardex valorizado vs. 1435 - read-only.
router.get("/reports/inventory-valuation", requireModulePermission("accounting", "view"), phase3.getInventoryValuation);
router.get("/reports/kardex/:productId", requireModulePermission("accounting", "view"), phase3.getProductKardex);

// Declaración de ICA - same gates as the IVA settlement.
router.route("/ica-declarations")
    .get(requireModulePermission("accounting", "view"), phase3.listIcaDeclarations)
    .post(requireModulePermission("accounting", "admin"), phase3.settleIcaDeclaration);
router.get("/ica-declarations/preview", requireModulePermission("accounting", "view"), phase3.previewIcaDeclaration);
router.post("/ica-declarations/:id/void", requireModulePermission("accounting", "admin"), phase3.voidIcaDeclaration);
router.post("/ica-declarations/:id/pay", requireModulePermission("accounting", "admin"), phase3.payIcaDeclaration);

router.route("/recurring-journals")
    .get(requireModulePermission("accounting", "view"), listRecurringJournalTemplates)
    .post(requireModulePermission("accounting", "edit"), createRecurringJournalTemplate);
router.route("/recurring-journals/:id")
    .patch(requireModulePermission("accounting", "edit"), updateRecurringJournalTemplate);
router.route("/recurring-journals/:id/run")
    .post(requireModulePermission("accounting", "edit"), runRecurringJournalTemplateNow);

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
router.route("/reports/exogena")
    .get(requireModulePermission("accounting", "view"), getExogenaReport);
// Estimated only - see rentaDeclaration.service.js's own comment. Read-only,
// same "view" gate as every other report/* route; the tax RATE TABLES this
// reads from are platform-admin-only (company.routes.js's
// /admin/income-tax-config, isAdmin-gated), never editable via this
// per-tenant "accounting" permission.
router.route("/reports/renta")
    .get(requireModulePermission("accounting", "view"), getRentaDeclaration);
router.route("/reports/renta/pdf")
    .get(requireModulePermission("accounting", "view"), downloadRentaDeclarationPdf);

router.route("/reports/income-statement").get(requireModulePermission("accounting", "view"), getIncomeStatement);
router.route("/reports/income-statement/comparison").get(requireModulePermission("accounting", "view"), getIncomeStatementComparison);
router.route("/reports/cash-flow").get(requireModulePermission("accounting", "view"), getCashFlowStatement);
router.route("/reports/balance-sheet").get(requireModulePermission("accounting", "view"), getBalanceSheet);
router.route("/reports/equity-changes").get(requireModulePermission("accounting", "view"), getEquityChangesStatement);
router.route("/reports/trial-balance").get(requireModulePermission("accounting", "view"), getTrialBalance);

// Liquidación de IVA - settling, voiding and paying post to the ledger (and
// paying moves cash), same "admin" gate as closing a period.
router.route("/vat-settlements")
    .get(requireModulePermission("accounting", "view"), listVatSettlements)
    .post(requireModulePermission("accounting", "admin"), settleVatPeriod);
router.get("/vat-settlements/preview", requireModulePermission("accounting", "view"), previewVatSettlement);
router.post("/vat-settlements/:id/void", requireModulePermission("accounting", "admin"), voidVatSettlement);
router.post("/vat-settlements/:id/pay", requireModulePermission("accounting", "admin"), payVatSettlement);

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

// Purely informational disclosures, not a posting or a lock - "edit" is
// enough, same level as cost centers/recurring expenses.
router.route("/financial-statement-notes")
    .get(requireModulePermission("accounting", "view"), listFinancialStatementNotes)
    .post(requireModulePermission("accounting", "edit"), createFinancialStatementNote);
router.route("/financial-statement-notes/:id")
    .put(requireModulePermission("accounting", "edit"), updateFinancialStatementNote)
    .delete(requireModulePermission("accounting", "edit"), deleteFinancialStatementNote);

export default router;
