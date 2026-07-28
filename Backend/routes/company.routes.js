import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import {
    createCompanyAdmin,
    listCompaniesAdmin,
    updateCompanyAdmin,
} from "../controllers/company.controller.js";

const router = Router();

router.use(verifyJWT, isAdmin);

router.route("/admin").get(listCompaniesAdmin).post(createCompanyAdmin);
router.route("/admin/:companyId").patch(updateCompanyAdmin);

export default router;
