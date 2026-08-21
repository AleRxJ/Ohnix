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
