import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission, stripCostFieldsUnlessAllowed } from "../middleware/team.permissions.js";
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
// Buying prices / inventory valuation hidden from members without the
// catalogViewCosts capability (team.permissions.js).
router.use(stripCostFieldsUnlessAllowed);
// Moving stock between locations only makes sense once an account has more
// than one - same gate as creating a second PointOfSale itself
// (pointOfSale.routes.js).
router.use(enforcePlanFeature("multiLocation"));

router
    .route("/")
    .get(requireModulePermission("inventory", "view"), listTransfers)
    .post(requireModulePermission("inventory", "edit"), idempotent("stock-transfer.request"), createTransferRequest);

// Quick transfers approve themselves in the same step (status "received"
// directly - see createQuickTransfer), so they need the same "admin" as
// /:id/approve or they'd be a way around it.
router
    .route("/quick")
    .post(requireModulePermission("inventory", "admin"), idempotent("stock-transfer.quick"), createQuickTransfer);

router.route("/:id").get(requireModulePermission("inventory", "view"), getTransfer);
router.route("/:id/approve").patch(requireModulePermission("inventory", "admin"), idempotent("stock-transfer.approve"), approveTransfer);
router.route("/:id/ship").patch(requireModulePermission("inventory", "edit"), idempotent("stock-transfer.ship"), shipTransfer);
router.route("/:id/receive").patch(requireModulePermission("inventory", "edit"), idempotent("stock-transfer.receive"), receiveTransfer);
router.route("/:id/cancel").patch(requireModulePermission("inventory", "edit"), idempotent("stock-transfer.cancel"), cancelTransfer);

export default router;
