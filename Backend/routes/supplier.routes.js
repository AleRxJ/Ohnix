import { Router } from "express";
import {
    createSupplier,
    getUserSuppliers,
    getAllSuppliers,
    updateSupplier,
    deleteSupplier,
    reassignSupplierPointOfSale,
} from "../controllers/supplier.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { enforceEntityLimit, enforcePlanFeature } from "../middleware/pricing.middleware.js";
import { upload } from "../middleware/multer.middleware.js";
import { requireModulePermission, requireCapability } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";

const router = Router();

router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

router.route("/admin/all").get(isAdmin, getAllSuppliers);

// Regular user routes
router
    .route("/")
    .post(requireModulePermission("suppliers", "edit"), enforceEntityLimit("suppliers"), upload.single("photo"), idempotent("supplier.create"), createSupplier)
    .get(requireModulePermission("suppliers", "view"), getUserSuppliers);

router
    .route("/:id")
    .patch(requireModulePermission("suppliers", "edit"), upload.single("photo"), idempotent("supplier.update"), updateSupplier)
    .delete(requireModulePermission("suppliers", "edit"), requireCapability("deleteRecords", "Tu rol no tiene permiso para eliminar registros."), idempotent("supplier.delete"), deleteSupplier);

router
    .route("/:id/point-of-sale")
    .patch(requireModulePermission("suppliers", "edit"), enforcePlanFeature("multiLocation"), reassignSupplierPointOfSale);

export default router;
