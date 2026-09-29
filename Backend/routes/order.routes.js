import { patchDeferredOrderCustomer, getOrderReceiptData } from "../controllers/einvoicePending.controller.js";
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
import { requireModulePermission, requireCapability } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";

const router = express.Router();

router.use(verifyJWT); // Apply auth middleware to all routes

// User routes - filtered by user ID
router.post("/", requireModulePermission("orders", "edit"), enforceEntityLimit("orders"), enforceMonthlyLimit("orders"), idempotent("order.create"), createOrder);
router.get("/", requireModulePermission("orders", "view"), getAllOrders);
router.get("/:id/details", requireModulePermission("orders", "view"), getOrderDetails);
// Printable ticket for the Caja (and reprints) - see orderReceipt.service.js.
router.get("/:id/receipt", requireModulePermission("orders", "view"), getOrderReceiptData);
router.patch("/:id/status", requireModulePermission("orders", "edit"), idempotent("order.status"), updateOrderStatus);
router.route("/:id/return-preview").get(requireModulePermission("orders", "view"), getOrderReturnPreview);
// Process a granular, repeatable return - same reasoning as
// purchase.routes.js's "/:id/returns": because it's meant to be called more
// than once, `idempotent` is what distinguishes an accidental duplicate call
// (retry, double-click) from a second real return.
router.route("/:id/returns").post(requireModulePermission("orders", "edit"), requireCapability("processReturns", "Tu rol no tiene permiso para procesar devoluciones."), idempotent("order.return"), processOrderReturn);
router.route("/:id/shipping-payload").get(requireModulePermission("orders", "view"), getOrderShippingPayload);
router.route("/:id/invoice").get(requireModulePermission("orders", "view"), generateInvoice);
// GET routes here are deliberately never gated by requireActiveSubscription:
// an already-issued DIAN invoice is the customer's own tax record, and they
// must be able to view/download it even while their Ohnix subscription is
// paused for non-payment (see requireActiveSubscription's comment). Only the
// write actions below - which create/resend billable DIAN documents - are
// gated.
// Sales e-invoices / credit notes are the "einvoicing" module (split out of
// "orders" 2026-09-28 - see team.permissions.js).
router.route("/:id/electronic-invoice").get(requireModulePermission("einvoicing", "view"), getOrderElectronicInvoice);
router.route("/:id/electronic-invoice/pdf").get(requireModulePermission("einvoicing", "view"), downloadOrderElectronicInvoicePdf);
// Before issuing a deferred sale: swap "Consumidor final" for the buyer who
// asked for the invoice (see einvoicePending.service.js).
router.patch("/:id/einvoice-customer", requireModulePermission("orders", "edit"), requireModulePermission("einvoicing", "edit"), patchDeferredOrderCustomer);
router.route("/:id/electronic-invoice/issue").post(requireModulePermission("einvoicing", "edit"), requireActiveSubscription, issueOrderElectronicInvoice);
router.route("/:id/electronic-invoice/sync").post(requireModulePermission("einvoicing", "edit"), requireActiveSubscription, syncOrderElectronicInvoice);
// Issuing a credit note is a DIAN-facing, irreversible fiscal document -
// "admin". The retry below stays "edit": it only finishes the local
// stock/ledger effect of a credit note someone with "admin" already issued.
router.route("/:id/electronic-invoice/credit-notes")
    .get(requireModulePermission("einvoicing", "view"), getOrderCreditNotes)
    .post(requireModulePermission("einvoicing", "admin"), requireActiveSubscription, idempotent("credit-note.issue"), issueOrderCreditNote);
router.post(
    "/:id/electronic-invoice/credit-notes/:creditNoteId/retry-local-effect",
    requireModulePermission("einvoicing", "edit"),
    requireActiveSubscription,
    idempotent("credit-note.local-effect"),
    retryOrderCreditNoteLocalEffect
);

// Admin-only routes
router.get("/all", isAdmin, getAllOrdersAdmin);

export default router;
