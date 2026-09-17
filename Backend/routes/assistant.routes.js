import { Router } from "express";
import {
    sendChatMessage,
    getConversations,
    getConversation,
    postFeedback,
} from "../controllers/assistant.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { assistantChatRateLimiter } from "../middleware/rateLimit.middleware.js";

// Deliberately no requireModulePermission gate here (see
// middleware/team.permissions.js) - the assistant is cross-cutting help, not
// tied to one operational module, and is read-only/informational, so any
// authenticated account member (owner or team member, any role) can use it.
const router = Router();

router.use(verifyJWT);

router.route("/chat").post(assistantChatRateLimiter, sendChatMessage);
router.route("/conversations").get(getConversations);
router.route("/conversations/:id").get(getConversation);
router.route("/feedback").post(postFeedback);

export default router;
