import { Router } from "express";
import {
    createPurchase,
    getAllPurchases,
    getPurchaseDetails,
    updatePurchaseStatus,
    getReturnPreview,
    processReturn,
} from "../controllers/purchase.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import {
    enforceEntityLimit,
    enforceMonthlyLimit,
} from "../middleware/pricing.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";

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
    .patch(requireModulePermission("purchases", "edit"), updatePurchaseStatus);

// Return preview route - to check what can be returned before processing
router.route("/:id/return-preview").get(requireModulePermission("purchases", "view"), getReturnPreview);

// Process a granular, repeatable return - the caller picks which lines and
// how much of each; can be called more than once while any line still has
// quantity - returnedQuantity left.
router.route("/:id/returns").post(requireModulePermission("purchases", "edit"), processReturn);

export default router;
