import { useEffect, useState } from "react";
import { Alert, Button, Card, DatePicker, Form, Input, Select, Steps, Tag, Typography } from "antd";
import { CheckCircleOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import { companyService } from "../../services/companyService";
import FirmaPassSelfService from "./FirmaPassSelfService";

const { Text, Title } = Typography;
const stepFields = [
    ["taxIdentification", "legalName", "vatResponsible"],
    ["softwareId", "softwarePin", "technicalKey"],
    ["street", "cityCode", "cityName", "departmentCode", "departmentName", "postalZone"],
    ["prefix", "resolutionNumber", "startNumber", "endNumber", "startDate", "endDate"],
];

const ElectronicInvoicingSettings = ({ company, onCompanyChanged }) => {
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
            if (error?.response?.status !== 422) toast.error(error?.response?.data?.message || "No fue posible consultar el estado.");
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
    }, [company?.id]);

    const next = async () => {
        try {
            await form.validateFields(stepFields[step]);
            setStep((current) => Math.min(current + 1, stepFields.length - 1));
        } catch {}
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
                        fiscalResponsibilities: ["O-13"],
                        taxInfo: {
                            registrationName: entity?.legalName || entity?.name,
                            companyId: { number: entity?.taxIdentification, type: "31", dv: entity?.taxIdentificationDv },
                            taxLevelCode: "O-13",
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
            toast.success("Tu empresa qued\u00f3 lista para facturar.");
        } catch (error) {
            if (!error?.errorFields) toast.error(error?.response?.data?.message || "No fue posible guardar la configuraci\u00f3n.");
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
        <Form.Item name={name} label={label} rules={options.required ? [{ required: true, message: "Este dato es obligatorio" }] : []}>
            {options.select ? <Select size="large" options={options.select} /> : <Input size="large" type={options.type} className="auth-ohnix-input" />}
        </Form.Item>
    );

    return (
        <Card loading={loading} className="overflow-hidden rounded-3xl border border-cyan-400/20 bg-[var(--ohnix-hover-overlay)] text-[var(--ohnix-text-primary)]">
            <div className="-m-6 mb-6 bg-gradient-to-r from-cyan-500/15 via-indigo-500/10 to-transparent p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex gap-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/15 text-xl text-cyan-300"><SafetyCertificateOutlined /></div>
                        <div>
                            <Title level={4} className="m-0 text-[var(--ohnix-text-primary)]">{"Facturaci\u00f3n electr\u00f3nica"}</Title>
                            <Text className="text-sm text-[var(--ohnix-text-muted)]">Un asistente guiado para dejar tu empresa lista ante la DIAN.</Text>
                        </div>
                    </div>
                    <Tag color={status?.provisioned ? "success" : "processing"} icon={status?.provisioned ? <CheckCircleOutlined /> : undefined}>{status?.provisioned ? "Lista para facturar" : "Configuraci\u00f3n pendiente"}</Tag>
                </div>
            </div>

            {status?.provisioned ? (
                <>
                    <Alert type={status.electronicInvoicingEnabled ? "success" : "info"} showIcon message={status.electronicInvoicingEnabled ? "Facturaci\u00f3n electr\u00f3nica activa" : "Configuraci\u00f3n DIAN completada"} description={status.electronicInvoicingEnabled ? "Ya puedes emitir documentos electr\u00f3nicos desde Ohnix." : "Completa el certificado digital para activar la emisi\u00f3n."} />
                    <FirmaPassSelfService electronicInvoicingEnabled={Boolean(status.electronicInvoicingEnabled)} onActivated={onCompanyChanged} />
                </>
            ) : otherProviderActive ? (
                <Alert
                    type="info"
                    showIcon
                    message="Tu empresa ya factura electrónicamente"
                    description={`El administrador de Ohnix ya activó la facturación electrónica de tu empresa con ${status.electronicInvoicingProvider === "factus" ? "Factus" : "Alanube"}. Si necesitas cambiar de proveedor, contacta a soporte.`}
                />
            ) : (
                <>
                    <Steps current={step} responsive className="mb-8" items={["Empresa", "Software DIAN", "Direcci\u00f3n", "Resoluci\u00f3n"].map((title) => ({ title }))} />
                    <Form form={form} layout="vertical">
                        {step === 0 && <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                            {field("taxIdentification", "NIT", { required: true })}
                            {field("legalName", "Raz\u00f3n social", { required: true })}
                            {field("email", "Correo de facturaci\u00f3n", { type: "email" })}
                            {field("vatResponsible", "Responsabilidad de IVA", { required: true, select: [{ value: "responsible", label: "Responsable de IVA" }, { value: "not_responsible", label: "No responsable de IVA" }] })}
                        </div>}
                        {step === 1 && <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                            {field("environment", "Ambiente", { required: true, select: [{ value: "SANDBOX", label: "Pruebas" }, { value: "PRODUCTION", label: "Producci\u00f3n" }] })}
                            {field("softwareId", "ID de software DIAN", { required: true })}
                            {field("softwarePin", "PIN de software", { required: true, type: "password" })}
                            {field("technicalKey", "Clave t\u00e9cnica", { required: true, type: "password" })}
                        </div>}
                        {step === 2 && <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                            {field("street", "Direcci\u00f3n", { required: true })}{field("cityCode", "C\u00f3digo de municipio", { required: true })}
                            {field("cityName", "Municipio", { required: true })}{field("departmentCode", "C\u00f3digo de departamento", { required: true })}
                            {field("departmentName", "Departamento", { required: true })}{field("postalZone", "C\u00f3digo postal", { required: true })}
                        </div>}
                        {step === 3 && <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                            {field("documentType", "Documento", { required: true, select: [{ value: "01", label: "Factura electr\u00f3nica" }, { value: "05", label: "Documento soporte" }] })}
                            {field("prefix", "Prefijo", { required: true })}{field("resolutionNumber", "N\u00famero de resoluci\u00f3n", { required: true })}
                            {field("startNumber", "N\u00famero inicial", { required: true, type: "number" })}{field("endNumber", "N\u00famero final", { required: true, type: "number" })}
                            <Form.Item name="startDate" label="Fecha inicial" rules={[{ required: true, message: "Este dato es obligatorio" }]}><DatePicker size="large" className="w-full" /></Form.Item>
                            <Form.Item name="endDate" label="Fecha final" rules={[{ required: true, message: "Este dato es obligatorio" }]}><DatePicker size="large" className="w-full" /></Form.Item>
                        </div>}
                    </Form>
                    <div className="mt-6 flex justify-between border-t border-[var(--ohnix-line-4)] pt-5">
                        <Button onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>Atr\u00e1s</Button>
                        {step < 3 ? <Button type="primary" onClick={next}>Continuar</Button> : <Button type="primary" loading={saving} onClick={submit}>Configurar mi empresa</Button>}
                    </div>
                </>
            )}
        </Card>
    );
};

export default ElectronicInvoicingSettings;
