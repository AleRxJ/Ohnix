import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import {
    listChartOfAccounts,
    listJournalEntries,
    getJournalEntry,
    listAccountingPeriods,
    closeAccountingPeriod,
    getIncomeStatement,
    getBalanceSheet,
} from "../controllers/accounting.controller.js";

const router = Router();

router.use(verifyJWT);

router.route("/chart-of-accounts").get(requireModulePermission("accounting", "view"), listChartOfAccounts);

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
