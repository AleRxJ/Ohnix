import { Router } from "express";
import { createSalesQuotation, getSalesQuotations, sendSalesQuotation } from "../controllers/salesQuotation.controller.js";
import { convertSalesQuotation } from "../controllers/salesQuotation.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { enforcePlanFeature } from "../middleware/pricing.middleware.js";
import { idempotent } from "../middleware/idempotency.middleware.js";

const router = Router();

router.use(verifyJWT);
router
    .route("/")
    .post(requireModulePermission("orders", "edit"), enforcePlanFeature("salesQuotations"), idempotent("sales-quotation.create"), createSalesQuotation)
    .get(requireModulePermission("orders", "view"), enforcePlanFeature("salesQuotations"), getSalesQuotations);

router.post("/:id/send", requireModulePermission("orders", "edit"), idempotent("sales-quotation.send"), sendSalesQuotation);
// "convert" turns this quotation into a real Order - the one action here
// where a retried request creating two orders instead of one would be a
// real, visible mistake (double stock deduction, double invoice), not just
// a cosmetic duplicate row.
router.post("/:id/convert", requireModulePermission("orders", "edit"), idempotent("sales-quotation.convert"), convertSalesQuotation);

export default router;
