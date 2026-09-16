import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { blockTeamMembers } from "../middleware/teamGuard.middleware.js";
import { upload } from "../middleware/multer.middleware.js";
import { idempotent } from "../middleware/idempotency.middleware.js";
import {
    addMyItcycleNumberingResolution,
    updateMyItcycleNumberingResolution,
    activateMyItcycleElectronicInvoicing,
    confirmMyFirmaPassValidation,
    createMyCertificateOrder,
    createMyViafirmaRequest,
    deleteMyCompanyLogo,
    getMyCertificateOrderCheckoutParams,
    getMyCertificateOrders,
    reportMyCertificateOrderCheckoutClosed,
    reportMyCertificateOrderTransactionReference,
    getMyCertificateProviderStatus,
    getMyCompany,
    getMyFirmaPassStatus,
    getMyFirmaPassValidationDetail,
    getMyItcycleStatus,
    getMyViafirmaCertificates,
    getMyViafirmaCertificateStatus,
    getMyViafirmaKycLink,
    getMyViafirmaTerms,
    listMyViafirmaDocuments,
    registerMyCompanyWithItcycle,
    provisionMyCompanyForCertificate,
    setMyItcycleDianConfiguration,
    resolveMyFirmaPassOrderNumber,
    revokeMyViafirmaCertificate,
    setMyCertificateProviderOverride,
    updateMyCompany,
    updateMyCompanyLogo,
    uploadMyCertificate,
    uploadMyFirmaPassArchivo,
    uploadMyFirmaPassRut,
    uploadMyViafirmaDocument,
} from "../controllers/companySelf.controller.js";

const router = Router();

// Distinct file/mount from company.routes.js on purpose: that one is
// entirely isAdmin-gated (router.use(verifyJWT, isAdmin)), and self-service
// "edit my own company" needs the opposite - any authenticated owner, never
// a team member (blockTeamMembers - branding is account-wide, same rule as
// billing/API keys).
router.use(verifyJWT, blockTeamMembers);

router.route("/me").get(getMyCompany).patch(updateMyCompany);
router.route("/me/logo").patch(upload.single("logo"), updateMyCompanyLogo).delete(deleteMyCompanyLogo);
router.route("/me/itcycle/status").get(getMyItcycleStatus);
router.route("/me/itcycle/certificate-provider").get(getMyCertificateProviderStatus).put(setMyCertificateProviderOverride);
router.route("/me/itcycle/register").post(idempotent("company.itcycle.register"), registerMyCompanyWithItcycle);
router.route("/me/itcycle/register-for-certificate").post(idempotent("company.itcycle.registerForCertificate"), provisionMyCompanyForCertificate);
router.route("/me/itcycle/dian-configuration").put(setMyItcycleDianConfiguration);
router.route("/me/itcycle/activate").post(idempotent("company.itcycle.activate"), activateMyItcycleElectronicInvoicing);
router.route("/me/itcycle/numbering-resolutions").post(idempotent("company.itcycle.numbering-resolution"), addMyItcycleNumberingResolution);
router.route("/me/itcycle/numbering-resolutions/:resolutionId").patch(updateMyItcycleNumberingResolution);
router.route("/me/itcycle/firmapass/order/:orderNumber").get(resolveMyFirmaPassOrderNumber);
router.route("/me/itcycle/firmapass/validations/:validationUuid").get(getMyFirmaPassValidationDetail);
router.route("/me/itcycle/firmapass/validations/:validationUuid/rut").post(uploadMyFirmaPassRut);
router.route("/me/itcycle/firmapass/validations/:validationUuid/archivos").post(uploadMyFirmaPassArchivo);
router.route("/me/itcycle/firmapass/validations/:validationUuid/confirmar").post(confirmMyFirmaPassValidation);
router.route("/me/itcycle/firmapass/status").get(getMyFirmaPassStatus);
router.route("/me/itcycle/certificates").post(idempotent("company.itcycle.certificate"), uploadMyCertificate);
router.route("/me/itcycle/viafirma/terms").get(getMyViafirmaTerms);
router.route("/me/itcycle/viafirma/certificate-orders").get(getMyCertificateOrders).post(idempotent("company.itcycle.viafirma.certificate-order"), createMyCertificateOrder);
router.route("/me/itcycle/viafirma/certificate-orders/:orderId/epayco-params").get(getMyCertificateOrderCheckoutParams);
router.route("/me/itcycle/viafirma/certificate-orders/:orderId/epayco-reference").post(reportMyCertificateOrderTransactionReference);
router.route("/me/itcycle/viafirma/certificate-orders/:orderId/epayco-checkout-closed").post(reportMyCertificateOrderCheckoutClosed);
router.route("/me/itcycle/viafirma/requests").post(idempotent("company.itcycle.viafirma.request"), createMyViafirmaRequest);
router.route("/me/itcycle/viafirma/certificates").get(getMyViafirmaCertificates);
router.route("/me/itcycle/viafirma/certificates/:certificateId/status").get(getMyViafirmaCertificateStatus);
router.route("/me/itcycle/viafirma/certificates/:certificateId/kyc-link").get(getMyViafirmaKycLink);
router.route("/me/itcycle/viafirma/certificates/:certificateId/documents").get(listMyViafirmaDocuments).post(uploadMyViafirmaDocument);
router.route("/me/itcycle/viafirma/certificates/:certificateId/revoke").post(revokeMyViafirmaCertificate);

export default router;
