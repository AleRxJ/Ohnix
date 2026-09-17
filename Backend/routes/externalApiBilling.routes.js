import { Router } from "express";
import { getMyBillingEnrollmentPreview, completeMyBillingEnrollment } from "../controllers/externalApiBilling.controller.js";
import { registerRateLimiter } from "../middleware/rateLimit.middleware.js";

// Fully public, unauthenticated - see externalApiBilling.controller.js's own
// comment. Scoped entirely by the single-use, 7-day link token in the URL,
// never by an Ohnix session (there isn't one - the caller is an external
// company with no Ohnix account). Rate-limited the same as
// guestCertificateCheckout.routes.js, for the same reason: a public,
// unauthenticated endpoint that can trigger a real external side effect
// (here, an ePayco customer/token registration) needs abuse protection.
const router = Router();

router.route("/enroll/:token").get(registerRateLimiter, getMyBillingEnrollmentPreview);
router.route("/enroll/:token").post(registerRateLimiter, completeMyBillingEnrollment);

export default router;
