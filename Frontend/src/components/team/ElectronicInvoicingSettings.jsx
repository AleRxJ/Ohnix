/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import { Alert, Button, Card, DatePicker, Form, Input, Select, Tag, Tooltip, Typography } from "antd";
import {
    ArrowLeftOutlined,
    ArrowRightOutlined,
    BankOutlined,
    CheckCircleOutlined,
    EnvironmentOutlined,
    FileProtectOutlined,
    IdcardOutlined,
    KeyOutlined,
    LockOutlined,
    MailOutlined,
    PlusOutlined,
    RocketOutlined,
    SafetyCertificateOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { companyService } from "../../services/companyService";
import { getElectronicInvoicingProviderLabel } from "../../utils/electronicInvoicingProvider";
import { COLOMBIA_DEPARTMENTS, findDepartmentName } from "../../constants/colombiaDivipola";
import { resolveApiErrorMessage } from "../../utils/apiError";
import { isValidNit, isValidPrefix, isValidSoftwareId, isValidTechnicalKey } from "../../utils/dianValidation";
import FirmaPassSelfService from "./FirmaPassSelfService";

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

// Documento Soporte (DIAN type "05") needs its own numbering resolution,
// separate from the invoice ("01") one the wizard below registers - see
// Backend/services/purchaseSupportDocument.service.js. Without it,
// issueSupportDocumentForPurchase fails silently (fire-and-forget) the
// first time a purchase from a not-obligated-to-invoice supplier completes,
// so this is offered right alongside FirmaPass, not buried elsewhere.
const SupportDocumentResolution = ({ onAdded }) => {
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
                documentType: "05",
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
                    <Title level={5} className="m-0 text-[var(--ohnix-text-primary)]">{t("fiscal_setup.support_document_title")}</Title>
                    <Text className="text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.support_document_hint")}</Text>
                </div>
            </div>
            <Form form={form} layout="vertical" className="mt-4">
                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    <Form.Item
                        name="prefix"
                        label={t("fiscal_setup.prefix")}
                        extra={t("fiscal_setup.prefix_hint")}
                        rules={[{ required: true, message: t("fiscal_setup.field_required") }, validatorRule(isValidPrefix, t("fiscal_setup.prefix_invalid"))]}
                    >
                        <Input size="large" maxLength={4} className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="resolutionNumber" label={t("fiscal_setup.resolution_number")} extra={t("fiscal_setup.resolution_number_hint")} rules={[{ required: true, whitespace: true, message: t("fiscal_setup.field_required") }]}>
                        <Input size="large" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="startNumber" label={t("fiscal_setup.start_number")} extra={t("fiscal_setup.number_range_hint")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
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
                    <Form.Item name="startDate" label={t("fiscal_setup.start_date")} extra={t("fiscal_setup.validity_dates_hint")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
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
                    {t("fiscal_setup.add_support_document_resolution")}
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
const RegisteredConfigSummary = ({ company, readiness, onCompanyChanged }) => {
    const { t } = useI18n();
    const [vatResponsible, setVatResponsible] = useState(company?.vatResponsible === "unset" ? undefined : company?.vatResponsible);
    const [savingVat, setSavingVat] = useState(false);

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

    const resolutions = readiness?.resolutions || [];
    const documentTypeLabel = (documentType) => {
        if (documentType === "01") return t("fiscal_setup.document_type_invoice");
        if (documentType === "05") return t("fiscal_setup.document_type_support");
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
                        <Tooltip title={t("fiscal_setup.config_locked_hint")}>
                            <LockOutlined className="text-xs text-[var(--ohnix-text-muted)]" />
                        </Tooltip>
                    </div>
                </div>
                <div>
                    <Text className="block text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.config_software_id")}</Text>
                    <div className="flex items-center gap-2">
                        <Text className="text-sm font-medium text-[var(--ohnix-text-primary)]">{company?.dianSoftwareId || "-"}</Text>
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
                                    <th className="pb-2 font-medium">{t("fiscal_setup.resolutions_col_status")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {resolutions.map((resolution) => (
                                    <tr key={resolution.id} className="border-t border-[var(--ohnix-line-4)]">
                                        <td className="py-2 pr-3 text-[var(--ohnix-text-primary)]">{documentTypeLabel(resolution.documentType)}</td>
                                        <td className="py-2 pr-3 text-[var(--ohnix-text-primary)]">{resolution.prefix}</td>
                                        <td className="py-2 pr-3 text-[var(--ohnix-text-primary)]">{resolution.resolutionNumber}</td>
                                        <td className="py-2 pr-3 text-[var(--ohnix-text-primary)]">
                                            {new Date(resolution.startDate).toLocaleDateString()} – {new Date(resolution.endDate).toLocaleDateString()}
                                        </td>
                                        <td className="py-2">
                                            <Tag color={resolution.isCurrent ? "green" : "default"}>
                                                {resolution.isCurrent ? t("fiscal_setup.resolutions_current") : t("fiscal_setup.resolutions_not_current")}
                                            </Tag>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
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
    // Generated once per mount, not per click - the idempotency middleware
    // replays the cached response for a repeated key, which only protects a
    // real retry (network timeout, a double-click, a lost response after the
    // server actually finished) if the SAME key is reused. A fresh
    // crypto.randomUUID() on every submit would make each retry look like a
    // brand-new request and could double-post the numbering resolution.
    const [registerIdempotencyKey] = useState(() => crypto.randomUUID());

    const refresh = async () => {
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
        <Form.Item name={name} label={label} extra={options.hint} rules={options.required ? [{ required: true, message: t("fiscal_setup.field_required") }] : []}>
            {options.select
                ? <Select size="large" options={options.select} />
                : <Input size="large" type={options.type} prefix={options.icon} className="auth-ohnix-input" />}
        </Form.Item>
    );

    const hasSupportDocumentResolution = (status?.readiness?.resolutions || []).some((r) => r.documentType === "05" && r.isCurrent);

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
                        <Alert className="mt-3 dark-alert dark-alert-amber" type="warning" showIcon message={t("fiscal_setup.readiness_unavailable")} description={t("fiscal_setup.readiness_unavailable_hint")} />
                    )}
                    <RegisteredConfigSummary company={company} readiness={status.readiness} onCompanyChanged={onCompanyChanged} />
                    <FirmaPassSelfService
                        electronicInvoicingEnabled={Boolean(status.electronicInvoicingEnabled)}
                        electronicInvoicingAtRisk={Boolean(status.electronicInvoicingAtRisk)}
                        onActivated={onCompanyChanged}
                    />
                    {!hasSupportDocumentResolution && <SupportDocumentResolution onAdded={refresh} />}
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
                                {field("environment", t("fiscal_setup.environment"), { required: true, hint: t("fiscal_setup.environment_hint"), select: [{ value: "SANDBOX", label: t("fiscal_setup.environment_sandbox") }, { value: "PRODUCTION", label: t("fiscal_setup.environment_production") }] })}
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
                                extra={t("fiscal_setup.prefix_hint")}
                                rules={[{ required: true, message: t("fiscal_setup.field_required") }, validatorRule(isValidPrefix, t("fiscal_setup.prefix_invalid"))]}
                            >
                                <Input size="large" maxLength={4} className="auth-ohnix-input" />
                            </Form.Item>
                            <Form.Item name="resolutionNumber" label={t("fiscal_setup.resolution_number")} extra={t("fiscal_setup.resolution_number_hint")} rules={[{ required: true, whitespace: true, message: t("fiscal_setup.field_required") }]}>
                                <Input size="large" className="auth-ohnix-input" />
                            </Form.Item>
                            <Form.Item name="startNumber" label={t("fiscal_setup.start_number")} extra={t("fiscal_setup.number_range_hint")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
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
                            <Form.Item name="startDate" label={t("fiscal_setup.start_date")} extra={t("fiscal_setup.validity_dates_hint")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}><DatePicker size="large" className="w-full" /></Form.Item>
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
