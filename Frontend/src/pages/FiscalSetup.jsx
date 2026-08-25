import { useContext, useEffect, useState } from "react";
import { Alert, Button, Card, Spin, Typography } from "antd";
import { ArrowLeftOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import PageHeader from "../components/common/PageHeader";
import ElectronicInvoicingSettings from "../components/team/ElectronicInvoicingSettings";
import { companyService } from "../services/companyService";
import AuthContext from "../context/AuthContext";

const { Text } = Typography;

const FiscalSetup = () => {
    const { refreshUser } = useContext(AuthContext);
    const [company, setCompany] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        companyService.getMyCompany()
            .then((response) => setCompany(response?.data?.company || null))
            .catch((error) => toast.error(error?.response?.data?.message || "No fue posible cargar los datos de empresa."))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="flex justify-center py-16"><Spin size="large" /></div>;

    return (
        <div className="p-4 sm:p-6">
            <PageHeader
                title={"Configuraci\u00f3n DIAN"}
                subtitle={"Prepara tu empresa para emitir documentos electr\u00f3nicos con Ohnix."}
                icon={<SafetyCertificateOutlined />}
                actionButton={<Link to="/dashboard"><Button icon={<ArrowLeftOutlined />}>Volver al panel</Button></Link>}
            />

            {!company && (
                <Alert
                    className="mt-6"
                    type="info"
                    showIcon
                    message="Primero crea el perfil de tu empresa"
                    description={"El asistente te pedir\u00e1 los datos necesarios. No necesitas crear un equipo ni contactar a soporte."}
                />
            )}

            <div className="mt-6 max-w-5xl">
                <ElectronicInvoicingSettings
                    company={company}
                    onCompanyChanged={async (updatedCompany) => {
                        setCompany(updatedCompany);
                        await refreshUser?.();
                    }}
                />
                <Card className="mt-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)]">
                    <Text className="text-xs text-[var(--ohnix-text-muted)]">
                        {"Ohnix no guarda tu clave privada ni el archivo de certificado en el navegador. Los datos se env\u00edan una sola vez a la capa fiscal cifrada."}
                    </Text>
                </Card>
            </div>
        </div>
    );
};

export default FiscalSetup;
