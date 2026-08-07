import express from "express";
import {
    createOrder,
    generateInvoice,
    getAllOrders,
    getAllOrdersAdmin,
    getOrderDetails,
    updateOrderStatus,
} from "../controllers/order.controller.js";
import {
    getOrderElectronicInvoice,
    issueOrderElectronicInvoice,
    syncOrderElectronicInvoice,
    issueOrderCreditNote,
    getOrderCreditNotes,
} from "../controllers/electronicInvoice.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import {
    enforceEntityLimit,
    enforceMonthlyLimit,
} from "../middleware/pricing.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";

const router = express.Router();

router.use(verifyJWT); // Apply auth middleware to all routes

// User routes - filtered by user ID
router.post("/", requireModulePermission("orders", "edit"), enforceEntityLimit("orders"), enforceMonthlyLimit("orders"), createOrder);
router.get("/", requireModulePermission("orders", "view"), getAllOrders);
router.get("/:id/details", requireModulePermission("orders", "view"), getOrderDetails);
router.patch("/:id/status", requireModulePermission("orders", "edit"), updateOrderStatus);
router.route("/:id/invoice").get(requireModulePermission("orders", "view"), generateInvoice);
router.route("/:id/electronic-invoice").get(requireModulePermission("orders", "view"), getOrderElectronicInvoice);
router.route("/:id/electronic-invoice/issue").post(requireModulePermission("orders", "edit"), issueOrderElectronicInvoice);
router.route("/:id/electronic-invoice/sync").post(requireModulePermission("orders", "edit"), syncOrderElectronicInvoice);
router.route("/:id/electronic-invoice/credit-notes")
    .get(requireModulePermission("orders", "view"), getOrderCreditNotes)
    .post(requireModulePermission("orders", "edit"), issueOrderCreditNote);

// Admin-only routes
router.get("/all", isAdmin, getAllOrdersAdmin);

export default router;
