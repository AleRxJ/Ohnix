import { Router } from "express";
import {
    createCustomer,
    getAllCustomers,
    getUserCustomers,
    updateCustomer,
    deleteCustomer,
} from "../controllers/customer.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { enforceEntityLimit } from "../middleware/pricing.middleware.js";
import { upload } from "../middleware/multer.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";

const router = Router();

router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

// Regular user routes - only for their own customers
router
    .route("/")
    .post(requireModulePermission("customers", "edit"), enforceEntityLimit("customers"), upload.single("photo"), createCustomer)
    .get(requireModulePermission("customers", "view"), getUserCustomers);

// Admin routes - can access all customers
router.route("/all").get(isAdmin, getAllCustomers);

router
    .route("/:id")
    .patch(requireModulePermission("customers", "edit"), upload.single("photo"), updateCustomer)
    .delete(requireModulePermission("customers", "edit"), deleteCustomer);

export default router;
