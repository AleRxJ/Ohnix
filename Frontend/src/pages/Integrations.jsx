import { useEffect, useState } from "react";
import { Button } from "antd";
import { ApiOutlined, ArrowLeftOutlined, CompassOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import PageHeader from "../components/common/PageHeader";
import PlanGate from "../components/common/PlanGate";
import ApiKeysPanel from "../components/billing/ApiKeysPanel";
import IntegrationsPanel from "../components/billing/IntegrationsPanel";
import WebhooksPanel from "../components/billing/WebhooksPanel";
import IntegrationsTour from "../components/integrations/IntegrationsTour";
import useI18n from "../hooks/useI18n";
import useSubscription from "../hooks/useSubscription";

const TOUR_SEEN_KEY = "ohnix_integrations_tour_seen";

const Integrations = () => {
    const { t } = useI18n();
    const { can, loading: subscriptionLoading } = useSubscription();
    const [tourOpen, setTourOpen] = useState(false);

    // First-time visitors get the tour automatically; anyone can replay it
    // from the "Ver cómo funciona" button - same "seen once, always
    // replayable" posture as InventoryTourFab, just via localStorage instead
    // of a fetched flag since this doesn't need to sync across devices.
    useEffect(() => {
        if (subscriptionLoading || !can("apiAccess")) return;
        try {
            if (!localStorage.getItem(TOUR_SEEN_KEY)) {
                setTourOpen(true);
                localStorage.setItem(TOUR_SEEN_KEY, "1");
            }
        } catch {
            /* localStorage unavailable - just skip auto-open */
        }
    }, [subscriptionLoading, can]);

    if (subscriptionLoading) return null;

    return (
        <div className="p-4 sm:p-6">
            <PageHeader
                title={t("integrations_page.page_title")}
                subtitle={t("integrations_page.page_subtitle")}
                icon={<ApiOutlined />}
                actionButton={
                    <div className="flex flex-wrap gap-2">
                        <Button icon={<CompassOutlined />} onClick={() => setTourOpen(true)}>
                            {t("integrations_tour.trigger")}
                        </Button>
                        <Link to="/dashboard">
                            <Button icon={<ArrowLeftOutlined />}>{t("fiscal_setup.back_to_dashboard")}</Button>
                        </Link>
                    </div>
                }
            />

            {can("apiAccess") ? (
                <>
                    <ApiKeysPanel />
                    <IntegrationsPanel />
                    <WebhooksPanel />
                </>
            ) : (
                <div className="mt-6 max-w-5xl">
                    <PlanGate featureKey="apiAccess" />
                </div>
            )}

            <IntegrationsTour open={tourOpen} onClose={() => setTourOpen(false)} />
        </div>
    );
};

export default Integrations;
