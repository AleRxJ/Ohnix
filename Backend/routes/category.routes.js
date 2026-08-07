import { Router } from "express";
import {
    createCategory,
    getAllCategories,
    getUserCategories,
    getAvailableCategories,
    updateCategory,
    deleteCategory,
} from "../controllers/category.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { enforceEntityLimit } from "../middleware/pricing.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";

const router = Router();

router.use(verifyJWT);

router.route("/available").get(requireModulePermission("categories", "view"), getAvailableCategories);

router.route("/").post(requireModulePermission("categories", "edit"), enforceEntityLimit("categories"), createCategory);
router.route("/user").get(requireModulePermission("categories", "view"), getUserCategories);
router.route("/user/:id")
    .patch(requireModulePermission("categories", "edit"), updateCategory)
    .delete(requireModulePermission("categories", "edit"), deleteCategory);

// Admin-only routes
router.use(isAdmin);
router.route("/admin/all").get(getAllCategories);
router.route("/admin/:id").patch(updateCategory).delete(deleteCategory);

export default router;
