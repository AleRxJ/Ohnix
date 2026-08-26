/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import { Alert, Button, Card, Input, Space, Tag, Typography, Upload } from "antd";
import { CheckCircleOutlined, ReloadOutlined, UploadOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { companyService } from "../../services/companyService";

const { Text } = Typography;

// The company buys its own digital certificate directly from FirmaPass, with
// its own payment method - Ohnix never resells or fronts this purchase (see
// the party-role-reversal note in Backend/services/purchaseSupportDocument.
// service.js for the DIAN-side reason this has to be the company's own
// certificate). This coupon was negotiated between Ohnix and FirmaPass and
// only discounts that purchase - it has nothing to do with itcycle-api-dian's
// own fees. Update here if FirmaPass ever issues a new code.
const FIRMAPASS_COUPON_CODE = "itcycle_2026";

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
    const [loginKey, setLoginKey] = useState("");
    const [validationUuid, setValidationUuid] = useState("");
    const [representativeId, setRepresentativeId] = useState("");
    const [rutBase64, setRutBase64] = useState(null);
    const [documentType, setDocumentType] = useState("");
    const [documentBase64, setDocumentBase64] = useState(null);
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState("");

    const refresh = async (silent = false) => {
        try {
            const response = await companyService.getMyFirmaPassStatus();
            setStatus(response?.data || null);
        } catch (error) {
            if (!silent) toast.error(error?.response?.data?.message || t("fiscal_setup.firmapass_status_error"));
        }
    };

    useEffect(() => { refresh(true); }, []);

    const run = async (key, action, successMessage) => {
        try {
            setBusy(key);
            await action();
            await refresh(true);
            if (successMessage) toast.success(successMessage);
        } catch (error) {
            toast.error(error?.response?.data?.message || t("fiscal_setup.firmapass_step_error"));
        } finally {
            setBusy("");
        }
    };

    const activeCertificate = (status?.certificates || []).some((certificate) => certificate.status === "ACTIVE");
    const canDriveValidation = Boolean(validationUuid.trim());

    return (
        <Card className="mt-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="m-0 text-base font-semibold text-[var(--ohnix-text-primary)]">{t("fiscal_setup.firmapass_title")}</h3>
                    <p className="mb-0 mt-1 text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.firmapass_hint")}</p>
                </div>
                <Tag color={activeCertificate ? "green" : "default"} icon={activeCertificate ? <CheckCircleOutlined /> : undefined}>
                    {activeCertificate ? t("fiscal_setup.firmapass_active") : t("fiscal_setup.firmapass_pending")}
                </Tag>
            </div>

            {!electronicInvoicingEnabled && activeCertificate && (
                <Alert
                    className="mt-4"
                    type="success"
                    showIcon
                    message={t("fiscal_setup.firmapass_ready_title")}
                    description={t("fiscal_setup.firmapass_ready_hint")}
                    action={
                        <Button
                            size="small"
                            type="primary"
                            loading={busy === "activate"}
                            onClick={() => run("activate", async () => {
                                const response = await companyService.activateMyItcycleElectronicInvoicing(crypto.randomUUID());
                                onActivated?.(response?.data);
                            }, t("fiscal_setup.firmapass_activate_success"))}
                        >
                            {t("fiscal_setup.firmapass_activate")}
                        </Button>
                    }
                />
            )}

            {electronicInvoicingEnabled ? (
                <Alert className="mt-4" type="success" showIcon message={t("fiscal_setup.firmapass_active_alert")} />
            ) : (
                <Space direction="vertical" size="middle" className="mt-4 w-full">
                    <Alert
                        type="info"
                        showIcon
                        message={t("fiscal_setup.firmapass_purchase_title")}
                        description={
                            <div>
                                <p className="mb-2">{t("fiscal_setup.firmapass_purchase_hint")}</p>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span>{t("fiscal_setup.firmapass_coupon_label")}:</span>
                                    <Text code copyable={{ text: FIRMAPASS_COUPON_CODE }}>{FIRMAPASS_COUPON_CODE}</Text>
                                </div>
                            </div>
                        }
                    />

                    <div>
                        <label className="mb-1 block text-sm font-medium text-[var(--ohnix-text-primary)]">{t("fiscal_setup.firmapass_login_key")}</label>
                        <div className="flex flex-wrap gap-2">
                            <Input.Password
                                className="auth-ohnix-input flex-1"
                                value={loginKey}
                                onChange={(event) => setLoginKey(event.target.value)}
                                placeholder={t("fiscal_setup.firmapass_login_key_placeholder")}
                            />
                            <Button
                                type="primary"
                                loading={busy === "key"}
                                disabled={!loginKey.trim()}
                                onClick={() => run("key", () => companyService.setMyFirmaPassLoginKey(loginKey.trim()), t("fiscal_setup.firmapass_login_key_saved"))}
                            >
                                {t("fiscal_setup.firmapass_save")}
                            </Button>
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-[var(--ohnix-text-primary)]">{t("fiscal_setup.firmapass_validation_uuid")}</label>
                        <Input
                            className="auth-ohnix-input"
                            value={validationUuid}
                            onChange={(event) => setValidationUuid(event.target.value)}
                            placeholder={t("fiscal_setup.firmapass_validation_uuid_placeholder")}
                        />
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

                    {status && <div className="flex flex-wrap gap-2">
                        <Tag color={status.loginKeySet ? "green" : "default"}>
                            {t("fiscal_setup.firmapass_key_status")}: {status.loginKeySet ? t("fiscal_setup.firmapass_key_configured") : t("fiscal_setup.firmapass_key_pending")}
                        </Tag>
                        {(status.certificates || []).map((certificate) => (
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
