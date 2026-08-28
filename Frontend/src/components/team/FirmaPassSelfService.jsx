/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import { Alert, Button, Card, Input, Space, Tag, Typography, Upload } from "antd";
import { CheckCircleOutlined, CopyOutlined, LinkOutlined, ReloadOutlined, SafetyCertificateOutlined, SearchOutlined, UploadOutlined } from "@ant-design/icons";
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

// FirmaPass creates the identity-validation request outside Ohnix. This UI
// keeps that boundary explicit, then lets the company owner complete every
// remaining step without an Ohnix platform administrator handling documents
// or credentials.
const FirmaPassSelfService = ({ electronicInvoicingEnabled, onActivated }) => {
    const { t } = useI18n();
    // Two ways to identify the validation FirmaPass created when the client
    // bought with the coupon: the order number FirmaPass's own checkout gives
    // them (resolved to a UUID server-side, no manual copy/paste needed), or
    // the raw UUID FirmaPass shows directly on their validation page. Order
    // number is the default/recommended path - manual UUID stays for anyone
    // who already has it or whose order lookup doesn't find a match.
    const [lookupMode, setLookupMode] = useState("order");
    const [orderNumber, setOrderNumber] = useState("");
    const [validationUuid, setValidationUuid] = useState("");
    const [representativeId, setRepresentativeId] = useState("");
    const [rutBase64, setRutBase64] = useState(null);
    const [documentType, setDocumentType] = useState("");
    const [documentBase64, setDocumentBase64] = useState(null);
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState("");
    // Same reasoning as ElectronicInvoicingSettings.jsx's registerIdempotencyKey -
    // a stable key per mount so a genuine retry (not a second, deliberate
    // activation attempt) replays the cached result instead of re-running
    // activateMyItcycleElectronicInvoicing from scratch.
    const [activateIdempotencyKey] = useState(() => crypto.randomUUID());

    const refresh = async (silent = false) => {
        try {
            const response = await companyService.getMyFirmaPassStatus();
            setStatus(response?.data || null);
        } catch (error) {
            if (!silent) toast.error(error?.response?.data?.message || t("fiscal_setup.firmapass_status_error"));
        }
    };

    useEffect(() => { refresh(true); }, []);

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

    const activeCertificate = (status?.certificates || []).some((certificate) => certificate.status === "ACTIVE");
    const validationUuidTrimmed = validationUuid.trim();
    const validationUuidInvalid = Boolean(validationUuidTrimmed) && !isValidUuid(validationUuidTrimmed);
    const canDriveValidation = Boolean(validationUuidTrimmed) && !validationUuidInvalid;

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

            {!electronicInvoicingEnabled && activeCertificate && (
                <Alert
                    className="mt-4 dark-alert dark-alert-teal"
                    type="success"
                    showIcon
                    message={t("fiscal_setup.firmapass_ready_title")}
                    description={t("fiscal_setup.firmapass_ready_hint")}
                    action={
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
                    }
                />
            )}

            {electronicInvoicingEnabled ? (
                <Alert className="mt-4 dark-alert dark-alert-teal" type="success" showIcon message={t("fiscal_setup.firmapass_active_alert")} />
            ) : (
                <Space direction="vertical" size="middle" className="mt-4 w-full">
                    <Alert
                        className="dark-alert dark-alert-purple"
                        type="info"
                        showIcon
                        message={t("fiscal_setup.firmapass_purchase_title")}
                        description={<p className="mb-0">{t("fiscal_setup.firmapass_purchase_hint")}</p>}
                    />

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

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-[var(--ohnix-text-primary)]">{t("fiscal_setup.firmapass_rut")}</label>
                            <div className="flex flex-wrap gap-2">
                                <Upload accept=".pdf,.png,.jpg,.jpeg" maxCount={1} beforeUpload={async (file) => { setRutBase64(await readFileAsBase64(file)); return false; }}>
                                    <Button icon={<UploadOutlined />}>{t("fiscal_setup.firmapass_attach_rut")}</Button>
                                </Upload>
                                <Input
                                    className="auth-ohnix-input min-w-40 flex-1"
                                    value={representativeId}
                                    onChange={(event) => setRepresentativeId(event.target.value)}
                                    placeholder={t("fiscal_setup.firmapass_representative_id")}
                                />
                                <Button
                                    loading={busy === "rut"}
                                    disabled={!canDriveValidation || !rutBase64}
                                    onClick={() => run("rut", () => companyService.uploadMyFirmaPassRut(validationUuid.trim(), { rutBase64, identificacionRepresentanteLegal: representativeId || undefined }), t("fiscal_setup.firmapass_rut_sent"))}
                                >
                                    {t("fiscal_setup.firmapass_send_rut")}
                                </Button>
                            </div>
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-[var(--ohnix-text-primary)]">{t("fiscal_setup.firmapass_additional_document")}</label>
                            <div className="flex flex-wrap gap-2">
                                <Input
                                    className="auth-ohnix-input min-w-32 flex-1"
                                    value={documentType}
                                    onChange={(event) => setDocumentType(event.target.value)}
                                    placeholder={t("fiscal_setup.firmapass_document_type_placeholder")}
                                />
                                <Upload accept=".pdf,.png,.jpg,.jpeg" maxCount={1} beforeUpload={async (file) => { setDocumentBase64(await readFileAsBase64(file)); return false; }}>
                                    <Button icon={<UploadOutlined />}>{t("fiscal_setup.firmapass_attach")}</Button>
                                </Upload>
                                <Button
                                    loading={busy === "document"}
                                    disabled={!canDriveValidation || !documentType || !documentBase64}
                                    onClick={() => run("document", () => companyService.uploadMyFirmaPassArchivo(validationUuid.trim(), { type: documentType, fileBase64: documentBase64 }), t("fiscal_setup.firmapass_document_sent"))}
                                >
                                    {t("fiscal_setup.firmapass_send")}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="primary"
                            className="hover:shadow-[0_0_26px_rgba(41,216,213,0.22)]"
                            loading={busy === "confirm"}
                            disabled={!canDriveValidation}
                            onClick={() => run("confirm", () => companyService.confirmMyFirmaPassValidation(validationUuid.trim()), t("fiscal_setup.firmapass_confirm_success"))}
                        >
                            {t("fiscal_setup.firmapass_confirm")}
                        </Button>
                        <Button icon={<ReloadOutlined />} loading={busy === "refresh"} onClick={() => run("refresh", () => refresh(true))}>
                            {t("fiscal_setup.firmapass_refresh")}
                        </Button>
                    </div>

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
