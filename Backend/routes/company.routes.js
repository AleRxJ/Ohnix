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
    registerCompanyWithItcycleAdmin,
    addItcycleNumberingResolutionAdmin,
    setCompanyFirmaPassLoginKeyAdmin,
    uploadCompanyFirmaPassRutAdmin,
    uploadCompanyFirmaPassArchivoAdmin,
    confirmCompanyFirmaPassValidationAdmin,
    getCompanyFirmaPassStatusAdmin,
} from "../controllers/company.controller.js";

const router = Router();

router.use(verifyJWT, isAdmin);

router.route("/admin").get(listCompaniesAdmin).post(createCompanyAdmin);
router.route("/admin/:companyId").patch(updateCompanyAdmin);
router.route("/admin/:companyId/logo").patch(upload.single("logo"), updateCompanyLogoAdmin);
router.route("/admin/:companyId/alanube/register").post(registerCompanyWithAlanubeAdmin);
router.route("/admin/:companyId/itcycle/register").post(registerCompanyWithItcycleAdmin);
router.route("/admin/:companyId/itcycle/numbering-resolutions").post(addItcycleNumberingResolutionAdmin);
router.route("/admin/:companyId/itcycle/firmapass/login-key").put(setCompanyFirmaPassLoginKeyAdmin);
router.route("/admin/:companyId/itcycle/firmapass/validations/:validationUuid/rut").post(uploadCompanyFirmaPassRutAdmin);
router.route("/admin/:companyId/itcycle/firmapass/validations/:validationUuid/archivos").post(uploadCompanyFirmaPassArchivoAdmin);
router.route("/admin/:companyId/itcycle/firmapass/validations/:validationUuid/confirmar").post(confirmCompanyFirmaPassValidationAdmin);
router.route("/admin/:companyId/itcycle/firmapass/status").get(getCompanyFirmaPassStatusAdmin);

export default router;
