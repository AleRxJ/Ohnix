import { Router } from "express";
import {
    lookupSaleForWarranty,
    createWarranty,
    getAllWarranties,
    getWarrantyDashboard,
    getWarrantyDetails,
    updateWarranty,
    updateWarrantyStatus,
    deleteWarranty,
    addWarrantyAttachments,
    removeWarrantyAttachment,
    previewWarrantyNotification,
    sendManualWarrantyNotification,
    getWarrantySettings,
    updateWarrantySettings,
} from "../controllers/warranty.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";
import { upload } from "../middleware/multer.middleware.js";

const router = Router();

router.use(verifyJWT);

// Settings (notification toggles + templates, section 8) is account
// configuration, not day-to-day operation - "admin" level only, same
// reasoning as billing/pointsOfSale management elsewhere.
router.route("/settings")
    .get(requireModulePermission("warranties", "admin"), getWarrantySettings)
    .put(requireModulePermission("warranties", "admin"), updateWarrantySettings);

router.route("/lookup/sale").get(requireModulePermission("warranties", "view"), lookupSaleForWarranty);

router.route("/dashboard").get(requireModulePermission("warranties", "view"), getWarrantyDashboard);

router
    .route("/")
    .get(requireModulePermission("warranties", "view"), getAllWarranties)
    .post(requireModulePermission("warranties", "edit"), idempotent("warranty.create"), createWarranty);

router
    .route("/:id")
    .get(requireModulePermission("warranties", "view"), getWarrantyDetails)
    .patch(requireModulePermission("warranties", "edit"), idempotent("warranty.update"), updateWarranty)
    .delete(requireModulePermission("warranties", "admin"), deleteWarranty);

router.route("/:id/status").patch(requireModulePermission("warranties", "edit"), idempotent("warranty.status"), updateWarrantyStatus);

router
    .route("/:id/attachments")
    .post(requireModulePermission("warranties", "edit"), upload.array("files", 5), addWarrantyAttachments);
router
    .route("/:id/attachments/:attachmentId")
    .delete(requireModulePermission("warranties", "edit"), removeWarrantyAttachment);

router.route("/:id/notify/preview").get(requireModulePermission("warranties", "view"), previewWarrantyNotification);
router
    .route("/:id/notify")
    .post(requireModulePermission("warranties", "edit"), idempotent("warranty.notify.manual"), sendManualWarrantyNotification);

export default router;
