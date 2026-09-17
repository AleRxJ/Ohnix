import { Router } from "express";
import { verifyApiKey, enforceApiRateLimit } from "../middleware/apiKeyAuth.middleware.js";
import { requireScope } from "../middleware/apiScopes.middleware.js";
import { enforceEntityLimit, enforceMonthlyLimit } from "../middleware/pricing.middleware.js";
import { idempotent } from "../middleware/idempotency.middleware.js";
import { upload } from "../middleware/multer.middleware.js";
import {
    createProduct,
    getAllProducts,
    updateProduct,
    adjustProductStock,
    getProductStockMovements,
    getProductLocationStock,
} from "../controllers/product.controller.js";
import { getPublicProduct } from "../controllers/publicApi.controller.js";
import {
    getVariants,
    postVariant,
    patchVariant,
    removeVariant,
    postVariantAdjustStock,
} from "../controllers/variant.controller.js";
import {
    addProductImages,
    deleteProductImage,
    setPrimaryProductImage,
    reorderProductImages,
} from "../controllers/productImage.controller.js";
import { MAX_PRODUCT_IMAGES } from "../services/productImage.service.js";
import { createCustomer, getUserCustomers } from "../controllers/customer.controller.js";
import { createOrder, getAllOrders, getOrderDetails, updateOrderStatus } from "../controllers/order.controller.js";
import {
    listWebhookEndpoints,
    createWebhookEndpoint,
    updateWebhookEndpoint,
    deleteWebhookEndpoint,
    getWebhookEvents,
} from "../controllers/webhookEndpoint.controller.js";

const router = Router();

router.use(verifyApiKey, enforceApiRateLimit);

// ── Products ─────────────────────────────────────────────────────────────
router
    .route("/products")
    .get(requireScope("products:read"), getAllProducts)
    .post(requireScope("products:write"), enforceEntityLimit("products"), upload.single("product_image"), createProduct);
router.route("/products/:id").get(requireScope("products:read"), getPublicProduct).patch(requireScope("products:write"), upload.single("product_image"), updateProduct);

// ── Variants ─────────────────────────────────────────────────────────────
router
    .route("/products/:id/variants")
    .get(requireScope("variants:read"), getVariants)
    .post(requireScope("variants:write"), postVariant);
router
    .route("/variants/:variantId")
    .patch(requireScope("variants:write"), patchVariant)
    .delete(requireScope("variants:write"), removeVariant);
router
    .route("/variants/:variantId/adjust-stock")
    .post(requireScope("inventory:write"), idempotent("public.variant.adjust-stock"), postVariantAdjustStock);

// ── Images ───────────────────────────────────────────────────────────────
router
    .route("/products/:id/images")
    .post(requireScope("products:write"), upload.array("images", MAX_PRODUCT_IMAGES), addProductImages);
router.route("/products/:id/images/reorder").patch(requireScope("products:write"), reorderProductImages);
router.route("/products/:id/images/:imageId").delete(requireScope("products:write"), deleteProductImage);
router.route("/products/:id/images/:imageId/primary").patch(requireScope("products:write"), setPrimaryProductImage);

// ── Inventory ────────────────────────────────────────────────────────────
router.route("/inventory/:id").get(requireScope("inventory:read"), getProductLocationStock);
router.route("/inventory/:id/movements").get(requireScope("inventory:read"), getProductStockMovements);
router
    .route("/inventory/:id/adjust")
    .post(requireScope("inventory:write"), idempotent("public.inventory.adjust"), adjustProductStock);

// ── Customers ────────────────────────────────────────────────────────────
router
    .route("/customers")
    .get(requireScope("customers:read"), getUserCustomers)
    .post(requireScope("customers:write"), enforceEntityLimit("customers"), createCustomer);

// ── Orders ───────────────────────────────────────────────────────────────
router
    .route("/orders")
    .get(requireScope("orders:read"), getAllOrders)
    .post(
        requireScope("orders:write"),
        enforceEntityLimit("orders"),
        enforceMonthlyLimit("orders"),
        idempotent("public.order.create"),
        createOrder
    );
router.route("/orders/:id/details").get(requireScope("orders:read"), getOrderDetails);
router
    .route("/orders/:id/status")
    .patch(requireScope("orders:write"), idempotent("public.order.status"), updateOrderStatus);

// ── Webhooks (register a URL to receive Ohnix events) ───────────────────
router.route("/webhooks/events").get(getWebhookEvents);
router
    .route("/webhooks")
    .get(requireScope("webhooks:write"), listWebhookEndpoints)
    .post(requireScope("webhooks:write"), createWebhookEndpoint);
router
    .route("/webhooks/:id")
    .patch(requireScope("webhooks:write"), updateWebhookEndpoint)
    .delete(requireScope("webhooks:write"), deleteWebhookEndpoint);

export default router;
