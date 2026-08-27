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
    listOrderPayments,
    registerOrderPayment,
    listPurchasePayments,
    registerPurchasePayment,
    createStatementEntries,
    listUnmatchedStatementEntries,
    listUnmatchedMovements,
    matchStatementEntry,
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

router.route("/orders/:orderId/payments")
    .get(requireModulePermission("finance", "view"), listOrderPayments)
    .post(requireModulePermission("finance", "edit"), registerOrderPayment);

router.route("/purchases/:purchaseId/payments")
    .get(requireModulePermission("finance", "view"), listPurchasePayments)
    .post(requireModulePermission("finance", "edit"), registerPurchasePayment);

router.route("/reconciliation/statement-entries")
    .post(requireModulePermission("finance", "edit"), createStatementEntries);

router.route("/reconciliation/unmatched-entries")
    .get(requireModulePermission("finance", "view"), listUnmatchedStatementEntries);

router.route("/reconciliation/unmatched-movements")
    .get(requireModulePermission("finance", "view"), listUnmatchedMovements);

router.route("/reconciliation/match")
    .post(requireModulePermission("finance", "edit"), matchStatementEntry);

export default router;
