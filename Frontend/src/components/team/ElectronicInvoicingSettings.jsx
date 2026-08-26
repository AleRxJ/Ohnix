/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import { Alert, Button, Card, DatePicker, Form, Input, Select, Steps, Tag, Typography } from "antd";
import { CheckCircleOutlined, PlusOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { companyService } from "../../services/companyService";
import FirmaPassSelfService from "./FirmaPassSelfService";

const { Text, Title } = Typography;
const stepFields = [
    ["taxIdentification", "legalName", "vatResponsible"],
    ["softwareId", "softwarePin", "technicalKey"],
    ["street", "cityCode", "cityName", "departmentCode", "departmentName", "postalZone"],
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
            });
            toast.success(t("fiscal_setup.add_resolution_success"));
            form.resetFields();
            onAdded?.();
        } catch (error) {
            if (!error?.errorFields) toast.error(error?.response?.data?.message || t("fiscal_setup.add_resolution_error"));
        } finally {
            setAdding(false);
        }
    };

    return (
        <Card className="mt-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)]">
            <Title level={5} className="m-0 text-[var(--ohnix-text-primary)]">{t("fiscal_setup.support_document_title")}</Title>
            <Text className="text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.support_document_hint")}</Text>
            <Form form={form} layout="vertical" className="mt-4">
                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    <Form.Item name="prefix" label={t("fiscal_setup.prefix")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                        <Input size="large" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="resolutionNumber" label={t("fiscal_setup.resolution_number")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                        <Input size="large" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="startNumber" label={t("fiscal_setup.start_number")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                        <Input size="large" type="number" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="endNumber" label={t("fiscal_setup.end_number")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                        <Input size="large" type="number" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="startDate" label={t("fiscal_setup.start_date")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                        <DatePicker size="large" className="w-full" />
                    </Form.Item>
                    <Form.Item name="endDate" label={t("fiscal_setup.end_date")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}>
                        <DatePicker size="large" className="w-full" />
                    </Form.Item>
                </div>
                <Button type="primary" icon={<PlusOutlined />} loading={adding} onClick={submit}>
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

    const refresh = async () => {
        try {
            const response = await companyService.getMyItcycleStatus();
            setStatus(response?.data || { provisioned: false });
        } catch (error) {
            // 422 just means "no company yet" (getOwnedCompanyOrThrow) - not a real error to surface.
            if (error?.response?.status !== 422) toast.error(error?.response?.data?.message || t("fiscal_setup.status_load_error"));
            setStatus({ provisioned: false });
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
                            address: { street: value.street, cityCode: value.cityCode, cityName: value.cityName, departmentCode: value.departmentCode, departmentName: value.departmentName, countryCode: "CO", postalZone: value.postalZone },
                        },
                        address: { street: value.street, cityCode: value.cityCode, cityName: value.cityName, departmentCode: value.departmentCode, departmentName: value.departmentName, countryCode: "CO", postalZone: value.postalZone },
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
            }, crypto.randomUUID());
            onCompanyChanged?.(entity);
            await refresh();
            toast.success(t("fiscal_setup.submit_success"));
        } catch (error) {
            if (!error?.errorFields) toast.error(error?.response?.data?.message || t("fiscal_setup.submit_error"));
        } finally {
            setSaving(false);
        }
    };

    const field = (name, label, options = {}) => (
        <Form.Item name={name} label={label} rules={options.required ? [{ required: true, message: t("fiscal_setup.field_required") }] : []}>
            {options.select ? <Select size="large" options={options.select} /> : <Input size="large" type={options.type} className="auth-ohnix-input" />}
        </Form.Item>
    );

    const hasSupportDocumentResolution = (status?.readiness?.resolutions || []).some((r) => r.documentType === "05" && r.isCurrent);

    return (
        <Card loading={loading} className="overflow-hidden rounded-3xl border border-cyan-400/20 bg-[var(--ohnix-hover-overlay)] text-[var(--ohnix-text-primary)]">
            <div className="-m-6 mb-6 bg-gradient-to-r from-cyan-500/15 via-indigo-500/10 to-transparent p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex gap-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/15 text-xl text-cyan-300"><SafetyCertificateOutlined /></div>
                        <div>
                            <Title level={4} className="m-0 text-[var(--ohnix-text-primary)]">{t("fiscal_setup.title")}</Title>
                            <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("fiscal_setup.subtitle")}</Text>
                        </div>
                    </div>
                    <Tag color={status?.provisioned ? "success" : "processing"} icon={status?.provisioned ? <CheckCircleOutlined /> : undefined}>
                        {status?.provisioned ? t("fiscal_setup.status_ready") : t("fiscal_setup.status_pending")}
                    </Tag>
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
                    <FirmaPassSelfService electronicInvoicingEnabled={Boolean(status.electronicInvoicingEnabled)} onActivated={onCompanyChanged} />
                    {!hasSupportDocumentResolution && <SupportDocumentResolution onAdded={refresh} />}
                </>
            ) : (
                <>
                    <Steps
                        current={step}
                        responsive
                        className="mb-8"
                        items={[
                            t("fiscal_setup.step_company"),
                            t("fiscal_setup.step_software"),
                            t("fiscal_setup.step_address"),
                            t("fiscal_setup.step_resolution"),
                        ].map((title) => ({ title }))}
                    />
                    <Form form={form} layout="vertical">
                        {step === 0 && <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                            {field("taxIdentification", t("fiscal_setup.nit"), { required: true })}
                            {field("legalName", t("fiscal_setup.legal_name"), { required: true })}
                            {field("email", t("fiscal_setup.billing_email"), { type: "email" })}
                            {field("vatResponsible", t("fiscal_setup.vat_responsibility"), { required: true, select: [{ value: "responsible", label: t("fiscal_setup.vat_responsible") }, { value: "not_responsible", label: t("fiscal_setup.vat_not_responsible") }] })}
                        </div>}
                        {step === 1 && <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                            {field("environment", t("fiscal_setup.environment"), { required: true, select: [{ value: "SANDBOX", label: t("fiscal_setup.environment_sandbox") }, { value: "PRODUCTION", label: t("fiscal_setup.environment_production") }] })}
                            {field("softwareId", t("fiscal_setup.software_id"), { required: true })}
                            {field("softwarePin", t("fiscal_setup.software_pin"), { required: true, type: "password" })}
                            {field("technicalKey", t("fiscal_setup.technical_key"), { required: true, type: "password" })}
                        </div>}
                        {step === 2 && <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                            {field("street", t("fiscal_setup.address"), { required: true })}{field("cityCode", t("fiscal_setup.city_code"), { required: true })}
                            {field("cityName", t("fiscal_setup.city_name"), { required: true })}{field("departmentCode", t("fiscal_setup.department_code"), { required: true })}
                            {field("departmentName", t("fiscal_setup.department_name"), { required: true })}{field("postalZone", t("fiscal_setup.postal_code"), { required: true })}
                        </div>}
                        {step === 3 && <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                            {field("documentType", t("fiscal_setup.document_type"), { required: true, select: [{ value: "01", label: t("fiscal_setup.document_type_invoice") }, { value: "05", label: t("fiscal_setup.document_type_support") }] })}
                            {field("prefix", t("fiscal_setup.prefix"), { required: true })}{field("resolutionNumber", t("fiscal_setup.resolution_number"), { required: true })}
                            {field("startNumber", t("fiscal_setup.start_number"), { required: true, type: "number" })}{field("endNumber", t("fiscal_setup.end_number"), { required: true, type: "number" })}
                            <Form.Item name="startDate" label={t("fiscal_setup.start_date")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}><DatePicker size="large" className="w-full" /></Form.Item>
                            <Form.Item name="endDate" label={t("fiscal_setup.end_date")} rules={[{ required: true, message: t("fiscal_setup.field_required") }]}><DatePicker size="large" className="w-full" /></Form.Item>
                        </div>}
                    </Form>
                    <div className="mt-6 flex justify-between border-t border-[var(--ohnix-line-4)] pt-5">
                        <Button onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>{t("fiscal_setup.back")}</Button>
                        {step < 3
                            ? <Button type="primary" onClick={next}>{t("fiscal_setup.continue")}</Button>
                            : <Button type="primary" loading={saving} onClick={submit}>{t("fiscal_setup.submit")}</Button>}
                    </div>
                </>
            )}
        </Card>
    );
};

export default ElectronicInvoicingSettings;
