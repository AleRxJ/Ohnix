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
import { enforceEntityLimit } from "../middleware/pricing.middleware.js";
import { upload, csvUpload } from "../middleware/multer.middleware.js";

const router = Router();

router.use(verifyJWT);

router.route("/bulk-upload").post(csvUpload.single("file"), bulkUploadProducts);

router
    .route("/")
    .post(enforceEntityLimit("products"), upload.single("product_image"), createProduct)
    .get(getAllProducts);

// Admin route
router.route("/all").get(isAdmin, getAllProductsAdmin);

router
    .route("/:id")
    .patch(upload.single("product_image"), updateProduct)
    .delete(deleteProduct);

export default router;
