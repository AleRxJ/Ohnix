import express from "express";
import {
    getDashboardMetrics,
    getStockReport,
    getSalesReport,
    getTopProducts,
    getPurchaseReport,
    getLowStockAlerts,
} from "../controllers/report.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { enforcePlanFeature } from "../middleware/pricing.middleware.js";

const router = express.Router();

router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

// Dashboard metrics
router.route("/dashboard").get(getDashboardMetrics);

// Stock report
router.route("/stock").get(getStockReport);

// Sales report — Negocio ($49) and above
router.route("/sales").get(enforcePlanFeature("reportSales"), getSalesReport);

// Purchase report — Negocio ($49) and above
router.route("/purchases").get(enforcePlanFeature("reportPurchases"), getPurchaseReport);

// Top products report — Negocio ($49) and above
router.route("/top-products").get(enforcePlanFeature("reportTopProducts"), getTopProducts);

// Low stock alerts with optional email notification
router.route("/low-stock-alerts").get(getLowStockAlerts);

// Admin-only routes - could be added if needed
// router.route("/admin/all-users-sales").get(isAdmin, getAllUsersSalesReport);

export default router;