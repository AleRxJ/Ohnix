import { Router } from "express";
import {
    createProduct,
    getAllProducts,
    updateProduct,
    deleteProduct,
    bulkUpdateLowStockThreshold,
    getAllProductsAdmin,
    adjustProductStock,
    getProductStockMovements,
    getProductLocationStock,
    transferProductStock,
} from "../controllers/product.controller.js";
import { bulkUploadProducts } from "../controllers/product.bulk.controller.js";
import {
    addProductImages,
    deleteProductImage,
    setPrimaryProductImage,
    reorderProductImages,
} from "../controllers/productImage.controller.js";
import { MAX_PRODUCT_IMAGES } from "../services/productImage.service.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { enforceEntityLimit, enforcePlanFeature } from "../middleware/pricing.middleware.js";
import { upload, csvUpload } from "../middleware/multer.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { bulkUploadRateLimiter } from "../middleware/rateLimit.middleware.js";
import { idempotent } from "../middleware/idempotency.middleware.js";

const router = Router();

router.use(verifyJWT);

// Bulk upload — Negocio ($49) and above
router.route("/bulk-upload").post(bulkUploadRateLimiter, requireModulePermission("products", "edit"), enforcePlanFeature("bulkUpload"), csvUpload.single("file"), bulkUploadProducts);

router
    .route("/")
    .post(requireModulePermission("products", "edit"), enforceEntityLimit("products"), upload.single("product_image"), createProduct)
    .get(requireModulePermission("products", "view"), getAllProducts);

router.route("/bulk-low-stock-threshold").patch(requireModulePermission("products", "edit"), bulkUpdateLowStockThreshold);

// Admin route
router.route("/all").get(isAdmin, getAllProductsAdmin);

router
    .route("/:id")
    .patch(requireModulePermission("products", "edit"), upload.single("product_image"), updateProduct)
    .delete(requireModulePermission("products", "edit"), deleteProduct);

// Gallery sub-resource. The literal "/reorder" route MUST be registered
// before "/:imageId" below, or Express matches "reorder" as an :imageId.
router
    .route("/:id/images")
    .post(requireModulePermission("products", "edit"), upload.array("images", MAX_PRODUCT_IMAGES), addProductImages);
router
    .route("/:id/images/reorder")
    .patch(requireModulePermission("products", "edit"), reorderProductImages);
router
    .route("/:id/images/:imageId")
    .delete(requireModulePermission("products", "edit"), deleteProductImage);
router
    .route("/:id/images/:imageId/primary")
    .patch(requireModulePermission("products", "edit"), setPrimaryProductImage);

router
    .route("/:id/adjust-stock")
    .post(requireModulePermission("products", "edit"), idempotent("product.adjust-stock"), adjustProductStock);
router.route("/:id/stock-movements").get(requireModulePermission("products", "view"), getProductStockMovements);
router.route("/:id/location-stock").get(requireModulePermission("products", "view"), getProductLocationStock);
router
    .route("/:id/transfer-stock")
    .post(
        requireModulePermission("products", "edit"),
        enforcePlanFeature("multiLocation"),
        idempotent("product.transfer-stock"),
        transferProductStock
    );

export default router;
