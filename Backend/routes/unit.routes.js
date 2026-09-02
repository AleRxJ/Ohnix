import { Router } from "express";
import {
    createUnit,
    getAllUnits,
    getAvailableUnits,
    updateUnit,
    deleteUnit,
} from "../controllers/unit.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { enforceEntityLimit } from "../middleware/pricing.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";

const router = Router();

router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

router.route("/available").get(requireModulePermission("units", "view"), getAvailableUnits);

// Regular user routes
router.route("/")
    .post(requireModulePermission("units", "edit"), enforceEntityLimit("units"), idempotent("unit.create"), createUnit)
    .get(requireModulePermission("units", "view"), getAllUnits); // This will now return only the user's units by default

router.route("/:id")
    .patch(requireModulePermission("units", "edit"), idempotent("unit.update"), updateUnit)
    .delete(requireModulePermission("units", "edit"), idempotent("unit.delete"), deleteUnit);

// Admin only routes
router.route("/admin/all").get(isAdmin, getAllUnits); // This will get all units for admin

export default router;
