import { Router } from "express";
import { listApiKeys, createApiKey, revokeApiKey } from "../controllers/apiKey.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { enforcePlanFeature } from "../middleware/pricing.middleware.js";

const router = Router();

router.use(verifyJWT, enforcePlanFeature("apiAccess"));

router.route("/").get(listApiKeys).post(createApiKey);
router.route("/:id").delete(revokeApiKey);

export default router;
