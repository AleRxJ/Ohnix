import { Router } from "express";
import { deleteTutorialData } from "../controllers/tutorialData.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

router.route("/").delete(deleteTutorialData);

export default router;
