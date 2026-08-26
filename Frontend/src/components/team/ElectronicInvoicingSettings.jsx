/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import { Alert, Button, Card, DatePicker, Form, Input, Select, Typography } from "antd";
import {
    ArrowLeftOutlined,
    ArrowRightOutlined,
    BankOutlined,
    CheckCircleOutlined,
    EnvironmentOutlined,
    FileProtectOutlined,
    IdcardOutlined,
    KeyOutlined,
    MailOutlined,
    PlusOutlined,
    RocketOutlined,
    SafetyCertificateOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { companyService } from "../../services/companyService";
import { COLOMBIA_DEPARTMENTS, findDepartmentName } from "../../constants/colombiaDivipola";
import { resolveApiErrorMessage } from "../../utils/apiError";
import FirmaPassSelfService from "./FirmaPassSelfService";

const { Text, Title } = Typography;
// ensureElectronicInvoicingPlan (Backend/services/electronicInvoicing.service.js)
// throws an English dev-facing message by design - this flow is entirely in
// Spanish, so every self-service catch translates this code instead of
// showing the raw message.
const PLAN_GATE_CODE_MESSAGES = { electronic_invoicing_plan_required: "fiscal_setup.plan_required" };
const stepFields = [
    ["taxIdentification", "legalName", "vatResponsible"],
    ["softwareId", "softwarePin", "technicalKey"],
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
                    <Form.Item name="prefix" label={t("fiscal_setup.prefix")} extra={t("fiscal_setup.prefix_hint")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                        <Input size="large" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="resolutionNumber" label={t("fiscal_setup.resolution_number")} extra={t("fiscal_setup.resolution_number_hint")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                        <Input size="large" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="startNumber" label={t("fiscal_setup.start_number")} extra={t("fiscal_setup.number_range_hint")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                        <Input size="large" type="number" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="endNumber" label={t("fiscal_setup.end_number")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                        <Input size="large" type="number" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="startDate" label={t("fiscal_setup.start_date")} extra={t("fiscal_setup.validity_dates_hint")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                        <DatePicker size="large" className="w-full" />
                    </Form.Item>
                    <Form.Item name="endDate" label={t("fiscal_setup.end_date")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
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
            await form.validateFields();
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
                dianConfiguration: {
                    environment: value.environment,
                    softwareId: value.softwareId,
                    softwarePin: value.softwarePin,
                    technicalKey: value.technicalKey,
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
        ? { color: "#44F3F0", border: "rgba(68,243,240,0.45)", dot: "status-dot--accepted" }
        : { color: "#FFCF70", border: "rgba(245,158,11,0.45)", dot: "status-dot--draft" };
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
                        style={{ color: statusTone.color, background: "rgba(6,10,10,0.4)", border: `1px solid ${statusTone.border}` }}
                    >
                        <span className={`status-dot ${statusTone.dot}`} />
                        {statusLabel}
                    </span>
                </div>
            </div>

            {status?.provisioned ? (
                <>
                    <Alert
                        type={status.electronicInvoicingEnabled ? "success" : "info"}
                        showIcon
                        message={status.electronicInvoicingEnabled ? t("fiscal_setup.status_active") : t("fiscal_setup.status_dian_complete")}
                        description={status.electronicInvoicingEnabled ? t("fiscal_setup.status_active_hint") : t("fiscal_setup.status_pending_hint")}
                    />
                    {status.readinessError && (
                        <Alert className="mt-3" type="warning" showIcon message={t("fiscal_setup.readiness_unavailable")} description={t("fiscal_setup.readiness_unavailable_hint")} />
                    )}
                    <FirmaPassSelfService electronicInvoicingEnabled={Boolean(status.electronicInvoicingEnabled)} onActivated={onCompanyChanged} />
                    {!hasSupportDocumentResolution && <SupportDocumentResolution onAdded={refresh} />}
                </>
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
                        {step === 0 && <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 animate-fade-up">
                            {field("taxIdentification", t("fiscal_setup.nit"), { required: true, icon: <IdcardOutlined className="text-[var(--ohnix-text-dim)]" />, hint: t("fiscal_setup.nit_hint") })}
                            {field("legalName", t("fiscal_setup.legal_name"), { required: true, icon: <BankOutlined className="text-[var(--ohnix-text-dim)]" />, hint: t("fiscal_setup.legal_name_hint") })}
                            {field("email", t("fiscal_setup.billing_email"), { type: "email", icon: <MailOutlined className="text-[var(--ohnix-text-dim)]" />, hint: t("fiscal_setup.billing_email_hint") })}
                            {field("vatResponsible", t("fiscal_setup.vat_responsibility"), { required: true, hint: t("fiscal_setup.vat_responsibility_hint"), select: [{ value: "responsible", label: t("fiscal_setup.vat_responsible") }, { value: "not_responsible", label: t("fiscal_setup.vat_not_responsible") }] })}
                        </div>}
                        {step === 1 && <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 animate-fade-up">
                            {field("environment", t("fiscal_setup.environment"), { required: true, hint: t("fiscal_setup.environment_hint"), select: [{ value: "SANDBOX", label: t("fiscal_setup.environment_sandbox") }, { value: "PRODUCTION", label: t("fiscal_setup.environment_production") }] })}
                            {field("softwareId", t("fiscal_setup.software_id"), { required: true, icon: <IdcardOutlined className="text-[var(--ohnix-text-dim)]" />, hint: t("fiscal_setup.software_id_hint") })}
                            {field("softwarePin", t("fiscal_setup.software_pin"), { required: true, type: "password", icon: <KeyOutlined className="text-[var(--ohnix-text-dim)]" />, hint: t("fiscal_setup.software_pin_hint") })}
                            {field("technicalKey", t("fiscal_setup.technical_key"), { required: true, type: "password", icon: <KeyOutlined className="text-[var(--ohnix-text-dim)]" />, hint: t("fiscal_setup.technical_key_hint") })}
                        </div>}
                        {step === 2 && <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 animate-fade-up">
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
                        </div>}
                        {step === 3 && <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 animate-fade-up">
                            {field("documentType", t("fiscal_setup.document_type"), { required: true, hint: t("fiscal_setup.document_type_hint"), select: [{ value: "01", label: t("fiscal_setup.document_type_invoice") }, { value: "05", label: t("fiscal_setup.document_type_support") }] })}
                            {field("prefix", t("fiscal_setup.prefix"), { required: true, hint: t("fiscal_setup.prefix_hint") })}{field("resolutionNumber", t("fiscal_setup.resolution_number"), { required: true, hint: t("fiscal_setup.resolution_number_hint") })}
                            {field("startNumber", t("fiscal_setup.start_number"), { required: true, type: "number", hint: t("fiscal_setup.number_range_hint") })}{field("endNumber", t("fiscal_setup.end_number"), { required: true, type: "number" })}
                            <Form.Item name="startDate" label={t("fiscal_setup.start_date")} extra={t("fiscal_setup.validity_dates_hint")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}><DatePicker size="large" className="w-full" /></Form.Item>
                            <Form.Item name="endDate" label={t("fiscal_setup.end_date")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}><DatePicker size="large" className="w-full" /></Form.Item>
                        </div>}
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
