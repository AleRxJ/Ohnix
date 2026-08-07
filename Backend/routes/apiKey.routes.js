import { Router } from "express";
import { listApiKeys, createApiKey, revokeApiKey } from "../controllers/apiKey.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { enforcePlanFeature } from "../middleware/pricing.middleware.js";
import { blockTeamMembers } from "../middleware/teamGuard.middleware.js";

const router = Router();

// API keys are an account-wide credential, not a per-module permission -
// owner-only in v1 regardless of team role (see teamGuard.middleware.js).
router.use(verifyJWT, enforcePlanFeature("apiAccess"), blockTeamMembers);

router.route("/").get(listApiKeys).post(createApiKey);
router.route("/:id").delete(revokeApiKey);

export default router;
