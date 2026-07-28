import { Router } from "express";
import {
    createPurchase,
    getAllPurchases,
    getPurchaseDetails,
    updatePurchaseStatus,
    getReturnPreview,
} from "../controllers/purchase.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import {
    enforceEntityLimit,
    enforceMonthlyLimit,
} from "../middleware/pricing.middleware.js";

const router = Router();

router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

// Regular user routes
router
    .route("/")
    .post(enforceEntityLimit("purchases"), enforceMonthlyLimit("purchases"), createPurchase)
    .get(getAllPurchases);

// Admin routes - if you want specific endpoints just for admins
router.route("/all").get(isAdmin, getAllPurchases); // Guaranteed to get all purchases

router.route("/:id").get(getPurchaseDetails).patch(updatePurchaseStatus);

// Return preview route - to check what can be returned before processing
router.route("/:id/return-preview").get(getReturnPreview);

export default router;
