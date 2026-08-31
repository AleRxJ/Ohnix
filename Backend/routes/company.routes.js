import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { upload } from "../middleware/multer.middleware.js";
import {
    createCompanyAdmin,
    listCompaniesAdmin,
    updateCompanyAdmin,
    updateCompanyLogoAdmin,
    getCompanyFirmaPassStatusAdmin,
    listFirmaPassValidationsAdmin,
    getNextFirmaPassValidationAdmin,
    getFirmaPassValidationDetailAdmin,
} from "../controllers/company.controller.js";

const router = Router();

router.use(verifyJWT, isAdmin);

router.route("/admin").get(listCompaniesAdmin).post(createCompanyAdmin);
router.route("/admin/:companyId").patch(updateCompanyAdmin);
router.route("/admin/:companyId/logo").patch(upload.single("logo"), updateCompanyLogoAdmin);
router.route("/admin/:companyId/itcycle/firmapass/status").get(getCompanyFirmaPassStatusAdmin);
// Alliance-wide FirmaPass discovery (not scoped to a companyId) - see
// Backend/services/firmaPassProvisioning.service.js.
router.route("/admin/itcycle/firmapass/validations").get(listFirmaPassValidationsAdmin);
router.route("/admin/itcycle/firmapass/validations/nueva-solicitud").get(getNextFirmaPassValidationAdmin);
router.route("/admin/itcycle/firmapass/validations/:validationUuid").get(getFirmaPassValidationDetailAdmin);

export default router;
