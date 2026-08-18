import { Router } from "express";
import { getPublicPricing } from "../controllers/subscription.controller.js";

// Intentionally has no verifyJWT/auth middleware - this is consumed by the
// public marketing /precios page before signup, and must resolve pricing by
// country alone. Mounted directly in app.js instead of under
// subscription.routes.js, which applies router.use(verifyJWT) to every
// route in that file.
const router = Router();

router.route("/public").get(getPublicPricing);

export default router;
