import express from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { listDimensionConfig, setDimensionConfig } from "../controllers/discoveryDimensionConfig.controller.js";

const router = express.Router();
router.use(verifyJWT);

router.get("/", isAdmin, listDimensionConfig);
router.patch("/", isAdmin, setDimensionConfig);

export default router;
