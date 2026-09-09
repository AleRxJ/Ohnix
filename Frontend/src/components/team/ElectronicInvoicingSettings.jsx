/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import { Alert, Button, Card, DatePicker, Form, Input, Modal, Select, Tag, Tooltip, Typography } from "antd";
import {
    ArrowLeftOutlined,
    ArrowRightOutlined,
    BankOutlined,
    CheckCircleOutlined,
    EditOutlined,
    EnvironmentOutlined,
    FileProtectOutlined,
    IdcardOutlined,
    KeyOutlined,
    LockOutlined,
    MailOutlined,
    PlusOutlined,
    QuestionCircleOutlined,
    ReloadOutlined,
    RocketOutlined,
    SafetyCertificateOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import useI18n from "../../hooks/useI18n";
import { companyService } from "../../services/companyService";
import { getElectronicInvoicingProviderLabel } from "../../utils/electronicInvoicingProvider";
import { COLOMBIA_DEPARTMENTS, findDepartmentName } from "../../constants/colombiaDivipola";
import { resolveApiErrorMessage } from "../../utils/apiError";
import { isValidNit, isValidPrefix, isValidSoftwareId, isValidTechnicalKey } from "../../utils/dianValidation";
import FirmaPassSelfService from "./FirmaPassSelfService";
import ViafirmaSelfService from "./ViafirmaSelfService";
import DianHabilitacionPanel from "./DianHabilitacionPanel";

const validatorRule = (isValid, message) => ({
    validator: (_, value) => (!value || isValid(value) ? Promise.resolve() : Promise.reject(new Error(message))),
});

const { Text, Title } = Typography;
// ensureElectronicInvoicingPlan (Backend/services/electronicInvoicing.service.js)
// throws an English dev-facing message by design - this flow is entirely in
// Spanish, so every self-service catch translates this code instead of
// showing the raw message.
const PLAN_GATE_CODE_MESSAGES = { electronic_invoicing_plan_required: "fiscal_setup.plan_required" };
const stepFields = [
    ["taxIdentification", "legalName", "vatResponsible"],
    ["environment", "softwareId", "softwarePin", "technicalKey"],
    ["street", "departmentCode", "cityCode", "cityName", "postalZone"],
    ["prefix", "resolutionNumber", "startNumber", "endNumber", "startDate", "endDate"],
];

// Generic self-service "add a numbering resolution" form for any DIAN
// document type. Originally hardcoded to "05" (Documento Soporte - see
// Backend/services/purchaseSupportDocument.service.js: without it,
// issueSupportDocumentForPurchase fails silently (fire-and-forget) the
// first time a purchase from a not-obligated-to-invoice supplier completes).
// Generalized so the same form also covers "91"/"92" (nota crédito/débito),
// which the DIAN habilitación test-matrix panel below requires a company to
// have before it can start - reusing this one parametrized form instead of
// duplicating it per document type.
// autoAssignPrefix is set only for "91"/"92": unlike a factura's Resolución
// de Facturación (DIAN pre-authorizes a specific prefix/range/dates before
// you can use them), Resolución DIAN 000042 de 2020 only requires notas
// crédito/débito to follow "un sistema de numeración consecutiva del emisor"
// - the ISSUER'S OWN consecutive scheme, not one DIAN grants in advance.
// itcycle-api-dian's own numbering-resolution creation is a plain database
// insert with no DIAN-side validation either way (confirmed against its
// admin.service.ts), so there's nothing to look up - only something to pick
// once and keep using. Pre-filling sensible values here (a distinct 2-letter
// prefix + a wide, decades-long range) turns "figure out what DIAN wants"
// into "review these defaults and click Agregar."
const NumberingResolutionForm = ({ documentType, titleKey, hintKey, buttonKey, onAdded, autoAssignPrefix }) => {
    const { t } = useI18n();
    const [form] = Form.useForm();
    const [adding, setAdding] = useState(false);
    // Stable across retries of the SAME attempt (network blip, a lost
    // response after itcycle-api-dian already created the resolution) so a
    // retry replays that result instead of registering a second, duplicate
    // DIAN numbering resolution - rotated only after a real success, since
    // the next add is a genuinely new resolution, not a retry.
    const [addIdempotencyKey, setAddIdempotencyKey] = useState(() => crypto.randomUUID());

    const submit = async () => {
        try {
            const values = await form.validateFields();
            setAdding(true);
            await companyService.addMyItcycleNumberingResolution({
                documentType,
                prefix: values.prefix,
                resolutionNumber: values.resolutionNumber,
                startNumber: Number(values.startNumber),
                endNumber: Number(values.endNumber),
                startDate: values.startDate?.format("YYYY-MM-DD"),
                endDate: values.endDate?.format("YYYY-MM-DD"),
            }, addIdempotencyKey);
            toast.success(t("fiscal_setup.add_resolution_success"));
            setAddIdempotencyKey(crypto.randomUUID());
            form.resetFields();
            onAdded?.();
        } catch (error) {
            if (!error?.errorFields) toast.error(resolveApiErrorMessage(error, t, PLAN_GATE_CODE_MESSAGES, "fiscal_setup.add_resolution_error"));
        } finally {
            setAdding(false);
        }
    };

    return (
        <Card className="mt-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)]">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#29D8D5]/30 bg-[#29D8D5]/10">
                    <FileProtectOutlined className="text-lg text-[#44F3F0]" />
                </div>
                <div>
                    <Title level={5} className="m-0 text-[var(--ohnix-text-primary)]">{t(titleKey)}</Title>
                    <Text className="text-xs text-[var(--ohnix-text-muted)]">{t(hintKey)}</Text>
                </div>
            </div>
            {autoAssignPrefix && (
                <Alert
                    className="mt-3 dark-alert dark-alert-purple"
                    type="info"
                    showIcon
                    message={t("fiscal_setup.auto_assign_resolution_hint")}
                />
            )}
            <Form
                form={form}
                layout="vertical"
                className="mt-4"
                initialValues={autoAssignPrefix ? {
                    prefix: autoAssignPrefix,
                    resolutionNumber: "1",
                    startNumber: 1,
                    endNumber: 999999,
                    startDate: dayjs(),
                    endDate: dayjs().add(10, "year"),
                } : undefined}
            >
                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    <Form.Item
                        name="prefix"
                        label={t("fiscal_setup.prefix")}
                        tooltip={t(autoAssignPrefix ? "fiscal_setup.prefix_hint_auto_assign" : "fiscal_setup.prefix_hint")}
                        rules={[{ required: true, message: t("fiscal_setup.field_required") }, validatorRule(isValidPrefix, t("fiscal_setup.prefix_invalid"))]}
                    >
                        <Input size="large" maxLength={4} className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="resolutionNumber" label={t("fiscal_setup.resolution_number")} tooltip={t(autoAssignPrefix ? "fiscal_setup.resolution_number_hint_auto_assign" : "fiscal_setup.resolution_number_hint")} rules={[{ required: true, whitespace: true, message: t("fiscal_setup.field_required") }]}>
                        <Input size="large" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="startNumber" label={t("fiscal_setup.start_number")} tooltip={t("fiscal_setup.number_range_hint")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                        <Input size="large" type="number" min={1} className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item
                        name="endNumber"
                        label={t("fiscal_setup.end_number")}
                        dependencies={["startNumber"]}
                        rules={[
                            { required: true, message: t("fiscal_setup.field_required") },
                            {
                                validator: (_, value) => {
                                    const startNumber = form.getFieldValue("startNumber");
                                    if (!value || !startNumber) return Promise.resolve();
                                    return Number(value) > Number(startNumber) ? Promise.resolve() : Promise.reject(new Error(t("fiscal_setup.number_range_invalid")));
                                },
                            },
                        ]}
                    >
                        <Input size="large" type="number" min={1} className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="startDate" label={t("fiscal_setup.start_date")} tooltip={t("fiscal_setup.validity_dates_hint")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                        <DatePicker size="large" className="w-full" />
                    </Form.Item>
                    <Form.Item
                        name="endDate"
                        label={t("fiscal_setup.end_date")}
                        dependencies={["startDate"]}
                        rules={[
                            { required: true, message: t("fiscal_setup.field_required") },
                            {
                                validator: (_, value) => {
                                    const startDate = form.getFieldValue("startDate");
                                    if (!value || !startDate) return Promise.resolve();
                                    return value.isAfter(startDate) ? Promise.resolve() : Promise.reject(new Error(t("fiscal_setup.date_range_invalid")));
                                },
                            },
                        ]}
                    >
                        <DatePicker size="large" className="w-full" />
                    </Form.Item>
                </div>
                <Button type="primary" className="hover:shadow-[0_0_26px_rgba(41,216,213,0.22)]" icon={<PlusOutlined />} loading={adding} onClick={submit}>
                    {t(buttonKey)}
                </Button>
            </Form>
        </Card>
    );
};

// Same 3 codes getCompanyDianReadiness can ever return (see
// companySelf.controller.js) - shared here so both the top status alert
// (electronicInvoicingAtRisk) and FirmaPassSelfService's own missing-fields
// message translate them identically instead of drifting apart.
const MISSING_READINESS_LABEL_KEYS = {
    dian_configuration: "fiscal_setup.missing_dian_configuration",
    invoice_resolution_01: "fiscal_setup.missing_invoice_resolution_01",
    active_certificate: "fiscal_setup.missing_active_certificate",
};

// Read-only recap of what registerMyCompanyWithItcycle actually submitted -
// before this, the wizard above simply vanished once status.provisioned was
// true and nothing ever showed the owner what they'd filled in again.
// legalName/taxIdentification/environment are locked here (not just styled
// that way - companySelf.controller.js's updateMyCompany rejects a changed
// value once itcycleCompanyId exists) because they're frozen into
// itcycle-api-dian's own DianConfiguration.supplierProfile at provisioning
// time and never resent per invoice - editing them here would only change
// what Ohnix displays, not what DIAN actually has on file. vatResponsible is
// the one field from the original wizard that's both safe to change later
// (see updateMyCompany's vatResponsibleEffectiveFrom tracking) and had no
// edit path left once the wizard disappeared - so it gets its own inline
// editor instead of just being displayed.
const RegisteredConfigSummary = ({ company, readiness, onCompanyChanged, onResolutionsChanged }) => {
    const { t } = useI18n();
    const [vatResponsible, setVatResponsible] = useState(company?.vatResponsible === "unset" ? undefined : company?.vatResponsible);
    const [savingVat, setSavingVat] = useState(false);
    // Only "91"/"92" resolutions are ever editable (see
    // updateItcycleNumberingResolutionForCompany's comment) - null means the
    // edit modal is closed.
    const [editingResolution, setEditingResolution] = useState(null);
    const [editForm] = Form.useForm();
    const [savingResolution, setSavingResolution] = useState(false);

    useEffect(() => {
        setVatResponsible(company?.vatResponsible === "unset" ? undefined : company?.vatResponsible);
    }, [company?.vatResponsible]);

    const saveVat = async () => {
        if (!vatResponsible || vatResponsible === company?.vatResponsible) return;
        try {
            setSavingVat(true);
            const response = await companyService.updateMyCompany({ vatResponsible });
            onCompanyChanged?.(response?.data);
            toast.success(t("fiscal_setup.config_vat_saved"));
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t, {}, "fiscal_setup.status_load_error"));
        } finally {
            setSavingVat(false);
        }
    };

    const openEditResolution = (resolution) => {
        setEditingResolution(resolution);
        editForm.setFieldsValue({
            prefix: resolution.prefix,
            resolutionNumber: resolution.resolutionNumber,
            startNumber: resolution.startNumber,
            endNumber: resolution.endNumber,
            startDate: dayjs(resolution.startDate),
            endDate: dayjs(resolution.endDate),
        });
    };

    const submitEditResolution = async () => {
        try {
            const values = await editForm.validateFields();
            setSavingResolution(true);
            await companyService.updateMyItcycleNumberingResolution(editingResolution.id, {
                prefix: values.prefix,
                resolutionNumber: values.resolutionNumber,
                startNumber: Number(values.startNumber),
                endNumber: Number(values.endNumber),
                startDate: values.startDate?.format("YYYY-MM-DD"),
                endDate: values.endDate?.format("YYYY-MM-DD"),
            });
            toast.success(t("fiscal_setup.resolutions_edit_success"));
            setEditingResolution(null);
            onResolutionsChanged?.();
        } catch (error) {
            if (!error?.errorFields) toast.error(resolveApiErrorMessage(error, t, {}, "fiscal_setup.resolutions_edit_error"));
        } finally {
            setSavingResolution(false);
        }
    };

    const resolutions = readiness?.resolutions || [];
    const documentTypeLabel = (documentType) => {
        if (documentType === "01") return t("fiscal_setup.document_type_invoice");
        if (documentType === "05") return t("fiscal_setup.document_type_support");
        if (documentType === "91") return t("fiscal_setup.document_type_credit_note");
        if (documentType === "92") return t("fiscal_setup.document_type_debit_note");
        return documentType;
    };

    return (
        <Card className="mt-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)]">
            <div className="flex flex-wrap items-center gap-2">
                <Title level={5} className="m-0 text-[var(--ohnix-text-primary)]">{t("fiscal_setup.config_summary_title")}</Title>
                <Tooltip title={t("fiscal_setup.config_modality_hint")}>
                    <Tag color="cyan" className="m-0">{t("fiscal_setup.config_modality_own_software")}</Tag>
                </Tooltip>
            </div>
            <Text className="text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.config_summary_hint")}</Text>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <Text className="block text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.config_legal_name")}</Text>
                    <div className="flex items-center gap-2">
                        <Text className="text-sm font-medium text-[var(--ohnix-text-primary)]">{company?.legalName || "-"}</Text>
                        <Tooltip title={t("fiscal_setup.config_locked_hint")}>
                            <LockOutlined className="text-xs text-[var(--ohnix-text-muted)]" />
                        </Tooltip>
                    </div>
                </div>
                <div>
                    <Text className="block text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.config_nit")}</Text>
                    <div className="flex items-center gap-2">
                        <Text className="text-sm font-medium text-[var(--ohnix-text-primary)]">
                            {company?.taxIdentification ? `${company.taxIdentification}-${company.taxIdentificationDv ?? ""}` : "-"}
                        </Text>
                        <Tooltip title={t("fiscal_setup.config_locked_hint")}>
                            <LockOutlined className="text-xs text-[var(--ohnix-text-muted)]" />
                        </Tooltip>
                    </div>
                </div>
                <div>
                    <Text className="block text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.config_email")}</Text>
                    <Text className="text-sm font-medium text-[var(--ohnix-text-primary)]">{company?.contactEmail || "-"}</Text>
                </div>
                <div>
                    <Text className="block text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.config_environment")}</Text>
                    <div className="flex items-center gap-2">
                        <Text className="text-sm font-medium text-[var(--ohnix-text-primary)]">{readiness?.environment || "-"}</Text>
                        {readiness?.environment && (
                            <Tooltip title={t(readiness.environment === "PRODUCTION" ? "fiscal_setup.config_environment_production_hint" : "fiscal_setup.config_environment_sandbox_hint")}>
                                <QuestionCircleOutlined className="text-xs text-[var(--ohnix-text-muted)]" />
                            </Tooltip>
                        )}
                        <Tooltip title={t("fiscal_setup.config_locked_hint")}>
                            <LockOutlined className="text-xs text-[var(--ohnix-text-muted)]" />
                        </Tooltip>
                    </div>
                </div>
                <div>
                    <Text className="block text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.config_software_id")}</Text>
                    <div className="flex items-center gap-2">
                        {/* readiness.softwareId is itcycle-api-dian's own live DianConfiguration -
                        the source of truth. company.dianSoftwareId (captured once, at
                        registerCompanyWithItcycle time - see electronicInvoicing.service.js) is
                        only a fallback for when readiness couldn't be fetched (see
                        status.readinessError above). */}
                        <Text className="text-sm font-medium text-[var(--ohnix-text-primary)]">{readiness?.softwareId || company?.dianSoftwareId || "-"}</Text>
                        <Tooltip title={t("fiscal_setup.config_locked_hint")}>
                            <LockOutlined className="text-xs text-[var(--ohnix-text-muted)]" />
                        </Tooltip>
                    </div>
                </div>
                <div className="sm:col-span-2">
                    <Text className="block text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.config_vat")}</Text>
                    <div className="flex flex-wrap items-center gap-2">
                        <Select
                            size="middle"
                            className="w-56"
                            value={vatResponsible}
                            placeholder={t("fiscal_setup.config_vat_unset")}
                            onChange={setVatResponsible}
                            options={[
                                { value: "responsible", label: t("fiscal_setup.vat_responsible") },
                                { value: "not_responsible", label: t("fiscal_setup.vat_not_responsible") },
                            ]}
                        />
                        <Button
                            size="middle"
                            type="primary"
                            loading={savingVat}
                            disabled={!vatResponsible || vatResponsible === company?.vatResponsible}
                            onClick={saveVat}
                        >
                            {t("fiscal_setup.config_vat_save")}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="mt-5">
                <Text className="block text-xs font-semibold uppercase tracking-wide text-[var(--ohnix-text-muted)]">
                    {t("fiscal_setup.resolutions_title")}
                </Text>
                {resolutions.length === 0 ? (
                    <Text className="mt-2 block text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.resolutions_empty")}</Text>
                ) : (
                    <div className="mt-2 overflow-x-auto">
                        <table className="w-full min-w-[520px] text-left text-xs">
                            <thead>
                                <tr className="text-[var(--ohnix-text-muted)]">
                                    <th className="pb-2 pr-3 font-medium">{t("fiscal_setup.resolutions_col_document_type")}</th>
                                    <th className="pb-2 pr-3 font-medium">{t("fiscal_setup.resolutions_col_prefix")}</th>
                                    <th className="pb-2 pr-3 font-medium">{t("fiscal_setup.resolutions_col_number")}</th>
                                    <th className="pb-2 pr-3 font-medium">{t("fiscal_setup.resolutions_col_validity")}</th>
                                    <th className="pb-2 pr-3 font-medium">{t("fiscal_setup.resolutions_col_status")}</th>
                                    <th className="pb-2 font-medium" />
                                </tr>
                            </thead>
                            <tbody>
                                {resolutions.map((resolution) => {
                                    // Only "91"/"92" (self-assigned, no DIAN validation) are ever
                                    // editable, and only before any document has claimed a number
                                    // from them - see updateItcycleNumberingResolutionForCompany.
                                    const canEdit = (resolution.documentType === "91" || resolution.documentType === "92")
                                        && resolution.currentNumber === resolution.startNumber;
                                    return (
                                        <tr key={resolution.id} className="border-t border-[var(--ohnix-line-4)]">
                                            <td className="py-2 pr-3 text-[var(--ohnix-text-primary)]">{documentTypeLabel(resolution.documentType)}</td>
                                            <td className="py-2 pr-3 text-[var(--ohnix-text-primary)]">{resolution.prefix}</td>
                                            <td className="py-2 pr-3 text-[var(--ohnix-text-primary)]">{resolution.resolutionNumber}</td>
                                            <td className="py-2 pr-3 text-[var(--ohnix-text-primary)]">
                                                {new Date(resolution.startDate).toLocaleDateString()} – {new Date(resolution.endDate).toLocaleDateString()}
                                            </td>
                                            <td className="py-2 pr-3">
                                                <Tag color={resolution.isCurrent ? "green" : "default"}>
                                                    {resolution.isCurrent ? t("fiscal_setup.resolutions_current") : t("fiscal_setup.resolutions_not_current")}
                                                </Tag>
                                            </td>
                                            <td className="py-2">
                                                {canEdit && (
                                                    <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEditResolution(resolution)}>
                                                        {t("fiscal_setup.resolutions_edit")}
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Modal
                title={t("fiscal_setup.resolutions_edit_title")}
                open={Boolean(editingResolution)}
                onCancel={() => setEditingResolution(null)}
                onOk={submitEditResolution}
                confirmLoading={savingResolution}
                okText={t("fiscal_setup.resolutions_edit_save")}
                cancelText={t("fiscal_setup.habilitacion_confirm_cancel")}
                destroyOnClose
            >
                <Form form={editForm} layout="vertical" className="mt-4">
                    <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                        <Form.Item
                            name="prefix"
                            label={t("fiscal_setup.prefix")}
                            rules={[{ required: true, message: t("fiscal_setup.field_required") }, validatorRule(isValidPrefix, t("fiscal_setup.prefix_invalid"))]}
                        >
                            <Input size="large" maxLength={4} className="auth-ohnix-input" />
                        </Form.Item>
                        <Form.Item name="resolutionNumber" label={t("fiscal_setup.resolution_number")} rules={[{ required: true, whitespace: true, message: t("fiscal_setup.field_required") }]}>
                            <Input size="large" className="auth-ohnix-input" />
                        </Form.Item>
                        <Form.Item name="startNumber" label={t("fiscal_setup.start_number")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                            <Input size="large" type="number" min={1} className="auth-ohnix-input" />
                        </Form.Item>
                        <Form.Item
                            name="endNumber"
                            label={t("fiscal_setup.end_number")}
                            dependencies={["startNumber"]}
                            rules={[
                                { required: true, message: t("fiscal_setup.field_required") },
                                {
                                    validator: (_, value) => {
                                        const startNumber = editForm.getFieldValue("startNumber");
                                        if (!value || !startNumber) return Promise.resolve();
                                        return Number(value) > Number(startNumber) ? Promise.resolve() : Promise.reject(new Error(t("fiscal_setup.number_range_invalid")));
                                    },
                                },
                            ]}
                        >
                            <Input size="large" type="number" min={1} className="auth-ohnix-input" />
                        </Form.Item>
                        <Form.Item name="startDate" label={t("fiscal_setup.start_date")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                            <DatePicker size="large" className="w-full" />
                        </Form.Item>
                        <Form.Item
                            name="endDate"
                            label={t("fiscal_setup.end_date")}
                            dependencies={["startDate"]}
                            rules={[
                                { required: true, message: t("fiscal_setup.field_required") },
                                {
                                    validator: (_, value) => {
                                        const startDate = editForm.getFieldValue("startDate");
                                        if (!value || !startDate) return Promise.resolve();
                                        return value.isAfter(startDate) ? Promise.resolve() : Promise.reject(new Error(t("fiscal_setup.date_range_invalid")));
                                    },
                                },
                            ]}
                        >
                            <DatePicker size="large" className="w-full" />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>
        </Card>
    );
};

const ElectronicInvoicingSettings = ({ company, onCompanyChanged }) => {
    const { t } = useI18n();
    const [form] = Form.useForm();
    const [step, setStep] = useState(0);
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    // Which certificate provider (firmapass|viafirma) signs this company's
    // real documents - a selector only makes sense when activeProviders has
    // more than one entry (an ACTIVE certificate from both at once).
    const [certificateProviderStatus, setCertificateProviderStatus] = useState({ activeProviders: [], override: null });
    const [providerSwitchBusy, setProviderSwitchBusy] = useState(false);
    // readinessError (itcycle-api-dian unreachable/cold-starting) used to just
    // print "try again in a few seconds" with nothing on screen that actually
    // retried or told the owner when - they had no way to know if reloading
    // now would help or if they should wait. This auto-retries a few times on
    // a visible countdown, backing off each time, plus a manual button for
    // "I don't want to wait."
    const [retrying, setRetrying] = useState(false);
    const [autoRetryCount, setAutoRetryCount] = useState(0);
    const [secondsToRetry, setSecondsToRetry] = useState(null);
    const MAX_AUTO_RETRIES = 3;
    // Generated once per mount, not per click - the idempotency middleware
    // replays the cached response for a repeated key, which only protects a
    // real retry (network timeout, a double-click, a lost response after the
    // server actually finished) if the SAME key is reused. A fresh
    // crypto.randomUUID() on every submit would make each retry look like a
    // brand-new request and could double-post the numbering resolution.
    const [registerIdempotencyKey] = useState(() => crypto.randomUUID());

    const refreshCertificateProviderStatus = async () => {
        try {
            const response = await companyService.getMyCertificateProviderStatus();
            setCertificateProviderStatus(response?.data || { activeProviders: [], override: null });
        } catch {
            // Non-critical - the certificate cards below fall back to their
            // own default visibility rule when this hasn't loaded yet.
        }
    };

    const refresh = async () => {
        refreshCertificateProviderStatus();
        try {
            const response = await companyService.getMyItcycleStatus();
            setStatus(response?.data || { provisioned: false });
        } catch (error) {
            // 422 just means "no company yet" (getOwnedCompanyOrThrow) - not a real error to surface.
            if (error?.response?.status === 422) {
                setStatus({ provisioned: false });
            } else {
                // Any other failure here is transient (itcycle-api-dian cold
                // start, a deploy in progress, a network blip) - never force
                // an already-registered company (status.provisioned === true)
                // back onto the initial registration wizard just because one
                // refresh failed. Keep whatever we last knew; only fall back
                // to "not provisioned" if we never successfully loaded at all.
                toast.error(error?.response?.data?.message || t("fiscal_setup.status_load_error"));
                setStatus((prev) => prev ?? { provisioned: false });
            }
        } finally {
            setLoading(false);
        }
    };

    // Backs off each attempt (8s, 16s, 24s) instead of hammering
    // itcycle-api-dian while it's cold-starting, and gives up after
    // MAX_AUTO_RETRIES so a genuinely down backend doesn't poll forever -
    // the manual button below always stays available after that.
    useEffect(() => {
        if (!status?.readinessError || autoRetryCount >= MAX_AUTO_RETRIES) {
            setSecondsToRetry(null);
            return undefined;
        }
        const delaySeconds = 8 * (autoRetryCount + 1);
        setSecondsToRetry(delaySeconds);
        const tick = setInterval(() => {
            setSecondsToRetry((current) => (current && current > 1 ? current - 1 : 0));
        }, 1000);
        const timeout = setTimeout(() => {
            clearInterval(tick);
            setAutoRetryCount((count) => count + 1);
            refresh();
        }, delaySeconds * 1000);
        return () => {
            clearInterval(tick);
            clearTimeout(timeout);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status?.readinessError, autoRetryCount]);

    useEffect(() => {
        if (!status?.readinessError) setAutoRetryCount(0);
    }, [status?.readinessError]);

    const retryReadinessNow = async () => {
        setRetrying(true);
        try {
            await refresh();
        } finally {
            setRetrying(false);
        }
    };

    useEffect(() => {
        form.setFieldsValue({
            taxIdentification: company?.taxIdentification || "",
            legalName: company?.legalName || company?.name || "",
            email: company?.contactEmail || "",
            vatResponsible: company?.vatResponsible === "unset" ? undefined : company?.vatResponsible,
            environment: "SANDBOX",
            documentType: "01",
        });
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [company?.id]);

    const next = async () => {
        try {
            await form.validateFields(stepFields[step]);
            setStep((current) => Math.min(current + 1, stepFields.length - 1));
        } catch {
            // validateFields already surfaces the field-level errors inline - nothing extra to show here.
        }
    };

    const submit = async () => {
        try {
            // Steps are always mounted (see the `display` toggle below) precisely
            // so this validates every field across all 4 steps, not just the
            // currently visible one - a step's Form.Items only register their
            // validation rules while mounted, so validating an unmounted step's
            // fields silently no-ops and a stale/incomplete value (e.g.
            // legalName) could otherwise slip through to the backend, surfacing
            // as a confusing top-level error after the whole wizard is filled in.
            try {
                await form.validateFields();
            } catch (validationError) {
                const firstInvalidField = validationError?.errorFields?.[0]?.name?.[0];
                const invalidStep = stepFields.findIndex((fields) => fields.includes(firstInvalidField));
                if (invalidStep !== -1) setStep(invalidStep);
                throw validationError;
            }
            setSaving(true);
            const value = form.getFieldsValue();
            const saved = await companyService.updateMyCompany({
                name: company?.name || value.legalName,
                legalName: value.legalName,
                contactEmail: value.email,
                taxIdentification: value.taxIdentification,
                countryCode: "CO",
                vatResponsible: value.vatResponsible,
            });
            const entity = saved?.data;
            await companyService.registerMyCompanyWithItcycle({
                // Each company registers its own DIAN habilitación (see the
                // software step below) - never a value shared across clients.
                dianConfiguration: {
                    environment: value.environment,
                    softwareId: value.softwareId,
                    softwarePin: value.softwarePin,
                    technicalKey: value.technicalKey,
                },
                supplierProfile: {
                    name: entity?.legalName || entity?.name,
                    identification: { number: entity?.taxIdentification, type: "31", dv: entity?.taxIdentificationDv },
                    personType: "1",
                    // "R-99-PN" ("no aplica") is the same generic default
                    // buildItcycleCustomerParty already uses for a buyer
                    // with no special DIAN fiscal responsibility on file -
                    // NOT "O-13" (Gran Contribuyente), a special DIAN
                    // designation that doesn't apply to most small/medium
                    // businesses, which is who actually self-registers here.
                    fiscalResponsibilities: ["R-99-PN"],
                    taxInfo: {
                        registrationName: entity?.legalName || entity?.name,
                        companyId: { number: entity?.taxIdentification, type: "31", dv: entity?.taxIdentificationDv },
                        taxLevelCode: "R-99-PN",
                        taxScheme: { code: "01" },
                        address: { street: value.street, cityCode: value.cityCode, cityName: value.cityName, departmentCode: value.departmentCode, departmentName: findDepartmentName(value.departmentCode), countryCode: "CO", postalZone: value.postalZone },
                    },
                    address: { street: value.street, cityCode: value.cityCode, cityName: value.cityName, departmentCode: value.departmentCode, departmentName: findDepartmentName(value.departmentCode), countryCode: "CO", postalZone: value.postalZone },
                    email: value.email || undefined,
                },
                numberingResolutions: [{
                    documentType: value.documentType,
                    prefix: value.prefix,
                    resolutionNumber: value.resolutionNumber,
                    startNumber: Number(value.startNumber),
                    endNumber: Number(value.endNumber),
                    startDate: value.startDate?.format("YYYY-MM-DD"),
                    endDate: value.endDate?.format("YYYY-MM-DD"),
                }],
            }, registerIdempotencyKey);
            onCompanyChanged?.(entity);
            await refresh();
            toast.success(t("fiscal_setup.submit_success"));
        } catch (error) {
            if (!error?.errorFields) toast.error(resolveApiErrorMessage(error, t, PLAN_GATE_CODE_MESSAGES, "fiscal_setup.submit_error"));
        } finally {
            setSaving(false);
        }
    };

    // electronicInvoicingProvider defaults to "alanube" for every company, so
    // its mere presence isn't a signal an admin deliberately chose it - only
    // electronicInvoicingEnabled=true means the admin actually turned on
    // live invoicing under that other provider. Hiding the wizard here backs
    // up the same check the backend enforces in registerMyCompanyWithItcycle.
    const otherProviderActive =
        !status?.provisioned &&
        status?.electronicInvoicingEnabled &&
        status?.electronicInvoicingProvider &&
        status.electronicInvoicingProvider !== "itcycle";

    const field = (name, label, options = {}) => (
        <Form.Item name={name} label={label} tooltip={options.hint} rules={options.required ? [{ required: true, message: t("fiscal_setup.field_required") }] : []}>
            {options.select
                ? <Select size="large" options={options.select} />
                : <Input size="large" type={options.type} prefix={options.icon} className="auth-ohnix-input" />}
        </Form.Item>
    );

    const hasResolution = (documentType) => (status?.readiness?.resolutions || []).some((r) => r.documentType === documentType && r.isCurrent);
    const isSandbox = status?.readiness?.environment === "SANDBOX";

    // Which certificate card(s) to show:
    // - Both active at once (real ambiguity, e.g. mid-migration or a manual
    //   contingency fallback) -> show a selector, render only the chosen one.
    // - Only FirmaPass active (an existing pre-Viafirma customer) -> show
    //   both: FirmaPass because it's what's actually protecting their
    //   invoicing today, Viafirma as the invitation to migrate.
    // - Anything else (nothing active yet, or only Viafirma active) ->
    //   Viafirma alone, matching the new default going forward.
    const { activeProviders, override } = certificateProviderStatus;
    const bothActive = activeProviders.includes("viafirma") && activeProviders.includes("firmapass");
    const onlyFirmaPassActive = activeProviders.includes("firmapass") && !activeProviders.includes("viafirma");
    const effectiveProvider = bothActive ? (override || "viafirma") : null;
    const showCertificateProviderSelector = bothActive;
    const showViafirmaCard = bothActive ? effectiveProvider === "viafirma" : true;
    const showFirmaPassCard = bothActive ? effectiveProvider === "firmapass" : onlyFirmaPassActive;

    const switchCertificateProvider = async (provider) => {
        try {
            setProviderSwitchBusy(true);
            const response = await companyService.setMyCertificateProviderOverride(provider);
            setCertificateProviderStatus(response?.data || { activeProviders, override: provider });
            toast.success(t("fiscal_setup.certificate_provider_switched"));
        } catch (error) {
            toast.error(error?.response?.data?.message || t("fiscal_setup.certificate_provider_switch_error"));
        } finally {
            setProviderSwitchBusy(false);
        }
    };

    const STEP_META = [
        { icon: <BankOutlined />, title: t("fiscal_setup.step_company"), caption: t("fiscal_setup.step_company_caption") },
        { icon: <SafetyCertificateOutlined />, title: t("fiscal_setup.step_software"), caption: t("fiscal_setup.step_software_caption") },
        { icon: <EnvironmentOutlined />, title: t("fiscal_setup.step_address"), caption: t("fiscal_setup.step_address_caption") },
        { icon: <FileProtectOutlined />, title: t("fiscal_setup.step_resolution"), caption: t("fiscal_setup.step_resolution_caption") },
    ];

    const statusTone = status?.provisioned
        ? { color: "#44F3F0", background: "rgba(68,243,240,0.14)", border: "rgba(68,243,240,0.45)", dot: "status-dot--accepted" }
        : { color: "#FFCF70", background: "rgba(245,158,11,0.14)", border: "rgba(245,158,11,0.45)", dot: "status-dot--draft" };
    const statusLabel = status?.provisioned ? t("fiscal_setup.status_ready") : t("fiscal_setup.status_pending");

    return (
        <Card loading={loading} className="overflow-hidden rounded-3xl border border-cyan-400/20 bg-[var(--ohnix-hover-overlay)] text-[var(--ohnix-text-primary)]">
            <div className="relative -m-6 mb-6 overflow-hidden bg-[linear-gradient(120deg,rgba(41,216,213,0.18),rgba(124,106,247,0.1)_45%,transparent_75%)] p-6">
                <div className="pointer-events-none absolute -right-14 -top-16 h-40 w-40 rounded-full border border-[#29D8D5]/25" />
                <div className="pointer-events-none absolute -right-2 -top-6 h-24 w-24 rounded-full border border-[#7C6AF7]/20" />
                <div className="relative flex flex-wrap items-start justify-between gap-4">
                    <div className="flex gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#29D8D5]/40 bg-gradient-to-br from-[#29D8D5]/25 to-[#7C6AF7]/15 text-xl text-[#44F3F0] shadow-[0_0_24px_rgba(41,216,213,0.28)] animate-glow-pulse">
                            <SafetyCertificateOutlined />
                        </div>
                        <div>
                            <Title level={4} className="m-0 text-[var(--ohnix-text-primary)]">{t("fiscal_setup.title")}</Title>
                            <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("fiscal_setup.subtitle")}</Text>
                        </div>
                    </div>
                    <span
                        className="status-pill"
                        style={{ color: statusTone.color, background: statusTone.background, border: `1px solid ${statusTone.border}` }}
                    >
                        <span className={`status-dot ${statusTone.dot}`} />
                        {statusLabel}
                    </span>
                </div>
            </div>

            {status?.provisioned ? (
                <>
                    <Alert
                        className={`dark-alert ${status.electronicInvoicingAtRisk ? "dark-alert-amber" : status.electronicInvoicingEnabled ? "dark-alert-teal" : "dark-alert-purple"}`}
                        type={status.electronicInvoicingAtRisk ? "warning" : status.electronicInvoicingEnabled ? "success" : "info"}
                        showIcon
                        message={status.electronicInvoicingAtRisk ? t("fiscal_setup.status_at_risk") : status.electronicInvoicingEnabled ? t("fiscal_setup.status_active") : t("fiscal_setup.status_dian_complete")}
                        description={
                            status.electronicInvoicingAtRisk
                                ? t("fiscal_setup.status_at_risk_hint", { items: (status.readiness?.missing || []).map((code) => t(MISSING_READINESS_LABEL_KEYS[code] || code)).join(", ") })
                                : status.electronicInvoicingEnabled ? t("fiscal_setup.status_active_hint") : t("fiscal_setup.status_pending_hint")
                        }
                    />
                    {status.readinessError && (
                        <Alert
                            className="mt-3 dark-alert dark-alert-amber"
                            type="warning"
                            showIcon
                            message={t("fiscal_setup.readiness_unavailable")}
                            description={
                                <div className="flex flex-col gap-1">
                                    <span>{t("fiscal_setup.readiness_unavailable_hint")}</span>
                                    {secondsToRetry != null && (
                                        <span className="text-xs text-[var(--ohnix-text-muted)]">
                                            {t("fiscal_setup.readiness_retry_countdown", { seconds: secondsToRetry })}
                                        </span>
                                    )}
                                </div>
                            }
                            action={
                                <Button size="small" icon={<ReloadOutlined />} loading={retrying} onClick={retryReadinessNow}>
                                    {t("fiscal_setup.readiness_retry_now")}
                                </Button>
                            }
                        />
                    )}
                    <RegisteredConfigSummary company={company} readiness={status.readiness} onCompanyChanged={onCompanyChanged} onResolutionsChanged={refresh} />
                    {showCertificateProviderSelector && (
                        // Two visual weights, same control: unresolved (override still
                        // null, silently defaulting to Viafirma) genuinely needs
                        // attention, so it gets the amber-tinted card + hint text.
                        // Once the owner has explicitly picked one, there's nothing
                        // left to decide - it shrinks to a quiet, neutral row so it
                        // doesn't keep reading as a warning every time this page loads.
                        <div
                            className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 transition-colors ${
                                override
                                    ? "border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)]"
                                    : "border-[var(--ohnix-status-amber)]/30 bg-[var(--ohnix-status-amber)]/5"
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <SafetyCertificateOutlined className={override ? "text-[var(--ohnix-text-dim)]" : "text-[var(--ohnix-status-amber)]"} />
                                <div>
                                    <Text className="block text-sm font-semibold text-[var(--ohnix-text-primary)]">
                                        {override ? t("fiscal_setup.certificate_provider_active_title") : t("fiscal_setup.certificate_provider_conflict_title")}
                                    </Text>
                                    {!override && (
                                        <Text className="block text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.certificate_provider_conflict_hint")}</Text>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-1 rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] p-1">
                                <button
                                    type="button"
                                    disabled={providerSwitchBusy}
                                    onClick={() => switchCertificateProvider("viafirma")}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                        effectiveProvider === "viafirma"
                                            ? "bg-[#29D8D5]/15 text-[#0f9e9c] shadow-[0_0_14px_rgba(41,216,213,0.15)]"
                                            : "text-[var(--ohnix-text-muted)] hover:text-[var(--ohnix-text-primary)]"
                                    }`}
                                >
                                    {t("fiscal_setup.certificate_provider_use_viafirma")}
                                </button>
                                <button
                                    type="button"
                                    disabled={providerSwitchBusy}
                                    onClick={() => switchCertificateProvider("firmapass")}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                        effectiveProvider === "firmapass"
                                            ? "bg-[#29D8D5]/15 text-[#0f9e9c] shadow-[0_0_14px_rgba(41,216,213,0.15)]"
                                            : "text-[var(--ohnix-text-muted)] hover:text-[var(--ohnix-text-primary)]"
                                    }`}
                                >
                                    {t("fiscal_setup.certificate_provider_use_firmapass")}
                                </button>
                            </div>
                        </div>
                    )}
                    {showViafirmaCard && (
                        <ViafirmaSelfService company={company} electronicInvoicingEnabled={Boolean(status.electronicInvoicingEnabled)} />
                    )}
                    {showFirmaPassCard && (
                        <FirmaPassSelfService
                            electronicInvoicingEnabled={Boolean(status.electronicInvoicingEnabled)}
                            electronicInvoicingAtRisk={Boolean(status.electronicInvoicingAtRisk)}
                            onActivated={onCompanyChanged}
                        />
                    )}
                    {status?.readiness?.certificateReady ? (
                        <>
                            {!hasResolution("05") && (
                                <NumberingResolutionForm
                                    documentType="05"
                                    titleKey="fiscal_setup.support_document_title"
                                    hintKey="fiscal_setup.support_document_hint"
                                    buttonKey="fiscal_setup.add_support_document_resolution"
                                    onAdded={refresh}
                                />
                            )}
                            {isSandbox && !hasResolution("91") && (
                                <NumberingResolutionForm
                                    documentType="91"
                                    titleKey="fiscal_setup.credit_note_resolution_title"
                                    hintKey="fiscal_setup.credit_note_resolution_hint"
                                    buttonKey="fiscal_setup.add_credit_note_resolution"
                                    autoAssignPrefix="NC"
                                    onAdded={refresh}
                                />
                            )}
                            {isSandbox && !hasResolution("92") && (
                                <NumberingResolutionForm
                                    documentType="92"
                                    titleKey="fiscal_setup.debit_note_resolution_title"
                                    hintKey="fiscal_setup.debit_note_resolution_hint"
                                    buttonKey="fiscal_setup.add_debit_note_resolution"
                                    autoAssignPrefix="ND"
                                    onAdded={refresh}
                                />
                            )}
                            {isSandbox && <DianHabilitacionPanel knownTestSetId={status?.itcycleTestSetId} />}
                        </>
                    ) : null /* Every one of these either sends a real document to
                        DIAN (habilitación tests) or configures numbering
                        for one that eventually will (documento soporte,
                        notes) - none of that is actionable without a
                        signed certificate to send it with (Viafirma,
                        FirmaPass, or a manually uploaded one - readiness
                        is provider-agnostic, see certificateReady's own
                        comment in admin.service.ts). Showing them earlier
                        just let someone configure/test something that
                        can't actually go anywhere yet - the paywall card
                        above (ViafirmaSelfService) already explains what's
                        needed, so this stays silent rather than repeating
                        that explanation in a second place. */}
                </>
            ) : otherProviderActive ? (
                <Alert
                    className="dark-alert dark-alert-purple"
                    type="info"
                    showIcon
                    message="Tu empresa ya factura electrónicamente"
                    description={`El administrador de Ohnix ya activó la facturación electrónica de tu empresa con ${getElectronicInvoicingProviderLabel(status.electronicInvoicingProvider)}. Si necesitas cambiar de proveedor, contacta a soporte.`}
                />
            ) : (
                <>
                    <div className="mb-8">
                        <div className="hidden items-start sm:flex">
                            {STEP_META.map((meta, index) => (
                                <div key={meta.title} className="flex flex-1 items-start last:flex-none">
                                    <div className="flex w-24 flex-col items-center gap-2 text-center">
                                        <div
                                            className={`flex h-11 w-11 items-center justify-center rounded-2xl border text-lg transition-all duration-300 ${
                                                index < step
                                                    ? "border-[#29D8D5]/50 bg-[#29D8D5]/15 text-[#44F3F0] shadow-[0_0_16px_rgba(41,216,213,0.3)]"
                                                    : index === step
                                                        ? "scale-110 border-transparent bg-gradient-to-br from-[#29D8D5] to-[#44F3F0] text-[#021314] shadow-[0_0_26px_rgba(41,216,213,0.5)]"
                                                        : "border-[var(--ohnix-line-5)] bg-[var(--ohnix-line-1)] text-[var(--ohnix-text-muted)]"
                                            }`}
                                        >
                                            {index < step ? <CheckCircleOutlined /> : meta.icon}
                                        </div>
                                        <div className={`text-[11px] font-bold uppercase tracking-wide leading-tight ${index <= step ? "text-[var(--ohnix-text-primary)]" : "text-[var(--ohnix-text-muted)]"}`}>
                                            {meta.title}
                                        </div>
                                    </div>
                                    {index < STEP_META.length - 1 && (
                                        <div className="relative top-[22px] mx-1 h-[2px] flex-1 overflow-hidden rounded-full bg-[var(--ohnix-line-4)]">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] transition-all duration-500"
                                                style={{ width: index < step ? "100%" : "0%" }}
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="sm:hidden">
                            <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-[var(--ohnix-text-muted)]">
                                <span>{t("fiscal_setup.step_progress", { current: step + 1, total: STEP_META.length })}</span>
                                <span className="text-[#44F3F0]">{Math.round(((step + 1) / STEP_META.length) * 100)}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-[var(--ohnix-line-3)]">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] transition-all duration-500"
                                    style={{ width: `${((step + 1) / STEP_META.length) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    <div key={step} className="mb-5 flex items-start gap-3 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 animate-fade-up">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#29D8D5]/30 bg-[#29D8D5]/10 text-lg text-[#44F3F0]">
                            {STEP_META[step].icon}
                        </div>
                        <div>
                            <div className="text-sm font-bold text-[var(--ohnix-text-primary)]">{STEP_META[step].title}</div>
                            <div className="text-xs text-[var(--ohnix-text-muted)]">{STEP_META[step].caption}</div>
                        </div>
                    </div>

                    <Form form={form} layout="vertical">
                        {/* All 4 steps stay mounted (toggled via `display`, not
                        conditional rendering) so form.validateFields() at final
                        submit can actually validate every field, not just the
                        currently visible step - see the comment in submit(). */}
                        <div style={{ display: step === 0 ? undefined : "none" }} className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                            <Form.Item
                                name="taxIdentification"
                                label={t("fiscal_setup.nit")}
                                extra={t("fiscal_setup.nit_hint")}
                                rules={[{ required: true, message: t("fiscal_setup.field_required") }, validatorRule(isValidNit, t("fiscal_setup.nit_invalid"))]}
                            >
                                <Input size="large" prefix={<IdcardOutlined className="text-[var(--ohnix-text-dim)]" />} className="auth-ohnix-input" />
                            </Form.Item>
                            <Form.Item
                                name="legalName"
                                label={t("fiscal_setup.legal_name")}
                                extra={t("fiscal_setup.legal_name_hint")}
                                rules={[{ required: true, whitespace: true, message: t("fiscal_setup.legal_name_invalid") }]}
                            >
                                <Input size="large" prefix={<BankOutlined className="text-[var(--ohnix-text-dim)]" />} className="auth-ohnix-input" />
                            </Form.Item>
                            <Form.Item
                                name="email"
                                label={t("fiscal_setup.billing_email")}
                                extra={t("fiscal_setup.billing_email_hint")}
                                rules={[{ type: "email", message: t("fiscal_setup.billing_email_invalid") }]}
                            >
                                <Input size="large" type="email" prefix={<MailOutlined className="text-[var(--ohnix-text-dim)]" />} className="auth-ohnix-input" />
                            </Form.Item>
                            {field("vatResponsible", t("fiscal_setup.vat_responsibility"), { required: true, hint: t("fiscal_setup.vat_responsibility_hint"), select: [{ value: "responsible", label: t("fiscal_setup.vat_responsible") }, { value: "not_responsible", label: t("fiscal_setup.vat_not_responsible") }] })}
                        </div>
                        <div style={{ display: step === 1 ? undefined : "none" }}>
                            <Alert
                                className="mb-4 dark-alert dark-alert-purple"
                                type="info"
                                showIcon
                                message={t("fiscal_setup.software_step_assisted_hint")}
                            />
                            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                                {/* Fixed to SANDBOX, not a real choice - the backend
                                (registerCompanyWithItcycle) force-overrides whatever a
                                self-service caller sends here anyway, since the DIAN
                                requires an approved set de pruebas de habilitación before
                                any company can go to PRODUCTION. That happens later, via
                                DianHabilitacionPanel + an Ohnix admin's own review, never
                                as a choice on this first registration step. */}
                                <Form.Item name="environment" label={t("fiscal_setup.environment")} tooltip={t("fiscal_setup.environment_hint")}>
                                    <Select size="large" disabled options={[{ value: "SANDBOX", label: t("fiscal_setup.environment_sandbox") }]} />
                                </Form.Item>
                                <Form.Item
                                    name="softwareId"
                                    label={t("fiscal_setup.software_id")}
                                    extra={t("fiscal_setup.software_id_hint")}
                                    rules={[{ required: true, message: t("fiscal_setup.field_required") }, validatorRule(isValidSoftwareId, t("fiscal_setup.software_id_invalid"))]}
                                >
                                    <Input size="large" prefix={<IdcardOutlined className="text-[var(--ohnix-text-dim)]" />} className="auth-ohnix-input" placeholder="deb9167c-e2f6-4796-9b4d-d102472e2397" />
                                </Form.Item>
                                <Form.Item
                                    name="softwarePin"
                                    label={t("fiscal_setup.software_pin")}
                                    extra={t("fiscal_setup.software_pin_hint")}
                                    rules={[{ required: true, whitespace: true, message: t("fiscal_setup.software_pin_invalid") }]}
                                >
                                    <Input size="large" type="password" prefix={<KeyOutlined className="text-[var(--ohnix-text-dim)]" />} className="auth-ohnix-input" />
                                </Form.Item>
                                <Form.Item
                                    name="technicalKey"
                                    label={t("fiscal_setup.technical_key")}
                                    extra={t("fiscal_setup.technical_key_hint")}
                                    rules={[{ required: true, message: t("fiscal_setup.field_required") }, validatorRule(isValidTechnicalKey, t("fiscal_setup.technical_key_invalid"))]}
                                >
                                    <Input size="large" type="password" prefix={<KeyOutlined className="text-[var(--ohnix-text-dim)]" />} className="auth-ohnix-input" />
                                </Form.Item>
                            </div>
                        </div>
                        <div style={{ display: step === 2 ? undefined : "none" }} className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                            {field("street", t("fiscal_setup.address"), { required: true, icon: <EnvironmentOutlined className="text-[var(--ohnix-text-dim)]" />, hint: t("fiscal_setup.address_hint") })}
                            <Form.Item
                                name="departmentCode"
                                label={t("fiscal_setup.department")}
                                extra={t("fiscal_setup.department_hint")}
                                rules={[{ required: true, message: t("fiscal_setup.field_required") }]}
                            >
                                <Select
                                    size="large"
                                    showSearch
                                    optionFilterProp="label"
                                    options={COLOMBIA_DEPARTMENTS.map((d) => ({ value: d.code, label: `${d.name} (${d.code})` }))}
                                    onChange={() => form.validateFields(["cityCode"]).catch(() => {})}
                                />
                            </Form.Item>
                            {field("cityName", t("fiscal_setup.city_name"), { required: true, hint: t("fiscal_setup.city_name_hint") })}
                            <Form.Item
                                name="cityCode"
                                label={t("fiscal_setup.city_code")}
                                extra={t("fiscal_setup.city_code_hint")}
                                dependencies={["departmentCode"]}
                                rules={[
                                    { required: true, message: t("fiscal_setup.field_required") },
                                    {
                                        validator: (_, value) => {
                                            const departmentCode = form.getFieldValue("departmentCode");
                                            if (!value || !departmentCode) return Promise.resolve();
                                            if (!/^\d{5}$/.test(value)) return Promise.reject(new Error(t("fiscal_setup.city_code_invalid")));
                                            if (!value.startsWith(departmentCode)) return Promise.reject(new Error(t("fiscal_setup.city_code_mismatch")));
                                            return Promise.resolve();
                                        },
                                    },
                                ]}
                            >
                                <Input size="large" className="auth-ohnix-input" placeholder="11001" />
                            </Form.Item>
                            {field("postalZone", t("fiscal_setup.postal_code"), { required: true, hint: t("fiscal_setup.postal_code_hint") })}
                        </div>
                        <div style={{ display: step === 3 ? undefined : "none" }} className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                            {field("documentType", t("fiscal_setup.document_type"), { required: true, hint: t("fiscal_setup.document_type_hint"), select: [{ value: "01", label: t("fiscal_setup.document_type_invoice") }, { value: "05", label: t("fiscal_setup.document_type_support") }] })}
                            <Form.Item
                                name="prefix"
                                label={t("fiscal_setup.prefix")}
                                tooltip={t("fiscal_setup.prefix_hint")}
                                rules={[{ required: true, message: t("fiscal_setup.field_required") }, validatorRule(isValidPrefix, t("fiscal_setup.prefix_invalid"))]}
                            >
                                <Input size="large" maxLength={4} className="auth-ohnix-input" />
                            </Form.Item>
                            <Form.Item name="resolutionNumber" label={t("fiscal_setup.resolution_number")} tooltip={t("fiscal_setup.resolution_number_hint")} rules={[{ required: true, whitespace: true, message: t("fiscal_setup.field_required") }]}>
                                <Input size="large" className="auth-ohnix-input" />
                            </Form.Item>
                            <Form.Item name="startNumber" label={t("fiscal_setup.start_number")} tooltip={t("fiscal_setup.number_range_hint")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                                <Input size="large" type="number" min={1} className="auth-ohnix-input" />
                            </Form.Item>
                            <Form.Item
                                name="endNumber"
                                label={t("fiscal_setup.end_number")}
                                dependencies={["startNumber"]}
                                rules={[
                                    { required: true, message: t("fiscal_setup.field_required") },
                                    {
                                        validator: (_, value) => {
                                            const startNumber = form.getFieldValue("startNumber");
                                            if (!value || !startNumber) return Promise.resolve();
                                            return Number(value) > Number(startNumber) ? Promise.resolve() : Promise.reject(new Error(t("fiscal_setup.number_range_invalid")));
                                        },
                                    },
                                ]}
                            >
                                <Input size="large" type="number" min={1} className="auth-ohnix-input" />
                            </Form.Item>
                            <Form.Item name="startDate" label={t("fiscal_setup.start_date")} tooltip={t("fiscal_setup.validity_dates_hint")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}><DatePicker size="large" className="w-full" /></Form.Item>
                            <Form.Item
                                name="endDate"
                                label={t("fiscal_setup.end_date")}
                                dependencies={["startDate"]}
                                rules={[
                                    { required: true, message: t("fiscal_setup.field_required") },
                                    {
                                        validator: (_, value) => {
                                            const startDate = form.getFieldValue("startDate");
                                            if (!value || !startDate) return Promise.resolve();
                                            return value.isAfter(startDate) ? Promise.resolve() : Promise.reject(new Error(t("fiscal_setup.date_range_invalid")));
                                        },
                                    },
                                ]}
                            >
                                <DatePicker size="large" className="w-full" />
                            </Form.Item>
                        </div>
                    </Form>
                    <div className="mt-6 flex justify-between border-t border-[var(--ohnix-line-4)] pt-5">
                        <Button icon={<ArrowLeftOutlined />} onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>{t("fiscal_setup.back")}</Button>
                        {step < 3
                            ? <Button type="primary" iconPosition="end" icon={<ArrowRightOutlined />} className="hover:shadow-[0_0_26px_rgba(41,216,213,0.22)]" onClick={next}>{t("fiscal_setup.continue")}</Button>
                            : <Button type="primary" icon={<RocketOutlined />} className="hover:shadow-[0_0_26px_rgba(41,216,213,0.22)]" loading={saving} onClick={submit}>{t("fiscal_setup.submit")}</Button>}
                    </div>
                </>
            )}
        </Card>
    );
};

export default ElectronicInvoicingSettings;
