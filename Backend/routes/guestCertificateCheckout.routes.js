import { Router } from "express";
import { registerForCertificateCheckout } from "../controllers/guestCertificateCheckout.controller.js";
import { registerRateLimiter } from "../middleware/rateLimit.middleware.js";

// Fully public, unauthenticated, account-creating endpoint (see
// guestCertificateCheckout.controller.js) - deliberately has NO
// verifyJWT/isAdmin/blockTeamMembers, it runs before any session exists.
// Rate-limited the same as /users/register since it creates a User the
// same way.
const router = Router();

router.route("/register").post(registerRateLimiter, registerForCertificateCheckout);

export default router;
