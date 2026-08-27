import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { enforcePlanFeature } from "../middleware/pricing.middleware.js";
import {
    listChartOfAccounts,
    listJournalEntries,
    getJournalEntry,
    listAccountingPeriods,
    closeAccountingPeriod,
    getIncomeStatement,
    getBalanceSheet,
    getAccountingStatus,
} from "../controllers/accounting.controller.js";

const router = Router();

router.use(verifyJWT);
// Automated accounting is Escala's differentiator (see pricing.middleware.js's
// PLAN_FEATURES) - gated once here for the whole module rather than per
// route, unlike electronicInvoicing (which needs a service-level check
// because it costs money per document, not per page view).
router.use(enforcePlanFeature("accounting"));

router.route("/chart-of-accounts").get(requireModulePermission("accounting", "view"), listChartOfAccounts);
router.route("/status").get(requireModulePermission("accounting", "view"), getAccountingStatus);

router.route("/journal-entries").get(requireModulePermission("accounting", "view"), listJournalEntries);
router.route("/journal-entries/:id").get(requireModulePermission("accounting", "view"), getJournalEntry);

router.route("/reports/income-statement").get(requireModulePermission("accounting", "view"), getIncomeStatement);
router.route("/reports/balance-sheet").get(requireModulePermission("accounting", "view"), getBalanceSheet);

router.route("/periods").get(requireModulePermission("accounting", "view"), listAccountingPeriods);
// Closing a period is a business-consequential action (blocks all further
// postings into that month), not routine data entry - gated at "admin"
// rather than "edit", unlike the rest of this module's read-only surface.
router.route("/periods/:id/close").post(requireModulePermission("accounting", "admin"), closeAccountingPeriod);

export default router;
