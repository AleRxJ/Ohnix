import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import { Empty, Spin, Alert } from "antd";
import { RadarChartOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import PageHeader from "../components/common/PageHeader";
import PlanGate from "../components/common/PlanGate";
import DiscoveryListCard from "../components/discoveries/DiscoveryListCard";
import DiscoveryDetailDrawer from "../components/discoveries/DiscoveryDetailDrawer";
import useI18n from "../hooks/useI18n";
import useSubscription from "../hooks/useSubscription";
import { discoveryService } from "../services/discoveryService";
import { getConnectivityState, subscribeConnectivity } from "../offline/connectivity";

// "Ohnix encontró algo" as a full page: every Discovery on the account,
// most important first, opening into DiscoveryDetailDrawer's full
// evidence/hypothesis/recommendation breakdown. The widget (mounted
// globally in DashboardLayout) is the teaser for this - this page is where
// someone actually reads one.
const FILTERS = ["open", "actioned", "resolved", "dismissed", "all"];
const OPEN_STATUSES = ["detected", "investigating", "validated", "published", "learned"];

// The filter bar's own tab, not antd Segmented - Segmented's built-in
// padding is too tight for a 5-way filter to read as separate, deliberate
// choices (they ran together edge-to-edge), and it carries no count, so
// switching to "Resueltos" told you nothing until the list had already
// re-rendered. Same pill-group idiom as ThemeToggle (rounded-full track,
// gradient-filled active pill) so it reads as Ohnix's own control rather
// than a re-skinned antd default, plus a live count per bucket so the bar
// itself is informative, not just a switch.
const DiscoveryFilterTabs = ({ value, onChange, counts, t }) => (
    <div className="discovery-filter-tabs" role="tablist" aria-label={t("discoveries.page_title")}>
        {FILTERS.map((key) => {
            const active = value === key;
            return (
                <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onChange(key)}
                    className={`discovery-filter-tab${active ? " is-active" : ""}`}
                >
                    <span>{t(`discoveries.filter_${key}`)}</span>
                    <span className="discovery-filter-tab-count">{counts[key] ?? 0}</span>
                </button>
            );
        })}
    </div>
);
DiscoveryFilterTabs.propTypes = {
    value: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    counts: PropTypes.object.isRequired,
    t: PropTypes.func.isRequired,
};

const Discoveries = () => {
    const { t } = useI18n();
    const location = useLocation();
    const { can, loading: subscriptionLoading } = useSubscription();
    const [filter, setFilter] = useState("open");
    const [discoveries, setDiscoveries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loaded, setLoaded] = useState(false);
    const [openId, setOpenId] = useState(location.state?.openId || null);
    const [isOffline, setIsOffline] = useState(!getConnectivityState());

    useEffect(() => subscribeConnectivity((online) => setIsOffline(!online)), []);

    const load = () => {
        setLoading(true);
        discoveryService
            .list({})
            .then(setDiscoveries)
            .catch(() => toast.error(t("discoveries.load_error")))
            .finally(() => {
                setLoading(false);
                setLoaded(true);
            });
    };

    useEffect(() => {
        // Skip the fetch entirely on a Starter account - it would only ever
        // 403 (Backend/routes/discovery.routes.js's enforcePlanFeature), and
        // subscriptionLoading gates this until the real plan is confirmed so
        // a Growth+ account never sees a flash of the locked state first.
        if (subscriptionLoading || !can("discoveryEngine")) return;
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subscriptionLoading]);

    const filtered = discoveries
        .filter((d) => {
            if (filter === "all") return true;
            if (filter === "open") return OPEN_STATUSES.includes(d.status);
            return d.status === filter;
        })
        .sort((a, b) => b.priority_score - a.priority_score);

    const counts = FILTERS.reduce((acc, key) => {
        if (key === "all") acc[key] = discoveries.length;
        else if (key === "open") acc[key] = discoveries.filter((d) => OPEN_STATUSES.includes(d.status)).length;
        else acc[key] = discoveries.filter((d) => d.status === key).length;
        return acc;
    }, {});

    const handleStatusChanged = (updated) => {
        setDiscoveries((prev) => prev.map((d) => (d._id === updated._id ? { ...d, ...updated } : d)));
    };

    if (subscriptionLoading) {
        return (
            <div className="discoveries-page p-4 sm:p-6 text-[var(--ohnix-text-primary)]">
                <div className="flex justify-center py-16">
                    <Spin />
                </div>
            </div>
        );
    }

    if (!can("discoveryEngine")) {
        return (
            <div className="discoveries-page p-4 sm:p-6 text-[var(--ohnix-text-primary)]">
                <PageHeader
                    title={t("discoveries.page_title")}
                    subtitle={t("discoveries.page_subtitle")}
                    icon={<RadarChartOutlined />}
                />
                <PlanGate featureKey="discoveryEngine" />
            </div>
        );
    }

    return (
        <div className="discoveries-page p-4 sm:p-6 text-[var(--ohnix-text-primary)]">
            <PageHeader
                title={t("discoveries.page_title")}
                subtitle={t("discoveries.page_subtitle")}
                icon={<RadarChartOutlined />}
            />

            {isOffline && (
                <Alert
                    message={t("reports.offline_notice_title")}
                    description={t("reports.offline_notice_description")}
                    type="warning"
                    showIcon
                    className="no-print mb-4 sm:mb-6 dark-alert dark-alert-amber"
                />
            )}

            <div className="mb-5">
                <DiscoveryFilterTabs value={filter} onChange={setFilter} counts={counts} t={t} />
            </div>

            {loading && (
                <div className="flex justify-center py-16">
                    <Spin />
                </div>
            )}

            {!loading && loaded && filtered.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[var(--ohnix-line-3)] px-6 py-14">
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                            <div className="max-w-md mx-auto text-center">
                                <div className="text-sm font-semibold text-[var(--ohnix-text-primary)] mb-1.5">
                                    {t("discoveries.empty_title")}
                                </div>
                                <div className="text-xs text-[var(--ohnix-text-muted)] leading-relaxed">
                                    {t("discoveries.empty_subtitle")}
                                </div>
                            </div>
                        }
                    />
                </div>
            )}

            {!loading && filtered.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filtered.map((discovery) => (
                        <DiscoveryListCard key={discovery._id} discovery={discovery} onClick={() => setOpenId(discovery._id)} />
                    ))}
                </div>
            )}

            <DiscoveryDetailDrawer
                open={Boolean(openId)}
                discoveryId={openId}
                onClose={() => setOpenId(null)}
                onStatusChanged={handleStatusChanged}
            />
        </div>
    );
};

export default Discoveries;
