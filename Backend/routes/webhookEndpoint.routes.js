import { Router } from "express";
import {
    listWebhookEndpoints,
    createWebhookEndpoint,
    updateWebhookEndpoint,
    deleteWebhookEndpoint,
    getWebhookDeliveries,
    getWebhookEvents,
} from "../controllers/webhookEndpoint.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { enforcePlanFeature } from "../middleware/pricing.middleware.js";
import { blockTeamMembers } from "../middleware/teamGuard.middleware.js";

const router = Router();

// Same posture as API keys: an account-wide credential/config, owner-only,
// gated behind the apiAccess plan feature (see pricing.middleware.js).
router.use(verifyJWT, enforcePlanFeature("apiAccess"), blockTeamMembers);

router.route("/events").get(getWebhookEvents);
router.route("/").get(listWebhookEndpoints).post(createWebhookEndpoint);
router.route("/:id").patch(updateWebhookEndpoint).delete(deleteWebhookEndpoint);
router.route("/:id/deliveries").get(getWebhookDeliveries);

export default router;
