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
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import {
    enforceEntityLimit,
    enforceMonthlyLimit,
} from "../middleware/pricing.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";

const router = Router();

router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

// Regular user routes
router
    .route("/")
    .post(requireModulePermission("purchases", "edit"), enforceEntityLimit("purchases"), enforceMonthlyLimit("purchases"), createPurchase)
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
router.route("/:id/support-document").get(requireModulePermission("purchases", "view"), getPurchaseSupportDocument);
router.route("/:id/support-document/issue").post(requireModulePermission("purchases", "edit"), issuePurchaseSupportDocument);
router.route("/:id/support-document/sync").post(requireModulePermission("purchases", "edit"), syncPurchaseSupportDocument);

export default router;
