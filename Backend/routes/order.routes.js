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

const router = express.Router();

router.use(verifyJWT); // Apply auth middleware to all routes

// User routes - filtered by user ID
router.post("/", enforceEntityLimit("orders"), enforceMonthlyLimit("orders"), createOrder);
router.get("/", getAllOrders);
router.get("/:id/details", getOrderDetails);
router.patch("/:id/status", updateOrderStatus);
router.route("/:id/invoice").get(generateInvoice);
router.route("/:id/electronic-invoice").get(getOrderElectronicInvoice);
router.route("/:id/electronic-invoice/issue").post(issueOrderElectronicInvoice);
router.route("/:id/electronic-invoice/sync").post(syncOrderElectronicInvoice);
router.route("/:id/electronic-invoice/credit-notes")
    .get(getOrderCreditNotes)
    .post(issueOrderCreditNote);

// Admin-only routes
router.get("/all", isAdmin, getAllOrdersAdmin);

export default router;
