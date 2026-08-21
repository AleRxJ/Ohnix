import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { enforcePlanFeature, enforceEntityLimit } from "../middleware/pricing.middleware.js";
import {
    listPointOfSales,
    createPointOfSale,
    updatePointOfSale,
} from "../controllers/pointOfSale.controller.js";

const router = Router();

router.use(verifyJWT);

router.route("/points-of-sale")
    .get(listPointOfSales)
    .post(
        requireModulePermission("pointsOfSale", "admin"),
        enforcePlanFeature("multiLocation"),
        enforceEntityLimit("pointsOfSale"),
        createPointOfSale
    );

router.route("/points-of-sale/:id")
    .patch(requireModulePermission("pointsOfSale", "admin"), updatePointOfSale);

export default router;
