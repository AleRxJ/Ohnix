import express from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { listDiscoveryPatternStats } from "../controllers/discoveryPatternStats.controller.js";

const router = express.Router();
router.use(verifyJWT);

router.get("/", isAdmin, listDiscoveryPatternStats);

export default router;
