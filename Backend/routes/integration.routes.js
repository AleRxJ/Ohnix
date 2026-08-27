import { Router } from "express";
import {
    getProviders,
    getIntegrations,
    postIntegration,
    getIntegration,
    postTestIntegration,
    deleteIntegration,
    getIntegrationLogs,
    postPublishProduct,
    postSyncInventory,
} from "../controllers/integration.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { enforcePlanFeature } from "../middleware/pricing.middleware.js";
import { blockTeamMembers } from "../middleware/teamGuard.middleware.js";
import { idempotent } from "../middleware/idempotency.middleware.js";

const router = Router();

// Same posture as API keys/webhook endpoints: account-wide, owner-only,
// gated behind the apiAccess plan feature.
router.use(verifyJWT, enforcePlanFeature("apiAccess"), blockTeamMembers);

router.route("/providers").get(getProviders);
router.route("/").get(getIntegrations).post(postIntegration);
router.route("/:id").get(getIntegration).delete(deleteIntegration);
router.route("/:id/test").post(postTestIntegration);
router.route("/:id/logs").get(getIntegrationLogs);
router.route("/:id/products/:productId/publish").post(idempotent("integration.publish-product"), postPublishProduct);
router.route("/:id/inventory/sync").post(idempotent("integration.sync-inventory"), postSyncInventory);

export default router;
