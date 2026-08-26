import { Router } from "express";
import { submitContactForm } from "../controllers/contact.controller.js";
import { contactFormRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.route("/contact").post(contactFormRateLimiter, submitContactForm);

export default router;
