/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import { Alert, Button, Card, Input, Space, Tag, Upload } from "antd";
import { CheckCircleOutlined, ReloadOutlined, UploadOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import { companyService } from "../../services/companyService";

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
            if (!silent) toast.error(error?.response?.data?.message || "No fue posible consultar FirmaPass.");
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
            toast.error(error?.response?.data?.message || "No fue posible completar el paso.");
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
                    <h3 className="m-0 text-base font-semibold text-[var(--ohnix-text-primary)]">Certificado con FirmaPass</h3>
                    <p className="mb-0 mt-1 text-xs text-[var(--ohnix-text-muted)]">Tu empresa controla su llave, documentos y validación. Ohnix no los muestra ni los conserva en el navegador.</p>
                </div>
                <Tag color={activeCertificate ? "green" : "default"} icon={activeCertificate ? <CheckCircleOutlined /> : undefined}>
                    {activeCertificate ? "Certificado activo" : "Pendiente"}
                </Tag>
            </div>

            {!electronicInvoicingEnabled && activeCertificate && (
                <Alert className="mt-4" type="success" showIcon message="Tu certificado está listo" description="Activa la facturación para empezar a emitir desde Ohnix." action={<Button size="small" type="primary" loading={busy === "activate"} onClick={() => run("activate", async () => { const response = await companyService.activateMyItcycleElectronicInvoicing(crypto.randomUUID()); onActivated?.(response?.data); }, "Facturación electrónica activada.")}>Activar</Button>} />
            )}

            {electronicInvoicingEnabled ? (
                <Alert className="mt-4" type="success" showIcon message="Facturación electrónica activa" />
            ) : (
                <Space direction="vertical" size="middle" className="mt-4 w-full">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-[var(--ohnix-text-primary)]">Llave de acceso de FirmaPass</label>
                        <div className="flex flex-wrap gap-2">
                            <Input.Password className="auth-ohnix-input flex-1" value={loginKey} onChange={(event) => setLoginKey(event.target.value)} placeholder="Pega la llave entregada por FirmaPass" />
                            <Button type="primary" loading={busy === "key"} disabled={!loginKey.trim()} onClick={() => run("key", () => companyService.setMyFirmaPassLoginKey(loginKey.trim()), "Llave de FirmaPass guardada.")}>Guardar</Button>
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-[var(--ohnix-text-primary)]">UUID de validación</label>
                        <Input className="auth-ohnix-input" value={validationUuid} onChange={(event) => setValidationUuid(event.target.value)} placeholder="El UUID creado en el portal de FirmaPass" />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-[var(--ohnix-text-primary)]">RUT</label>
                            <div className="flex flex-wrap gap-2">
                                <Upload accept=".pdf,.png,.jpg,.jpeg" maxCount={1} beforeUpload={async (file) => { setRutBase64(await readFileAsBase64(file)); return false; }}><Button icon={<UploadOutlined />}>Adjuntar RUT</Button></Upload>
                                <Input className="auth-ohnix-input min-w-40 flex-1" value={representativeId} onChange={(event) => setRepresentativeId(event.target.value)} placeholder="Cédula representante" />
                                <Button loading={busy === "rut"} disabled={!canDriveValidation || !rutBase64} onClick={() => run("rut", () => companyService.uploadMyFirmaPassRut(validationUuid.trim(), { rutBase64, identificacionRepresentanteLegal: representativeId || undefined }), "RUT enviado a FirmaPass.")}>Enviar RUT</Button>
                            </div>
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-[var(--ohnix-text-primary)]">Documento adicional (si FirmaPass lo solicita)</label>
                            <div className="flex flex-wrap gap-2">
                                <Input className="auth-ohnix-input min-w-32 flex-1" value={documentType} onChange={(event) => setDocumentType(event.target.value)} placeholder="Tipo de documento" />
                                <Upload accept=".pdf,.png,.jpg,.jpeg" maxCount={1} beforeUpload={async (file) => { setDocumentBase64(await readFileAsBase64(file)); return false; }}><Button icon={<UploadOutlined />}>Adjuntar</Button></Upload>
                                <Button loading={busy === "document"} disabled={!canDriveValidation || !documentType || !documentBase64} onClick={() => run("document", () => companyService.uploadMyFirmaPassArchivo(validationUuid.trim(), { type: documentType, fileBase64: documentBase64 }), "Documento enviado a FirmaPass.")}>Enviar</Button>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button type="primary" loading={busy === "confirm"} disabled={!canDriveValidation} onClick={() => run("confirm", () => companyService.confirmMyFirmaPassValidation(validationUuid.trim()), "Solicitud confirmada. FirmaPass terminará la emisión de forma asíncrona.")}>Confirmar solicitud</Button>
                        <Button icon={<ReloadOutlined />} loading={busy === "refresh"} onClick={() => run("refresh", () => refresh(true))}>Actualizar estado</Button>
                    </div>

                    {status && <div className="flex flex-wrap gap-2">
                        <Tag color={status.loginKeySet ? "green" : "default"}>Llave: {status.loginKeySet ? "configurada" : "pendiente"}</Tag>
                        {(status.certificates || []).map((certificate) => <Tag key={certificate.id || certificate.certificateIdentifier} color={certificate.status === "ACTIVE" ? "green" : "orange"}>{certificate.certificateIdentifier || "Certificado"}: {certificate.status}</Tag>)}
                    </div>}
                </Space>
            )}
        </Card>
    );
};

export default FirmaPassSelfService;
