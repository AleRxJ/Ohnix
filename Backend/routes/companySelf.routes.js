import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { blockTeamMembers } from "../middleware/teamGuard.middleware.js";
import { upload } from "../middleware/multer.middleware.js";
import { idempotent } from "../middleware/idempotency.middleware.js";
import {
    addMyItcycleNumberingResolution,
    activateMyItcycleElectronicInvoicing,
    confirmMyFirmaPassValidation,
    getMyCompany,
    getMyFirmaPassStatus,
    getMyItcycleStatus,
    registerMyCompanyWithItcycle,
    setMyFirmaPassLoginKey,
    updateMyCompany,
    updateMyCompanyLogo,
    uploadMyFirmaPassArchivo,
    uploadMyFirmaPassRut,
} from "../controllers/companySelf.controller.js";

const router = Router();

// Distinct file/mount from company.routes.js on purpose: that one is
// entirely isAdmin-gated (router.use(verifyJWT, isAdmin)), and self-service
// "edit my own company" needs the opposite - any authenticated owner, never
// a team member (blockTeamMembers - branding is account-wide, same rule as
// billing/API keys).
router.use(verifyJWT, blockTeamMembers);

router.route("/me").get(getMyCompany).patch(updateMyCompany);
router.route("/me/logo").patch(upload.single("logo"), updateMyCompanyLogo);
router.route("/me/itcycle/status").get(getMyItcycleStatus);
router.route("/me/itcycle/register").post(idempotent("company.itcycle.register"), registerMyCompanyWithItcycle);
router.route("/me/itcycle/activate").post(idempotent("company.itcycle.activate"), activateMyItcycleElectronicInvoicing);
router.route("/me/itcycle/numbering-resolutions").post(idempotent("company.itcycle.numbering-resolution"), addMyItcycleNumberingResolution);
router.route("/me/itcycle/firmapass/login-key").put(setMyFirmaPassLoginKey);
router.route("/me/itcycle/firmapass/validations/:validationUuid/rut").post(uploadMyFirmaPassRut);
router.route("/me/itcycle/firmapass/validations/:validationUuid/archivos").post(uploadMyFirmaPassArchivo);
router.route("/me/itcycle/firmapass/validations/:validationUuid/confirmar").post(confirmMyFirmaPassValidation);
router.route("/me/itcycle/firmapass/status").get(getMyFirmaPassStatus);

export default router;
