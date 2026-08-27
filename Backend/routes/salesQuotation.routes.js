import { Router } from "express";
import { createSalesQuotation, getSalesQuotations, sendSalesQuotation } from "../controllers/salesQuotation.controller.js";
import { convertSalesQuotation } from "../controllers/salesQuotation.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { enforcePlanFeature } from "../middleware/pricing.middleware.js";

const router = Router();

router.use(verifyJWT);
router
    .route("/")
    .post(requireModulePermission("orders", "edit"), enforcePlanFeature("salesQuotations"), createSalesQuotation)
    .get(requireModulePermission("orders", "view"), enforcePlanFeature("salesQuotations"), getSalesQuotations);

router.post("/:id/send", requireModulePermission("orders", "edit"), sendSalesQuotation);
router.post("/:id/convert", requireModulePermission("orders", "edit"), convertSalesQuotation);

export default router;
