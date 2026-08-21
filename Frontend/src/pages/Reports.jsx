import React, { useState, useContext } from "react";
import { Card, Tabs, Badge, Alert } from "antd";
import {
    FileTextOutlined,
    ShoppingCartOutlined,
    InboxOutlined,
    TrophyOutlined,
    AlertOutlined,
    BarChartOutlined,
} from "@ant-design/icons";
import PageHeader from "../components/common/PageHeader";
import StockReport from "../components/reports/StockReport";
import SalesReport from "../components/reports/SalesReport";
import PurchaseReport from "../components/reports/PurchaseReport";
import TopProductsReport from "../components/reports/TopProductsReport";
import AdvancedReports from "../components/reports/AdvancedReports";
import LowStockAlertsPanel from "../components/reports/LowStockAlertsPanel";
import PlanGate from "../components/common/PlanGate";
import AuthContext from "../context/AuthContext";
import useI18n from "../hooks/useI18n";
import useSubscription from "../hooks/useSubscription";

const Reports = () => {
    const [activeTab, setActiveTab] = useState("stock");
    const { user } = useContext(AuthContext);
    const { t, currentLanguage } = useI18n();
    const { can, loading: subscriptionLoading } = useSubscription();
    const hasAutoEmailAlerts = can("autoEmailAlerts");
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
        <div className="p-3 sm:p-6 max-w-7xl mx-auto text-[var(--ohnix-text-primary)]">
            <div className="no-print">
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
            </div>

            {/* Print-only document header - hidden on screen, revealed by the
                print stylesheet (index.css) so a printed report reads as an
                actual document instead of a screenshot of the dashboard. */}
            <div className="print-only mb-6">
                <div className="flex items-baseline justify-between border-b border-black pb-2">
                    <span className="text-xl font-bold">
                        {user?.company?.name || "Ohnix"}
                    </span>
                    <span className="text-xs">Ohnix</span>
                </div>
                <h2 className="mt-3 mb-1 text-lg font-bold">
                    {t("reports.print_report_label")}: {tabLabelByKey[activeTab]}
                </h2>
                <p className="mb-1 text-sm">{reportDescriptions[activeTab]}</p>
                <p className="text-xs">
                    {t("reports.print_generated_for")}: {user?.company?.name || user?.username}
                    {" · "}
                    {t("reports.print_generated_on")}: {new Date().toLocaleString(currentLanguage)}
                </p>
            </div>

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
                    className="no-print mb-4 sm:mb-6 dark-alert dark-alert-purple"
                />
            )}

            <LowStockAlertsPanel />

            {/* Reports Tabs */}
            <Card className="shadow-sm border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card-soft)]" size={isMobile ? "small" : "default"}>
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={tabItems}
                    size={isMobile ? "default" : "large"}
                    className="custom-tabs"
                    tabBarStyle={{
                        marginBottom: isMobile ? "16px" : "24px",
                        borderBottom: "1px solid var(--ohnix-line-4)",
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
                <Card className="no-print mb-4 border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card-soft)]" size="small">
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
                    <p className="text-xs text-[var(--ohnix-text-muted)] mt-2 mb-0">
                        {reportDescriptions[activeTab]}
                    </p>
                </Card>
            )}

            {/* Footer Info */}
            <div
                className={`no-print mt-6 sm:mt-8 text-center text-[var(--ohnix-text-muted)] ${
                    isMobile ? "text-xs" : "text-sm"
                }`}
            >
                <p className="px-2">
                    {t("reports.reports_generated_realtime")}
                    {user?.role === "admin"
                        ? ` ${t("reports.admin_view_shows_system_wide_data")}`
                        : ` ${t("reports.data_filtered_to_your_account")}`}
                </p>
                {/* subscriptionLoading: same plan-resolution race as LowStockAlertsPanel.jsx
                    (useSubscription's plan starts unresolved) - skip this line entirely
                    until we actually know, instead of flashing the locked copy on every
                    Negocio+ account's first paint. */}
                {!(user?.role === "admin") && subscriptionLoading ? null : (
                    <p className="mt-1 px-2">
                        {user?.role === "admin" || hasAutoEmailAlerts
                            ? t("reports.low_stock_alerts_footer")
                            : t("reports.low_stock_alerts_footer_locked")}
                    </p>
                )}
                <p className="mt-1 px-2">
                    {t("reports.last_updated")}: {new Date().toLocaleString(currentLanguage)}
                </p>
            </div>
        </div>
    );
};

export default Reports;
