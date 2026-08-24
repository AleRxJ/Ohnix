import React, { useState } from "react";
import { Modal, Form, Input, Select, Switch, Upload, Button, ColorPicker, DatePicker, Tag, Divider, Steps, Segmented, Space } from "antd";
import { UploadOutlined, ShopOutlined, LeftOutlined, RightOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import useI18n from "../../hooks/useI18n";

const darkModalStyles = {
    mask: { backgroundColor: "rgba(0,0,0,0.55)" },
    content: {
        background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
        border: "1px solid var(--ohnix-line-4)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
        borderRadius: "24px",
    },
    header: {
        background: "transparent",
        borderBottom: "1px solid var(--ohnix-line-3)",
        padding: "20px 24px 16px",
    },
    body: { padding: 24 },
};

const ResolutionFields = ({ basePath, t }) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Form.Item name={[...basePath, "resolutionNumber"]} label={t("admin.alanube_resolution_number")}>
            <Input size="large" className="auth-ohnix-input" />
        </Form.Item>
        <Form.Item name={[...basePath, "prefix"]} label={t("admin.alanube_resolution_prefix")}>
            <Input size="large" className="auth-ohnix-input" />
        </Form.Item>
        <Form.Item name={[...basePath, "minNumber"]} label={t("admin.alanube_resolution_min")}>
            <Input size="large" type="number" className="auth-ohnix-input" />
        </Form.Item>
        <Form.Item name={[...basePath, "maxNumber"]} label={t("admin.alanube_resolution_max")}>
            <Input size="large" type="number" className="auth-ohnix-input" />
        </Form.Item>
        <Form.Item
            name={[...basePath, "startDate"]}
            label={t("admin.alanube_resolution_start")}
            getValueProps={(value) => ({ value: value ? dayjs(value) : undefined })}
            normalize={(value) => (value ? value.format("YYYY-MM-DD") : null)}
        >
            <DatePicker size="large" className="auth-ohnix-input w-full" />
        </Form.Item>
        <Form.Item
            name={[...basePath, "endDate"]}
            label={t("admin.alanube_resolution_end")}
            getValueProps={(value) => ({ value: value ? dayjs(value) : undefined })}
            normalize={(value) => (value ? value.format("YYYY-MM-DD") : null)}
        >
            <DatePicker size="large" className="auth-ohnix-input w-full" />
        </Form.Item>
        <Form.Item name={[...basePath, "technicalKey"]} label={t("admin.alanube_resolution_technical_key")} className="sm:col-span-2">
            <Input size="large" className="auth-ohnix-input" />
        </Form.Item>
    </div>
);

// Reads a File as a base64 string (no data: prefix) - used for the
// itcycle-api-dian certificate upload, which posts JSON with p12Base64
// rather than multipart form data (see itcycleDian.service.js#uploadItcycleCertificate).
const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(`${reader.result || ""}`.split(",").pop());
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

// Field names owned by each wizard step - used both to render only the
// active step and to scope form.validateFields() to it before advancing, so
// an error on a later step never blocks moving through earlier ones.
const ITCYCLE_STEP_FIELDS = [
    ["taxIdentification", "taxIdentificationDv"],
    ["itcycleEnvironment", "itcycleSoftwareId", "itcycleSoftwarePin", "itcycleTechnicalKey"],
    [
        "itcycleAddressStreet",
        "itcycleAddressCityCode",
        "itcycleAddressCityName",
        "itcycleAddressDepartmentCode",
        "itcycleAddressDepartmentName",
        "itcycleAddressPostalZone",
    ],
    [
        "itcycleNumberingPrefix",
        "itcycleNumberingResolutionNumber",
        "itcycleNumberingStartNumber",
        "itcycleNumberingEndNumber",
        "itcycleNumberingStartDate",
        "itcycleNumberingEndDate",
    ],
    ["itcycleCertificateIdentifier", "itcycleCertificateFile", "itcycleCertificatePassword"],
];

// Drives FirmaPass's issuance flow (login key -> rut -> archivos -> confirmar
// -> status) as independent, separately-triggered actions rather than form
// fields bundled into the wizard's one-shot final submit - these calls happen
// at different times, often hours apart, against a validationUuid the admin
// creates by hand in FirmaPass's own portal (no API exists to create it - see
// itcycleDian.service.js's FirmaPass section). loginKeySaved is session-local
// only: itcycle-api-dian never exposes whether a login key was already saved
// in a previous session, so it must be re-entered here each time the modal
// is reopened before rut/archivos/confirmar can be called.
const FirmaPassAutomatedSection = ({
    companyId,
    t,
    onSetFirmaPassLoginKey,
    onUploadFirmaPassRut,
    onUploadFirmaPassArchivo,
    onConfirmFirmaPassValidation,
    onGetFirmaPassStatus,
}) => {
    const [loginKey, setLoginKey] = useState("");
    const [loginKeySaved, setLoginKeySaved] = useState(false);
    const [savingKey, setSavingKey] = useState(false);

    const [validationUuid, setValidationUuid] = useState("");

    const [rutFile, setRutFile] = useState(null);
    const [representanteLegalId, setRepresentanteLegalId] = useState("");
    const [uploadingRut, setUploadingRut] = useState(false);
    const [rutResult, setRutResult] = useState(null);

    const [archivoType, setArchivoType] = useState("");
    const [archivoFile, setArchivoFile] = useState(null);
    const [uploadingArchivo, setUploadingArchivo] = useState(false);
    const [archivoResult, setArchivoResult] = useState(null);

    const [confirming, setConfirming] = useState(false);
    const [confirmResult, setConfirmResult] = useState(null);

    const [loadingStatus, setLoadingStatus] = useState(false);
    const [statusResult, setStatusResult] = useState(null);

    const canDriveValidation = loginKeySaved && validationUuid.trim().length > 0;

    const handleSaveLoginKey = async () => {
        setSavingKey(true);
        try {
            await onSetFirmaPassLoginKey?.(companyId, loginKey);
            setLoginKeySaved(true);
        } finally {
            setSavingKey(false);
        }
    };

    const handleUploadRut = async () => {
        setUploadingRut(true);
        try {
            const result = await onUploadFirmaPassRut?.(companyId, validationUuid.trim(), {
                rutBase64: rutFile,
                identificacionRepresentanteLegal: representanteLegalId || undefined,
            });
            setRutResult(result?.data || null);
        } finally {
            setUploadingRut(false);
        }
    };

    const handleUploadArchivo = async () => {
        setUploadingArchivo(true);
        try {
            const result = await onUploadFirmaPassArchivo?.(companyId, validationUuid.trim(), {
                type: archivoType,
                fileBase64: archivoFile,
            });
            setArchivoResult(result || null);
        } finally {
            setUploadingArchivo(false);
        }
    };

    const handleConfirm = async () => {
        setConfirming(true);
        try {
            const result = await onConfirmFirmaPassValidation?.(companyId, validationUuid.trim());
            setConfirmResult(result || null);
        } finally {
            setConfirming(false);
        }
    };

    const handleRefreshStatus = async () => {
        setLoadingStatus(true);
        try {
            const result = await onGetFirmaPassStatus?.(companyId);
            setStatusResult(result || null);
        } finally {
            setLoadingStatus(false);
        }
    };

    const progress = archivoResult || rutResult;

    return (
        <Space direction="vertical" size="middle" className="w-full">
            <div>
                <div className="mb-2 text-sm font-medium text-[var(--ohnix-text-primary)]">
                    {t("admin.itcycle_firmapass_login_key")}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Input.Password
                        size="large"
                        className="auth-ohnix-input flex-1"
                        style={{ minWidth: 220 }}
                        value={loginKey}
                        onChange={(e) => setLoginKey(e.target.value)}
                    />
                    <Button type="primary" loading={savingKey} onClick={handleSaveLoginKey} disabled={!loginKey}>
                        {t("admin.itcycle_firmapass_login_key_save")}
                    </Button>
                    {loginKeySaved && <Tag color="green">{t("admin.itcycle_firmapass_login_key_saved")}</Tag>}
                </div>
                <p className="mt-1 text-xs text-[var(--ohnix-text-dim)]">{t("admin.itcycle_firmapass_login_key_hint")}</p>
            </div>

            <div>
                <div className="mb-2 text-sm font-medium text-[var(--ohnix-text-primary)]">
                    {t("admin.itcycle_firmapass_validation_uuid")}
                </div>
                <Input
                    size="large"
                    className="auth-ohnix-input"
                    value={validationUuid}
                    onChange={(e) => setValidationUuid(e.target.value)}
                />
                <p className="mt-1 text-xs text-[var(--ohnix-text-dim)]">{t("admin.itcycle_firmapass_validation_uuid_hint")}</p>
            </div>

            <div>
                <div className="mb-2 text-sm font-medium text-[var(--ohnix-text-primary)]">
                    {t("admin.itcycle_firmapass_rut_file")}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Upload
                        accept=".pdf,.png,.jpg,.jpeg"
                        maxCount={1}
                        beforeUpload={async (file) => {
                            setRutFile(await readFileAsBase64(file));
                            return false;
                        }}
                    >
                        <Button icon={<UploadOutlined />}>{t("admin.itcycle_firmapass_rut_file")}</Button>
                    </Upload>
                    <Input
                        size="large"
                        className="auth-ohnix-input"
                        style={{ maxWidth: 220 }}
                        placeholder={t("admin.itcycle_firmapass_representante_legal_id")}
                        value={representanteLegalId}
                        onChange={(e) => setRepresentanteLegalId(e.target.value)}
                    />
                    <Button loading={uploadingRut} disabled={!canDriveValidation || !rutFile} onClick={handleUploadRut}>
                        {t("admin.itcycle_firmapass_rut_upload")}
                    </Button>
                </div>
            </div>

            <div>
                <div className="mb-2 text-sm font-medium text-[var(--ohnix-text-primary)]">
                    {t("admin.itcycle_firmapass_archivo_file")}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Input
                        size="large"
                        className="auth-ohnix-input"
                        style={{ maxWidth: 180 }}
                        placeholder={t("admin.itcycle_firmapass_archivo_type")}
                        value={archivoType}
                        onChange={(e) => setArchivoType(e.target.value)}
                    />
                    <Upload
                        accept=".pdf,.png,.jpg,.jpeg"
                        maxCount={1}
                        beforeUpload={async (file) => {
                            setArchivoFile(await readFileAsBase64(file));
                            return false;
                        }}
                    >
                        <Button icon={<UploadOutlined />}>{t("admin.itcycle_firmapass_archivo_file")}</Button>
                    </Upload>
                    <Button
                        loading={uploadingArchivo}
                        disabled={!canDriveValidation || !archivoType || !archivoFile}
                        onClick={handleUploadArchivo}
                    >
                        {t("admin.itcycle_firmapass_archivo_upload")}
                    </Button>
                </div>
            </div>

            {progress && (
                <div className="flex flex-wrap items-center gap-2">
                    {(progress.uploaded_documents || []).map((doc) => (
                        <Tag color="green" key={`uploaded-${doc}`}>{doc}</Tag>
                    ))}
                    {(progress.pending_documents || []).map((doc) => (
                        <Tag color="orange" key={`pending-${doc}`}>{doc}</Tag>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <Button type="primary" loading={confirming} disabled={!canDriveValidation} onClick={handleConfirm}>
                    {t("admin.itcycle_firmapass_confirm")}
                </Button>
                {confirmResult && (
                    <Tag color="blue">
                        {confirmResult.certificateIdentifier} —{" "}
                        {confirmResult.estado === "pe"
                            ? t("admin.itcycle_firmapass_estado_pe")
                            : t("admin.itcycle_firmapass_estado_unknown", { estado: confirmResult.estado })}
                    </Tag>
                )}
            </div>

            <div>
                <Button icon={<ReloadOutlined />} loading={loadingStatus} onClick={handleRefreshStatus}>
                    {t("admin.itcycle_firmapass_refresh_status")}
                </Button>
                {statusResult && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Tag color={statusResult.loginKeySet ? "green" : "default"}>
                            {t("admin.itcycle_firmapass_login_key_saved")}: {statusResult.loginKeySet ? "✓" : "—"}
                        </Tag>
                        {(statusResult.certificates || []).map((cert) => (
                            <Tag color={cert.status === "ACTIVE" ? "green" : "orange"} key={cert.id}>
                                {cert.certificateIdentifier} — {cert.status}
                            </Tag>
                        ))}
                    </div>
                )}
            </div>
        </Space>
    );
};

// Same fields CompanyFormModal already collected for itcycle provisioning
// (registerCompanyWithItcycle in electronicInvoicing.service.js), just
// presented as a guided wizard instead of one long flat list - no field
// name, validation rule, or submit payload changes.
const ItcycleProvisioningWizard = ({
    form,
    t,
    editingCompany,
    onRegisterItcycle,
    onAddItcycleNumberingResolution,
    onSetFirmaPassLoginKey,
    onUploadFirmaPassRut,
    onUploadFirmaPassArchivo,
    onConfirmFirmaPassValidation,
    onGetFirmaPassStatus,
}) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [certMode, setCertMode] = useState("manual");
    const isLastStep = currentStep === ITCYCLE_STEP_FIELDS.length - 1;

    const stepLabels = [
        t("admin.itcycle_step_identification"),
        t("admin.itcycle_step_dian_config"),
        t("admin.itcycle_step_address"),
        t("admin.itcycle_step_numbering"),
        t("admin.itcycle_step_certificate"),
    ];

    const goNext = async () => {
        try {
            await form.validateFields(ITCYCLE_STEP_FIELDS[currentStep]);
            setCurrentStep((s) => Math.min(s + 1, ITCYCLE_STEP_FIELDS.length - 1));
        } catch {
            // validateFields already surfaces the field-level errors inline - nothing extra to show here.
        }
    };
    const goBack = () => setCurrentStep((s) => Math.max(s - 1, 0));

    return (
        <div>
            <Steps
                size="small"
                current={currentStep}
                onChange={setCurrentStep}
                className="mb-5"
                items={stepLabels.map((label) => ({ title: label }))}
            />

            <div style={{ display: currentStep === 0 ? "block" : "none" }}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Form.Item name="taxIdentification" label={t("admin.alanube_nit")}>
                        <Input size="large" className="auth-ohnix-input" placeholder="900123456" />
                    </Form.Item>
                    <Form.Item name="taxIdentificationDv" label={t("admin.alanube_nit_dv")}>
                        <Input size="large" className="auth-ohnix-input" placeholder={t("admin.alanube_nit_dv_hint")} />
                    </Form.Item>
                </div>
            </div>

            <div style={{ display: currentStep === 1 ? "block" : "none" }}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Form.Item name="itcycleEnvironment" label={t("admin.itcycle_environment")} initialValue="SANDBOX">
                        <Select
                            size="large"
                            options={[
                                { value: "SANDBOX", label: t("admin.itcycle_environment_sandbox") },
                                { value: "PRODUCTION", label: t("admin.itcycle_environment_production") },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item name="itcycleSoftwareId" label={t("admin.itcycle_software_id")}>
                        <Input size="large" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="itcycleSoftwarePin" label={t("admin.itcycle_software_pin")}>
                        <Input.Password size="large" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="itcycleTechnicalKey" label={t("admin.itcycle_technical_key")}>
                        <Input size="large" className="auth-ohnix-input" />
                    </Form.Item>
                </div>
            </div>

            <div style={{ display: currentStep === 2 ? "block" : "none" }}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Form.Item name="itcycleAddressStreet" label={t("admin.itcycle_address_street")} className="sm:col-span-2">
                        <Input size="large" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="itcycleAddressCityCode" label={t("admin.itcycle_address_city_code")}>
                        <Input size="large" className="auth-ohnix-input" placeholder="11001" />
                    </Form.Item>
                    <Form.Item name="itcycleAddressCityName" label={t("admin.itcycle_address_city_name")}>
                        <Input size="large" className="auth-ohnix-input" placeholder="Bogota, D.C." />
                    </Form.Item>
                    <Form.Item name="itcycleAddressDepartmentCode" label={t("admin.itcycle_address_department_code")}>
                        <Input size="large" className="auth-ohnix-input" placeholder="11" />
                    </Form.Item>
                    <Form.Item name="itcycleAddressDepartmentName" label={t("admin.itcycle_address_department_name")}>
                        <Input size="large" className="auth-ohnix-input" placeholder="Bogota" />
                    </Form.Item>
                    <Form.Item name="itcycleAddressPostalZone" label={t("admin.itcycle_address_postal_zone")}>
                        <Input size="large" className="auth-ohnix-input" placeholder="110111" />
                    </Form.Item>
                </div>
            </div>

            <div style={{ display: currentStep === 3 ? "block" : "none" }}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Form.Item name="itcycleNumberingDocumentType" label={t("admin.itcycle_numbering_document_type")} initialValue="01">
                        <Select
                            size="large"
                            options={[
                                { value: "01", label: t("admin.itcycle_numbering_document_type_invoice") },
                                { value: "05", label: t("admin.itcycle_numbering_document_type_support_document") },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item name="itcycleNumberingPrefix" label={t("admin.alanube_resolution_prefix")}>
                        <Input size="large" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="itcycleNumberingResolutionNumber" label={t("admin.alanube_resolution_number")}>
                        <Input size="large" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="itcycleNumberingStartNumber" label={t("admin.alanube_resolution_min")}>
                        <Input size="large" type="number" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="itcycleNumberingEndNumber" label={t("admin.alanube_resolution_max")}>
                        <Input size="large" type="number" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item
                        name="itcycleNumberingStartDate"
                        label={t("admin.alanube_resolution_start")}
                        getValueProps={(value) => ({ value: value ? dayjs(value) : undefined })}
                        normalize={(value) => (value ? value.format("YYYY-MM-DD") : null)}
                    >
                        <DatePicker size="large" className="auth-ohnix-input w-full" />
                    </Form.Item>
                    <Form.Item
                        name="itcycleNumberingEndDate"
                        label={t("admin.alanube_resolution_end")}
                        getValueProps={(value) => ({ value: value ? dayjs(value) : undefined })}
                        normalize={(value) => (value ? value.format("YYYY-MM-DD") : null)}
                    >
                        <DatePicker size="large" className="auth-ohnix-input w-full" />
                    </Form.Item>
                </div>

                {/* Sends just this step's 7 fields to itcycle-api-dian directly
                    (not through the full register/reregister flow below, which
                    is NOT idempotent server-side and would duplicate the "01"
                    resolution on every reregister) - lets an admin add "01" then
                    switch documentType and add "05" without re-provisioning. */}
                {editingCompany && (
                    <div className="mt-2 flex items-center gap-3">
                        <Button
                            size="small"
                            onClick={() =>
                                onAddItcycleNumberingResolution?.(editingCompany.id, {
                                    documentType: form.getFieldValue("itcycleNumberingDocumentType") || "01",
                                    prefix: form.getFieldValue("itcycleNumberingPrefix"),
                                    resolutionNumber: form.getFieldValue("itcycleNumberingResolutionNumber"),
                                    startNumber: form.getFieldValue("itcycleNumberingStartNumber"),
                                    endNumber: form.getFieldValue("itcycleNumberingEndNumber"),
                                    startDate: form.getFieldValue("itcycleNumberingStartDate"),
                                    endDate: form.getFieldValue("itcycleNumberingEndDate"),
                                })
                            }
                        >
                            {t("admin.itcycle_numbering_add_resolution")}
                        </Button>
                        <span className="text-xs text-[var(--ohnix-text-dim)]">{t("admin.itcycle_numbering_add_resolution_hint")}</span>
                    </div>
                )}
            </div>

            <div style={{ display: currentStep === 4 ? "block" : "none" }}>
                <Form.Item label={t("admin.itcycle_firmapass_title")}>
                    <Segmented
                        value={certMode}
                        onChange={setCertMode}
                        options={[
                            { label: t("admin.itcycle_firmapass_mode_manual"), value: "manual" },
                            { label: t("admin.itcycle_firmapass_mode_auto"), value: "firmapass" },
                        ]}
                    />
                </Form.Item>

                {certMode === "manual" ? (
                    <>
                        <Form.Item name="itcycleCertificateIdentifier" label={t("admin.itcycle_certificate_identifier")}>
                            <Input size="large" className="auth-ohnix-input" />
                        </Form.Item>
                        {/* itcycleCertificateFile's value is set imperatively via form.setFieldValue in
                            beforeUpload below (it holds a base64 string, not a File - Upload has no
                            matching value prop to bind through Form.Item, so this wrapper is for the
                            label only). */}
                        <Form.Item name="itcycleCertificateFile" label={t("admin.itcycle_certificate_file")}>
                            <Upload
                                accept=".p12,.pfx"
                                maxCount={1}
                                beforeUpload={async (file) => {
                                    const base64 = await readFileAsBase64(file);
                                    form.setFieldValue("itcycleCertificateFile", base64);
                                    return false;
                                }}
                            >
                                <Button icon={<UploadOutlined />}>{t("admin.itcycle_certificate_upload")}</Button>
                            </Upload>
                        </Form.Item>
                        <Form.Item name="itcycleCertificatePassword" label={t("admin.itcycle_certificate_password")}>
                            <Input.Password size="large" className="auth-ohnix-input" />
                        </Form.Item>
                    </>
                ) : (
                    editingCompany && (
                        <FirmaPassAutomatedSection
                            companyId={editingCompany.id}
                            t={t}
                            onSetFirmaPassLoginKey={onSetFirmaPassLoginKey}
                            onUploadFirmaPassRut={onUploadFirmaPassRut}
                            onUploadFirmaPassArchivo={onUploadFirmaPassArchivo}
                            onConfirmFirmaPassValidation={onConfirmFirmaPassValidation}
                            onGetFirmaPassStatus={onGetFirmaPassStatus}
                        />
                    )
                )}

                {editingCompany && (
                    <div className="mb-1 flex flex-wrap items-center gap-3">
                        <Tag color={editingCompany.itcycleCompanyId ? "cyan" : "default"}>
                            {editingCompany.itcycleCompanyId
                                ? t("admin.itcycle_registered_status", { id: editingCompany.itcycleCompanyId })
                                : t("admin.itcycle_not_registered_status")}
                        </Tag>
                        <Button
                            size="small"
                            type="primary"
                            onClick={() => onRegisterItcycle?.(editingCompany.id, form.getFieldsValue())}
                        >
                            {editingCompany.itcycleCompanyId ? t("admin.itcycle_reregister") : t("admin.itcycle_register")}
                        </Button>
                    </div>
                )}
            </div>

            <div className="mt-4 flex justify-between border-t border-[var(--ohnix-line-4)] pt-4">
                <Button icon={<LeftOutlined />} disabled={currentStep === 0} onClick={goBack}>
                    {t("admin.itcycle_step_back")}
                </Button>
                {!isLastStep && (
                    <Button type="primary" onClick={goNext}>
                        {t("admin.itcycle_step_next")} <RightOutlined />
                    </Button>
                )}
            </div>
        </div>
    );
};

const CompanyFormModal = ({
    open,
    onCancel,
    onSubmit,
    submitting,
    form,
    editingCompany,
    onUploadLogo,
    onRegisterAlanube,
    onRegisterItcycle,
    onAddItcycleNumberingResolution,
    onSetFirmaPassLoginKey,
    onUploadFirmaPassRut,
    onUploadFirmaPassArchivo,
    onConfirmFirmaPassValidation,
    onGetFirmaPassStatus,
}) => {
    const { t } = useI18n();
    const selectedCountry = Form.useWatch("countryCode", form);
    const selectedProvider = Form.useWatch("electronicInvoicingProvider", form) || "alanube";

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <ShopOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                        {editingCompany ? t("admin.configure_company") : t("admin.add_company")}
                    </span>
                </div>
            }
            open={open}
            onCancel={onCancel}
            onOk={() => form.submit()}
            confirmLoading={submitting}
            okText={t("common.save")}
            cancelText={t("common.cancel")}
            okButtonProps={{ className: "h-10 px-6 rounded-md font-medium" }}
            cancelButtonProps={{ className: "h-10 px-6 rounded-md" }}
            destroyOnClose
            width={640}
            styles={darkModalStyles}
        >
            <Form form={form} layout="vertical" onFinish={onSubmit} className="mt-2">
                <Form.Item
                    name="name"
                    label={t("admin.company_name")}
                    rules={[{ required: true, message: t("validation.required_field") }]}
                >
                    <Input size="large" className="auth-ohnix-input" />
                </Form.Item>
                <Form.Item name="legalName" label={t("admin.company_legal_name")}>
                    <Input size="large" className="auth-ohnix-input" />
                </Form.Item>
                <Form.Item
                    name="countryCode"
                    label={t("admin.country_iso_label")}
                    initialValue="CO"
                    rules={[
                        {
                            pattern: /^[A-Za-z]{2}$/,
                            message: t("admin.country_iso_hint"),
                        },
                    ]}
                >
                    <Select
                        size="large"
                        className="auth-ohnix-input"
                        showSearch
                        options={[
                            { value: "CO", label: "CO - Colombia" },
                            { value: "ES", label: "ES - España" },
                        ]}
                        filterOption={(input, option) =>
                            `${option?.label || ""}`.toLowerCase().includes(input.toLowerCase())
                        }
                    />
                </Form.Item>
                <Form.Item name="contactEmail" label={t("admin.company_contact_email")}>
                    <Input type="email" size="large" className="auth-ohnix-input" />
                </Form.Item>
                <Form.Item name="phone" label={t("admin.company_phone")}>
                    <Input size="large" className="auth-ohnix-input" />
                </Form.Item>

                <div className="module-shell rounded-2xl border border-[var(--ohnix-line-4)] p-4 mb-4">
                    <div className="mb-3 text-sm font-bold text-[var(--ohnix-text-primary)]">{t("admin.pdf_branding_title")}</div>
                    <p className="mb-3 text-xs text-[var(--ohnix-text-dim)]">{t("admin.pdf_branding_hint")}</p>

                    {editingCompany ? (
                        <div className="mb-4 flex items-center gap-3">
                            {editingCompany.logoUrl && (
                                <img
                                    src={editingCompany.logoUrl}
                                    alt="logo"
                                    className="h-12 w-12 rounded-lg border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] object-contain"
                                />
                            )}
                            <Upload
                                accept="image/*"
                                showUploadList={false}
                                beforeUpload={() => false}
                                onChange={({ file }) => onUploadLogo?.(editingCompany.id, file)}
                            >
                                <Button icon={<UploadOutlined />}>{t("admin.upload_logo")}</Button>
                            </Upload>
                        </div>
                    ) : (
                        <p className="mb-4 text-xs text-[var(--ohnix-text-dim)]">{t("admin.upload_logo_after_create")}</p>
                    )}

                    <Form.Item
                        name="pdfFooterText"
                        label={t("admin.pdf_footer_text")}
                        extra={<span className="text-[var(--ohnix-text-dim)]">{t("admin.pdf_footer_text_hint")}</span>}
                    >
                        <Input.TextArea rows={2} className="auth-ohnix-input" placeholder={t("admin.pdf_footer_text_placeholder")} />
                    </Form.Item>

                    <Form.Item
                        name="pdfAccentColor"
                        label={t("admin.pdf_accent_color")}
                        extra={<span className="text-[var(--ohnix-text-dim)]">{t("admin.pdf_accent_color_hint")}</span>}
                        getValueFromEvent={(_, hex) => hex}
                        className="mb-0"
                    >
                        <ColorPicker format="hex" showText />
                    </Form.Item>
                </div>

                {selectedCountry === "CO" && (
                    <div className="module-shell rounded-2xl border border-[var(--ohnix-line-4)] p-4 mb-4">
                        <div className="mb-1 text-sm font-bold text-[var(--ohnix-text-primary)]">{t("admin.vat_responsible_title")}</div>
                        <p className="mb-3 text-xs text-[var(--ohnix-text-dim)]">{t("admin.vat_responsible_hint")}</p>
                        <Form.Item name="vatResponsible" label={t("admin.vat_responsible_label")} initialValue="unset" className="mb-0">
                            <Select
                                size="large"
                                className="auth-ohnix-input"
                                options={[
                                    { value: "unset", label: t("admin.vat_status_unset") },
                                    { value: "responsible", label: t("admin.vat_status_responsible") },
                                    { value: "not_responsible", label: t("admin.vat_status_not_responsible") },
                                ]}
                            />
                        </Form.Item>
                    </div>
                )}

                {selectedCountry === "CO" && (
                    <div className="relative overflow-hidden rounded-2xl border border-[#29D8D5]/25 bg-[radial-gradient(circle_at_90%_10%,rgba(41,216,213,.20),transparent_35%),linear-gradient(135deg,rgba(16,39,43,.9),rgba(14,12,31,.88))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.07)]">
                        <div className="absolute right-[-22px] top-[-25px] h-24 w-24 rounded-full border border-[#44F3F0]/20" />
                        <div className="relative mb-1 flex items-center gap-2 text-sm font-bold text-[var(--ohnix-text-primary)]">
                            <span className="h-2 w-2 rounded-full bg-[#44F3F0] shadow-[0_0_14px_#44F3F0]" />
                            {t("admin.dian_section_title")}
                        </div>
                        <p className="relative mb-4 text-xs text-[var(--ohnix-text-muted)]">{t("admin.dian_section_hint")}</p>
                        <Form.Item name="electronicInvoicingEnabled" valuePropName="checked" initialValue={false}>
                            <Switch checkedChildren={t("admin.dian_toggle_active")} unCheckedChildren={t("admin.dian_toggle_inactive")} />
                        </Form.Item>

                        <Form.Item name="electronicInvoicingProvider" label={t("admin.dian_provider")} initialValue="alanube">
                            <Select
                                size="large"
                                options={[
                                    { value: "alanube", label: "Alanube" },
                                    { value: "factus", label: "Factus" },
                                    { value: "itcycle", label: "ITCycle (software propio)" },
                                ]}
                            />
                        </Form.Item>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Form.Item name="factusPaymentForm" label={t("admin.dian_payment_form")} initialValue="1">
                                <Select
                                    size="large"
                                    options={[
                                        { value: "1", label: t("admin.dian_payment_cash") },
                                        { value: "2", label: t("admin.dian_payment_credit") },
                                    ]}
                                />
                            </Form.Item>
                            <Form.Item name="factusPaymentMethodCode" label={t("admin.dian_payment_method")} initialValue="42">
                                <Input size="large" className="auth-ohnix-input" placeholder="42" />
                            </Form.Item>
                        </div>

                        {selectedProvider === "factus" ? (
                            <>
                                <Form.Item name="factusNumberingRangeId" label={t("admin.dian_numbering_range_id")}>
                                    <Input size="large" className="auth-ohnix-input" placeholder={t("admin.dian_numbering_range_placeholder")} />
                                </Form.Item>
                                <Form.Item
                                    name="factusCreditNoteNumberingRangeId"
                                    label={t("admin.dian_credit_note_numbering_range_id")}
                                    extra={<span className="text-[var(--ohnix-text-dim)]">{t("admin.dian_credit_note_numbering_range_hint")}</span>}
                                >
                                    <Input size="large" className="auth-ohnix-input" placeholder={t("admin.dian_numbering_range_placeholder")} />
                                </Form.Item>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <Form.Item name="factusDocumentType" label={t("admin.dian_document_type")} initialValue="01">
                                        <Select size="large" options={[{ value: "01", label: t("admin.dian_doc_invoice") }]} />
                                    </Form.Item>
                                    <Form.Item name="factusOperationType" label={t("admin.dian_operation_type")} initialValue="10">
                                        <Select
                                            size="large"
                                            options={[
                                                { value: "10", label: t("admin.dian_operation_standard") },
                                                { value: "11", label: t("admin.dian_operation_mandate") },
                                            ]}
                                        />
                                    </Form.Item>
                                </div>
                            </>
                        ) : selectedProvider === "itcycle" ? (
                            <ItcycleProvisioningWizard
                                form={form}
                                t={t}
                                editingCompany={editingCompany}
                                onRegisterItcycle={onRegisterItcycle}
                                onAddItcycleNumberingResolution={onAddItcycleNumberingResolution}
                                onSetFirmaPassLoginKey={onSetFirmaPassLoginKey}
                                onUploadFirmaPassRut={onUploadFirmaPassRut}
                                onUploadFirmaPassArchivo={onUploadFirmaPassArchivo}
                                onConfirmFirmaPassValidation={onConfirmFirmaPassValidation}
                                onGetFirmaPassStatus={onGetFirmaPassStatus}
                            />
                        ) : (
                            <>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <Form.Item name="taxIdentification" label={t("admin.alanube_nit")}>
                                        <Input size="large" className="auth-ohnix-input" placeholder="900123456" />
                                    </Form.Item>
                                    <Form.Item name="taxIdentificationDv" label={t("admin.alanube_nit_dv")}>
                                        <Input size="large" className="auth-ohnix-input" placeholder={t("admin.alanube_nit_dv_hint")} />
                                    </Form.Item>
                                </div>

                                {editingCompany && (
                                    <div className="mb-4 flex flex-wrap items-center gap-3">
                                        <Tag color={editingCompany.alanubeCompanyId ? "cyan" : "default"}>
                                            {editingCompany.alanubeCompanyId
                                                ? t("admin.alanube_registered_status", { id: editingCompany.alanubeCompanyId })
                                                : t("admin.alanube_not_registered_status")}
                                        </Tag>
                                        <Button size="small" onClick={() => onRegisterAlanube?.(editingCompany.id)}>
                                            {editingCompany.alanubeCompanyId ? t("admin.alanube_reregister") : t("admin.alanube_register")}
                                        </Button>
                                    </div>
                                )}

                                <Form.Item name="alanubeTestSetId" label={t("admin.alanube_test_set_id")} extra={<span className="text-[var(--ohnix-text-dim)]">{t("admin.alanube_test_set_id_hint")}</span>}>
                                    <Input size="large" className="auth-ohnix-input" />
                                </Form.Item>

                                <Divider className="!border-[var(--ohnix-line-4)] !my-4" orientation="left">
                                    <span className="text-xs text-[var(--ohnix-text-dim)]">{t("admin.alanube_invoice_resolution")}</span>
                                </Divider>
                                <ResolutionFields basePath={["alanubeInvoiceResolution"]} t={t} />

                                <Divider className="!border-[var(--ohnix-line-4)] !my-4" orientation="left">
                                    <span className="text-xs text-[var(--ohnix-text-dim)]">{t("admin.alanube_credit_note_resolution")}</span>
                                </Divider>
                                <ResolutionFields basePath={["alanubeCreditNoteResolution"]} t={t} />
                            </>
                        )}
                    </div>
                )}
            </Form>
        </Modal>
    );
};

export default CompanyFormModal;
