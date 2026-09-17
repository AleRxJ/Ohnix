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
    listCertificateOrdersAdmin,
    createExternalApiClientAdmin,
    listExternalApiClientsAdmin,
    issueExternalApiClientApiKeyAdmin,
    listExternalApiClientLiveKeysAdmin,
    getExternalApiClientUsageAdmin,
    createExternalApiClientBillingEnrollmentLinkAdmin,
    getExternalApiClientBillingHistoryAdmin,
    listIncomeTaxYearConfigsAdmin,
    upsertIncomeTaxYearConfigAdmin,
    setIncomeTaxYearConfigVerifiedAdmin,
    listSimpleRegimeBracketsAdmin,
    upsertSimpleRegimeBracketsAdmin,
    setSimpleRegimeBracketsVerifiedAdmin,
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
// Cross-company CertificateOrder visibility (every company, not just one) -
// see Backend/services/certificateOrder.service.js#listCertificateOrdersAdmin.
router.route("/admin/itcycle/certificate-orders").get(listCertificateOrdersAdmin);
// External API clients: companies with no Ohnix account/Company row (their
// own POS/ERP/SaaS) provisioned directly on itcycle-api-dian to integrate
// against Ohnix's DIAN e-invoicing engine via API - see
// Backend/services/externalApiClient.service.js.
router.route("/admin/itcycle/external-clients").get(listExternalApiClientsAdmin).post(createExternalApiClientAdmin);
router.route("/admin/itcycle/external-clients/:id/api-keys").post(issueExternalApiClientApiKeyAdmin);
// Live cross-check against itcycle-api-dian's own records (metadata only) -
// see Backend/services/externalApiClient.service.js#listLiveApiKeysForExternalClient.
router.route("/admin/itcycle/external-clients/:id/live-api-keys").get(listExternalApiClientLiveKeysAdmin);
// Read-only billable-usage count (current calendar month, ACCEPTED documents
// only) - see Backend/services/externalApiClient.service.js#getUsageForExternalClient.
router.route("/admin/itcycle/external-clients/:id/usage").get(getExternalApiClientUsageAdmin);
// Automatic recurring billing: generates the single-use card-enrollment link
// (see Backend/services/externalApiClient.service.js#createBillingEnrollmentLink)
// and lists the charge audit trail apiClientBillingScheduler.js writes to.
router.route("/admin/itcycle/external-clients/:id/billing-enrollment-link").post(createExternalApiClientBillingEnrollmentLinkAdmin);
router.route("/admin/itcycle/external-clients/:id/billing-history").get(getExternalApiClientBillingHistoryAdmin);

// Renta/RST reference tables - see company.controller.js's comment on why
// this lives here (isAdmin) instead of accounting.routes.js.
router.route("/admin/income-tax-config").get(listIncomeTaxYearConfigsAdmin).post(upsertIncomeTaxYearConfigAdmin);
router.route("/admin/income-tax-config/:year/verify").patch(setIncomeTaxYearConfigVerifiedAdmin);
router.route("/admin/income-tax-config/simple-brackets").get(listSimpleRegimeBracketsAdmin);
router.route("/admin/income-tax-config/simple-brackets/:year").post(upsertSimpleRegimeBracketsAdmin);
router.route("/admin/income-tax-config/simple-brackets/:year/verify").patch(setSimpleRegimeBracketsVerifiedAdmin);

export default router;
