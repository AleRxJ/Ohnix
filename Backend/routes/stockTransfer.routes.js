import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { enforcePlanFeature } from "../middleware/pricing.middleware.js";
import { idempotent } from "../middleware/idempotency.middleware.js";
import {
    createTransferRequest,
    createQuickTransfer,
    listTransfers,
    getTransfer,
    approveTransfer,
    shipTransfer,
    receiveTransfer,
    cancelTransfer,
} from "../controllers/stockTransfer.controller.js";

const router = Router();

router.use(verifyJWT);
// Moving stock between locations only makes sense once an account has more
// than one - same gate as creating a second PointOfSale itself
// (pointOfSale.routes.js).
router.use(enforcePlanFeature("multiLocation"));

router
    .route("/")
    .get(requireModulePermission("products", "view"), listTransfers)
    .post(requireModulePermission("products", "edit"), idempotent("stock-transfer.request"), createTransferRequest);

router
    .route("/quick")
    .post(requireModulePermission("products", "edit"), idempotent("stock-transfer.quick"), createQuickTransfer);

router.route("/:id").get(requireModulePermission("products", "view"), getTransfer);
router.route("/:id/approve").patch(requireModulePermission("products", "edit"), idempotent("stock-transfer.approve"), approveTransfer);
router.route("/:id/ship").patch(requireModulePermission("products", "edit"), idempotent("stock-transfer.ship"), shipTransfer);
router.route("/:id/receive").patch(requireModulePermission("products", "edit"), idempotent("stock-transfer.receive"), receiveTransfer);
router.route("/:id/cancel").patch(requireModulePermission("products", "edit"), idempotent("stock-transfer.cancel"), cancelTransfer);

export default router;
