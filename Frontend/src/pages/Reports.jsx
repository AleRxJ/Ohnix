import React, { useState, useContext, useEffect } from "react";
import { Card, Tabs, Badge, Button, Space, Alert, Tooltip } from "antd";
import {
    FileTextOutlined,
    ShoppingCartOutlined,
    InboxOutlined,
    TrophyOutlined,
    AlertOutlined,
    BarChartOutlined,
    MailOutlined,
    ClockCircleOutlined,
    SettingOutlined,
} from "@ant-design/icons";
import PageHeader from "../components/common/PageHeader";
import StockReport from "../components/reports/StockReport";
import SalesReport from "../components/reports/SalesReport";
import PurchaseReport from "../components/reports/PurchaseReport";
import TopProductsReport from "../components/reports/TopProductsReport";
import AdvancedReports from "../components/reports/AdvancedReports";
import PlanGate from "../components/common/PlanGate";
import AuthContext from "../context/AuthContext";
import { api } from "../api/api";
import toast from "react-hot-toast";
import useI18n from "../hooks/useI18n";
import useSubscription from "../hooks/useSubscription";

const Reports = () => {
    const [activeTab, setActiveTab] = useState("stock");
    const [triggeringAlert, setTriggeringAlert] = useState(false);
    const [schedulerStatus, setSchedulerStatus] = useState(null);
    const { user } = useContext(AuthContext);
    const { t, currentLanguage } = useI18n();
    const { can } = useSubscription();
    const isMobile = window.innerWidth < 768;

    const tabLabelByKey = {
        stock: isMobile ? t("reports.stock") : t("reports.stock_report"),
        sales: isMobile ? t("reports.sales") : t("reports.sales_report"),
        purchases: isMobile ? t("reports.purchases") : t("reports.purchase_report"),
        "top-products": isMobile
            ? t("reports.top")
            : t("reports.top_products"),
        advanced: t("reports.advanced.tab_label"),
    };

    // New function for admin to manually trigger alerts (for testing)
    const triggerLowStockAlert = async () => {
        try {
            setTriggeringAlert(true);
            const response = await api.post("/scheduler/trigger-alerts");

            if (response.data.success) {
                const { sent, failed, noLowStock, total } = response.data.data;
                toast.success(
                    `Alert process completed! 📧 Sent: ${sent}, ✅ No low stock: ${noLowStock}, ❌ Failed: ${failed} (Total users: ${total})`
                );
            }
        } catch (error) {
            toast.error(
                error.response?.data?.message ||
                    "Failed to trigger low stock alerts"
            );
        } finally {
            setTriggeringAlert(false);
        }
    };

    // Get scheduler status (for admin)
    const getSchedulerStatus = async () => {
        try {
            const response = await api.get("/scheduler/status");
            if (response.data.success) {
                setSchedulerStatus(response.data.data);
            }
        } catch (error) {
            console.error("Failed to get scheduler status:", error);
        }
    };

    // Load scheduler status on component mount for admin
    useEffect(() => {
        if (user?.role === "admin") {
            getSchedulerStatus();
        }
    }, [user]);

    const tabItems = [
        {
            key: "stock",
            label: (
                <span
                    className={`flex items-center ${isMobile ? "text-xs" : "text-sm"}`}
                >
                    <InboxOutlined
                        className={`${isMobile ? "mr-1 text-xs" : "mr-1 text-sm"}`}
                    />
                    {tabLabelByKey.stock}
                </span>
            ),
            children: <StockReport />,
        },
        {
            key: "sales",
            label: (
                <span
                    className={`flex items-center ${isMobile ? "text-xs" : "text-sm"}`}
                >
                    <ShoppingCartOutlined
                        className={`${isMobile ? "mr-1 text-xs" : "mr-1 text-sm"}`}
                    />
                    {tabLabelByKey.sales}
                </span>
            ),
            children: can("reportSales") ? <SalesReport /> : <PlanGate featureKey="reportSales" />,
        },
        {
            key: "purchases",
            label: (
                <span
                    className={`flex items-center ${isMobile ? "text-xs" : "text-sm"}`}
                >
                    <FileTextOutlined
                        className={`${isMobile ? "mr-1 text-xs" : "mr-1 text-sm"}`}
                    />
                    {tabLabelByKey.purchases}
                </span>
            ),
            children: can("reportPurchases") ? <PurchaseReport /> : <PlanGate featureKey="reportPurchases" />,
        },
        {
            key: "top-products",
            label: (
                <span
                    className={`flex items-center ${isMobile ? "text-xs" : "text-sm"}`}
                >
                    <TrophyOutlined
                        className={`${isMobile ? "mr-1 text-xs" : "mr-1 text-sm"}`}
                    />
                    {tabLabelByKey["top-products"]}
                </span>
            ),
            children: can("reportTopProducts") ? <TopProductsReport /> : <PlanGate featureKey="reportTopProducts" />,
        },
        {
            key: "advanced",
            label: (
                <span
                    className={`flex items-center ${isMobile ? "text-xs" : "text-sm"}`}
                >
                    <BarChartOutlined
                        className={`${isMobile ? "mr-1 text-xs" : "mr-1 text-sm"}`}
                    />
                    {tabLabelByKey.advanced}
                </span>
            ),
            children: can("advancedReports") ? <AdvancedReports /> : <PlanGate featureKey="advancedReports" />,
        },
    ];

    const reportDescriptions = {
        stock: t("reports.report_description_stock"),
        sales: t("reports.report_description_sales"),
        purchases: t("reports.report_description_purchases"),
        "top-products": t("reports.report_description_top_products"),
        advanced: t("reports.advanced.description"),
    };

    return (
        <div className="p-3 sm:p-6 max-w-7xl mx-auto text-white">
            <PageHeader
                title={
                    <span className="text-lg sm:text-xl md:text-2xl">
                        {isMobile
                            ? t("reports.reports_and_analytics")
                            : t("reports.business_reports_and_analytics")}
                    </span>
                }
                subtitle={
                    <span className="text-sm sm:text-base">
                        {isMobile
                            ? t("reports.comprehensive_business_insights")
                            : t("reports.comprehensive_business_insights_long")}
                    </span>
                }
            />

            {/* Admin Notice */}
            {user?.role === "admin" && (
                <Alert
                    message={t("reports.admin_view")}
                    description={
                        isMobile
                            ? t("reports.admin_viewing_system_wide_data_short")
                            : t("reports.admin_viewing_system_wide_data_long")
                    }
                    type="info"
                    showIcon
                    className="mb-4 sm:mb-6"
                />
            )}

            {/* Automatic Low Stock Alert Info */}
            <Alert
                message={t("reports.automatic_low_stock_alerts")}
                description={
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <span className={isMobile ? "text-xs" : "text-sm"}>
                                {t("reports.low_stock_alert_schedule")}
                                {user?.role === "admin"
                                    ? ` ${t("reports.low_stock_alert_admin_suffix")}`
                                    : ` ${t("reports.low_stock_alert_user_suffix")}`}
                            </span>
                            {user?.role === "admin" && (
                                <div className="flex gap-2 items-center">
                                    {schedulerStatus && (
                                        <Badge
                                            status={
                                                schedulerStatus.isRunning
                                                    ? "processing"
                                                    : "error"
                                            }
                                            text={
                                                schedulerStatus.isRunning
                                                    ? t("reports.scheduler_running")
                                                    : t("reports.scheduler_stopped")
                                            }
                                        />
                                    )}
                                    <Button
                                        type="link"
                                        icon={<SettingOutlined />}
                                        size="small"
                                        onClick={triggerLowStockAlert}
                                        loading={triggeringAlert}
                                    >
                                        {t("reports.test_alerts")}
                                    </Button>
                                </div>
                            )}
                        </div>
                        {schedulerStatus && user?.role === "admin" && (
                            <div className="text-xs text-gray-500">
                                {t("reports.threshold")}:{" "}
                                {schedulerStatus.threshold} {t("reports.units")} |
                                {t("reports.next_run")}:{" "}
                                {schedulerStatus.nextRun
                                    ? new Date(
                                          schedulerStatus.nextRun
                                      ).toLocaleString(currentLanguage)
                                    : t("reports.not_scheduled")}
                            </div>
                        )}
                    </div>
                }
                type="success"
                showIcon
                icon={<ClockCircleOutlined />}
                className="mb-4 sm:mb-6"
            />

            {/* Quick Actions */}
            <Card
                className="mb-4 sm:mb-6 border border-white/10 bg-[#0B0B0B]/90"
                size={isMobile ? "small" : "default"}
            >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1">
                        <h3
                            className={`font-semibold mb-2 ${
                                isMobile ? "text-base" : "text-lg"
                            }`}
                        >
                            {t("reports.quick_actions")}
                        </h3>
                        <p
                            className={`text-[#A9B3B8] ${
                                isMobile ? "text-xs" : "text-sm"
                            }`}
                        >
                            {isMobile
                                ? t("reports.business_insights_and_actions")
                                : reportDescriptions[activeTab]}
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
                        {user?.role === "admin" && (
                            <Tooltip title={t("reports.manual_trigger_alerts_tooltip")}>
                                <Button
                                    type="primary"
                                    icon={<AlertOutlined />}
                                    onClick={triggerLowStockAlert}
                                    loading={triggeringAlert}
                                    size={isMobile ? "middle" : "default"}
                                    disabled={
                                        schedulerStatus &&
                                        !schedulerStatus.isRunning
                                    }
                                >
                                    {isMobile
                                        ? t("reports.test_alerts")
                                        : t("reports.trigger_test_alerts")}
                                </Button>
                            </Tooltip>
                        )}
                        <Button
                            icon={<BarChartOutlined />}
                            onClick={() => window.print()}
                            size={isMobile ? "middle" : "default"}
                        >
                            {isMobile
                                ? t("reports.print")
                                : t("reports.print_report")}
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Reports Tabs */}
            <Card className="shadow-sm border border-white/10 bg-[#0B0B0B]/90" size={isMobile ? "small" : "default"}>
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={tabItems}
                    size={isMobile ? "default" : "large"}
                    className="custom-tabs"
                    tabBarStyle={{
                        marginBottom: isMobile ? "16px" : "24px",
                        borderBottom: "1px solid rgba(255,255,255,0.1)",
                    }}
                    tabPosition={isMobile ? "top" : "top"}
                    tabBarExtraContent={
                        !isMobile ? (
                            <div className="flex items-center space-x-2">
                                <Badge
                                    status={
                                        activeTab === "stock"
                                            ? "processing"
                                            : "default"
                                    }
                                    text={activeTab === "stock" ? t("common.active") : ""}
                                />
                                {activeTab === "stock" && (
                                    <AlertOutlined
                                        className="text-orange-500"
                                        title={t("reports.stock_monitoring_active")}
                                    />
                                )}
                            </div>
                        ) : null
                    }
                />
            </Card>

            {/* Mobile Active Tab Indicator */}
            {isMobile && (
                <Card className="mb-4 border border-white/10 bg-[#0B0B0B]/90" size="small">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                            <Badge
                                status={
                                    activeTab === "stock"
                                        ? "processing"
                                        : "default"
                                }
                                text={tabLabelByKey[activeTab]}
                            />
                            {activeTab === "stock" && (
                                <AlertOutlined
                                    className="text-orange-500"
                                    title={t("reports.stock_monitoring_active")}
                                />
                            )}
                        </div>
                    </div>
                    <p className="text-xs text-[#A9B3B8] mt-2 mb-0">
                        {reportDescriptions[activeTab]}
                    </p>
                </Card>
            )}

            {/* Footer Info */}
            <div
                className={`mt-6 sm:mt-8 text-center text-[#A9B3B8] ${
                    isMobile ? "text-xs" : "text-sm"
                }`}
            >
                <p className="px-2">
                    {t("reports.reports_generated_realtime")}
                    {user?.role === "admin"
                        ? ` ${t("reports.admin_view_shows_system_wide_data")}`
                        : ` ${t("reports.data_filtered_to_your_account")}`}
                </p>
                <p className="mt-1 px-2">
                    {t("reports.low_stock_alerts_footer")}
                </p>
                <p className="mt-1 px-2">
                    {t("reports.last_updated")}: {new Date().toLocaleString(currentLanguage)}
                </p>
            </div>
        </div>
    );
};

export default Reports;
