import { Router } from "express";
import {
    createQuotation,
    getAllQuotations,
    getQuotationDetails,
    updateQuotation,
    markQuotationReceived,
    rejectQuotation,
} from "../controllers/purchaseQuotation.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";

const router = Router();

router.use(verifyJWT);

// Quotations share the "purchases" permission module rather than getting
// their own - approving/rejecting a supplier's price offer is the same team
// responsibility as managing purchases themselves, and splitting it into a
// separately grantable module isn't needed yet (see plan's "fuera de
// alcance"). Not subject to enforceEntityLimit/enforceMonthlyLimit("purchases")
// - a quotation isn't a purchase until it's actually converted into one.
router
    .route("/")
    .post(requireModulePermission("purchases", "edit"), idempotent("purchase-quotation.create"), createQuotation)
    .get(requireModulePermission("purchases", "view"), getAllQuotations);

router
    .route("/:id")
    .get(requireModulePermission("purchases", "view"), getQuotationDetails)
    .patch(requireModulePermission("purchases", "edit"), idempotent("purchase-quotation.update"), updateQuotation);

router.route("/:id/received").post(requireModulePermission("purchases", "edit"), idempotent("quotation.received"), markQuotationReceived);
router.route("/:id/reject").post(requireModulePermission("purchases", "edit"), idempotent("quotation.reject"), rejectQuotation);

export default router;
