import express from "express";
import {
    getDashboardMetrics,
    getStockReport,
    getSalesReport,
    getTopProducts,
    getPurchaseReport,
    getLowStockAlerts,
    getProfitMarginReport,
    getTopCustomersReport,
    getSalesByTeamReport,
    getPeriodComparisonReport,
    getVatReport,
    getCarteraReport,
    exportReportPdf,
    authorizeCsvExport,
    authorizeExcelExport,
} from "../controllers/report.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { enforcePlanFeature } from "../middleware/pricing.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { reportExportRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

// Dashboard metrics live under their own "dashboard" module (not "reports")
// so a freshly invited team member with the default Miembro role - which
// grants dashboard:view and nothing else - lands on a working overview
// instead of a blank/403'd screen. Everything else here stays behind
// "reports", which the owner grants explicitly per role.
router.route("/dashboard").get(requireModulePermission("dashboard", "view"), getDashboardMetrics);

// Stock report
router.route("/stock").get(requireModulePermission("reports", "view"), getStockReport);

// Sales report — Negocio ($49) and above
router.route("/sales").get(requireModulePermission("reports", "view"), enforcePlanFeature("reportSales"), getSalesReport);

// Purchase report — Negocio ($49) and above
router.route("/purchases").get(requireModulePermission("reports", "view"), enforcePlanFeature("reportPurchases"), getPurchaseReport);

// Top products report — Negocio ($49) and above
router.route("/top-products").get(requireModulePermission("reports", "view"), enforcePlanFeature("reportTopProducts"), getTopProducts);

// Low stock alerts with optional email notification
router.route("/low-stock-alerts").get(requireModulePermission("reports", "view"), getLowStockAlerts);

// Advanced reports — Escala ($99) and above
router.route("/profit-margin").get(requireModulePermission("reports", "view"), enforcePlanFeature("advancedReports"), getProfitMarginReport);
router.route("/top-customers").get(requireModulePermission("reports", "view"), enforcePlanFeature("advancedReports"), getTopCustomersReport);
router.route("/sales-by-team").get(requireModulePermission("reports", "view"), enforcePlanFeature("advancedReports"), getSalesByTeamReport);
router.route("/period-comparison").get(requireModulePermission("reports", "view"), enforcePlanFeature("advancedReports"), getPeriodComparisonReport);
router.route("/vat").get(requireModulePermission("reports", "view"), enforcePlanFeature("advancedReports"), getVatReport);
router.route("/cartera").get(requireModulePermission("reports", "view"), enforcePlanFeature("advancedReports"), getCarteraReport);

// PDF export - the app's default JSON body limit (16kb, app.js) is too small
// for a full report table (hundreds of rows), so this route gets its own
// parser with a higher limit rather than raising it globally.
router.route("/export/pdf").post(
    express.json({ limit: "5mb" }),
    reportExportRateLimiter,
    requireModulePermission("reports", "view"),
    enforcePlanFeature("exportPdf"),
    exportReportPdf
);

// CSV/Excel are generated client-side from data already on screen - these
// two routes exist only so the browser has a real server check to pass
// before it's allowed to build that file locally (see exportReportPdf's
// comment in the controller for why this can't just be a client-side
// `can()` check, e.g. Stock report data is ungated but Excel export isn't).
router.route("/export/csv/authorize").get(requireModulePermission("reports", "view"), enforcePlanFeature("exportCsv"), authorizeCsvExport);
router.route("/export/excel/authorize").get(requireModulePermission("reports", "view"), enforcePlanFeature("exportExcel"), authorizeExcelExport);

// Admin-only routes - could be added if needed
// router.route("/admin/all-users-sales").get(isAdmin, getAllUsersSalesReport);

export default router;