import React, { useContext, useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
    Card,
    Row,
    Col,
    Tag,
    Divider,
    Typography,
    Button,
    Badge,
    Tooltip,
    theme,
} from "antd";
import {
    DollarOutlined,
    InboxOutlined,
    ShoppingCartOutlined,
    ShoppingOutlined,
    WarningOutlined,
    AreaChartOutlined,
    PieChartOutlined,
    InfoCircleOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    ArrowRightOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import DiscoveryDashboardHero from "../components/discoveries/DiscoveryDashboardHero";
import StatCard from "../components/dashboard/StatCard";
import ProductDistribution from "../components/dashboard/ProductDistribution";
import DataTable from "../components/dashboard/DataTable";
import LoadingSpinner from "../components/dashboard/LoadingSpinner";
import ErrorDisplay from "../components/dashboard/ErrorDisplay";
import { api } from "../api/api";
import SalesChart from "../components/dashboard/SalesChart";
import useI18n from "../hooks/useI18n";
import { useCurrency } from "../context/CurrencyContext";
import { subscriptionService } from "../services/subscriptionService";
import { useTeam } from "../context/TeamContext";
import { getFirstAccessibleRoute } from "../utils/teamRouting";
import { useDataInvalidation } from "../hooks/useDataInvalidation";
import AuthContext from "../context/AuthContext";
import { ELECTRONIC_INVOICING_ENABLED } from "../config/features";

const { useToken } = theme;
const { Title, Text } = Typography;

const Dashboard = () => {
    const navigate = useNavigate();
    const { token } = useToken();
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const location = useLocation();
    const { user } = useContext(AuthContext);
    const { hasPermission, isTeamMember, loading: teamLoading } = useTeam();
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
    const [timeframe, setTimeframe] = useState("30days");
    const [subscriptionSnapshot, setSubscriptionSnapshot] = useState(null);
    const [requestSnapshot, setRequestSnapshot] = useState([]);
    const [isPolling, setIsPolling] = useState(false);

    useEffect(() => {
        if (teamLoading || !canSeeDashboard) return;
        fetchDashboardData();
    }, [timeframe, teamLoading, canSeeDashboard]);

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
            const dashboardResponse = await api.get("/reports/dashboard", { params: { timeframe } });

            if (!dashboardResponse.data.success) {
                setError(t("dashboard.failed_fetch_dashboard_data"));
                toast.error(t("dashboard.failed_load_data"));
                return;
            }

            const metricsData = dashboardResponse.data.data;
            let topProductsData = [];
            let salesReportData = {};

            const [topProductsResult, salesReportResult] = await Promise.allSettled([
                api.get("/reports/top-products", { params: { timeframe } }),
                api.get("/reports/sales", { params: { timeframe } }),
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

            toast.success(t("dashboard.data_loaded_successfully"));
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

    const topProductsColumns = [
        {
            title: t("products.product"),
            dataIndex: "product_name",
            key: "product_name",
            ellipsis: {
                showTitle: false,
            },
            render: (text) => (
                <Tooltip placement="topLeft" title={text}>
                    <span className="text-sm font-medium text-[var(--ohnix-text-table-cell)] block max-w-[150px] sm:max-w-[200px] truncate">
                        {text}
                    </span>
                </Tooltip>
            ),
        },
        {
            title: t("common.quantity"),
            dataIndex: "quantity_sold",
            key: "quantity_sold",
            width: 80,
            align: "center",
            sorter: (a, b) => a.quantity_sold - b.quantity_sold,
            render: (value) => (
                <Badge
                    count={value}
                    className="font-medium"
                    style={{
                        backgroundColor: "#1890ff",
                        fontSize: "11px",
                    }}
                />
            ),
        },
        {
            title: t("common.total"),
            dataIndex: "total_sales",
            key: "total_sales",
            width: 100,
            align: "right",
            render: (value) => (
                <span className="font-semibold text-green-600">
                    ${value.toLocaleString()}
                </span>
            ),
            sorter: (a, b) => a.total_sales - b.total_sales,
        },
    ];

    const lowStockColumns = [
        {
            title: t("products.product"),
            dataIndex: "product_name",
            key: "product_name",
            ellipsis: {
                showTitle: false,
            },
            render: (text) => (
                <Tooltip placement="topLeft" title={text}>
                    <span className="text-sm font-medium text-[var(--ohnix-text-table-cell)] block max-w-[150px] sm:max-w-[200px] truncate">
                        {text}
                    </span>
                </Tooltip>
            ),
        },
        {
            title: t("products.stock"),
            dataIndex: "stock",
            key: "stock",
            width: 70,
            align: "center",
            render: (value) => (
                <span
                    className={`font-bold ${value === 0 ? "text-red-600" : "text-orange-600"}`}
                >
                    {value}
                </span>
            ),
        },
        {
            title: t("common.status"),
            key: "status",
            width: 90,
            align: "center",
            render: (_, record) => (
                <Tag
                    color={record.stock === 0 ? "error" : "warning"}
                    className="text-xs font-medium"
                >
                    {record.stock === 0 ? t("products.out_of_stock") : t("products.low_stock")}
                </Tag>
            ),
        },
    ];

    const recentOrdersColumns = [
        {
            title: t("orders.invoice_number"),
            dataIndex: "invoice_no",
            key: "invoice_no",
            width: 100,
            render: (value) => (
                <span className="font-mono text-blue-600 font-medium">
                    #{value}
                </span>
            ),
        },
        {
            title: t("customers.customer"),
            key: "customer",
            ellipsis: {
                showTitle: false,
            },
            render: (_, record) => {
                const customerName =
                    record.customer_id?.name || t("customers.unknown_customer");
                return (
                    <Tooltip placement="topLeft" title={customerName}>
                        <span className="text-sm font-medium text-[var(--ohnix-text-table-cell)] block max-w-[150px] sm:max-w-[200px] truncate">
                            {customerName}
                        </span>
                    </Tooltip>
                );
            },
        },
        {
            title: t("common.date"),
            key: "date",
            width: 100,
            responsive: ["md"],
            render: (_, record) => (
                <span className="text-sm text-[var(--ohnix-text-muted)]">
                    {new Date(record.createdAt).toLocaleDateString()}
                </span>
            ),
        },
        {
            title: t("common.total"),
            dataIndex: "total",
            key: "total",
            width: 100,
            align: "right",
            render: (value) => (
                <span className="font-semibold text-green-600">
                    ${value.toLocaleString()}
                </span>
            ),
        },
        {
            title: t("common.status"),
            dataIndex: "order_status",
            key: "order_status",
            width: 100,
            align: "center",
            render: (status) => {
                let color = "default";
                if (status === "completed") color = "success";
                if (status === "processing") color = "processing";
                if (status === "pending") color = "warning";
                if (status === "cancelled") color = "error";

                return <Tag color={color}>{t(`common.${status}`)}</Tag>;
            },
        },
    ];

    if (loading) {
        return <LoadingSpinner tip={t("dashboard.loading_dashboard_data")} />;
    }

    if (error) {
        return <ErrorDisplay error={error} onRetry={fetchDashboardData} />;
    }

    const topPerformer = dashboardData.topProducts?.[0] || null;
    const mostProfitableProduct = dashboardData.topProducts?.length
        ? [...dashboardData.topProducts].sort((a, b) => b.total_sales - a.total_sales)[0]
        : null;
    const totalSales = Number(dashboardData.totalSales || 0);
    const totalPurchase = Number(dashboardData.totalPurchase || 0);
    const totalOrders = dashboardData.salesData?.summary?.totalOrders || 0;
    const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    const topProductShare =
        totalSales > 0 && topPerformer?.total_sales
            ? (Number(topPerformer.total_sales) / totalSales) * 100
            : 0;
    const stockRiskCount =
        (dashboardData.lowStockProducts?.length || 0) +
        (dashboardData.outOfStockCount || 0);
    const netTradeDelta = totalSales - totalPurchase;
    const activePlanRequest = requestSnapshot.find((request) =>
        ["open", "reviewing", "approved"].includes(request.status)
    );

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(41,216,213,0.08),transparent_26%),linear-gradient(180deg,var(--ohnix-bg-alt)_0%,var(--ohnix-bg)_100%)] text-[var(--ohnix-text-primary)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <DashboardHeader onRefresh={fetchDashboardData} />

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
                    <div className="bg-[var(--ohnix-surface-card)] rounded-2xl border border-[var(--ohnix-line-4)] shadow-[var(--ohnix-shadow-card)] p-6 backdrop-blur-md">
                        {canSeeBilling && (
                        <div className="mb-5 rounded-xl border border-[#29D8D5]/20 bg-[#29D8D5]/8 p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <Text className="text-xs uppercase tracking-[0.16em] text-[var(--ohnix-text-muted)]">
                                        {t("dashboard.plan_overview")}
                                    </Text>
                                    <div className="mt-1 text-sm text-[var(--ohnix-text-primary)]">
                                        {t("dashboard.current_plan")}: {" "}
                                        {t(`profile.subscription.plan_${subscriptionSnapshot?.plan || "starter"}`)}
                                    </div>
                                    {activePlanRequest ? (
                                        <div className="mt-1 text-xs text-[#CFE8E8]">
                                            {t("dashboard.request_in_progress")}: {" "}
                                            {t(`profile.subscription.request_status_${activePlanRequest.status}`)}
                                        </div>
                                    ) : (
                                        <div className="mt-1 text-xs text-[var(--ohnix-text-muted)]">
                                            {t("dashboard.no_active_plan_request")}
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        type="default"
                                        icon={<ReloadOutlined spin={isPolling} />}
                                        onClick={fetchSubscriptionSnapshot}
                                        title={t("common.refresh")}
                                        className="rounded-full border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-2)] text-[var(--ohnix-text-primary)] hover:border-[#29D8D5]/40 hover:text-[#E9FEFE]"
                                    />
                                    <Button
                                        type="default"
                                        onClick={() => navigate("/billing")}
                                        className="rounded-full border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-2)] text-[var(--ohnix-text-primary)] hover:border-[#29D8D5]/40 hover:text-[#E9FEFE]"
                                    >
                                        {t("dashboard.manage_plan_cta")}
                                    </Button>
                                </div>
                            </div>
                        </div>
                        )}

                        <Row gutter={[16, 16]}>
                            <Col xs={24} sm={12} lg={8}>
                                <StatCard
                                    title={t("dashboard.total_sales")}
                                    value={dashboardData.totalSales}
                                    prefix={<ShoppingCartOutlined />}
                                    valueStyle={{ color: "#34D399" }}
                                    icon={
                                        <ShoppingCartOutlined className="text-2xl text-success" />
                                    }
                                    formatter={(value) =>
                                        formatCurrency(value)
                                    }
                                />
                            </Col>
                            <Col xs={24} sm={12} lg={8}>
                                <StatCard
                                    title={t("dashboard.total_purchases")}
                                    value={dashboardData.totalPurchase}
                                    prefix={<ShoppingOutlined />}
                                    valueStyle={{ color: "#60A5FA" }}
                                    icon={
                                        <ShoppingOutlined className="text-2xl text-primary" />
                                    }
                                    formatter={(value) =>
                                        formatCurrency(value)
                                    }
                                />
                            </Col>
                            <Col xs={24} sm={24} lg={8}>
                                <StatCard
                                    title={t("dashboard.inventory_value")}
                                    value={dashboardData.inventoryValue}
                                    prefix={<DollarOutlined />}
                                    valueStyle={{ color: "#A78BFA" }}
                                    icon={
                                        <DollarOutlined className="text-2xl text-purple" />
                                    }
                                    formatter={(value) =>
                                        formatCurrency(value)
                                    }
                                    precision={2}
                                />
                            </Col>
                            <Col xs={24} sm={8}>
                                <StatCard
                                    title={t("dashboard.total_products")}
                                    value={dashboardData.totalProducts}
                                    icon={
                                        <InboxOutlined className="text-2xl text-blue" />
                                    }
                                />
                            </Col>
                            <Col xs={24} sm={8}>
                                <StatCard
                                    title={t("dashboard.total_stock")}
                                    value={dashboardData.totalStock}
                                    icon={
                                        <ShoppingOutlined className="text-2xl text-cyan" />
                                    }
                                />
                            </Col>
                            <Col xs={24} sm={8}>
                                <StatCard
                                    title={t("dashboard.out_of_stock")}
                                    value={dashboardData.outOfStockCount}
                                    icon={
                                        <WarningOutlined className="text-2xl" />
                                    }
                                    valueStyle={{
                                        color:
                                            dashboardData.outOfStockCount > 0
                                                ? token.colorError
                                                : token.colorSuccess,
                                    }}
                                />
                            </Col>
                        </Row>
                    </div>
                </section>

                <section className="mt-8 animate-fade-up">
                    <Divider className="flex items-center gap-3 mb-6">
                        <div>
                            <h2 className="text-xl font-bold text-[var(--ohnix-text-primary)] m-0 leading-tight">
                                {t("dashboard.analytics_insights")}
                            </h2>
                            <p className="text-sm text-[var(--ohnix-text-muted)] m-0">
                                {t("dashboard.performance_metrics")}
                            </p>
                        </div>
                    </Divider>

                    <div className="space-y-6">
                        <SalesChart salesData={dashboardData.salesData} />

                        <div className="bg-[var(--ohnix-surface-card)] rounded-2xl border border-[var(--ohnix-line-4)] shadow-[var(--ohnix-shadow-card)] p-6 backdrop-blur-md">
                            <div className="flex items-center justify-between gap-4 mb-5">
                                <div>
                                    <h3 className="text-lg font-bold text-[var(--ohnix-text-primary)] m-0 leading-tight">
                                        {t("dashboard.business_pulse")}
                                    </h3>
                                    <p className="text-sm text-[var(--ohnix-text-muted)] m-0">
                                        {t("dashboard.business_pulse_description")}
                                    </p>
                                </div>
                                <Badge
                                    count={stockRiskCount}
                                    style={{
                                        backgroundColor:
                                            stockRiskCount > 0
                                                ? "rgba(250,173,20,0.18)"
                                                : "rgba(41,216,213,0.16)",
                                        color:
                                            stockRiskCount > 0
                                                ? "#FFCF70"
                                                : "#44F3F0",
                                        fontWeight: 700,
                                        boxShadow: "none",
                                    }}
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                                <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4">
                                    <div className="text-xs uppercase tracking-[0.28em] text-[var(--ohnix-text-muted)]">{t("dashboard.net_trade_delta")}</div>
                                    <div className={`mt-2 text-2xl font-semibold ${netTradeDelta >= 0 ? "text-[#44F3F0]" : "text-[#F28B82]"}`}>
                                        {formatCurrency(netTradeDelta)}
                                    </div>
                                    <div className="mt-2 text-sm text-[var(--ohnix-text-muted)]">{t("dashboard.net_trade_delta_description")}</div>
                                </div>

                                <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4">
                                    <div className="text-xs uppercase tracking-[0.28em] text-[var(--ohnix-text-muted)]">{t("dashboard.average_order_value")}</div>
                                    <div className="mt-2 text-2xl font-semibold text-[var(--ohnix-text-primary)]">{formatCurrency(averageOrderValue)}</div>
                                    <div className="mt-2 text-sm text-[var(--ohnix-text-muted)]">{t("dashboard.average_order_value_description")}</div>
                                </div>

                                <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4">
                                    <div className="text-xs uppercase tracking-[0.28em] text-[var(--ohnix-text-muted)]">{t("dashboard.stock_risk")}</div>
                                    <div className="mt-2 text-2xl font-semibold text-[var(--ohnix-text-primary)]">{stockRiskCount}</div>
                                    <div className="mt-2 text-sm text-[var(--ohnix-text-muted)]">{t("dashboard.stock_risk_description")}</div>
                                </div>

                                <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4">
                                    <div className="text-xs uppercase tracking-[0.28em] text-[var(--ohnix-text-muted)]">{t("dashboard.revenue_concentration")}</div>
                                    <div className="mt-2 text-2xl font-semibold text-[var(--ohnix-text-primary)]">{topProductShare.toFixed(1)}%</div>
                                    <div className="mt-2 text-sm text-[var(--ohnix-text-muted)]">{t("dashboard.revenue_concentration_description")}</div>
                                </div>
                            </div>
                        </div>

                        <ProductDistribution
                            topProducts={dashboardData.topProducts}
                        />

                        {dashboardData.topProducts &&
                            dashboardData.topProducts.length > 0 && (
                                <div className="bg-[var(--ohnix-surface-card)] rounded-2xl border border-[var(--ohnix-line-4)] shadow-[var(--ohnix-shadow-card)] p-6 backdrop-blur-md">
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="w-10 h-10 rounded-lg bg-[linear-gradient(135deg,rgba(41,216,213,0.2),rgba(68,243,240,0.1))] border border-[#29D8D5]/25 flex items-center justify-center">
                                            <InfoCircleOutlined className="text-lg text-[#44F3F0]" />
                                        </div>
                                        <div>
                                                <h3 className="text-lg font-bold text-[var(--ohnix-text-primary)] m-0 leading-tight">
                                                    {t("dashboard.quick_insights")}
                                            </h3>
                                                <p className="text-sm text-[var(--ohnix-text-muted)] m-0">
                                                    {t("dashboard.key_product_highlights")}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="p-5 bg-[linear-gradient(145deg,rgba(41,216,213,0.16),rgba(41,216,213,0.04))] rounded-xl border border-[#29D8D5]/30">
                                            <div className="flex items-start justify-between mb-3">
                                                <Text className="text-[#44F3F0] text-xs font-bold uppercase tracking-wider block">
                                                    {t("dashboard.top_performer")}
                                                </Text>
                                                <div className="w-8 h-8 rounded-lg bg-[#29D8D5]/15 border border-[#29D8D5]/35 flex items-center justify-center">
                                                    🏆
                                                </div>
                                            </div>
                                            <Text className="text-base font-bold text-[var(--ohnix-text-primary)] block mb-2">
                                                {topPerformer?.product_name}
                                            </Text>
                                            <Badge
                                                count={t("dashboard.units_sold", {
                                                    count: topPerformer?.quantity_sold,
                                                })}
                                                style={{
                                                    backgroundColor: "rgba(41,216,213,0.22)",
                                                    color: "#44F3F0",
                                                    fontSize: "11px",
                                                    fontWeight: 600,
                                                }}
                                            />
                                        </div>

                                        <div className="p-5 bg-[linear-gradient(145deg,rgba(68,243,240,0.14),rgba(68,243,240,0.03))] rounded-xl border border-[#44F3F0]/28">
                                            <div className="flex items-start justify-between mb-3">
                                                <Text className="text-[#8CECEC] text-xs font-bold uppercase tracking-wider block">
                                                    {t("dashboard.most_profitable")}
                                                </Text>
                                                <div className="w-8 h-8 rounded-lg bg-[#44F3F0]/12 border border-[#44F3F0]/30 flex items-center justify-center">
                                                    💰
                                                </div>
                                            </div>
                                            <Text className="text-base font-bold text-[var(--ohnix-text-primary)] block mb-2">
                                                {mostProfitableProduct?.product_name}
                                            </Text>
                                            <Badge
                                                count={t("dashboard.revenue", {
                                                    value: mostProfitableProduct?.total_sales?.toLocaleString(),
                                                })}
                                                style={{
                                                    backgroundColor: "rgba(68,243,240,0.2)",
                                                    color: "#8CECEC",
                                                    fontSize: "11px",
                                                    fontWeight: 600,
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                    </div>
                </section>

                <section className="mt-8 pb-8 animate-fade-up">
                    <Divider className="flex items-center gap-3 mb-6">
                        <div>
                            <h2 className="text-xl font-bold text-[var(--ohnix-text-primary)] m-0 leading-tight">
                                {t("dashboard.reports_activity")}
                            </h2>
                            <p className="text-sm text-[var(--ohnix-text-muted)] m-0">
                                {t("dashboard.recent_transactions_and_alerts")}
                            </p>
                        </div>
                    </Divider>

                    <div className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-[var(--ohnix-surface-card)] rounded-2xl border border-[var(--ohnix-line-4)] shadow-[var(--ohnix-shadow-card)]">
                                <DataTable
                                    title={t("dashboard.top_selling_products")}
                                    columns={topProductsColumns}
                                    dataSource={dashboardData.topProducts.slice(
                                        0,
                                        5
                                    )}
                                    viewAllLink="/reports/top-products"
                                    pagination={{ pageSize: 5, size: "small" }}
                                />
                            </div>

                            <div className="bg-[var(--ohnix-surface-card)] rounded-2xl border border-[var(--ohnix-line-4)] shadow-[var(--ohnix-shadow-card)]">
                                <DataTable
                                    title={t("dashboard.low_stock_alerts")}
                                    columns={lowStockColumns}
                                    dataSource={dashboardData.lowStockProducts.slice(
                                        0,
                                        5
                                    )}
                                    viewAllLink="/reports/low-stock-alerts"
                                    pagination={{ pageSize: 5, size: "small" }}
                                />
                            </div>
                        </div>

                        <div className="bg-[var(--ohnix-surface-card)] rounded-2xl border border-[var(--ohnix-line-4)] shadow-[var(--ohnix-shadow-card)]">
                            <DataTable
                                title={t("dashboard.recent_orders")}
                                columns={recentOrdersColumns}
                                dataSource={dashboardData.recentOrders.slice(
                                    0,
                                    8
                                )}
                                viewAllLink="/orders"
                                pagination={{ pageSize: 8, size: "small" }}
                            />
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
};

export default Dashboard;
