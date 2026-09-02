import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { blockTeamMembers } from "../middleware/teamGuard.middleware.js";
import { idempotent } from "../middleware/idempotency.middleware.js";
import {
    startMyDianTestMatrixRun,
    getMyDianTestMatrixRun,
    listMyDianTestMatrixRuns,
    cancelMyDianTestMatrixRun,
    requestMyDianProductionActivation,
} from "../controllers/dianTestMatrixSelf.controller.js";

const router = Router();

// Separate file/mount from dianTestMatrix.routes.js (admin, isAdmin-gated) -
// self-service DIAN habilitación is owner-only, same rule as
// companySelf.routes.js (branding/billing/API keys): any authenticated
// owner, never a team member.
router.use(verifyJWT, blockTeamMembers);

router.route("/runs").get(listMyDianTestMatrixRuns).post(idempotent("dian-test-matrix.start"), startMyDianTestMatrixRun);
router.route("/runs/:runId").get(getMyDianTestMatrixRun);
router.route("/runs/:runId/cancel").post(cancelMyDianTestMatrixRun);
router.route("/runs/:runId/request-production").post(idempotent("dian-test-matrix.request-production"), requestMyDianProductionActivation);

export default router;
