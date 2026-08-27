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
    getIncomeStatement,
    getBalanceSheet,
    getTrialBalance,
    getAccountingStatus,
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

router.route("/journal-entries").get(requireModulePermission("accounting", "view"), listJournalEntries);
router.route("/journal-entries/:id").get(requireModulePermission("accounting", "view"), getJournalEntry);

router.route("/reports/income-statement").get(requireModulePermission("accounting", "view"), getIncomeStatement);
router.route("/reports/balance-sheet").get(requireModulePermission("accounting", "view"), getBalanceSheet);
router.route("/reports/trial-balance").get(requireModulePermission("accounting", "view"), getTrialBalance);

router.route("/periods").get(requireModulePermission("accounting", "view"), listAccountingPeriods);
// Closing a period is a business-consequential action (blocks all further
// postings into that month), not routine data entry - gated at "admin"
// rather than "edit", unlike the rest of this module's read-only surface.
router.route("/periods/:id/close").post(requireModulePermission("accounting", "admin"), closeAccountingPeriod);

export default router;
