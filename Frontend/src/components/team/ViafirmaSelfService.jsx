/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Checkbox, Form, Input, Select, Space, Tag, Typography, Upload } from "antd";
import {
    BankOutlined,
    CheckCircleOutlined,
    EyeOutlined,
    IdcardOutlined,
    LinkOutlined,
    MailOutlined,
    SafetyCertificateOutlined,
    SyncOutlined,
    UploadOutlined,
    UserOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { companyService } from "../../services/companyService";
import { resolveApiErrorMessage } from "../../utils/apiError";
import { COLOMBIA_DEPARTMENTS } from "../../constants/colombiaDivipola";
import { computeNitCheckDigit } from "../../utils/nit.util";

const { Text } = Typography;
// Same reasoning as ElectronicInvoicingSettings.jsx/FirmaPassSelfService.jsx's
// PLAN_GATE_CODE_MESSAGES - createMyViafirmaRequest also gates on
// ensureElectronicInvoicingPlan server-side.
const PLAN_GATE_CODE_MESSAGES = { electronic_invoicing_plan_required: "fiscal_setup.plan_required" };

const ORGANIZATION_TYPES = ["RM", "PROP", "RUNEOL", "RNT", "ESAL", "ESOL", "JUEGOS", "EXTRANJERAS"];

// Ohnix's own resale price to the customer - deliberately NOT what Ohnix
// pays Viafirma per certificate (a separate, confidential consumption-based
// rate negotiated directly with Viafirma). Purely informational for now -
// no checkout is wired to this yet; billing is coordinated separately.
const VIAFIRMA_PRICE_1_YEAR = "$100.000 COP";
const VIAFIRMA_PRICE_2_YEARS = "$160.000 COP";
const VIAFIRMA_LOGO_URL = "https://www.viafirma.com/wp-content/uploads/2025/02/logo_25_vf_1.svg";
// Same asset Navbar.jsx uses for the primary Ohnix wordmark - kept large and
// first in the lockup below, with Viafirma appearing smaller as the backing
// partner ("En alianza con"), not the other way around.
const OHNIX_LOGO_URL = "/Ohnix_FullLogo_Transparent.png";

// Maps the provider-agnostic InternalCertificateStatus vocabulary
// (itcycle-api-dian's ViafirmaCertificateProvider/mapViafirmaStatus) onto
// this UI's copy/tag color - the raw Viafirma status code never reaches the
// user, only this classification does.
const STATUS_PRESENTATION = {
    pending_provider_review: { key: "viafirma_status_pending_review", color: "blue" },
    awaiting_identity_verification: { key: "viafirma_status_awaiting_identity", color: "gold" },
    verifying_identity: { key: "viafirma_status_verifying_identity", color: "blue" },
    identity_rejected: { key: "viafirma_status_identity_rejected", color: "red" },
    awaiting_documents: { key: "viafirma_status_awaiting_documents", color: "gold" },
    issued_ready_to_finalize: { key: "viafirma_status_ready_to_finalize", color: "blue" },
    active: { key: "viafirma_status_active", color: "green" },
    issuance_failed: { key: "viafirma_status_issuance_failed", color: "red" },
    revoked: { key: "viafirma_status_revoked", color: "default" },
    expired: { key: "viafirma_status_expired", color: "default" },
};

// Maps the flat set of field names that can show up in a Certificate's
// stored `submittedData` (itcycle-api-dian's viafirmaIssuance.service.ts) to
// the same i18n label already used on the request form - so "what did I
// submit" reads with the exact same wording as "what am I about to submit".
const SUBMITTED_FIELD_LABEL_KEYS = {
    profileKind: "viafirma_field_profile_kind",
    organization: "viafirma_field_organization",
    organizationalUnit: "viafirma_field_organizational_unit",
    nit: "viafirma_field_nit",
    identity: "viafirma_field_identity",
    state: "viafirma_field_department",
    locality: "viafirma_field_city",
    address: "viafirma_field_address",
    email: "viafirma_field_email",
    givenName: "viafirma_field_given_name",
    surname: "viafirma_field_surname",
    organizationType: "viafirma_field_organization_type",
    identityType: "viafirma_field_identity_type",
};

const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(`${reader.result || ""}`.split(",").pop());
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

// Ohnix generates the CSR/keypair server-side (in itcycle-api-dian) the
// moment this form is submitted - Viafirma only ever receives the CSR
// (public information), never the private key. This component only
// collects the subject/identity data the API doc's §3.1/§3.2 require;
// itcycle-api-dian owns everything cryptographic.
//
// No activation button here (unlike FirmaPassSelfService): getDianReadiness's
// certificateReady check is provider-agnostic (any ACTIVE Certificate row
// counts, see itcycle-api-dian's admin.service.ts), so once a Viafirma
// certificate goes ACTIVE, FirmaPassSelfService's own "Activar" button
// (rendered alongside this component) already picks it up - no need to
// duplicate that flow here.
const ViafirmaSelfService = ({ company, electronicInvoicingEnabled }) => {
    const { t } = useI18n();
    const [form] = Form.useForm();
    const [profileKind, setProfileKind] = useState("FE-PJ");
    // legalName/taxIdentification are already registered (frozen once
    // itcycleCompanyId exists - see updateMyCompany's own comment) and
    // required to even reach this panel (Viafirma needs an itcycle-provisioned
    // company) - never ask the user to retype them. Only fall back to a free
    // text field in the (shouldn't-happen) case a registered company somehow
    // has no NIT on record yet.
    const hasRegisteredNit = Boolean(company?.taxIdentification);
    const registeredNit = hasRegisteredNit
        ? `${company.taxIdentification}-${company.taxIdentificationDv ?? computeNitCheckDigit(company.taxIdentification) ?? ""}`
        : "";
    // Cosmetic only, for the fallback free-text case - the DV Ohnix actually
    // sends is always (re)computed/verified server-side (see
    // companySelf.controller.js's createMyViafirmaRequest).
    const nitValue = Form.useWatch("nit", form);
    const nitPreview = nitValue ? `${nitValue}-${computeNitCheckDigit(nitValue) ?? ""}` : "";
    const [certificates, setCertificates] = useState([]);
    const [activeCertificateId, setActiveCertificateId] = useState(null);
    const [liveStatus, setLiveStatus] = useState(null);
    const [docName, setDocName] = useState("");
    const [docBase64, setDocBase64] = useState("");
    const [busy, setBusy] = useState("");
    const [requestIdempotencyKey] = useState(() => crypto.randomUUID());
    const [showSubmittedData, setShowSubmittedData] = useState(false);
    // Distinguishes "confirmed you have no certificate yet" from "we
    // couldn't check right now" - without this, a transient backend outage
    // silently looked identical to having nothing on record, which could
    // have led someone to submit a duplicate real request on top of one
    // that was still fine, just temporarily unreachable.
    const [certificatesLoadError, setCertificatesLoadError] = useState(false);

    // Only meant to run once, right after the first load - the toggle
    // shouldn't jump back to whatever the last submission used every time
    // refreshCertificates() re-runs later (manual refresh, polling, etc.),
    // overriding a profile the user is actively switching to right now.
    const profileKindDefaulted = useRef(false);

    const refreshCertificates = async (silent = false) => {
        try {
            const response = await companyService.getMyViafirmaCertificates();
            const list = response?.data?.certificates || [];
            setCertificates(list);
            setCertificatesLoadError(false);
            // Prefer an ACTIVE certificate; otherwise the most recently
            // created one still in progress - there can be more than one on
            // record after a rejected attempt.
            const preferred = list.find((c) => c.status === "ACTIVE")
                || [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0]
                || null;
            setActiveCertificateId((current) => (list.some((c) => c.id === current) ? current : preferred?.id || null));
            if (!profileKindDefaulted.current && preferred?.submittedData?.profileKind) {
                profileKindDefaulted.current = true;
                setProfileKind(preferred.submittedData.profileKind);
            }
        } catch (error) {
            setCertificatesLoadError(true);
            if (!silent) toast.error(error?.response?.data?.message || t("fiscal_setup.viafirma_status_error"));
        }
    };

    useEffect(() => { refreshCertificates(true); }, []);

    // Same "don't ask twice" logic as the read-only NIT block above, applied
    // to the fields the form still collects: emailCertificate defaults to
    // the company's own contact email (still editable - the certificate's
    // notification address can reasonably differ), and for Persona Natural
    // the applicant's identity defaults to the company's registered NIT
    // (their own cédula, in that case) since it's almost always the same
    // person. Re-applied whenever the profile toggle changes.
    useEffect(() => {
        form.setFieldsValue({
            emailCertificate: company?.contactEmail || undefined,
            ...(profileKind === "FE-PN" ? { identity: company?.taxIdentification || undefined } : {}),
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileKind, company?.contactEmail, company?.taxIdentification]);

    // CEA-3.0-07 art. 10.11.1.e - fetched fresh per profileKind (never
    // cached across the two profiles, and re-fetched every time this
    // switches) since the doc itself warns terms can differ/change and
    // must not be treated as a fixed value. termsAccepted is reset too -
    // accepting FE-PJ's terms shouldn't silently carry over to FE-PN's.
    const [termsUrl, setTermsUrl] = useState("");
    useEffect(() => {
        form.setFieldsValue({ termsAccepted: false });
        let cancelled = false;
        companyService.getMyViafirmaTerms(profileKind)
            .then((response) => { if (!cancelled) setTermsUrl(response?.data?.terms || ""); })
            .catch(() => { if (!cancelled) setTermsUrl(""); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileKind]);

    const activeCertificateRow = certificates.find((c) => c.id === activeCertificateId) || null;

    const refreshLiveStatus = async (certificateId) => {
        if (!certificateId) return;
        try {
            const response = await companyService.getMyViafirmaCertificateStatus(certificateId);
            setLiveStatus(response?.data || null);
        } catch {
            setLiveStatus(null);
        }
    };

    useEffect(() => {
        setLiveStatus(null);
        if (activeCertificateId && activeCertificateRow?.status !== "ACTIVE") {
            refreshLiveStatus(activeCertificateId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeCertificateId]);

    const run = async (key, action, successMessage, errorFormatter) => {
        try {
            setBusy(key);
            await action();
            if (successMessage) toast.success(successMessage);
        } catch (error) {
            toast.error(errorFormatter?.(error) || resolveApiErrorMessage(error, t, PLAN_GATE_CODE_MESSAGES, "fiscal_setup.viafirma_step_error"));
        } finally {
            setBusy("");
        }
    };

    // Ohnix operates exclusively against Viafirma's Colombia RA - the C
    // (country) attribute is always "CO" for both the CSR subject and the
    // identity-document's issuing country, so it's never shown as an
    // editable field (one less unexplained 2-letter box to fill in).
    const COUNTRY = "CO";

    const submitRequest = (values) => run(
        "createRequest",
        async () => {
            // For a Persona Natural, the person being verified IS the
            // certificate holder - the same cédula/pasaporte serves both as
            // the CSR's SERIALNUMBER and as the identity Viafirma verifies,
            // so the form only asks for it once (`values.identity`).
            const subject = profileKind === "FE-PJ"
                ? {
                    profileKind: "FE-PJ",
                    country: COUNTRY,
                    state: values.state,
                    locality: values.locality,
                    address: values.address,
                    organization: company?.legalName || values.organization,
                    organizationalUnit: values.organizationalUnit,
                    nit: hasRegisteredNit ? registeredNit : values.nit,
                    email: values.emailCertificate,
                    givenName: values.givenName,
                    surname: values.surname,
                }
                : {
                    profileKind: "FE-PN",
                    country: COUNTRY,
                    state: values.state,
                    locality: values.locality,
                    address: values.address,
                    identity: values.identity,
                    email: values.emailCertificate,
                    givenName: values.givenName,
                    surname: values.surname,
                };
            const response = await companyService.createMyViafirmaRequest({
                profileKind,
                subject,
                identityType: values.identityType,
                countryCode: COUNTRY,
                identity: values.identity,
                emailCertificate: values.emailCertificate,
                organizationType: profileKind === "FE-PJ" ? values.organizationType : undefined,
                termsAccepted: values.termsAccepted === true,
            }, requestIdempotencyKey);
            setActiveCertificateId(response?.data?.certificateId || null);
            form.resetFields();
            await refreshCertificates(true);
        },
        t("fiscal_setup.viafirma_request_success"),
    );

    const fetchKycLink = () => run(
        "kyc",
        async () => {
            const response = await companyService.getMyViafirmaKycLink(activeCertificateId);
            const link = response?.data?.link;
            if (link) window.open(link, "_blank", "noopener,noreferrer");
        },
        null,
        () => t("fiscal_setup.viafirma_kyc_link_error"),
    );

    const sendDocument = () => run(
        "document",
        async () => {
            await companyService.uploadMyViafirmaDocument(activeCertificateId, { name: docName, base64: docBase64 });
            setDocName("");
            setDocBase64("");
        },
        t("fiscal_setup.viafirma_document_sent"),
    );

    const activeCertificate = certificates.some((c) => c.status === "ACTIVE");
    const internalStatus = activeCertificateRow?.status === "ACTIVE" ? "active" : liveStatus?.internalStatus;
    const presentation = internalStatus ? STATUS_PRESENTATION[internalStatus] : null;

    // While a request is in progress, the status can change on Viafirma's
    // side at any time (identity verification completed, a document
    // reviewed, etc.) - poll quietly instead of making the applicant click a
    // button to find out. Stops once the certificate goes ACTIVE or lands in
    // a terminal failure state that needs the applicant to act first.
    useEffect(() => {
        if (!activeCertificateId || activeCertificateRow?.status === "ACTIVE") return undefined;
        if (internalStatus === "identity_rejected" || internalStatus === "issuance_failed") return undefined;
        const interval = setInterval(() => {
            refreshCertificates(true);
            refreshLiveStatus(activeCertificateId);
        }, 20000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeCertificateId, internalStatus]);

    return (
        <Card className="mt-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <img src={OHNIX_LOGO_URL} alt={t("fiscal_setup.viafirma_ohnix_logo_alt")} className="h-14 object-contain object-left" />
                <div className="flex items-center gap-2 rounded-full border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ohnix-text-muted)]">{t("fiscal_setup.viafirma_alliance_powered_by")}</span>
                    <img src={VIAFIRMA_LOGO_URL} alt={t("fiscal_setup.viafirma_logo_alt")} className="h-5 shrink-0 object-contain" />
                </div>
            </div>

            <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#29D8D5]/30 bg-[#29D8D5]/10">
                        <SafetyCertificateOutlined className="text-lg text-[#44F3F0]" />
                    </div>
                    <div>
                        <h3 className="m-0 text-base font-semibold text-[var(--ohnix-text-primary)]">{t("fiscal_setup.viafirma_title")}</h3>
                        <p className="mb-0 mt-1 text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.viafirma_hint")}</p>
                    </div>
                </div>
                <span
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                        activeCertificate
                            ? "border-[#29D8D5]/30 bg-[#29D8D5]/10 text-[#0f9e9c]"
                            : "border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] text-[var(--ohnix-text-muted)]"
                    }`}
                >
                    {activeCertificate && <CheckCircleOutlined />}
                    {activeCertificate ? t("fiscal_setup.viafirma_active") : t("fiscal_setup.viafirma_pending")}
                </span>
            </div>

            {activeCertificateRow && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-2 text-xs">
                    <span className="text-[var(--ohnix-text-muted)]">
                        {t("fiscal_setup.viafirma_cert_identifier")}: <span className="font-medium text-[var(--ohnix-text-primary)]">{activeCertificateRow.certificateIdentifier || "-"}</span>
                    </span>
                    {activeCertificateRow.expiresAt && (
                        <span className="text-[var(--ohnix-text-muted)]">
                            {t("fiscal_setup.viafirma_cert_expires")}: <span className="font-medium text-[var(--ohnix-text-primary)]">{new Date(activeCertificateRow.expiresAt).toLocaleDateString()}</span>
                        </span>
                    )}
                    {presentation && <Tag color={presentation.color} className="m-0">{t(`fiscal_setup.${presentation.key}`)}</Tag>}
                    {activeCertificateRow.submittedData && (
                        <button
                            type="button"
                            onClick={() => setShowSubmittedData((prev) => !prev)}
                            className="ml-auto flex items-center gap-1.5 rounded-full border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] px-2.5 py-1 text-[11px] font-medium text-[var(--ohnix-text-muted)] transition-colors hover:text-[var(--ohnix-text-primary)]"
                        >
                            <EyeOutlined />
                            {showSubmittedData ? t("fiscal_setup.viafirma_hide_submitted_data") : t("fiscal_setup.viafirma_view_submitted_data")}
                        </button>
                    )}
                </div>
            )}

            {activeCertificateRow?.submittedData && (
                <div className="mt-2">
                    {showSubmittedData && (
                        <div className="mt-1 rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-3">
                            <div className="mb-2 text-xs font-semibold text-[var(--ohnix-text-primary)]">{t("fiscal_setup.viafirma_submitted_data_title")}</div>
                            <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                                {Object.entries(activeCertificateRow.submittedData)
                                    // `country` is never asked from the user (always "CO" - see
                                    // submitRequest's own COUNTRY constant), so it's omitted here
                                    // for the same reason it's never shown as an editable field.
                                    // `emailCertificate` is submitRequest's own duplicate of
                                    // `email` (the form only ever collects one email address and
                                    // reuses it for both) - showing both would just repeat the
                                    // same row twice under the same label.
                                    .filter(([key, value]) => key !== "country" && key !== "emailCertificate" && value !== undefined && value !== null && value !== "")
                                    .map(([key, value]) => (
                                        <div key={key} className="flex justify-between gap-3 text-xs">
                                            <span className="text-[var(--ohnix-text-muted)]">{t(`fiscal_setup.${SUBMITTED_FIELD_LABEL_KEYS[key] || key}`)}</span>
                                            <span className="text-right font-medium text-[var(--ohnix-text-primary)]">
                                                {key === "organizationType" && t(`fiscal_setup.viafirma_org_type_${String(value).toLowerCase()}`)}
                                                {key === "profileKind" && t(value === "FE-PJ" ? "fiscal_setup.viafirma_profile_pj" : "fiscal_setup.viafirma_profile_pn")}
                                                {key !== "organizationType" && key !== "profileKind" && String(value)}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeCertificateRow && activeCertificateRow.status !== "ACTIVE" && (
                <Space direction="vertical" size="middle" className="mt-4 w-full">
                    {internalStatus === "awaiting_identity_verification" && (
                        <div className="rounded-2xl border border-[var(--ohnix-status-purple)]/30 bg-gradient-to-br from-[var(--ohnix-status-purple)]/10 via-transparent to-transparent p-4">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--ohnix-status-purple)]/30 bg-[var(--ohnix-status-purple)]/10">
                                    <IdcardOutlined className="text-lg text-[var(--ohnix-status-purple)]" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-semibold text-[var(--ohnix-text-primary)]">{t("fiscal_setup.viafirma_get_kyc_link")}</div>
                                    <p className="mb-3 mt-1 text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.viafirma_kyc_hint")}</p>
                                    <Button type="primary" icon={<LinkOutlined />} loading={busy === "kyc"} onClick={fetchKycLink}>
                                        {t("fiscal_setup.viafirma_kyc_button")}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {internalStatus === "verifying_identity" && (
                        <div className="rounded-2xl border border-[var(--ohnix-status-purple)]/30 bg-gradient-to-br from-[var(--ohnix-status-purple)]/10 via-transparent to-transparent p-4">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--ohnix-status-purple)]/30 bg-[var(--ohnix-status-purple)]/10">
                                    <SyncOutlined spin className="text-lg text-[var(--ohnix-status-purple)]" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-semibold text-[var(--ohnix-text-primary)]">{t("fiscal_setup.viafirma_status_verifying_identity")}</div>
                                    <p className="mb-0 mt-1 text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.viafirma_verifying_identity_hint")}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {internalStatus === "pending_provider_review" && (
                        <div className="rounded-2xl border border-[var(--ohnix-status-info)]/30 bg-gradient-to-br from-[var(--ohnix-status-info)]/10 via-transparent to-transparent p-4">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--ohnix-status-info)]/30 bg-[var(--ohnix-status-info)]/10">
                                    <SyncOutlined spin className="text-lg text-[var(--ohnix-status-info)]" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-semibold text-[var(--ohnix-text-primary)]">{t("fiscal_setup.viafirma_status_pending_review")}</div>
                                    <p className="mb-0 mt-1 text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.viafirma_pending_review_hint")}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {internalStatus === "issued_ready_to_finalize" && (
                        <div className="rounded-2xl border border-[var(--ohnix-status-info)]/30 bg-gradient-to-br from-[var(--ohnix-status-info)]/10 via-transparent to-transparent p-4">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--ohnix-status-info)]/30 bg-[var(--ohnix-status-info)]/10">
                                    <SyncOutlined spin className="text-lg text-[var(--ohnix-status-info)]" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-semibold text-[var(--ohnix-text-primary)]">{t("fiscal_setup.viafirma_status_ready_to_finalize")}</div>
                                    <p className="mb-0 mt-1 text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.viafirma_ready_to_finalize_hint")}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {internalStatus === "awaiting_documents" && (
                        <div className="rounded-xl border border-[var(--ohnix-line-3)] bg-[var(--ohnix-line-1)] p-3">
                            <div className="mb-2 text-sm font-semibold text-[var(--ohnix-text-primary)]">{t("fiscal_setup.viafirma_documents_title")}</div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Input
                                    className="auth-ohnix-input max-w-xs"
                                    value={docName}
                                    onChange={(event) => setDocName(event.target.value)}
                                    placeholder={t("fiscal_setup.viafirma_document_name_placeholder")}
                                />
                                <Upload
                                    className="ohnix-doc-upload"
                                    accept=".pdf,.png,.jpg,.jpeg"
                                    maxCount={1}
                                    beforeUpload={async (file) => {
                                        const base64 = await readFileAsBase64(file);
                                        setDocBase64(base64);
                                        if (!docName) setDocName(file.name);
                                        return false;
                                    }}
                                >
                                    <Button icon={<UploadOutlined />}>{t("fiscal_setup.viafirma_attach")}</Button>
                                </Upload>
                                <Button loading={busy === "document"} disabled={!docBase64 || !docName} onClick={sendDocument}>
                                    {t("fiscal_setup.viafirma_send")}
                                </Button>
                            </div>
                        </div>
                    )}

                    {internalStatus === "identity_rejected" || internalStatus === "issuance_failed" ? (
                        <Alert
                            className="dark-alert dark-alert-red"
                            type="error"
                            showIcon
                            message={presentation ? t(`fiscal_setup.${presentation.key}`) : ""}
                        />
                    ) : (
                        <p className="mb-0 flex items-center gap-1.5 text-[11px] text-[var(--ohnix-text-dim)]">
                            <SyncOutlined spin />
                            {t("fiscal_setup.viafirma_auto_refresh_hint")}
                        </p>
                    )}
                </Space>
            )}

            {certificatesLoadError && !activeCertificateRow && (
                <Alert
                    className="dark-alert dark-alert-red mt-4"
                    type="error"
                    showIcon
                    message={t("fiscal_setup.viafirma_certificates_load_error")}
                    description={t("fiscal_setup.viafirma_certificates_load_error_hint")}
                    action={
                        <Button size="small" onClick={() => refreshCertificates(false)}>
                            {t("fiscal_setup.viafirma_retry")}
                        </Button>
                    }
                />
            )}

            {!certificatesLoadError && (!activeCertificateRow || internalStatus === "identity_rejected" || internalStatus === "issuance_failed") && (
                <div className="mt-4">
                    <div className="overflow-hidden rounded-2xl border border-[#29D8D5]/30 bg-gradient-to-br from-[#29D8D5]/10 via-transparent to-transparent">
                        <div className="p-4">
                            <div className="text-sm font-semibold text-[var(--ohnix-text-primary)]">{t("fiscal_setup.viafirma_alliance_title")}</div>
                            <p className="mb-0 mt-1 max-w-lg text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.viafirma_alliance_body")}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)]/60 px-4 py-3">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ohnix-text-muted)]">{t("fiscal_setup.viafirma_price_title")}</span>
                            <span className="rounded-full border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] px-3 py-1 text-xs text-[var(--ohnix-text-primary)]">
                                {t("fiscal_setup.viafirma_price_1_year_label")} <span className="font-semibold text-[#0f9e9c]">{VIAFIRMA_PRICE_1_YEAR}</span>
                            </span>
                            <span className="rounded-full border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] px-3 py-1 text-xs text-[var(--ohnix-text-primary)]">
                                {t("fiscal_setup.viafirma_price_2_years_label")} <span className="font-semibold text-[#0f9e9c]">{VIAFIRMA_PRICE_2_YEARS}</span>
                            </span>
                            <span className="text-[11px] text-[var(--ohnix-text-muted)]">{t("fiscal_setup.viafirma_price_note")}</span>
                        </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] p-4">
                        <div className="mb-3 text-sm font-semibold text-[var(--ohnix-text-primary)]">{t("fiscal_setup.viafirma_how_it_works_title")}</div>
                        <div className="space-y-3">
                            {[
                                t("fiscal_setup.viafirma_how_it_works_step1"),
                                t("fiscal_setup.viafirma_how_it_works_step2"),
                                profileKind === "FE-PJ"
                                    ? t("fiscal_setup.viafirma_how_it_works_step_docs_pj")
                                    : t("fiscal_setup.viafirma_how_it_works_step_docs_pn"),
                                t("fiscal_setup.viafirma_how_it_works_step3"),
                                t("fiscal_setup.viafirma_how_it_works_step4"),
                            ].map((stepText, index) => (
                                <div key={index} className="flex items-start gap-3">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#29D8D5]/15 text-xs font-bold text-[#0f9e9c]">
                                        {index + 1}
                                    </span>
                                    <p className="mb-0 pt-0.5 text-xs text-[var(--ohnix-text-muted)]">{stepText}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <Form form={form} layout="vertical" className="mt-4" onFinish={submitRequest} initialValues={{ identityType: "IDC", organizationType: "RM", termsAccepted: false }}>
                        <div className="mb-4 flex gap-1 rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-1">
                            <button
                                type="button"
                                onClick={() => setProfileKind("FE-PJ")}
                                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    profileKind === "FE-PJ"
                                        ? "bg-[#29D8D5]/15 text-[#0f9e9c] shadow-[0_0_14px_rgba(41,216,213,0.15)]"
                                        : "text-[var(--ohnix-text-muted)] hover:text-[var(--ohnix-text-primary)]"
                                }`}
                            >
                                <BankOutlined />
                                {t("fiscal_setup.viafirma_profile_pj")}
                            </button>
                            <button
                                type="button"
                                onClick={() => setProfileKind("FE-PN")}
                                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    profileKind === "FE-PN"
                                        ? "bg-[#29D8D5]/15 text-[#0f9e9c] shadow-[0_0_14px_rgba(41,216,213,0.15)]"
                                        : "text-[var(--ohnix-text-muted)] hover:text-[var(--ohnix-text-primary)]"
                                }`}
                            >
                                <UserOutlined />
                                {t("fiscal_setup.viafirma_profile_pn")}
                            </button>
                        </div>

                        {profileKind === "FE-PJ" && (
                            <div className="mb-4">
                                <div className="mb-2 flex items-center gap-2">
                                    <BankOutlined className="text-[#0f9e9c]" />
                                    <label className="m-0 text-sm font-semibold text-[var(--ohnix-text-primary)]">{t("fiscal_setup.viafirma_section_company")}</label>
                                </div>
                                {hasRegisteredNit && company?.legalName ? (
                                    <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-2 text-xs">
                                        <span className="text-[var(--ohnix-text-muted)]">
                                            {t("fiscal_setup.viafirma_field_organization")}: <span className="font-medium text-[var(--ohnix-text-primary)]">{company.legalName}</span>
                                        </span>
                                        <span className="text-[var(--ohnix-text-muted)]">
                                            {t("fiscal_setup.viafirma_field_nit")}: <span className="font-medium text-[var(--ohnix-text-primary)]">{registeredNit}</span>
                                        </span>
                                        <span className="text-[10px] text-[var(--ohnix-text-dim)]">{t("fiscal_setup.viafirma_registered_field_hint")}</span>
                                    </div>
                                ) : null}
                                <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
                                    {!(hasRegisteredNit && company?.legalName) && (
                                        <>
                                            <Form.Item name="organization" label={t("fiscal_setup.viafirma_field_organization")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                                                <Input className="auth-ohnix-input" />
                                            </Form.Item>
                                            <Form.Item
                                                name="nit"
                                                label={t("fiscal_setup.viafirma_field_nit")}
                                                tooltip={t("fiscal_setup.viafirma_field_nit_hint")}
                                                extra={nitPreview ? t("fiscal_setup.viafirma_field_nit_preview", { nit: nitPreview }) : undefined}
                                                rules={[{ required: true, message: t("fiscal_setup.field_required") }]}
                                            >
                                                <Input className="auth-ohnix-input" inputMode="numeric" />
                                            </Form.Item>
                                        </>
                                    )}
                                    <Form.Item
                                        name="organizationType"
                                        label={t("fiscal_setup.viafirma_field_organization_type")}
                                        tooltip={t("fiscal_setup.viafirma_field_organization_type_hint")}
                                        rules={[{ required: true, message: t("fiscal_setup.field_required") }]}
                                    >
                                        <Select
                                            options={ORGANIZATION_TYPES.map((value) => ({
                                                value,
                                                label: t(`fiscal_setup.viafirma_org_type_${value.toLowerCase()}`),
                                                hint: t(`fiscal_setup.viafirma_org_type_${value.toLowerCase()}_hint`),
                                            }))}
                                            optionRender={(option) => (
                                                <div>
                                                    <div>{option.data.label}</div>
                                                    <div className="text-xs text-[var(--ohnix-text-muted)]">{option.data.hint}</div>
                                                </div>
                                            )}
                                        />
                                    </Form.Item>
                                    <Form.Item
                                        name="organizationalUnit"
                                        label={t("fiscal_setup.viafirma_field_organizational_unit")}
                                        tooltip={t("fiscal_setup.viafirma_field_organizational_unit_hint")}
                                        rules={[{ required: true, message: t("fiscal_setup.field_required") }]}
                                    >
                                        <Input className="auth-ohnix-input" />
                                    </Form.Item>
                                    <Form.Item name="state" label={t("fiscal_setup.viafirma_field_department")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                                        <Select
                                            showSearch
                                            optionFilterProp="label"
                                            options={COLOMBIA_DEPARTMENTS.map((d) => ({ value: d.name.toUpperCase(), label: d.name }))}
                                        />
                                    </Form.Item>
                                    <Form.Item name="locality" label={t("fiscal_setup.viafirma_field_city")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                                        <Input className="auth-ohnix-input" />
                                    </Form.Item>
                                    <Form.Item name="address" label={t("fiscal_setup.viafirma_field_address")} className="sm:col-span-2" rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                                        <Input className="auth-ohnix-input" />
                                    </Form.Item>
                                </div>
                            </div>
                        )}

                        {profileKind === "FE-PN" && (
                            <div className="mb-4">
                                <div className="mb-2 flex items-center gap-2">
                                    <UserOutlined className="text-[#0f9e9c]" />
                                    <label className="m-0 text-sm font-semibold text-[var(--ohnix-text-primary)]">{t("fiscal_setup.viafirma_section_personal")}</label>
                                </div>
                                <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
                                    <Form.Item name="state" label={t("fiscal_setup.viafirma_field_department")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                                        <Select
                                            showSearch
                                            optionFilterProp="label"
                                            options={COLOMBIA_DEPARTMENTS.map((d) => ({ value: d.name.toUpperCase(), label: d.name }))}
                                        />
                                    </Form.Item>
                                    <Form.Item name="locality" label={t("fiscal_setup.viafirma_field_city")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                                        <Input className="auth-ohnix-input" />
                                    </Form.Item>
                                    <Form.Item name="address" label={t("fiscal_setup.viafirma_field_address")} className="sm:col-span-2" rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                                        <Input className="auth-ohnix-input" />
                                    </Form.Item>
                                </div>
                            </div>
                        )}

                        <div className="mb-4">
                            <div className="mb-1 flex items-center gap-2">
                                <IdcardOutlined className="text-[#0f9e9c]" />
                                <label className="m-0 text-sm font-semibold text-[var(--ohnix-text-primary)]">
                                    {profileKind === "FE-PJ" ? t("fiscal_setup.viafirma_section_representative") : t("fiscal_setup.viafirma_section_identity")}
                                </label>
                            </div>
                            <p className="mb-2 text-xs text-[var(--ohnix-text-muted)]">
                                {profileKind === "FE-PJ" ? t("fiscal_setup.viafirma_section_representative_hint") : t("fiscal_setup.viafirma_section_identity_hint")}
                            </p>
                            {profileKind === "FE-PN" && hasRegisteredNit && (
                                <div className="mb-3 flex items-center gap-x-2 rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-2 text-xs">
                                    <span className="text-[var(--ohnix-text-muted)]">
                                        {t("fiscal_setup.viafirma_field_identity_pn")}: <span className="font-medium text-[var(--ohnix-text-primary)]">{company.taxIdentification}</span>
                                    </span>
                                    <span className="text-[10px] text-[var(--ohnix-text-dim)]">{t("fiscal_setup.viafirma_identity_prefilled_hint")}</span>
                                </div>
                            )}
                            <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
                                <Form.Item name="givenName" label={t("fiscal_setup.viafirma_field_given_name")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                                    <Input className="auth-ohnix-input" />
                                </Form.Item>
                                <Form.Item name="surname" label={t("fiscal_setup.viafirma_field_surname")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                                    <Input className="auth-ohnix-input" />
                                </Form.Item>
                                <Form.Item name="identityType" label={t("fiscal_setup.viafirma_field_identity_type")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                                    <Select
                                        options={[
                                            { value: "IDC", label: t("fiscal_setup.viafirma_identity_type_cedula") },
                                            { value: "PAS", label: t("fiscal_setup.viafirma_identity_type_passport") },
                                        ]}
                                    />
                                </Form.Item>
                                <Form.Item
                                    name="identity"
                                    label={profileKind === "FE-PJ" ? t("fiscal_setup.viafirma_field_identity") : t("fiscal_setup.viafirma_field_identity_pn")}
                                    rules={[{ required: true, message: t("fiscal_setup.field_required") }]}
                                >
                                    <Input className="auth-ohnix-input" />
                                </Form.Item>
                            </div>
                        </div>

                        <div className="mb-4">
                            <div className="mb-2 flex items-center gap-2">
                                <MailOutlined className="text-[#0f9e9c]" />
                                <label className="m-0 text-sm font-semibold text-[var(--ohnix-text-primary)]">{t("fiscal_setup.viafirma_section_contact")}</label>
                            </div>
                            <Form.Item
                                name="emailCertificate"
                                label={t("fiscal_setup.viafirma_field_email")}
                                tooltip={t("fiscal_setup.viafirma_field_email_hint")}
                                rules={[{ required: true, type: "email", message: t("fiscal_setup.field_required") }]}
                            >
                                <Input className="auth-ohnix-input max-w-sm" />
                            </Form.Item>
                        </div>

                        <Form.Item
                            name="termsAccepted"
                            valuePropName="checked"
                            rules={[{
                                validator: (_, value) => (value ? Promise.resolve() : Promise.reject(new Error(t("fiscal_setup.viafirma_terms_required")))),
                            }]}
                        >
                            <Checkbox>
                                {t("fiscal_setup.viafirma_terms_prefix")}{" "}
                                {termsUrl ? (
                                    <a href={termsUrl} target="_blank" rel="noopener noreferrer" className="text-[#29D8D5] underline">
                                        {t("fiscal_setup.viafirma_terms_link")}
                                    </a>
                                ) : (
                                    t("fiscal_setup.viafirma_terms_link")
                                )}{" "}
                                {t("fiscal_setup.viafirma_terms_suffix")}
                            </Checkbox>
                        </Form.Item>

                        <Button type="primary" htmlType="submit" className="hover:shadow-[0_0_26px_rgba(41,216,213,0.22)]" loading={busy === "createRequest"}>
                            {t("fiscal_setup.viafirma_submit_request")}
                        </Button>
                    </Form>
                </div>
            )}

            {electronicInvoicingEnabled && activeCertificate && (
                <Text type="secondary" className="mt-3 block text-xs">{t("fiscal_setup.viafirma_active")}</Text>
            )}
        </Card>
    );
};

export default ViafirmaSelfService;
