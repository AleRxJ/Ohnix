/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Card, DatePicker, Form, Input, Space, Tag, Typography, Upload } from "antd";
import { ArrowRightOutlined, CheckCircleOutlined, CopyOutlined, LinkOutlined, ReloadOutlined, SafetyCertificateOutlined, SearchOutlined, UploadOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { companyService } from "../../services/companyService";
import { resolveApiErrorMessage } from "../../utils/apiError";
import { isValidUuid } from "../../utils/dianValidation";

const { Text } = Typography;
// Same reasoning as ElectronicInvoicingSettings.jsx's PLAN_GATE_CODE_MESSAGES.
const PLAN_GATE_CODE_MESSAGES = { electronic_invoicing_plan_required: "fiscal_setup.plan_required" };

// The company buys its own digital certificate directly from FirmaPass, with
// its own payment method - Ohnix never resells or fronts this purchase (see
// the party-role-reversal note in Backend/services/purchaseSupportDocument.
// service.js for the DIAN-side reason this has to be the company's own
// certificate). This coupon was negotiated between Ohnix and FirmaPass and
// only discounts that purchase - it has nothing to do with itcycle-api-dian's
// own fees. Update here if FirmaPass ever issues a new code.
const FIRMAPASS_COUPON_CODE = "itcycle_2026";

// Alliance cart links from FirmaPass, coupon pre-applied - clicking either
// one lands the client straight on FirmaPass's own checkout with the
// discount already active, so they never have to find/paste the coupon
// manually. Update here if FirmaPass ever reissues these (product id or code).
const FIRMAPASS_CART_URL_1_YEAR = "https://firmapass.com/?add-to-cart=6896&coupon=itcycle_2026";
const FIRMAPASS_CART_URL_2_YEAR = "https://firmapass.com/?add-to-cart=6897&coupon=itcycle_2026";

const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(`${reader.result || ""}`.split(",").pop());
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

// A pending/uploaded document entry can be a bare string (older RUT-upload
// response shape) or a richer object with FirmaPass's own label/description
// (list/detail response shape, confirmed against the real sandbox API) -
// normalize once to a consistent shape so nothing downstream has to branch
// on which one it got.
const normalizeDoc = (doc) => (typeof doc === "string"
    ? { type: doc, label: doc, description: null, accept: ".pdf,.png,.jpg,.jpeg" }
    : { type: doc?.type, label: doc?.label || doc?.type, description: doc?.description || null, accept: doc?.accept || ".pdf,.png,.jpg,.jpeg" });

// FirmaPass creates the identity-validation request outside Ohnix. This UI
// keeps that boundary explicit, then lets the company owner complete every
// remaining step without an Ohnix platform administrator handling documents
// or credentials.
const FirmaPassSelfService = ({ electronicInvoicingEnabled, electronicInvoicingAtRisk, canActivate = true, onActivated }) => {
    const { t } = useI18n();
    const navigate = useNavigate();
    // Two ways to identify the validation FirmaPass created when the client
    // bought with the coupon: the order number FirmaPass's own checkout gives
    // them (resolved to a UUID server-side, no manual copy/paste needed), or
    // the raw UUID FirmaPass shows directly on their validation page. Order
    // number is the default/recommended path - manual UUID stays for anyone
    // who already has it or whose order lookup doesn't find a match.
    const [lookupMode, setLookupMode] = useState("order");
    const [orderNumber, setOrderNumber] = useState("");
    const [validationUuid, setValidationUuid] = useState("");
    // One base64 file per FirmaPass document `type` (rut, cc, ccio, ...) -
    // replaces a single generic "document type" text field now that
    // FirmaPass's own pending_documents tells us exactly which types are
    // still needed, with their real label/description/accept per type.
    const [docFiles, setDocFiles] = useState({});
    const [status, setStatus] = useState(null);
    // The validation itself (estado, pending_documents, uploaded_documents,
    // completion_url) - separate from `status` above (Company-wide
    // certificate status). Drives which step-by-step upload rows to show.
    const [validationDetail, setValidationDetail] = useState(null);
    const [busy, setBusy] = useState("");
    // Same reasoning as ElectronicInvoicingSettings.jsx's registerIdempotencyKey -
    // a stable key per mount so a genuine retry (not a second, deliberate
    // activation attempt) replays the cached result instead of re-running
    // activateMyItcycleElectronicInvoicing from scratch.
    const [activateIdempotencyKey] = useState(() => crypto.randomUUID());
    // Alternative to the whole rut/archivos/confirmar wizard below: a
    // company that already has a finished certificate (bought elsewhere, or
    // a FirmaPass one obtained outside this coupon) can hand it over
    // directly instead of walking every FirmaPass step. Collapsed by
    // default since the wizard above is still the common path.
    const [manualCertOpen, setManualCertOpen] = useState(false);
    // The buy/upload/FirmaPass-wizard block below is only ever needed again
    // once invoicing is already active if the owner wants to add a backup
    // certificate or replace one that's about to expire - collapsed by
    // default then (unlike the pre-activation case, where it's the whole
    // point of the card) so it doesn't compete with the "all good" alert.
    // Forced open when electronicInvoicingAtRisk regardless of this toggle,
    // since that state means the current certificate (or resolution) already
    // stopped covering issuance and the owner needs this visible immediately.
    const [certManagerOpen, setCertManagerOpen] = useState(false);
    const [manualCertFileBase64, setManualCertFileBase64] = useState("");
    const [certForm] = Form.useForm();
    const [uploadCertIdempotencyKey] = useState(() => crypto.randomUUID());
    // getMyFirmaPassStatus's certificate list is scoped to provider="firmapass"
    // (see itcycle-api-dian's getFirmaPassStatus) - a certificate uploaded
    // manually with a different provider (or "firmapass" obtained outside
    // this coupon) would never show up there, leaving activeCertificate
    // permanently false even though it's genuinely active. readiness's
    // certificateReady is the provider-agnostic signal (same one
    // activateMyItcycleElectronicInvoicing itself checks server-side), so
    // it's fetched here too and OR'd in below.
    const [readiness, setReadiness] = useState(null);

    const refresh = async (silent = false) => {
        try {
            const response = await companyService.getMyFirmaPassStatus();
            setStatus(response?.data || null);
        } catch (error) {
            if (!silent) toast.error(error?.response?.data?.message || t("fiscal_setup.firmapass_status_error"));
        }
        try {
            const itcycleStatus = await companyService.getMyItcycleStatus();
            setReadiness(itcycleStatus?.data?.readiness || null);
        } catch {
            // Best-effort only - activeCertificate below already has the
            // FirmaPass-scoped status as a fallback signal.
        }
    };

    useEffect(() => { refresh(true); }, []);

    // Tracks the uuid the most-recently-started fetch was FOR, so a slower
    // earlier response (e.g. for a uuid the user has since changed away
    // from) can't overwrite state with data for the wrong validation once it
    // finally arrives out of order.
    const latestUuidRef = useRef("");

    // itcycle-api-dian's getValidationDetail is a raw passthrough of
    // FirmaPass's own {message, data} envelope, on top of Ohnix's own
    // ApiResponse envelope - hence the double `.data.data`.
    const refreshValidationDetail = async (uuid) => {
        try {
            const response = await companyService.getMyFirmaPassValidation(uuid);
            if (latestUuidRef.current !== uuid) return;
            setValidationDetail(response?.data?.data || null);
        } catch {
            // A lookup failure here (bad/unknown uuid, transient error) just
            // means the step list falls back to "upload the RUT" below -
            // nothing to surface as a toast for what's essentially a status refresh.
            if (latestUuidRef.current === uuid) setValidationDetail(null);
        }
    };

    // Fires for BOTH lookup paths (order-number resolution and manually
    // pasting a UUID) since both just end up setting `validationUuid` -
    // one effect instead of duplicating the fetch in two click handlers.
    // Also resets any attached-but-unsent files: they were picked for
    // whatever validation was showing before, and silently carrying them
    // over to a different uuid would upload the wrong company's document.
    useEffect(() => {
        const trimmed = validationUuid.trim();
        latestUuidRef.current = trimmed;
        setDocFiles({});
        if (trimmed && isValidUuid(trimmed)) {
            refreshValidationDetail(trimmed);
        } else {
            setValidationDetail(null);
        }
    }, [validationUuid]);

    const run = async (key, action, successMessage, errorFormatter) => {
        try {
            setBusy(key);
            await action();
            await refresh(true);
            if (successMessage) toast.success(successMessage);
        } catch (error) {
            toast.error(errorFormatter?.(error) || resolveApiErrorMessage(error, t, PLAN_GATE_CODE_MESSAGES, "fiscal_setup.firmapass_step_error"));
        } finally {
            setBusy("");
        }
    };

    // getDianReadiness's `missing` codes ride in the ApiError `errors` array
    // (see Backend/controllers/companySelf.controller.js) - translate the
    // closed, stable set of 3 possible codes instead of showing them raw.
    // FirmaPass's own "no se encontró una validación... disponible para esta
    // operación" (returned by both /archivos and /confirmar, per their
    // Postman docs) fires whenever the validation hasn't actually reached
    // `pvi` internally - most commonly because the personal-data form on
    // their own portal (completion_url, surfaced below) was never finished,
    // even though the RUT step already succeeded. That raw message alone
    // doesn't point the user anywhere, so swap in a translated hint whenever
    // it shows up instead of just relaying it verbatim.
    const describeFirmaPassNotReadyError = (error) => {
        const rawMessage = error?.response?.data?.message;
        if (typeof rawMessage === "string" && rawMessage.toLowerCase().includes("disponible para esta operaci")) {
            return t("fiscal_setup.firmapass_validation_not_ready_error");
        }
        return null;
    };

    const describeMissingReadiness = (error) => {
        const codes = error?.response?.data?.errors;
        if (!Array.isArray(codes) || codes.length === 0) return null;
        const labels = {
            dian_configuration: t("fiscal_setup.missing_dian_configuration"),
            invoice_resolution_01: t("fiscal_setup.missing_invoice_resolution_01"),
            active_certificate: t("fiscal_setup.missing_active_certificate"),
        };
        const known = codes.map((code) => labels[code]).filter(Boolean);
        return known.length > 0 ? t("fiscal_setup.firmapass_activate_missing", { items: known.join(", ") }) : null;
    };

    const uploadManualCertificate = (values) => run(
        "uploadCertificate",
        async () => {
            await companyService.uploadMyCertificate({
                provider: values.provider.trim(),
                certificateIdentifier: values.certificateIdentifier.trim(),
                p12Base64: manualCertFileBase64,
                password: values.password,
                expiresAt: values.expiresAt?.format("YYYY-MM-DD"),
            }, uploadCertIdempotencyKey);
            certForm.resetFields();
            setManualCertFileBase64("");
            setManualCertOpen(false);
        },
        t("fiscal_setup.firmapass_manual_certificate_success"),
    );

    const copyCoupon = async () => {
        try {
            await navigator.clipboard.writeText(FIRMAPASS_COUPON_CODE);
            toast.success(t("fiscal_setup.firmapass_coupon_copied"));
        } catch {
            // Clipboard API can be unavailable (permissions, insecure context) - the code is still visible to select and copy by hand.
        }
    };

    const lookupOrderNumber = () => run(
        "lookupOrder",
        async () => {
            const response = await companyService.resolveMyFirmaPassOrderNumber(orderNumber.trim());
            setValidationUuid(response?.data?.uuid || "");
        },
        t("fiscal_setup.firmapass_order_found"),
    );

    const uploadDocument = (type) => {
        const fileBase64 = docFiles[type];
        if (!fileBase64) return;
        const action = type === "rut"
            // identificacionRepresentanteLegal (for company/legal-entity RUTs)
            // isn't collected here - nobody on the team could confirm exactly
            // when FirmaPass needs it, and an unexplained field is worse than
            // not offering it yet. Re-add once that's actually verified.
            ? () => companyService.uploadMyFirmaPassRut(validationUuidTrimmed, { rutBase64: fileBase64 })
            : () => companyService.uploadMyFirmaPassArchivo(validationUuidTrimmed, { type, fileBase64 });
        run(`doc:${type}`, async () => {
            await action();
            setDocFiles((prev) => { const next = { ...prev }; delete next[type]; return next; });
            await refreshValidationDetail(validationUuidTrimmed);
        }, t("fiscal_setup.firmapass_document_sent"), describeFirmaPassNotReadyError);
    };

    const activeCertificate = (status?.certificates || []).some((certificate) => certificate.status === "ACTIVE") || Boolean(readiness?.certificateReady);
    // Which certificate is actually being used to sign right now - prefer an
    // ACTIVE one (there can be more than one on record after a renewal), but
    // still surface something (most recently created) if none is ACTIVE yet,
    // since that's still useful context while a new one is pending.
    const certificates = status?.certificates || [];
    const displayedCertificate = certificates.find((certificate) => certificate.status === "ACTIVE")
        || [...certificates].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0]
        || null;
    const validationUuidTrimmed = validationUuid.trim();
    const validationUuidInvalid = Boolean(validationUuidTrimmed) && !isValidUuid(validationUuidTrimmed);
    const canDriveValidation = Boolean(validationUuidTrimmed) && !validationUuidInvalid;

    // FirmaPass's own pending_documents is the source of truth for what's
    // left once we have it; before the first successful fetch (or if RUT
    // hasn't been uploaded yet and FirmaPass hasn't returned a list), fall
    // back to "upload the RUT" - the one step every validation needs first,
    // regardless of what pending_documents said before that upload existed.
    // uploaded_documents comes back as an object keyed by type (confirmed
    // against the real sandbox API: {"rut": {type, label, uploaded_at}}),
    // not an array like pending_documents - Object.values handles both that
    // and a plain array fallback (Object.values of an array is itself).
    const uploadedTypes = new Set(Object.values(validationDetail?.uploaded_documents || {}).map((doc) => normalizeDoc(doc).type).filter(Boolean));
    const pendingFromApi = Array.isArray(validationDetail?.pending_documents) ? validationDetail.pending_documents : null;
    const remainingDocs = pendingFromApi ?? (uploadedTypes.has("rut") ? [] : [{ type: "rut", label: t("fiscal_setup.firmapass_rut") }]);
    const readyToConfirm = Boolean(validationDetail) && remainingDocs.length === 0;
    // completion_url is present on any not-yet-finished validation (still
    // there even once only a document remains pending, not exclusively while
    // personal data is missing) - offered as an alternative path, not a
    // diagnosis of exactly what's wrong.
    const hasCompletionUrl = Boolean(validationDetail?.completion_url);

    return (
        <Card className="mt-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#29D8D5]/30 bg-[#29D8D5]/10">
                        <SafetyCertificateOutlined className="text-lg text-[#44F3F0]" />
                    </div>
                    <div>
                        <h3 className="m-0 text-base font-semibold text-[var(--ohnix-text-primary)]">{t("fiscal_setup.firmapass_title")}</h3>
                        <p className="mb-0 mt-1 text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.firmapass_hint")}</p>
                    </div>
                </div>
                <Tag color={activeCertificate ? "green" : "default"} icon={activeCertificate ? <CheckCircleOutlined /> : undefined}>
                    {activeCertificate ? t("fiscal_setup.firmapass_active") : t("fiscal_setup.firmapass_pending")}
                </Tag>
            </div>

            {displayedCertificate && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-2 text-xs">
                    <span className="text-[var(--ohnix-text-muted)]">
                        {t("fiscal_setup.firmapass_cert_identifier")}: <span className="font-medium text-[var(--ohnix-text-primary)]">{displayedCertificate.certificateIdentifier || "-"}</span>
                    </span>
                    {displayedCertificate.expiresAt && (
                        <span className="text-[var(--ohnix-text-muted)]">
                            {t("fiscal_setup.firmapass_cert_expires")}: <span className="font-medium text-[var(--ohnix-text-primary)]">{new Date(displayedCertificate.expiresAt).toLocaleDateString()}</span>
                        </span>
                    )}
                    <Tag color={displayedCertificate.status === "ACTIVE" ? "green" : "orange"} className="m-0">{displayedCertificate.status}</Tag>
                </div>
            )}

            {!electronicInvoicingEnabled && activeCertificate && (
                // activateMyItcycleElectronicInvoicing is still Negocio-plan-gated
                // server-side even though holding/activating a certificate isn't
                // - swap the real activate button for the same upgrade CTA used
                // elsewhere (LowStockAlertsPanel) instead of letting the click 403.
                <Alert
                    className={`mt-4 dark-alert ${canActivate ? "dark-alert-teal" : "dark-alert-purple"}`}
                    type={canActivate ? "success" : "info"}
                    showIcon
                    message={t("fiscal_setup.firmapass_ready_title")}
                    description={canActivate ? t("fiscal_setup.firmapass_ready_hint") : t("fiscal_setup.plan_required")}
                    action={
                        canActivate ? (
                            <Button
                                size="small"
                                type="primary"
                                className="hover:shadow-[0_0_26px_rgba(41,216,213,0.22)]"
                                loading={busy === "activate"}
                                onClick={() => run("activate", async () => {
                                    const response = await companyService.activateMyItcycleElectronicInvoicing(activateIdempotencyKey);
                                    onActivated?.(response?.data);
                                }, t("fiscal_setup.firmapass_activate_success"), describeMissingReadiness)}
                            >
                                {t("fiscal_setup.firmapass_activate")}
                            </Button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => navigate("/profile?tab=billing")}
                                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#29D8D5] px-4 py-2 text-xs font-semibold text-[#021314] transition-colors hover:bg-[#44F3F0]"
                            >
                                {t("fiscal_setup.plan_required_cta")}
                                <ArrowRightOutlined />
                            </button>
                        )
                    }
                />
            )}

            {electronicInvoicingEnabled && (
                electronicInvoicingAtRisk ? (
                    // getMyItcycleStatus's electronicInvoicingAtRisk means the
                    // enabled flag and the live certificate/resolution check
                    // (activeCertificate above) have diverged - showing the plain
                    // success alert here at the same time the Tag above says
                    // "Pendiente" is exactly the contradiction this was built to
                    // avoid, so this state gets its own honest warning instead.
                    <Alert className="mt-4 dark-alert dark-alert-amber" type="warning" showIcon message={t("fiscal_setup.status_at_risk")} description={t("fiscal_setup.firmapass_pending")} />
                ) : (
                    <Alert className="mt-4 dark-alert dark-alert-teal" type="success" showIcon message={t("fiscal_setup.firmapass_active_alert")} />
                )
            )}

            {electronicInvoicingEnabled && (
                <Button
                    type="link"
                    size="small"
                    className="mt-1 h-auto px-0"
                    onClick={() => setCertManagerOpen((open) => !open)}
                >
                    {(certManagerOpen || electronicInvoicingAtRisk) ? t("fiscal_setup.firmapass_cert_manager_hide") : t("fiscal_setup.firmapass_cert_manager_show")}
                </Button>
            )}

            {(!electronicInvoicingEnabled || certManagerOpen || electronicInvoicingAtRisk) && (
                <Space direction="vertical" size="middle" className="mt-4 w-full">
                    <Alert
                        className="dark-alert dark-alert-purple"
                        type="info"
                        showIcon
                        message={t("fiscal_setup.firmapass_purchase_title")}
                        description={<p className="mb-0">{t("fiscal_setup.firmapass_purchase_hint")}</p>}
                    />

                    <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] p-4">
                        <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 text-left"
                            onClick={() => setManualCertOpen((open) => !open)}
                        >
                            <span className="text-sm font-semibold text-[var(--ohnix-text-primary)]">{t("fiscal_setup.firmapass_manual_certificate_title")}</span>
                            <span className="shrink-0 text-xs font-medium text-[#44F3F0]">
                                {manualCertOpen ? t("fiscal_setup.firmapass_manual_certificate_collapse") : t("fiscal_setup.firmapass_manual_certificate_expand")}
                            </span>
                        </button>
                        <p className="mb-0 mt-1 text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.firmapass_manual_certificate_hint")}</p>
                        {manualCertOpen && (
                            <Form form={certForm} layout="vertical" className="mt-3" onFinish={uploadManualCertificate}>
                                <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
                                    <Form.Item name="provider" label={t("fiscal_setup.firmapass_manual_certificate_provider")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                                        <Input className="auth-ohnix-input" placeholder="firmapass, certicamara, gse..." />
                                    </Form.Item>
                                    <Form.Item name="certificateIdentifier" label={t("fiscal_setup.firmapass_manual_certificate_identifier")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                                        <Input className="auth-ohnix-input" />
                                    </Form.Item>
                                    <Form.Item name="password" label={t("fiscal_setup.firmapass_manual_certificate_password")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                                        <Input.Password className="auth-ohnix-input" />
                                    </Form.Item>
                                    <Form.Item name="expiresAt" label={t("fiscal_setup.firmapass_manual_certificate_expires")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                                        <DatePicker className="w-full" />
                                    </Form.Item>
                                </div>
                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                    <Upload
                                        className="ohnix-doc-upload"
                                        accept=".p12,.pfx"
                                        maxCount={1}
                                        beforeUpload={async (file) => {
                                            const base64 = await readFileAsBase64(file);
                                            setManualCertFileBase64(base64);
                                            return false;
                                        }}
                                        onRemove={() => setManualCertFileBase64("")}
                                    >
                                        <Button icon={<UploadOutlined />}>{t("fiscal_setup.firmapass_manual_certificate_attach")}</Button>
                                    </Upload>
                                    {manualCertFileBase64 && <Text type="success" className="text-xs">{t("fiscal_setup.firmapass_manual_certificate_file_ready")}</Text>}
                                </div>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    className="hover:shadow-[0_0_26px_rgba(41,216,213,0.22)]"
                                    loading={busy === "uploadCertificate"}
                                    disabled={!manualCertFileBase64}
                                >
                                    {t("fiscal_setup.firmapass_manual_certificate_submit")}
                                </Button>
                            </Form>
                        )}
                    </div>

                    <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--ohnix-line-5)] bg-[var(--ohnix-line-1)] text-[var(--ohnix-text-soft)]">
                                    <SafetyCertificateOutlined />
                                </span>
                                <span className="text-sm font-semibold text-[var(--ohnix-text-primary)]">FirmaPass</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ohnix-text-muted)]">
                                    {t("fiscal_setup.firmapass_coupon_label")}
                                </span>
                                <span className="ohnix-coupon-chip">
                                    <code>{FIRMAPASS_COUPON_CODE}</code>
                                    <Button
                                        type="text"
                                        size="small"
                                        className="ohnix-coupon-copy"
                                        icon={<CopyOutlined />}
                                        onClick={copyCoupon}
                                    />
                                </span>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <a href={FIRMAPASS_CART_URL_1_YEAR} target="_blank" rel="noreferrer">
                                <Button block icon={<LinkOutlined />}>{t("fiscal_setup.firmapass_buy_1_year")}</Button>
                            </a>
                            <a href={FIRMAPASS_CART_URL_2_YEAR} target="_blank" rel="noreferrer">
                                <Button block icon={<LinkOutlined />}>{t("fiscal_setup.firmapass_buy_2_years")}</Button>
                            </a>
                        </div>
                        <p className="mb-0 mt-2 text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.firmapass_buy_hint")}</p>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-[var(--ohnix-text-primary)]">{t("fiscal_setup.firmapass_lookup_title")}</label>
                        <div className="mb-2 flex flex-wrap gap-2">
                            <Button
                                size="small"
                                type={lookupMode === "order" ? "primary" : "default"}
                                onClick={() => setLookupMode("order")}
                            >
                                {t("fiscal_setup.firmapass_lookup_by_order")}
                            </Button>
                            <Button
                                size="small"
                                type={lookupMode === "uuid" ? "primary" : "default"}
                                onClick={() => setLookupMode("uuid")}
                            >
                                {t("fiscal_setup.firmapass_lookup_by_uuid")}
                            </Button>
                        </div>

                        {lookupMode === "order" ? (
                            <div>
                                <div className="flex flex-wrap gap-2">
                                    <Input
                                        className="auth-ohnix-input flex-1"
                                        value={orderNumber}
                                        onChange={(event) => setOrderNumber(event.target.value)}
                                        placeholder={t("fiscal_setup.firmapass_order_number_placeholder")}
                                    />
                                    <Button
                                        icon={<SearchOutlined />}
                                        loading={busy === "lookupOrder"}
                                        disabled={!orderNumber.trim()}
                                        onClick={lookupOrderNumber}
                                    >
                                        {t("fiscal_setup.firmapass_lookup_search")}
                                    </Button>
                                </div>
                                {validationUuid && !validationUuidInvalid && (
                                    <p className="mb-0 mt-2 text-xs text-[var(--ohnix-text-muted)]">
                                        {t("fiscal_setup.firmapass_uuid_resolved", { uuid: validationUuid })}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div>
                                <Input
                                    className="auth-ohnix-input"
                                    status={validationUuidInvalid ? "error" : undefined}
                                    value={validationUuid}
                                    onChange={(event) => setValidationUuid(event.target.value)}
                                    placeholder={t("fiscal_setup.firmapass_validation_uuid_placeholder")}
                                />
                                {validationUuidInvalid && <Text type="danger" className="mt-1 block text-xs">{t("fiscal_setup.validation_uuid_invalid")}</Text>}
                            </div>
                        )}
                    </div>

                    {canDriveValidation && (
                        <div className="space-y-3">
                            <label className="mb-0 block text-sm font-medium text-[var(--ohnix-text-primary)]">{t("fiscal_setup.firmapass_steps_title")}</label>

                            {remainingDocs.map((rawDoc) => {
                                const { type, label, description, accept } = normalizeDoc(rawDoc);
                                return (
                                    <div key={type} className="rounded-xl border border-[var(--ohnix-line-3)] bg-[var(--ohnix-line-1)] p-3">
                                        <div className="mb-1 text-sm font-semibold text-[var(--ohnix-text-primary)]">{label}</div>
                                        {description && <p className="mb-2 text-xs text-[var(--ohnix-text-muted)]">{description}</p>}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Upload
                                                className="ohnix-doc-upload"
                                                accept={accept}
                                                maxCount={1}
                                                beforeUpload={async (file) => {
                                                    const base64 = await readFileAsBase64(file);
                                                    setDocFiles((prev) => ({ ...prev, [type]: base64 }));
                                                    return false;
                                                }}
                                            >
                                                <Button icon={<UploadOutlined />}>{t("fiscal_setup.firmapass_attach")}</Button>
                                            </Upload>
                                            <Button
                                                loading={busy === `doc:${type}`}
                                                disabled={!docFiles[type]}
                                                onClick={() => uploadDocument(type)}
                                            >
                                                {t("fiscal_setup.firmapass_send")}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}

                            {hasCompletionUrl && (
                                <Alert
                                    className="dark-alert dark-alert-purple"
                                    type="info"
                                    showIcon
                                    message={t("fiscal_setup.firmapass_personal_data_title")}
                                    description={t("fiscal_setup.firmapass_personal_data_hint")}
                                    action={
                                        <a href={validationDetail.completion_url} target="_blank" rel="noreferrer">
                                            <Button size="small" icon={<LinkOutlined />}>{t("fiscal_setup.firmapass_personal_data_button")}</Button>
                                        </a>
                                    }
                                />
                            )}

                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="primary"
                                    className="hover:shadow-[0_0_26px_rgba(41,216,213,0.22)]"
                                    loading={busy === "confirm"}
                                    disabled={!readyToConfirm}
                                    onClick={() => run("confirm", async () => {
                                        await companyService.confirmMyFirmaPassValidation(validationUuidTrimmed);
                                        await refreshValidationDetail(validationUuidTrimmed);
                                    }, t("fiscal_setup.firmapass_confirm_success"), describeFirmaPassNotReadyError)}
                                >
                                    {t("fiscal_setup.firmapass_confirm")}
                                </Button>
                                <Button
                                    icon={<ReloadOutlined />}
                                    loading={busy === "refresh"}
                                    onClick={() => run("refresh", async () => { await refresh(true); await refreshValidationDetail(validationUuidTrimmed); })}
                                >
                                    {t("fiscal_setup.firmapass_refresh")}
                                </Button>
                            </div>
                        </div>
                    )}

                    {(status?.certificates || []).length > 0 && <div className="flex flex-wrap gap-2">
                        {status.certificates.map((certificate) => (
                            <Tag key={certificate.id || certificate.certificateIdentifier} color={certificate.status === "ACTIVE" ? "green" : "orange"}>
                                {certificate.certificateIdentifier || t("fiscal_setup.firmapass_title")}: {certificate.status}
                            </Tag>
                        ))}
                    </div>}
                </Space>
            )}
        </Card>
    );
};

export default FirmaPassSelfService;
