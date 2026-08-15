import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import {
    getColombiaTaxSettingsAdmin,
    updateColombiaTaxSettingsAdmin,
} from "../controllers/systemSettings.controller.js";

const router = Router();

router.use(verifyJWT, isAdmin);

router.route("/colombia-tax").get(getColombiaTaxSettingsAdmin).patch(updateColombiaTaxSettingsAdmin);

export default router;
