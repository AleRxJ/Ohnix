import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import {
    startDianTestMatrixRunAdmin,
    getDianTestMatrixRunAdmin,
    listDianTestMatrixRunsAdmin,
    cancelDianTestMatrixRunAdmin,
} from "../controllers/dianTestMatrix.controller.js";

const router = Router();

// Platform-admin only - see Backend/services/dianTestMatrix.service.js for
// why this can never be a client-facing feature (running the DIAN
// habilitación set de pruebas requires real DIAN sandbox credentials no
// client interacts with directly).
router.use(verifyJWT, isAdmin);

router.route("/runs").get(listDianTestMatrixRunsAdmin).post(startDianTestMatrixRunAdmin);
router.route("/runs/:runId").get(getDianTestMatrixRunAdmin);
router.route("/runs/:runId/cancel").post(cancelDianTestMatrixRunAdmin);

export default router;
