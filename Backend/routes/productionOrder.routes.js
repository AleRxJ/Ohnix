import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";
import {
    createProductionOrder,
    listProductionOrders,
    getProductionOrder,
    completeProductionOrder,
    cancelProductionOrder,
} from "../controllers/productionOrder.controller.js";

const router = Router();

router.use(verifyJWT);

router
    .route("/")
    .get(requireModulePermission("inventory", "view"), listProductionOrders)
    .post(requireModulePermission("inventory", "edit"), idempotent("production-order.create"), createProductionOrder);

router.route("/:id").get(requireModulePermission("inventory", "view"), getProductionOrder);
router.route("/:id/complete").patch(requireModulePermission("inventory", "edit"), idempotent("production-order.complete"), completeProductionOrder);
router.route("/:id/cancel").patch(requireModulePermission("inventory", "edit"), idempotent("production-order.cancel"), cancelProductionOrder);

export default router;
