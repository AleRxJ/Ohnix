import { Router } from "express";
import { deleteTutorialData } from "../controllers/tutorialData.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { blockTeamMembers } from "../middleware/teamGuard.middleware.js";

const router = Router();

// Owner-only: the purge spans products/orders/purchases/customers/etc. of the
// whole account, so no single module permission covers it - and the tour
// that calls it is already hidden from team members (InventoryTourFab.jsx).
router.use(verifyJWT, blockTeamMembers);

router.route("/").delete(deleteTutorialData);

export default router;
