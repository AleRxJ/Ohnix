import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import { idempotent } from "../middleware/idempotency.middleware.js";
import {
    getProviderConnection,
    putProviderConnection,
    deleteProviderConnection,
    getProviderTerminals,
    postPaymentIntent,
    getPaymentIntent,
    postCancelPaymentIntent,
} from "../controllers/paymentProvider.controller.js";

// Each company connects and charges through its OWN provider account - every
// handler here is scoped to req.user.prismaId. The public webhook receiver
// lives in app.js (raw body, no JWT).
const router = Router();
router.use(verifyJWT);

// Reading whether Bold is connected is what the Caja needs to offer it;
// changing the keys is a finance-admin decision.
router
    .route("/:provider/connection")
    .get(requireModulePermission("orders", "view"), getProviderConnection)
    .put(requireModulePermission("finance", "admin"), putProviderConnection)
    .delete(requireModulePermission("finance", "admin"), deleteProviderConnection);

router.get("/:provider/terminals", requireModulePermission("orders", "edit"), getProviderTerminals);

router.post(
    "/:provider/intents",
    requireModulePermission("orders", "edit"),
    requireModulePermission("finance", "edit"),
    idempotent("payment-intent.create"),
    postPaymentIntent
);
router.get("/intents/:intentId", requireModulePermission("orders", "edit"), getPaymentIntent);
router.post("/intents/:intentId/cancel", requireModulePermission("orders", "edit"), postCancelPaymentIntent);

export default router;
