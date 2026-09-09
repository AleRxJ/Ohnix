import express from "express";
import {
    createOrder,
    generateInvoice,
    getAllOrders,
    getAllOrdersAdmin,
    getOrderDetails,
    updateOrderStatus,
    getOrderReturnPreview,
    processOrderReturn,
    getOrderShippingPayload,
} from "../controllers/order.controller.js";
import {
    downloadOrderElectronicInvoicePdf,
    getOrderElectronicInvoice,
    issueOrderElectronicInvoice,
    syncOrderElectronicInvoice,
    issueOrderCreditNote,
    getOrderCreditNotes,
    retryOrderCreditNoteLocalEffect,
} from "../controllers/electronicInvoice.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import {
    enforceEntityLimit,
    enforceMonthlyLimit,
    requireActiveSubscription,
} from "../middleware/pricing.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";

const router = express.Router();

router.use(verifyJWT); // Apply auth middleware to all routes

// User routes - filtered by user ID
router.post("/", requireModulePermission("orders", "edit"), enforceEntityLimit("orders"), enforceMonthlyLimit("orders"), idempotent("order.create"), createOrder);
router.get("/", requireModulePermission("orders", "view"), getAllOrders);
router.get("/:id/details", requireModulePermission("orders", "view"), getOrderDetails);
router.patch("/:id/status", requireModulePermission("orders", "edit"), idempotent("order.status"), updateOrderStatus);
router.route("/:id/return-preview").get(requireModulePermission("orders", "view"), getOrderReturnPreview);
// Process a granular, repeatable return - same reasoning as
// purchase.routes.js's "/:id/returns": because it's meant to be called more
// than once, `idempotent` is what distinguishes an accidental duplicate call
// (retry, double-click) from a second real return.
router.route("/:id/returns").post(requireModulePermission("orders", "edit"), idempotent("order.return"), processOrderReturn);
router.route("/:id/shipping-payload").get(requireModulePermission("orders", "view"), getOrderShippingPayload);
router.route("/:id/invoice").get(requireModulePermission("orders", "view"), generateInvoice);
// GET routes here are deliberately never gated by requireActiveSubscription:
// an already-issued DIAN invoice is the customer's own tax record, and they
// must be able to view/download it even while their Ohnix subscription is
// paused for non-payment (see requireActiveSubscription's comment). Only the
// write actions below - which create/resend billable DIAN documents - are
// gated.
router.route("/:id/electronic-invoice").get(requireModulePermission("orders", "view"), getOrderElectronicInvoice);
router.route("/:id/electronic-invoice/pdf").get(requireModulePermission("orders", "view"), downloadOrderElectronicInvoicePdf);
router.route("/:id/electronic-invoice/issue").post(requireModulePermission("orders", "edit"), requireActiveSubscription, issueOrderElectronicInvoice);
router.route("/:id/electronic-invoice/sync").post(requireModulePermission("orders", "edit"), requireActiveSubscription, syncOrderElectronicInvoice);
router.route("/:id/electronic-invoice/credit-notes")
    .get(requireModulePermission("orders", "view"), getOrderCreditNotes)
    .post(requireModulePermission("orders", "edit"), requireActiveSubscription, idempotent("credit-note.issue"), issueOrderCreditNote);
router.post(
    "/:id/electronic-invoice/credit-notes/:creditNoteId/retry-local-effect",
    requireModulePermission("orders", "edit"),
    requireActiveSubscription,
    idempotent("credit-note.local-effect"),
    retryOrderCreditNoteLocalEffect
);

// Admin-only routes
router.get("/all", isAdmin, getAllOrdersAdmin);

export default router;
