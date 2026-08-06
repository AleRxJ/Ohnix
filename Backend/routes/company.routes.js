import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { upload } from "../middleware/multer.middleware.js";
import {
    createCompanyAdmin,
    listCompaniesAdmin,
    updateCompanyAdmin,
    updateCompanyLogoAdmin,
    registerCompanyWithAlanubeAdmin,
} from "../controllers/company.controller.js";

const router = Router();

router.use(verifyJWT, isAdmin);

router.route("/admin").get(listCompaniesAdmin).post(createCompanyAdmin);
router.route("/admin/:companyId").patch(updateCompanyAdmin);
router.route("/admin/:companyId/logo").patch(upload.single("logo"), updateCompanyLogoAdmin);
router.route("/admin/:companyId/alanube/register").post(registerCompanyWithAlanubeAdmin);

export default router;
