import React, { useState, useEffect, useContext } from "react";
import { Card, DatePicker, Button, Tabs, Table, Row, Col } from "antd";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { CalendarOutlined, RiseOutlined, FallOutlined } from "@ant-design/icons";
import { api } from "../../api/api";
import AuthContext from "../../context/AuthContext";
import { useCurrency } from "../../context/CurrencyContext";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import StatCard from "../dashboard/StatCard";
import useI18n from "../../hooks/useI18n";

const { RangePicker } = DatePicker;

const ChangeBadge = ({ value }) => {
    const positive = value >= 0;
    const Icon = positive ? RiseOutlined : FallOutlined;
    return (
        <span className={`inline-flex items-center gap-1 text-sm font-medium ${positive ? "text-green-500" : "text-red-400"}`}>
            <Icon /> {positive ? "+" : ""}{value}%
        </span>
    );
};

const AdvancedReports = () => {
    const [activeTab, setActiveTab] = useState("margin");
    const [dateRange, setDateRange] = useState([dayjs().subtract(30, "days"), dayjs()]);
    const [loading, setLoading] = useState(false);
    const [marginData, setMarginData] = useState(null);
    const [customersData, setCustomersData] = useState(null);
    const [teamData, setTeamData] = useState(null);
    const [comparisonData, setComparisonData] = useState(null);
    const { user } = useContext(AuthContext);
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();

    const dateParams = () => ({
        start_date: dateRange[0].format("YYYY-MM-DD"),
        end_date: dateRange[1].format("YYYY-MM-DD"),
    });

    const fetchAll = async () => {
        try {
            setLoading(true);
            const params = dateParams();
            const [margin, customers, team, comparison] = await Promise.all([
                api.get("/reports/profit-margin", { params }),
                api.get("/reports/top-customers", { params }),
                api.get("/reports/sales-by-team", { params }),
                api.get("/reports/period-comparison", { params }),
            ]);
            setMarginData(margin.data.data);
            setCustomersData(customers.data.data);
            setTeamData(team.data.data);
            setComparisonData(comparison.data.data);
        } catch (error) {
            toast.error(error.response?.data?.message || t("reports.advanced.failed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleDateRangeChange = (dates) => {
        if (dates && dates.length === 2) {
            setDateRange(dates);
        }
    };

    const marginColumns = [
        { title: t("products.product_name"), dataIndex: "product_name", key: "product_name", ellipsis: true },
        { title: t("reports.quantity_sold"), dataIndex: "quantity", key: "quantity", width: 100, responsive: ["sm"] },
        { title: t("reports.total_sales"), dataIndex: "revenue", key: "revenue", render: (v) => formatCurrency(v), width: 130 },
        { title: t("reports.advanced.margin"), dataIndex: "margin", key: "margin", render: (v) => <span className={v >= 0 ? "text-green-500" : "text-red-400"}>{formatCurrency(v)}</span>, width: 130 },
        { title: t("reports.advanced.margin_percent"), dataIndex: "marginPercent", key: "marginPercent", render: (v) => `${v}%`, width: 100, responsive: ["md"] },
    ];

    const customerColumns = [
        { title: t("customers.customer_name"), dataIndex: "customer_name", key: "customer_name", ellipsis: true },
        { title: t("reports.advanced.orders_count"), dataIndex: "orderCount", key: "orderCount", width: 100 },
        { title: t("reports.total_sales"), dataIndex: "totalRevenue", key: "totalRevenue", render: (v) => formatCurrency(v), width: 130 },
        { title: t("reports.advanced.avg_order_value"), dataIndex: "avgOrderValue", key: "avgOrderValue", render: (v) => formatCurrency(v), width: 130, responsive: ["md"] },
    ];

    const teamColumns = [
        { title: t("reports.advanced.team_member"), dataIndex: "username", key: "username", ellipsis: true },
        { title: t("reports.advanced.orders_count"), dataIndex: "orderCount", key: "orderCount", width: 100 },
        { title: t("reports.total_sales"), dataIndex: "totalRevenue", key: "totalRevenue", render: (v) => formatCurrency(v), width: 130 },
    ];

    const filterBar = (
        <Card className="module-shell border border-[var(--ohnix-line-4)] overflow-hidden hover-lift mb-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div className="flex flex-col sm:flex-row gap-3">
                    <RangePicker
                        value={dateRange}
                        onChange={handleDateRangeChange}
                        format="YYYY-MM-DD"
                        allowClear={false}
                        className="w-full sm:w-auto auth-ohnix-input"
                    />
                    <Button type="primary" icon={<CalendarOutlined />} onClick={fetchAll} loading={loading}>
                        {t("reports.refresh_report")}
                    </Button>
                </div>
            </div>
        </Card>
    );

    const tabItems = [
        {
            key: "margin",
            label: t("reports.advanced.margin_tab"),
            children: marginData && (
                <>
                    <Row gutter={[16, 16]} className="mb-4">
                        <Col xs={24} sm={8}>
                            <StatCard title={t("reports.total_sales")} value={marginData.summary.totalRevenue} formatter={formatCurrency} valueStyle={{ color: "#1890ff" }} />
                        </Col>
                        <Col xs={24} sm={8}>
                            <StatCard title={t("reports.advanced.margin")} value={marginData.summary.totalMargin} formatter={formatCurrency} valueStyle={{ color: marginData.summary.totalMargin >= 0 ? "#52c41a" : "#f5222d" }} />
                        </Col>
                        <Col xs={24} sm={8}>
                            <StatCard title={t("reports.advanced.margin_percent")} value={marginData.summary.marginPercent} suffix="%" valueStyle={{ color: "#7C6AF7" }} />
                        </Col>
                    </Row>
                    {marginData.byProduct.length > 0 && (
                        <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4" title={t("reports.advanced.margin_by_product")}>
                            <ResponsiveContainer width="100%" height={320}>
                                <BarChart data={marginData.byProduct.slice(0, 8)}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="product_name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={100} interval={0} />
                                    <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                                    <Tooltip formatter={(v) => formatCurrency(v)} />
                                    <Bar dataKey="margin" fill="#52c41a" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>
                    )}
                    <Card className="module-shell border border-[var(--ohnix-line-4)]">
                        <Table columns={marginColumns} dataSource={marginData.byProduct} rowKey="_id" loading={loading} pagination={{ pageSize: 10 }} className="module-dark-table" scroll={{ x: 500 }} />
                    </Card>
                </>
            ),
        },
        {
            key: "customers",
            label: t("reports.advanced.customers_tab"),
            children: customersData && (
                <>
                    {customersData.customers.length > 0 && (
                        <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4" title={t("reports.advanced.top_customers_by_revenue")}>
                            <ResponsiveContainer width="100%" height={320}>
                                <BarChart data={customersData.customers.slice(0, 8)}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="customer_name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={100} interval={0} />
                                    <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                                    <Tooltip formatter={(v) => formatCurrency(v)} />
                                    <Bar dataKey="totalRevenue" fill="#29D8D5" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>
                    )}
                    <Card className="module-shell border border-[var(--ohnix-line-4)]">
                        <Table columns={customerColumns} dataSource={customersData.customers} rowKey="_id" loading={loading} pagination={{ pageSize: 10 }} className="module-dark-table" scroll={{ x: 500 }} />
                    </Card>
                </>
            ),
        },
        {
            key: "team",
            label: t("reports.advanced.team_tab"),
            children: teamData && (
                <>
                    {teamData.members.length > 0 && (
                        <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4" title={t("reports.advanced.sales_by_team")}>
                            <ResponsiveContainer width="100%" height={320}>
                                <BarChart data={teamData.members}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="username" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={100} interval={0} />
                                    <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                                    <Tooltip formatter={(v) => formatCurrency(v)} />
                                    <Bar dataKey="totalRevenue" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>
                    )}
                    <Card className="module-shell border border-[var(--ohnix-line-4)]">
                        <Table columns={teamColumns} dataSource={teamData.members} rowKey="_id" loading={loading} pagination={{ pageSize: 10 }} className="module-dark-table" scroll={{ x: 400 }} />
                    </Card>
                </>
            ),
        },
        {
            key: "comparison",
            label: t("reports.advanced.comparison_tab"),
            children: comparisonData && (
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12}>
                        <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("reports.total_sales")}>
                            <div className="text-2xl font-bold text-[var(--ohnix-text-primary)] mb-1">{formatCurrency(comparisonData.current.totalSales)}</div>
                            <div className="text-xs text-[var(--ohnix-text-muted)] mb-2">{t("reports.advanced.vs_previous_period")}: {formatCurrency(comparisonData.previous.totalSales)}</div>
                            <ChangeBadge value={comparisonData.change.sales} />
                        </Card>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("orders.total_orders")}>
                            <div className="text-2xl font-bold text-[var(--ohnix-text-primary)] mb-1">{comparisonData.current.totalOrders}</div>
                            <div className="text-xs text-[var(--ohnix-text-muted)] mb-2">{t("reports.advanced.vs_previous_period")}: {comparisonData.previous.totalOrders}</div>
                            <ChangeBadge value={comparisonData.change.orders} />
                        </Card>
                    </Col>
                </Row>
            ),
        },
    ];

    return (
        <div className="space-y-4">
            {filterBar}
            <Card className="module-shell border border-[var(--ohnix-line-4)] overflow-hidden">
                <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} className="custom-tabs" />
            </Card>
        </div>
    );
};

export default AdvancedReports;
