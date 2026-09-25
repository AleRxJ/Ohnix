import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";
import {
    listCashAccounts,
    getCashAccount,
    listCashAccountConfigurationHistory,
    createCashAccount,
    updateCashAccount,
    deactivateCashAccount,
    listCashAccountMovements,
    registerManualExpense,
    registerManualIncome,
    transferCash,
    adjustCash,
    getCashIntegrity,
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
    unmatchStatementEntry,
    getReconciliationBalance,
    getGmfAccount,
    getAccountsPayablePlan,
    updatePurchaseDueDate,
    getAccountsReceivablePlan,
    updateOrderDueDate,
    allocateOrderPayment,
    allocatePurchasePayment,
    listOrderPaymentAllocations,
    listPurchasePaymentAllocations,
    listUnallocatedPayments,
    listPaymentCredits,
    registerPaymentAdvance,
    applyPaymentCredit,
    listPaymentMethods,
    createPaymentMethod,
    updatePaymentMethod,
    setPaymentMethodActive,
    registerCapitalContribution,
    registerEquityDistribution,
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
router.route("/cash-accounts/:id/configuration-history")
    .get(requireModulePermission("finance", "view"), listCashAccountConfigurationHistory);

router.route("/expenses")
    .post(requireModulePermission("finance", "edit"), idempotent("finance.expense"), registerManualExpense);

router.route("/income")
    .post(requireModulePermission("finance", "edit"), idempotent("finance.income"), registerManualIncome);
router.route("/transfers")
    .post(requireModulePermission("finance", "edit"), idempotent("finance.cash-transfer"), transferCash);
router.route("/adjustments")
    .post(requireModulePermission("finance", "edit"), idempotent("finance.cash-adjustment"), adjustCash);
router.route("/integrity")
    .get(requireModulePermission("finance", "view"), getCashIntegrity);

router.route("/orders/:orderId/payments")
    .get(requireModulePermission("finance", "view"), listOrderPayments)
    .post(requireModulePermission("finance", "edit"), idempotent("finance.order-payment"), registerOrderPayment);
router.post("/orders/:orderId/payments/:paymentId/allocate", requireModulePermission("finance", "edit"), allocateOrderPayment);
router.get("/orders/:orderId/payments/:paymentId/allocations", requireModulePermission("finance", "view"), listOrderPaymentAllocations);

router.route("/purchases/:purchaseId/payments")
    .get(requireModulePermission("finance", "view"), listPurchasePayments)
    .post(requireModulePermission("finance", "edit"), idempotent("finance.purchase-payment"), registerPurchasePayment);
router.post("/purchases/:purchaseId/payments/:paymentId/allocate", requireModulePermission("finance", "edit"), allocatePurchasePayment);
router.get("/purchases/:purchaseId/payments/:paymentId/allocations", requireModulePermission("finance", "view"), listPurchasePaymentAllocations);
router.get("/payments/unallocated", requireModulePermission("finance", "view"), listUnallocatedPayments);
router.get("/payment-credits", requireModulePermission("finance", "view"), listPaymentCredits);
router.post("/payment-credits", requireModulePermission("finance", "edit"), idempotent("finance.payment-credit"), registerPaymentAdvance);
router.post("/payment-credits/:creditId/apply", requireModulePermission("finance", "edit"), applyPaymentCredit);
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
router.route("/reconciliation/unmatch")
    .post(requireModulePermission("finance", "edit"), unmatchStatementEntry);
router.route("/reconciliation/balance")
    .get(requireModulePermission("finance", "view"), getReconciliationBalance);
// "edit", not "view": the first call lazily creates the 530505 GMF account
// in the tenant's chart (chartOfAccounts.service.js#ensureGmfAccount).
router.route("/reconciliation/gmf-account")
    .get(requireModulePermission("finance", "edit"), getGmfAccount);

// Payment methods (Fase 5 - causación automática) - creating/editing a
// method changes what every future payment against it automatically
// causes, so it's gated at "admin" like WithholdingConcept CRUD in
// accounting.routes.js, not routine "edit" data entry.
router.route("/payment-methods")
    .get(requireModulePermission("finance", "view"), listPaymentMethods)
    .post(requireModulePermission("finance", "admin"), createPaymentMethod);
router.route("/payment-methods/:id")
    .patch(requireModulePermission("finance", "admin"), updatePaymentMethod);
router.route("/payment-methods/:id/active")
    .patch(requireModulePermission("finance", "admin"), setPaymentMethodActive);

// Equity movements (Fase 6 - estado de cambios en el patrimonio) - same
// permission level as manual income/expense, since these are just another
// kind of cash-affecting entry, not a config change.
router.route("/equity/contributions")
    .post(requireModulePermission("finance", "edit"), idempotent("finance.capital-contribution"), registerCapitalContribution);
router.route("/equity/distributions")
    .post(requireModulePermission("finance", "edit"), idempotent("finance.equity-distribution"), registerEquityDistribution);

export default router;
