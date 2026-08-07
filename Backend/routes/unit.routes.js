import { Router } from "express";
import {
    createUnit,
    getAllUnits,
    updateUnit,
    deleteUnit,
} from "../controllers/unit.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { enforceEntityLimit } from "../middleware/pricing.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";

const router = Router();

router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

// Regular user routes
router.route("/")
    .post(requireModulePermission("units", "edit"), enforceEntityLimit("units"), createUnit)
    .get(requireModulePermission("units", "view"), getAllUnits); // This will now return only the user's units by default

router.route("/:id")
    .patch(requireModulePermission("units", "edit"), updateUnit)
    .delete(requireModulePermission("units", "edit"), deleteUnit);

// Admin only routes
router.route("/admin/all").get(isAdmin, getAllUnits); // This will get all units for admin

export default router;
