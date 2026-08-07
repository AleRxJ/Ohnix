import React, { useState, useEffect, useContext } from "react";
import {
    Card,
    Select,
    Button,
    Space,
    Table,
    Avatar,
    Row,
    Col,
    Statistic,
} from "antd";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from "recharts";
import {
    TrophyOutlined,
    ShoppingCartOutlined,
    DollarOutlined,
    ReloadOutlined,
} from "@ant-design/icons";
import { api } from "../../api/api";
import AuthContext from "../../context/AuthContext";
import { useCurrency } from "../../context/CurrencyContext";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import StatCard from "../dashboard/StatCard";
import useI18n from "../../hooks/useI18n";
import ReportExportButtons from "./ReportExportButtons";
import { downloadCsv, downloadExcel } from "../../utils/exportReport";

const { Option } = Select;

const TopProductsReport = () => {
    const [topProducts, setTopProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [limit, setLimit] = useState(10);
    const { user } = useContext(AuthContext);
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();

    const COLORS = [
        "#0088FE",
        "#00C49F",
        "#FFBB28",
        "#FF8042",
        "#8884d8",
        "#82ca9d",
        "#ffc658",
        "#ff7300",
        "#a4de6c",
        "#ffc0cb",
    ];

    useEffect(() => {
        fetchTopProducts();
    }, [limit]);

    const fetchTopProducts = async () => {
        try {
            setLoading(true);
            const response = await api.get(
                `/reports/top-products?limit=${limit}`
            );
            if (response.data.success) {
                setTopProducts(response.data.data);
            }
        } catch (error) {
            toast.error(
                error.response?.data?.message ||
                        t("reports.failed_top_products_report")
            );
        } finally {
            setLoading(false);
        }
    };

    const buildReportRows = () => {
        const rows = [];

        rows.push([t("reports.top_products_report_summary")]);
        const summary = calculateSummary();
        rows.push([t("reports.total_products"), summary.totalProducts]);
        rows.push([t("reports.total_quantity_sold"), summary.totalQuantitySold]);
        rows.push([
            t("orders.total_revenue"),
            formatCurrency(summary.totalRevenue),
        ]);
        rows.push([""]);

        rows.push([
            t("reports.rank"),
            t("products.product_code"),
            t("products.product_name"),
            t("reports.quantity_sold"),
            t("reports.total_sales_rupees"),
            t("reports.average_price_rupees"),
        ]);

        topProducts.forEach((item, index) => {
            const avgPrice =
                item.quantity_sold > 0
                    ? item.total_sales / item.quantity_sold
                    : 0;
            rows.push([
                index + 1,
                item.product_code,
                item.product_name,
                item.quantity_sold,
                formatCurrency(item.total_sales),
                formatCurrency(avgPrice),
            ]);
        });

        return rows;
    };

    const exportToCSV = () => {
        if (topProducts.length === 0) {
            toast.error(t("reports.no_data_to_export"));
            return;
        }
        downloadCsv(buildReportRows(), `top-products-report-${dayjs().format("YYYY-MM-DD")}.csv`);
        toast.success(t("reports.top_products_report_exported"));
    };

    const exportToExcel = () => {
        if (topProducts.length === 0) {
            toast.error(t("reports.no_data_to_export"));
            return;
        }
        downloadExcel(
            buildReportRows(),
            `top-products-report-${dayjs().format("YYYY-MM-DD")}.xlsx`,
            t("reports.top_products_report_summary")
        );
        toast.success(t("reports.top_products_report_exported"));
    };

    const columns = [
        {
            title: t("reports.rank"),
            key: "rank",
            render: (_, __, index) => (
                <div className="flex items-center">
                    {index < 3 ? (
                        <TrophyOutlined
                            className={`mr-1 sm:mr-2 ${
                                index === 0
                                    ? "text-yellow-500"
                                    : index === 1
                                      ? "text-gray-400"
                                      : "text-orange-600"
                            }`}
                            style={{
                                fontSize:
                                    window.innerWidth < 768 ? "14px" : "18px",
                            }}
                        />
                    ) : null}
                    <span className="font-medium text-xs sm:text-sm">
                        #{index + 1}
                    </span>
                </div>
            ),
            width: window.innerWidth < 768 ? 60 : 80,
        },
        {
            title: t("products.product"),
            key: "product",
            render: (record) => (
                <div className="flex items-center space-x-2 sm:space-x-3">
                    <Avatar
                        src={record.product_image}
                        size={window.innerWidth < 768 ? "small" : "large"}
                        className="bg-gray-200 flex-shrink-0"
                    >
                        {record.product_name?.charAt(0)?.toUpperCase()}
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <div className="font-medium text-xs sm:text-sm truncate">
                            {record.product_name}
                        </div>
                        <div className="text-gray-500 text-xs truncate">
                            {record.product_code}
                        </div>
                    </div>
                </div>
            ),
            sorter: (a, b) => a.product_name.localeCompare(b.product_name),
            width: window.innerWidth < 768 ? 140 : 250,
            ellipsis: true,
        },
        {
            title: window.innerWidth < 768 ? t("reports.qty") : t("reports.quantity_sold"),
            dataIndex: "quantity_sold",
            key: "quantity_sold",
            sorter: (a, b) => a.quantity_sold - b.quantity_sold,
            render: (quantity) => (
                <div className="text-center">
                    <div
                        className={`font-bold text-blue-600 ${
                            window.innerWidth < 768 ? "text-sm" : "text-lg"
                        }`}
                    >
                        {quantity}
                    </div>
                    <div className="text-gray-500 text-xs hidden sm:block">
                        {t("reports.units")}
                    </div>
                </div>
            ),
            width: window.innerWidth < 768 ? 60 : 120,
        },
        {
            title: window.innerWidth < 768 ? t("reports.sales") : t("reports.total_sales"),
            dataIndex: "total_sales",
            key: "total_sales",
            sorter: (a, b) => a.total_sales - b.total_sales,
            render: (sales) => (
                <div className="text-center">
                    <div
                        className={`font-bold text-green-600 ${
                            window.innerWidth < 768 ? "text-xs" : "text-lg"
                        }`}
                    >
                        {formatCurrency(sales)}
                    </div>
                    <div className="text-gray-500 text-xs hidden sm:block">
                        {t("reports.revenue")}
                    </div>
                </div>
            ),
            width: window.innerWidth < 768 ? 70 : 120,
        },
        {
            title: t("reports.avg_price"),
            key: "avg_price",
            render: (record) => {
                const avgPrice =
                    record.quantity_sold > 0
                        ? record.total_sales / record.quantity_sold
                        : 0;
                return (
                    <div className="text-center">
                        <div
                            className={`font-medium text-purple-600 ${
                                window.innerWidth < 768
                                    ? "text-xs"
                                    : "text-base"
                            }`}
                        >
                            {formatCurrency(avgPrice)}
                        </div>
                        <div className="text-gray-500 text-xs hidden md:block">
                            {t("reports.per_unit")}
                        </div>
                    </div>
                );
            },
            width: window.innerWidth < 768 ? 70 : 120,
            responsive: ["sm"],
        },
    ];

    const calculateSummary = () => {
        const totalQuantitySold = topProducts.reduce(
            (sum, product) => sum + product.quantity_sold,
            0
        );
        const totalRevenue = topProducts.reduce(
            (sum, product) => sum + product.total_sales,
            0
        );
        const totalProducts = topProducts.length;

        return { totalQuantitySold, totalRevenue, totalProducts };
    };

    const summary = calculateSummary();

    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Controls */}
            <Card
                title={
                    <span className="text-sm sm:text-base text-white">
                        {t("reports.top_products_configuration")}
                    </span>
                }
                className="module-shell border border-white/10"
            >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <span className="text-sm text-[#A9B3B8]">{t("reports.show_top")}</span>
                        <Select
                            value={limit}
                            onChange={setLimit}
                            className="w-full sm:w-32"
                            size={window.innerWidth < 768 ? "middle" : "large"}
                        >
                            <Option value={5}>{t("reports.products_count", { count: 5 })}</Option>
                            <Option value={10}>{t("reports.products_count", { count: 10 })}</Option>
                            <Option value={15}>{t("reports.products_count", { count: 15 })}</Option>
                            <Option value={20}>{t("reports.products_count", { count: 20 })}</Option>
                            <Option value={25}>{t("reports.products_count", { count: 25 })}</Option>
                        </Select>
                        <Button
                            type="primary"
                            icon={<ReloadOutlined />}
                            onClick={fetchTopProducts}
                            loading={loading}
                            className="w-full sm:w-auto"
                            size={window.innerWidth < 768 ? "middle" : "large"}
                        >
                            <span className="hidden sm:inline">{t("common.refresh")}</span>
                            <span className="sm:hidden">{t("common.refresh")}</span>
                        </Button>
                    </div>
                    <ReportExportButtons
                        hasData={topProducts.length > 0}
                        onExportCsv={exportToCSV}
                        onExportExcel={exportToExcel}
                    />
                </div>
            </Card>

            {/* Summary Cards */}
            {topProducts.length > 0 && (
                <Row gutter={[16, 16]} className="mb-4 sm:mb-6">
                    <Col xs={24} sm={8} lg={8}>
                        <StatCard
                            title={
                                window.innerWidth < 768
                                        ? t("common.products")
                                        : t("reports.total_products")
                            }
                            value={summary.totalProducts}
                            icon={
                                <TrophyOutlined className="text-xl sm:text-2xl text-blue" />
                            }
                            valueStyle={{ color: "#1890ff" }}
                            className="dashboard-stat-card"
                        />
                    </Col>
                    <Col xs={24} sm={8} lg={8}>
                        <StatCard
                            title={
                                window.innerWidth < 768
                                        ? t("reports.qty_sold")
                                        : t("reports.total_quantity_sold")
                            }
                            value={summary.totalQuantitySold}
                            icon={
                                <ShoppingCartOutlined className="text-xl sm:text-2xl text-green" />
                            }
                            valueStyle={{ color: "#52c41a" }}
                            className="dashboard-stat-card"
                        />
                    </Col>
                    <Col xs={24} sm={8} lg={8}>
                        <StatCard
                            title={
                                window.innerWidth < 768
                                        ? t("reports.revenue")
                                        : t("orders.total_revenue")
                            }
                            value={summary.totalRevenue}
                            icon={
                                <DollarOutlined className="text-xl sm:text-2xl text-purple" />
                            }
                            valueStyle={{ color: "#722ed1" }}
                            className="dashboard-stat-card"
                            formatter={(value) => formatCurrency(value)}
                            precision={window.innerWidth < 768 ? 0 : 2}
                        />
                    </Col>
                </Row>
            )}

            {topProducts.length > 0 && (
                <Row gutter={[12, 12]}>
                    {/* Quantity Sold Chart */}
                    <Col xs={24} lg={12}>
                        <Card
                            title={
                                <span className="text-sm sm:text-base text-white">
                                    {window.innerWidth < 768
                                        ? t("reports.top_by_quantity")
                                        : t("reports.top_products_by_quantity_sold")}
                                </span>
                            }
                            className="h-full module-shell border border-white/10"
                        >
                            <div className="w-full overflow-x-auto">
                                <ResponsiveContainer
                                    width="100%"
                                    height={window.innerWidth < 768 ? 300 : 400}
                                    minWidth={280}
                                >
                                    <BarChart
                                        data={topProducts.slice(
                                            0,
                                            window.innerWidth < 768 ? 5 : 10
                                        )}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="product_name"
                                            tick={{
                                                fontSize:
                                                    window.innerWidth < 768
                                                        ? 8
                                                        : 10,
                                            }}
                                            angle={
                                                window.innerWidth < 768
                                                    ? -90
                                                    : -30
                                            }
                                            textAnchor="end"
                                            height={
                                                window.innerWidth < 768
                                                    ? 140
                                                    : 120
                                            }
                                            interval={0}
                                        />
                                        <YAxis
                                            tick={{
                                                fontSize:
                                                    window.innerWidth < 768
                                                        ? 10
                                                        : 12,
                                            }}
                                        />
                                        <Tooltip
                                            formatter={(value, name) => [
                                                value,
                                                t("reports.quantity_sold")
                                            ]}
                                            labelFormatter={(label) =>
                                                `${t("products.product")}: ${label}`
                                            }
                                        />
                                        <Legend />
                                        <Bar
                                            dataKey="quantity_sold"
                                            fill="#44F3F0"
                                            name={t("reports.quantity_sold")}
                                            radius={[4, 4, 0, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                    </Col>

                    {/* Revenue Chart */}
                    <Col xs={24} lg={12}>
                        <Card
                            title={
                                <span className="text-sm sm:text-base text-white">
                                    {window.innerWidth < 768
                                        ? t("reports.top_by_revenue")
                                        : t("reports.top_products_by_revenue")}
                                </span>
                            }
                            className="h-full module-shell border border-white/10"
                        >
                            <div className="w-full overflow-x-auto">
                                <ResponsiveContainer
                                    width="100%"
                                    height={window.innerWidth < 768 ? 300 : 400}
                                    minWidth={280}
                                >
                                    <BarChart
                                        data={topProducts.slice(
                                            0,
                                            window.innerWidth < 768 ? 5 : 10
                                        )}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="product_name"
                                            tick={{
                                                fontSize:
                                                    window.innerWidth < 768
                                                        ? 8
                                                        : 10,
                                            }}
                                            angle={
                                                window.innerWidth < 768
                                                    ? -90
                                                    : -30
                                            }
                                            textAnchor="end"
                                            height={
                                                window.innerWidth < 768
                                                    ? 140
                                                    : 120
                                            }
                                            interval={0}
                                        />
                                        <YAxis
                                            tick={{
                                                fontSize:
                                                    window.innerWidth < 768
                                                        ? 10
                                                        : 12,
                                            }}
                                            tickFormatter={(value) =>
                                                formatCurrency(value)
                                            }
                                        />
                                        <Tooltip
                                            formatter={(value, name) => [
                                                formatCurrency(value),
                                                t("reports.revenue"),
                                            ]}
                                            labelFormatter={(label) =>
                                                `${t("products.product")}: ${label}`
                                            }
                                        />
                                        <Legend />
                                        <Bar
                                            dataKey="total_sales"
                                            fill="#29D8D5"
                                            name={t("reports.revenue")}
                                            radius={[4, 4, 0, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                    </Col>
                </Row>
            )}

            {/* Revenue Distribution Pie Chart */}
            {topProducts.length > 0 && (
                <Card
                    title={
                        <span className="text-sm sm:text-base text-white">
                            {window.innerWidth < 768
                                ? t("reports.revenue")
                                : t("reports.revenue_distribution_by_product")}
                        </span>
                    }
                    className="w-full module-shell border border-white/10"
                >
                    <div className="w-full overflow-x-auto">
                        <ResponsiveContainer
                            width="100%"
                            height={window.innerWidth < 768 ? 350 : 500}
                            minWidth={300}
                        >
                            <PieChart>
                                <Pie
                                    data={topProducts.slice(
                                        0,
                                        window.innerWidth < 768 ? 5 : 10
                                    )}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({
                                        product_name,
                                        percent,
                                        total_sales,
                                    }) => {
                                        const maxLength =
                                            window.innerWidth < 768 ? 8 : 15;
                                        const displayName =
                                            product_name.length > maxLength
                                                ? `${product_name.substring(0, maxLength)}...`
                                                : product_name;
                                        return `${displayName} (${(percent * 100).toFixed(1)}%)`;
                                    }}
                                    outerRadius={
                                        window.innerWidth < 768 ? 100 : 150
                                    }
                                    fill="#8884d8"
                                    dataKey="total_sales"
                                >
                                    {topProducts
                                        .slice(
                                            0,
                                            window.innerWidth < 768 ? 5 : 10
                                        )
                                        .map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={
                                                    COLORS[
                                                        index % COLORS.length
                                                    ]
                                                }
                                            />
                                        ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value, name) => [
                                        formatCurrency(value),
                                        t("reports.revenue"),
                                    ]}
                                />
                                <Legend
                                    wrapperStyle={{ paddingTop: "20px" }}
                                    formatter={(value, entry) => {
                                        const name = entry.payload.product_name;
                                        const maxLength =
                                            window.innerWidth < 768 ? 12 : 25;
                                        const displayName =
                                            name.length > maxLength
                                                ? `${name.substring(0, maxLength)}...`
                                                : name;
                                        return `${displayName} - ${formatCurrency(entry.payload.total_sales)}`;
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            )}

            {/* Top Products Table */}
            <Card
                title={
                    <span className="text-sm sm:text-base">
                        {window.innerWidth < 768
                            ? `Top ${limit} Products`
                            : `Top ${limit} Best Selling Products`}
                    </span>
                }
            >
                <div className="overflow-x-auto">
                    <Table
                        columns={columns}
                        dataSource={topProducts}
                        rowKey="_id"
                        loading={loading}
                        pagination={{
                            pageSize: window.innerWidth < 768 ? 5 : 10,
                            showSizeChanger: window.innerWidth >= 768,
                            showQuickJumper: window.innerWidth >= 1024,
                            showTotal: (total, range) =>
                                window.innerWidth >= 768
                                    ? `${range[0]}-${range[1]} of ${total} items`
                                    : `${range[0]}-${range[1]}/${total}`,
                            simple: window.innerWidth < 768,
                        }}
                        scroll={{ x: 400 }}
                        size={window.innerWidth < 768 ? "small" : "middle"}
                        className="top-products-table module-dark-table"
                        rowClassName={() => "bg-transparent hover:bg-white/[0.05]"}
                    />
                </div>
            </Card>

            {topProducts.length === 0 && !loading && (
                <Card className="module-shell border border-white/10">
                    <div className="text-center py-8 sm:py-12">
                        <TrophyOutlined
                            style={{
                                fontSize:
                                    window.innerWidth < 768 ? "36px" : "48px",
                                color: "#29D8D5",
                            }}
                        />
                        <p className="text-[#A9B3B8] mt-4 text-sm sm:text-base px-4">
                            {t("reports.top_products_no_data")}
                        </p>
                        <p className="text-[#8B98A0] text-xs sm:text-sm px-4">
                            {t("reports.top_products_no_data_help")}
                        </p>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default TopProductsReport;
