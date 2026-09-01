import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import {
    listCashAccounts,
    getCashAccount,
    createCashAccount,
    updateCashAccount,
    deactivateCashAccount,
    listCashAccountMovements,
    registerManualExpense,
    registerManualIncome,
    listOrderPayments,
    registerOrderPayment,
    listPurchasePayments,
    registerPurchasePayment,
    createStatementEntries,
    listUnmatchedStatementEntries,
    listUnmatchedMovements,
    matchStatementEntry,
    suggestStatementMatches,
    getReconciliationSummary,
    getReconciliationReport,
    getAccountsPayablePlan,
    updatePurchaseDueDate,
    getAccountsReceivablePlan,
    updateOrderDueDate,
} from "../controllers/finance.controller.js";

const router = Router();

router.use(verifyJWT);

router.route("/cash-accounts")
    .get(requireModulePermission("finance", "view"), listCashAccounts)
    .post(requireModulePermission("finance", "edit"), createCashAccount);

router.route("/cash-accounts/:id")
    .get(requireModulePermission("finance", "view"), getCashAccount)
    .patch(requireModulePermission("finance", "edit"), updateCashAccount);

router.route("/cash-accounts/:id/deactivate")
    .post(requireModulePermission("finance", "edit"), deactivateCashAccount);

router.route("/cash-accounts/:id/movements")
    .get(requireModulePermission("finance", "view"), listCashAccountMovements);

router.route("/expenses")
    .post(requireModulePermission("finance", "edit"), registerManualExpense);

router.route("/income")
    .post(requireModulePermission("finance", "edit"), registerManualIncome);

router.route("/orders/:orderId/payments")
    .get(requireModulePermission("finance", "view"), listOrderPayments)
    .post(requireModulePermission("finance", "edit"), registerOrderPayment);

router.route("/purchases/:purchaseId/payments")
    .get(requireModulePermission("finance", "view"), listPurchasePayments)
    .post(requireModulePermission("finance", "edit"), registerPurchasePayment);
router.route("/accounts-payable")
    .get(requireModulePermission("finance", "view"), getAccountsPayablePlan);
router.route("/purchases/:purchaseId/due-date")
    .patch(requireModulePermission("finance", "edit"), updatePurchaseDueDate);
router.route("/accounts-receivable")
    .get(requireModulePermission("finance", "view"), getAccountsReceivablePlan);
router.route("/orders/:orderId/due-date")
    .patch(requireModulePermission("finance", "edit"), updateOrderDueDate);

router.route("/reconciliation/statement-entries")
    .post(requireModulePermission("finance", "edit"), createStatementEntries);

router.route("/reconciliation/unmatched-entries")
    .get(requireModulePermission("finance", "view"), listUnmatchedStatementEntries);

router.route("/reconciliation/unmatched-movements")
    .get(requireModulePermission("finance", "view"), listUnmatchedMovements);

router.route("/reconciliation/match")
    .post(requireModulePermission("finance", "edit"), matchStatementEntry);
router.route("/reconciliation/suggestions")
    .get(requireModulePermission("finance", "view"), suggestStatementMatches);
router.route("/reconciliation/summary")
    .get(requireModulePermission("finance", "view"), getReconciliationSummary);
router.route("/reconciliation/report")
    .get(requireModulePermission("finance", "view"), getReconciliationReport);

export default router;
