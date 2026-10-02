import React, { useContext, useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button, Segmented, Tooltip } from "antd";
import {
    DollarOutlined,
    InboxOutlined,
    ShoppingCartOutlined,
    ShoppingOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    ArrowRightOutlined,
    CrownOutlined,
    FileTextOutlined,
    TagOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import DiscoveryDashboardHero from "../components/discoveries/DiscoveryDashboardHero";
import DashboardSkeleton from "../components/dashboard/overview/DashboardSkeleton";
import ErrorDisplay from "../components/dashboard/ErrorDisplay";
import KpiTile from "../components/dashboard/overview/KpiTile";
import SalesTrendCard from "../components/dashboard/overview/SalesTrendCard";
import InventoryCard from "../components/dashboard/overview/InventoryCard";
import TopProductsCard from "../components/dashboard/overview/TopProductsCard";
import RecentOrdersCard from "../components/dashboard/overview/RecentOrdersCard";
import { PERIODS, buildSalesPeriod, percentChange } from "../components/dashboard/overview/salesSeries";
import { api } from "../api/api";
import useI18n from "../hooks/useI18n";
import { useCurrency } from "../context/CurrencyContext";
import { subscriptionService } from "../services/subscriptionService";
import { useTeam } from "../context/TeamContext";
import { getFirstAccessibleRoute } from "../utils/teamRouting";
import { useDataInvalidation } from "../hooks/useDataInvalidation";
import AuthContext from "../context/AuthContext";
import { ELECTRONIC_INVOICING_ENABLED } from "../config/features";

const PERIOD_STORAGE_KEY = "ohnix.dashboardPeriod";

const readStoredPeriod = () => {
    try {
        const stored = localStorage.getItem(PERIOD_STORAGE_KEY);
        return PERIODS.includes(stored) ? stored : "30d";
    } catch {
        return "30d";
    }
};

const Dashboard = () => {
    const navigate = useNavigate();
    const { t, currentLanguage } = useI18n();
    const { formatCurrency } = useCurrency();
    const location = useLocation();
    const { user } = useContext(AuthContext);
    const { hasPermission, hasCapability, isTeamMember, loading: teamLoading } = useTeam();
    // Inventory value is cost data - stripped by the backend without
    // catalogViewCosts, so its card is dropped and the row re-balances.
    const canViewCosts = hasCapability("catalogViewCosts");
    const canSeeBilling = hasPermission("billing", "view");
    const canSeeDashboard = hasPermission("dashboard", "view");
    // Same gating useSubscription/getMenuItems use to decide whether this
    // account owns fiscal setup at all (Colombia, not a team member) - the
    // nudge only ever shows to someone who can actually act on it.
    const needsDianSetup = !teamLoading
        && ELECTRONIC_INVOICING_ENABLED
        && (!user?.company || user?.company?.countryCode === "CO")
        && !isTeamMember
        && !user?.company?.electronicInvoicingEnabled;

    // /dashboard is every entry point's default target (post-login, post-
    // invite-acceptance, GuestRoute, etc.) - a restricted team member who
    // hasn't been granted dashboard access would otherwise land here and
    // just see a 403, instead of wherever they're actually allowed to work.
    // Wait for team permissions to resolve first so this doesn't fire on
    // stale/default state.
    useEffect(() => {
        if (teamLoading || canSeeDashboard) return;
        navigate(getFirstAccessibleRoute(hasPermission), { replace: true });
    }, [teamLoading, canSeeDashboard, hasPermission, navigate]);
    const [loading, setLoading] = useState(true);
    // Skeleton only until the first successful load - later refreshes
    // (manual, or another user's change via useDataInvalidation) keep the
    // current numbers on screen and just spin the refresh icon.
    const [hasLoaded, setHasLoaded] = useState(false);
    const [error, setError] = useState(null);
    const [dashboardData, setDashboardData] = useState({
        totalSales: 0,
        totalPurchase: 0,
        inventoryValue: 0,
        totalProducts: 0,
        totalStock: 0,
        outOfStockCount: 0,
        lowStockProducts: [],
        recentOrders: [],
        salesData: [],
        topProducts: [],
    });
    // Whether /reports/sales and /reports/top-products answered at all (they're
    // plan-gated, see fetchDashboardData) - "locked" and "no sales yet" need
    // different empty states.
    const [reportsAvailable, setReportsAvailable] = useState({ sales: false, topProducts: false });
    const [period, setPeriod] = useState(readStoredPeriod);
    const [subscriptionSnapshot, setSubscriptionSnapshot] = useState(null);
    const [requestSnapshot, setRequestSnapshot] = useState([]);
    const [isPolling, setIsPolling] = useState(false);

    useEffect(() => {
        if (teamLoading || !canSeeDashboard) return;
        fetchDashboardData();
    }, [teamLoading, canSeeDashboard]);

    const changePeriod = (value) => {
        setPeriod(value);
        try {
            localStorage.setItem(PERIOD_STORAGE_KEY, value);
        } catch {
            // Remembering the period is a convenience only.
        }
    };

    // Another connected user creating/updating a product, order, or
    // purchase - the dashboard's totals/low-stock list/recent orders are all
    // aggregated server-side, so a full re-fetch is the only correct way to
    // keep them current (nothing here can be patched incrementally).
    useDataInvalidation(["product", "order", "purchase"], () => {
        if (teamLoading || !canSeeDashboard) return;
        fetchDashboardData();
    });

    useEffect(() => {
        if (canSeeBilling) fetchSubscriptionSnapshot();
    }, [canSeeBilling]);

    // Refetch subscription when page becomes visible (user returns to tab)
    useEffect(() => {
        if (!canSeeBilling) return;
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                fetchSubscriptionSnapshot();
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, [canSeeBilling]);

    // Auto-poll subscription if there's an active request
    useEffect(() => {
        const hasActiveRequest = requestSnapshot.some((req) =>
            ["open", "reviewing", "approved"].includes(req.status)
        );

        if (!hasActiveRequest) {
            setIsPolling(false);
            return;
        }

        setIsPolling(true);
        const interval = setInterval(() => {
            fetchSubscriptionSnapshot();
        }, 3000); // Poll every 3 seconds

        return () => clearInterval(interval);
    }, [requestSnapshot]);

    // Aggressive refetch after returning from PaymentSuccess
    useEffect(() => {
        if (location.state?.fromPayment) {
            // Refetch immediately and after 2 seconds for backend processing
            fetchSubscriptionSnapshot();
            const timer = setTimeout(() => fetchSubscriptionSnapshot(), 2000);
            return () => clearTimeout(timer);
        }
    }, [location.state?.fromPayment]);

    const fetchSubscriptionSnapshot = async () => {
        try {
            const [subscriptionResponse, requestsResponse] = await Promise.all([
                subscriptionService.getMySubscription(),
                subscriptionService.getMyUpgradeRequests(),
            ]);

            setSubscriptionSnapshot(subscriptionResponse?.data || null);
            setRequestSnapshot(Array.isArray(requestsResponse?.data) ? requestsResponse.data : []);
        } catch {
            setSubscriptionSnapshot(null);
            setRequestSnapshot([]);
        }
    };

    const fetchDashboardData = async () => {
        try {
            setLoading(true);

            // /reports/dashboard is the only call every plan can make (it's
            // ungated) - top-products/sales require reportTopProducts/
            // reportSales (Negocio+), which Starter/trial users don't have.
            // These used to always be fetched together via Promise.all, so
            // one 403 from either gated call failed the whole dashboard with
            // a full-page error - broke the very first thing a new Starter
            // signup sees. Now the base metrics load unconditionally, and
            // the two gated calls are still attempted (the backend is the
            // only authoritative answer on whether the plan allows them,
            // avoiding a race against useSubscription's own async plan
            // fetch) but a 403 from either just means "no data for this
            // section", not a page-wide error.
            const dashboardResponse = await api.get("/reports/dashboard");

            if (!dashboardResponse.data.success) {
                setError(t("dashboard.failed_fetch_dashboard_data"));
                toast.error(t("dashboard.failed_load_data"));
                return;
            }

            const metricsData = dashboardResponse.data.data;
            let topProductsData = [];
            let salesReportData = {};

            const [topProductsResult, salesReportResult] = await Promise.allSettled([
                api.get("/reports/top-products"),
                api.get("/reports/sales"),
            ]);

            if (topProductsResult.status === "fulfilled") {
                topProductsData = topProductsResult.value.data.data || [];
            }
            if (salesReportResult.status === "fulfilled") {
                salesReportData = salesReportResult.value.data.data || {};
            }

            setDashboardData({
                ...metricsData,
                topProducts: topProductsData,
                salesData: salesReportData,
            });
            setReportsAvailable({
                sales: salesReportResult.status === "fulfilled",
                topProducts: topProductsResult.status === "fulfilled",
            });
            setError(null);
            setHasLoaded(true);
        } catch (err) {
            console.error("Dashboard data fetch error:", err);
            const errorMessage =
                err.response?.data?.message ||
                t("dashboard.something_went_wrong_dashboard");
            setError(errorMessage);
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const salesByDate = Array.isArray(dashboardData.salesData?.salesByDate)
        ? dashboardData.salesData.salesByDate
        : null;
    const salesTimezone = dashboardData.salesData?.timezone;
    const salesPeriod = useMemo(
        () => buildSalesPeriod(salesByDate || [], period, salesTimezone ? { timezone: salesTimezone } : undefined),
        [salesByDate, period, salesTimezone]
    );

    if (!hasLoaded && !error) {
        return <DashboardSkeleton />;
    }

    if (error && !hasLoaded) {
        return <ErrorDisplay error={error} onRetry={fetchDashboardData} />;
    }

    const locale = currentLanguage === "es" ? "es-CO" : "en-US";
    const numberFormat = new Intl.NumberFormat(locale);
    const formatNumber = (value) => numberFormat.format(Number(value) || 0);
    const today = new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });

    const { current, previous } = salesPeriod;
    const averageTicket = current.orders > 0 ? Math.round(current.sales / current.orders) : 0;
    const previousAverageTicket = previous.orders > 0 ? Math.round(previous.sales / previous.orders) : 0;
    const vsLabel = t(`dashboard.vs_previous_${period}`);
    const activePlanRequest = requestSnapshot.find((request) =>
        ["open", "reviewing", "approved"].includes(request.status)
    );
    const displayName = user?.username || user?.company?.name || "";

    const inventoryKpi = {
        key: "inventory",
        label: t("dashboard.inventory_value"),
        icon: <DollarOutlined />,
        value: formatCurrency(dashboardData.inventoryValue),
        hint: t("dashboard.inventory_value_hint"),
    };
    // /reports/dashboard's totalSales sums every non-cancelled order's total
    // (pending ones included), while the chart and period KPIs count only
    // completed sales net of returns. When the sales report is available, the
    // lifetime figure uses that same definition so the page never shows two
    // different "ventas" numbers for the same history.
    const lifetimeSales = reportsAvailable.sales
        ? Number(dashboardData.salesData?.summary?.totalSales) || 0
        : dashboardData.totalSales;
    const lifetimeSalesKpi = {
        key: "lifetime",
        label: t("dashboard.lifetime_sales"),
        icon: <ShoppingCartOutlined />,
        value: formatCurrency(lifetimeSales),
        hint: t("dashboard.lifetime_hint"),
    };

    // With the sales report (Negocio+) the headline row is about the selected
    // period; without it, only the all-time /reports/dashboard totals exist.
    const kpis = reportsAvailable.sales
        ? [
              {
                  key: "sales",
                  label: t("dashboard.kpi_sales"),
                  icon: <ShoppingCartOutlined />,
                  value: formatCurrency(current.sales),
                  change: percentChange(current.sales, previous.sales),
              },
              {
                  key: "orders",
                  label: t("dashboard.kpi_orders"),
                  icon: <FileTextOutlined />,
                  value: formatNumber(current.orders),
                  change: percentChange(current.orders, previous.orders),
              },
              {
                  key: "ticket",
                  label: t("dashboard.average_order_value"),
                  icon: <TagOutlined />,
                  value: formatCurrency(averageTicket),
                  change: percentChange(averageTicket, previousAverageTicket),
              },
              canViewCosts ? inventoryKpi : lifetimeSalesKpi,
          ]
        : [
              lifetimeSalesKpi,
              {
                  key: "purchases",
                  label: t("dashboard.lifetime_purchases"),
                  icon: <ShoppingOutlined />,
                  value: formatCurrency(dashboardData.totalPurchase),
                  hint: t("dashboard.lifetime_hint"),
              },
              canViewCosts && inventoryKpi,
              {
                  key: "products",
                  label: t("dashboard.total_products"),
                  icon: <InboxOutlined />,
                  value: formatNumber(dashboardData.totalProducts),
                  hint: t("dashboard.units_in_stock_count", { count: dashboardData.totalStock, value: formatNumber(dashboardData.totalStock) }),
              },
          ].filter(Boolean);

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(41,216,213,0.08),transparent_26%),linear-gradient(180deg,var(--ohnix-bg-alt)_0%,var(--ohnix-bg)_100%)] text-[var(--ohnix-text-primary)]">
            <div className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
                <header className="flex flex-col gap-4 animate-fade-up sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                        <p className="m-0 text-sm text-[var(--ohnix-text-muted)] first-letter:uppercase">{today}</p>
                        <h1 className="m-0 mt-1 truncate text-2xl font-bold text-[var(--ohnix-text-primary)] sm:text-3xl">
                            {displayName ? t("dashboard.greeting", { name: displayName }) : t("common.dashboard")}
                        </h1>
                        <p className="m-0 mt-1 text-sm text-[var(--ohnix-text-muted)]">{t("dashboard.greeting_subtitle")}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {canSeeBilling && (
                            <Tooltip
                                title={
                                    activePlanRequest
                                        ? `${t("dashboard.request_in_progress")}: ${t(`profile.subscription.request_status_${activePlanRequest.status}`)}`
                                        : t("dashboard.manage_plan_cta")
                                }
                            >
                                <button
                                    type="button"
                                    onClick={() => navigate("/billing")}
                                    className="inline-flex h-8 items-center gap-2 rounded-full border border-[#29D8D5]/30 bg-[#29D8D5]/10 px-3 text-xs font-semibold text-[var(--ohnix-text-primary)] transition-colors hover:border-[#29D8D5]/60"
                                >
                                    <CrownOutlined className="text-[#44F3F0]" />
                                    {t("dashboard.plan_chip", {
                                        plan: t(`profile.subscription.plan_${subscriptionSnapshot?.plan || "starter"}`),
                                    })}
                                    {activePlanRequest && <ReloadOutlined spin={isPolling} className="text-[#FFCF70]" />}
                                </button>
                            </Tooltip>
                        )}
                        <Button onClick={fetchDashboardData} icon={<ReloadOutlined spin={loading} />} disabled={loading} className="rounded-full" title={t("common.refresh")}>
                            <span className="hidden sm:inline">{t("common.refresh")}</span>
                        </Button>
                    </div>
                </header>

                <DiscoveryDashboardHero />

                {needsDianSetup && (
                    <section className="mt-6 animate-fade-up">
                        <div className="relative overflow-hidden rounded-2xl border border-[#FFCF70]/30 bg-[linear-gradient(120deg,rgba(245,158,11,0.14),rgba(124,106,247,0.06)_55%,transparent)] p-5 shadow-[var(--ohnix-shadow-card)]">
                            <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full border border-[#FFCF70]/20" />
                            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-4">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#FFCF70]/40 bg-[#FFCF70]/10 text-xl text-[#FFCF70] shadow-[0_0_20px_rgba(245,158,11,0.25)] animate-glow-pulse">
                                        <SafetyCertificateOutlined />
                                    </div>
                                    <div>
                                        <span
                                            className="status-pill"
                                            style={{ color: "#FFCF70", background: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.35)" }}
                                        >
                                            <span className="status-dot status-dot--draft" />
                                            {t("dashboard.dian_tip_badge")}
                                        </span>
                                        <h3 className="mt-2 text-base font-bold leading-tight text-[var(--ohnix-text-primary)] sm:text-lg">
                                            {t("dashboard.dian_tip_title")}
                                        </h3>
                                        <p className="mt-1 max-w-xl text-sm text-[var(--ohnix-text-muted)]">
                                            {t("dashboard.dian_tip_description")}
                                        </p>
                                    </div>
                                </div>
                                <Link to="/fiscal-setup" className="w-full shrink-0 sm:w-auto">
                                    <Button
                                        type="primary"
                                        size="large"
                                        icon={<ArrowRightOutlined />}
                                        iconPosition="end"
                                        block={window.innerWidth < 640}
                                        className="hover:shadow-[0_0_26px_rgba(41,216,213,0.22)]"
                                    >
                                        {t("dashboard.dian_tip_cta")}
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </section>
                )}

                <section className="mt-6 animate-fade-up-delay">
                    {reportsAvailable.sales && (
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--ohnix-text-muted)]">
                                {t("dashboard.summary")}
                            </h2>
                            <Segmented
                                value={period}
                                onChange={changePeriod}
                                options={PERIODS.map((value) => ({ value, label: t(`dashboard.period_${value}`) }))}
                            />
                        </div>
                    )}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {kpis.map(({ key, ...kpi }) => (
                            <KpiTile key={key} changeLabel={vsLabel} {...kpi} />
                        ))}
                    </div>
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 animate-fade-up xl:grid-cols-3">
                    <div className="min-w-0 xl:col-span-2">
                        <SalesTrendCard period={salesPeriod} available={reportsAvailable.sales} canUpgrade={canSeeBilling} />
                    </div>
                    <InventoryCard
                        totalProducts={dashboardData.totalProducts}
                        totalStock={dashboardData.totalStock}
                        outOfStockCount={dashboardData.outOfStockCount}
                        lowStockProducts={dashboardData.lowStockProducts || []}
                        formatNumber={formatNumber}
                    />
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 animate-fade-up lg:grid-cols-2">
                    <TopProductsCard topProducts={dashboardData.topProducts || []} available={reportsAvailable.topProducts} />
                    <RecentOrdersCard recentOrders={dashboardData.recentOrders || []} />
                </section>

                {reportsAvailable.sales && (
                    <footer className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-5 py-3 text-xs text-[var(--ohnix-text-muted)]">
                        <span className="font-semibold uppercase tracking-wider">{t("dashboard.lifetime_title")}</span>
                        <span>
                            {t("dashboard.lifetime_sales")}:{" "}
                            <strong className="tabular-nums text-[var(--ohnix-text-primary)]">{formatCurrency(lifetimeSales)}</strong>
                        </span>
                        <span>
                            {t("dashboard.lifetime_purchases")}:{" "}
                            <strong className="tabular-nums text-[var(--ohnix-text-primary)]">{formatCurrency(dashboardData.totalPurchase)}</strong>
                        </span>
                    </footer>
                )}
            </div>
        </main>
    );
};

export default Dashboard;
