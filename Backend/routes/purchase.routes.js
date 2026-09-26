import { Router } from "express";
import {
    createPurchase,
    getAllPurchases,
    getPurchaseDetails,
    updatePurchaseStatus,
    getReturnPreview,
    processReturn,
} from "../controllers/purchase.controller.js";
import {
    getPurchaseSupportDocument,
    issuePurchaseSupportDocument,
    syncPurchaseSupportDocument,
} from "../controllers/purchaseSupportDocument.controller.js";
import {
    getPurchaseReceiptAcknowledgment,
    recordPurchaseSupplierInvoiceReference,
    triggerPurchaseAcuseDeRecibo,
    triggerPurchaseAceptacionExpresa,
    triggerPurchaseReclamo,
    syncPurchaseReceiptAcknowledgment,
} from "../controllers/receiptAcknowledgment.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import {
    enforceEntityLimit,
    enforceMonthlyLimit,
    requireActiveSubscription,
} from "../middleware/pricing.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";

const router = Router();

router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

// Regular user routes
router
    .route("/")
    .post(requireModulePermission("purchases", "edit"), enforceEntityLimit("purchases"), enforceMonthlyLimit("purchases"), idempotent("purchase.create"), createPurchase)
    .get(requireModulePermission("purchases", "view"), getAllPurchases);

// Admin routes - if you want specific endpoints just for admins
router.route("/all").get(isAdmin, getAllPurchases); // Guaranteed to get all purchases

router.route("/:id")
    .get(requireModulePermission("purchases", "view"), getPurchaseDetails)
    .patch(requireModulePermission("purchases", "edit"), idempotent("purchase.status"), updatePurchaseStatus);

// Return preview route - to check what can be returned before processing
router.route("/:id/return-preview").get(requireModulePermission("purchases", "view"), getReturnPreview);

// Process a granular, repeatable return - the caller picks which lines and
// how much of each; can be called more than once while any line still has
// quantity - returnedQuantity left. Because it's *meant* to be repeatable,
// an accidental duplicate call (retry, double-click) looks exactly like a
// second real return - `idempotent` is what tells them apart.
router.route("/:id/returns").post(requireModulePermission("purchases", "edit"), idempotent("purchase.return"), processReturn);

// Documento Soporte (DIAN type "05", itcycle-api-dian only) - see
// purchaseSupportDocument.service.js. Auto-issued on purchase completion;
// these endpoints are for viewing status and manually retrying/syncing.
// GET is never gated by requireActiveSubscription - same reasoning as
// order.routes.js's electronic-invoice GET routes: this is the customer's
// own tax record and must stay viewable even while the account is paused.
router.route("/:id/support-document").get(requireModulePermission("purchases", "view"), getPurchaseSupportDocument);
router.route("/:id/support-document/issue").post(requireModulePermission("purchases", "edit"), requireActiveSubscription, issuePurchaseSupportDocument);
router.route("/:id/support-document/sync").post(requireModulePermission("purchases", "edit"), requireActiveSubscription, syncPurchaseSupportDocument);

// Receipt acknowledgment (RADIAN buyer-side events - acuse de recibo /
// recibo del bien / aceptación expresa / reclamo) for a purchase from a
// supplier that issues its OWN real invoice - see
// receiptAcknowledgment.service.js. Opposite precondition from Documento
// Soporte above. Acuse+recepción auto-fire on purchase completion (chained
// server-side, see purchase.service.js); recepción has no manual endpoint by
// design. GET ungated by subscription status, same reasoning as support-document.
router.route("/:id/receipt-acknowledgment").get(requireModulePermission("purchases", "view"), getPurchaseReceiptAcknowledgment);
router.route("/:id/receipt-acknowledgment/reference").post(requireModulePermission("purchases", "edit"), idempotent("purchase.receipt_reference"), recordPurchaseSupplierInvoiceReference);
router.route("/:id/receipt-acknowledgment/acuse").post(requireModulePermission("purchases", "edit"), requireActiveSubscription, triggerPurchaseAcuseDeRecibo);
// Aceptación expresa / reclamo are binding RADIAN events on the supplier's
// invoice - "admin". The acuse de recibo above is routine and stays "edit".
router.route("/:id/receipt-acknowledgment/aceptacion-expresa").post(requireModulePermission("purchases", "admin"), requireActiveSubscription, triggerPurchaseAceptacionExpresa);
router.route("/:id/receipt-acknowledgment/reclamo").post(requireModulePermission("purchases", "admin"), requireActiveSubscription, triggerPurchaseReclamo);
router.route("/:id/receipt-acknowledgment/sync").post(requireModulePermission("purchases", "edit"), requireActiveSubscription, syncPurchaseReceiptAcknowledgment);

export default router;
