import { Router } from "express";
import {
    createProduct,
    getAllProducts,
    updateProduct,
    deleteProduct,
    getAllProductsAdmin,
} from "../controllers/product.controller.js";
import { bulkUploadProducts } from "../controllers/product.bulk.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { enforceEntityLimit, enforcePlanFeature } from "../middleware/pricing.middleware.js";
import { upload, csvUpload } from "../middleware/multer.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";

const router = Router();

router.use(verifyJWT);

// Bulk upload — Negocio ($49) and above
router.route("/bulk-upload").post(requireModulePermission("products", "edit"), enforcePlanFeature("bulkUpload"), csvUpload.single("file"), bulkUploadProducts);

router
    .route("/")
    .post(requireModulePermission("products", "edit"), enforceEntityLimit("products"), upload.single("product_image"), createProduct)
    .get(requireModulePermission("products", "view"), getAllProducts);

// Admin route
router.route("/all").get(isAdmin, getAllProductsAdmin);

router
    .route("/:id")
    .patch(requireModulePermission("products", "edit"), upload.single("product_image"), updateProduct)
    .delete(requireModulePermission("products", "edit"), deleteProduct);

export default router;
