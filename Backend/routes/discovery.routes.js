import express from "express";
import { listDiscoveries, getDiscovery, updateDiscoveryStatus, setDiscoveryExplanation } from "../controllers/discovery.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { enforcePlanFeature } from "../middleware/pricing.middleware.js";

const router = express.Router();

router.use(verifyJWT);
// Discovery Engine is a Negocio+ feature (PLAN_FEATURES.discoveryEngine) -
// gated on the whole router since every route here is the same feature,
// same pattern as accounting.routes.js's router.use(enforcePlanFeature(...)).
router.use(enforcePlanFeature("discoveryEngine"));

// Piggybacks on the "reports" module permission for Fase 1 rather than
// introducing a new grantable module - revisit if discoveries end up
// needing their own independent access level from reports.
router.route("/").get(requireModulePermission("reports", "view"), listDiscoveries);
router.route("/:id").get(requireModulePermission("reports", "view"), getDiscovery);
router.route("/:id/status").patch(requireModulePermission("reports", "edit"), updateDiscoveryStatus);
router.route("/:id/explanation").patch(requireModulePermission("reports", "edit"), setDiscoveryExplanation);

export default router;
