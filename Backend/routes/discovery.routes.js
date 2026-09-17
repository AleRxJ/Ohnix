import express from "express";
import { listDiscoveries, getDiscovery, updateDiscoveryStatus, setDiscoveryExplanation } from "../controllers/discovery.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";

const router = express.Router();

router.use(verifyJWT);

// Piggybacks on the "reports" module permission for Fase 1 rather than
// introducing a new grantable module - revisit if discoveries end up
// needing their own independent access level from reports.
router.route("/").get(requireModulePermission("reports", "view"), listDiscoveries);
router.route("/:id").get(requireModulePermission("reports", "view"), getDiscovery);
router.route("/:id/status").patch(requireModulePermission("reports", "edit"), updateDiscoveryStatus);
router.route("/:id/explanation").patch(requireModulePermission("reports", "edit"), setDiscoveryExplanation);

export default router;
