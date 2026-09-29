import { Router } from "express";
import {
    createCustomer,
    getAllCustomers,
    getUserCustomers,
    updateCustomer,
    deleteCustomer,
    reassignCustomerPointOfSale,
    getOrCreateFinalConsumer,
} from "../controllers/customer.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { enforceEntityLimit, enforcePlanFeature } from "../middleware/pricing.middleware.js";
import { upload } from "../middleware/multer.middleware.js";
import { requireModulePermission, requireCapability } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";

const router = Router();

router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

// Regular user routes - only for their own customers
router
    .route("/")
    .post(requireModulePermission("customers", "edit"), enforceEntityLimit("customers"), upload.single("photo"), idempotent("customer.create"), createCustomer)
    .get(requireModulePermission("customers", "view"), getUserCustomers);

// Admin routes - can access all customers
router.route("/all").get(isAdmin, getAllCustomers);

// POS checkout ("Caja") - gated on selling, not on managing customers: a
// cashier needs the walk-in buyer without "customers: edit".
router.post("/final-consumer", requireModulePermission("orders", "edit"), getOrCreateFinalConsumer);

router
    .route("/:id")
    .patch(requireModulePermission("customers", "edit"), upload.single("photo"), idempotent("customer.update"), updateCustomer)
    .delete(requireModulePermission("customers", "edit"), requireCapability("deleteRecords", "Tu rol no tiene permiso para eliminar registros."), idempotent("customer.delete"), deleteCustomer);

router
    .route("/:id/point-of-sale")
    .patch(requireModulePermission("customers", "edit"), enforcePlanFeature("multiLocation"), reassignCustomerPointOfSale);

export default router;
