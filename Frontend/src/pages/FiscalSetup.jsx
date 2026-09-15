import { useContext, useEffect, useState } from "react";
import { Alert, Button, Card, Spin, Typography } from "antd";
import { ArrowLeftOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import PageHeader from "../components/common/PageHeader";
import ElectronicInvoicingSettings from "../components/team/ElectronicInvoicingSettings";
import { companyService } from "../services/companyService";
import AuthContext from "../context/AuthContext";
import useI18n from "../hooks/useI18n";
import useSubscription from "../hooks/useSubscription";

const { Text } = Typography;

const FiscalSetup = () => {
    const { t } = useI18n();
    const { refreshUser } = useContext(AuthContext);
    const { can, loading: subscriptionLoading } = useSubscription();
    const [company, setCompany] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        companyService.getMyCompany()
            .then((response) => setCompany(response?.data?.company || null))
            .catch((error) => toast.error(error?.response?.data?.message || t("fiscal_setup.load_error")))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading || subscriptionLoading) return <div className="flex justify-center py-16"><Spin size="large" /></div>;

    return (
        <div className="p-4 sm:p-6">
            <PageHeader
                title={t("fiscal_setup.page_title")}
                subtitle={t("fiscal_setup.page_subtitle")}
                icon={<SafetyCertificateOutlined />}
                actionButton={<Link to="/dashboard"><Button icon={<ArrowLeftOutlined />}>{t("fiscal_setup.back_to_dashboard")}</Button></Link>}
            />

            {!company && (
                <Alert
                    className="mt-6 dark-alert dark-alert-purple"
                    type="info"
                    showIcon
                    message={t("fiscal_setup.no_company_title")}
                    description={t("fiscal_setup.no_company_hint")}
                />
            )}

            <div className="mt-6 max-w-5xl">
                {/* Holding/uploading a certificate and provisioning with
                itcycle-api-dian is available on every plan - only actually
                switching invoice issuance on (and self-service numbering
                resolutions) is gated to the Negocio plan. That gate is
                enforced inside ElectronicInvoicingSettings itself now, not
                at this page level, so every company can still reach the DIAN
                configuration + certificate steps below regardless of plan. */}
                <ElectronicInvoicingSettings
                    company={company}
                    canActivateInvoicing={can("electronicInvoicing")}
                    onCompanyChanged={async (updatedCompany) => {
                        setCompany(updatedCompany);
                        await refreshUser?.();
                    }}
                />
                <Card className="mt-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)]">
                    <Text className="text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.privacy_note")}</Text>
                </Card>
            </div>
        </div>
    );
};

export default FiscalSetup;
