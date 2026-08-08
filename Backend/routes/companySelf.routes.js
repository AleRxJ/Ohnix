import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { blockTeamMembers } from "../middleware/teamGuard.middleware.js";
import { upload } from "../middleware/multer.middleware.js";
import { getMyCompany, updateMyCompany, updateMyCompanyLogo } from "../controllers/companySelf.controller.js";

const router = Router();

// Distinct file/mount from company.routes.js on purpose: that one is
// entirely isAdmin-gated (router.use(verifyJWT, isAdmin)), and self-service
// "edit my own company" needs the opposite - any authenticated owner, never
// a team member (blockTeamMembers - branding is account-wide, same rule as
// billing/API keys).
router.use(verifyJWT, blockTeamMembers);

router.route("/me").get(getMyCompany).patch(updateMyCompany);
router.route("/me/logo").patch(upload.single("logo"), updateMyCompanyLogo);

export default router;
