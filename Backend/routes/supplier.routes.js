import { Router } from "express";
import {
    createSupplier,
    getUserSuppliers,
    getAllSuppliers,
    updateSupplier,
    deleteSupplier,
} from "../controllers/supplier.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { enforceEntityLimit } from "../middleware/pricing.middleware.js";
import { upload } from "../middleware/multer.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";

const router = Router();

router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

router.route("/admin/all").get(isAdmin, getAllSuppliers);

// Regular user routes
router
    .route("/")
    .post(requireModulePermission("suppliers", "edit"), enforceEntityLimit("suppliers"), upload.single("photo"), createSupplier)
    .get(requireModulePermission("suppliers", "view"), getUserSuppliers);

router
    .route("/:id")
    .patch(requireModulePermission("suppliers", "edit"), upload.single("photo"), updateSupplier)
    .delete(requireModulePermission("suppliers", "edit"), deleteSupplier);

export default router;
