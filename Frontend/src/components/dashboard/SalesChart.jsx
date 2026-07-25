import React, { useMemo } from "react";
import { Empty, Typography, Spin } from "antd";
import {
    LineChartOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
} from "@ant-design/icons";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";

const { Text, Title } = Typography;

const SalesChart = ({ salesData = {}, loading = false }) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();

    const salesByDate = useMemo(() => {
        if (Array.isArray(salesData)) {
            return salesData;
        } else if (
            salesData?.salesByDate &&
            Array.isArray(salesData.salesByDate)
        ) {
            return salesData.salesByDate;
        }
        return [];
    }, [salesData]);

    const chartData = useMemo(
        () =>
            salesByDate.map((item) => ({
                date: item._id,
                sales: item.total,
                orders: item.orders || 0,
            })),
        [salesByDate]
    );

    const hasSalesData = chartData && chartData.length > 0;

    const totalSales = useMemo(
        () =>
            hasSalesData
                ? chartData.reduce((sum, item) => sum + item.sales, 0)
                : 0,
        [chartData, hasSalesData]
    );

    const totalOrders = useMemo(
        () =>
            hasSalesData
                ? chartData.reduce((sum, item) => sum + (item.orders || 0), 0)
                : 0,
        [chartData, hasSalesData]
    );

    const averageSales = useMemo(
        () =>
            hasSalesData && chartData.length > 0
                ? totalSales / chartData.length
                : 0,
        [totalSales, chartData, hasSalesData]
    );

    const trend = useMemo(() => {
        if (!hasSalesData || chartData.length < 2) return 0;

        const splitPoint = Math.floor(chartData.length / 2);
        const firstHalf = chartData.slice(0, splitPoint);
        const secondHalf = chartData.slice(splitPoint);

        const firstHalfTotal = firstHalf.reduce(
            (sum, item) => sum + item.sales,
            0
        );
        const secondHalfTotal = secondHalf.reduce(
            (sum, item) => sum + item.sales,
            0
        );

        if (firstHalfTotal === 0) return secondHalfTotal > 0 ? 100 : 0;
        return ((secondHalfTotal - firstHalfTotal) / firstHalfTotal) * 100;
    }, [chartData, hasSalesData]);

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="rounded-xl border border-white/10 bg-[#0B0B0B]/96 px-4 py-3 shadow-[0_18px_30px_rgba(0,0,0,0.4)]">
                    <p className="text-[#A9B3B8] text-xs font-medium mb-1">
                        {label}
                    </p>
                    <p className="text-[#44F3F0] font-bold text-base mb-0">
                        {formatCurrency(Number(payload[0].value))}
                    </p>
                </div>
            );
        }
        return null;
    };

    const formatRupees = (value) => formatCurrency(Number(value));

    const summaryData = useMemo(() => {
        if (salesData && salesData.summary) {
            return salesData.summary;
        }
        return {
            totalSales,
            totalOrders,
        };
    }, [salesData, totalSales, totalOrders]);

    return (
        <section className="w-full rounded-2xl border border-white/10 bg-[#0B0B0B]/92 shadow-[0_18px_40px_rgba(0,0,0,0.35)] overflow-hidden reveal-card">
            <header className="px-6 py-5 border-b border-white/8">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[linear-gradient(135deg,rgba(41,216,213,0.22),rgba(68,243,240,0.12))] border border-[#29D8D5]/25 flex items-center justify-center shadow-sm">
                        <LineChartOutlined className="text-[#44F3F0] text-lg" />
                    </div>
                    <div>
                        <h2 className="m-0 text-white font-bold text-lg leading-tight">
                            {t("reports.sales_performance")}
                        </h2>
                        <p className="m-0 text-[#A9B3B8] text-xs mt-0.5">
                            {t("reports.track_revenue_and_order_trends")}
                        </p>
                    </div>
                </div>
            </header>

            {loading ? (
                <div className="flex justify-center items-center py-32">
                    <Spin size="large" />
                </div>
            ) : hasSalesData ? (
                <div className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
                            <Text className="text-[#A9B3B8] text-xs font-semibold uppercase tracking-wider block mb-2">
                                {t("reports.total_sales")}
                            </Text>
                            <div className="text-white text-3xl font-bold">
                                {formatCurrency(summaryData.totalSales)}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
                            <Text className="text-[#A9B3B8] text-xs font-semibold uppercase tracking-wider block mb-2">
                                {t("orders.total_orders")}
                            </Text>
                            <div className="text-white text-3xl font-bold">
                                {summaryData.totalOrders}
                            </div>
                        </div>

                        <div
                            className={`px-5 py-4 rounded-xl border-2 sm:col-span-2 lg:col-span-1 ${
                                trend > 0
                                    ? "bg-white/[0.03] border-[#29D8D5]/25"
                                    : trend < 0
                                      ? "bg-white/[0.03] border-rose-400/30"
                                      : "bg-white/[0.03] border-white/10"
                            }`}
                        >
                            <Text
                                className={`text-xs font-semibold uppercase tracking-wider block mb-2 ${
                                    trend > 0
                                        ? "text-[#44F3F0]"
                                        : trend < 0
                                          ? "text-rose-700"
                                          : "text-[#A9B3B8]"
                                }`}
                            >
                                {t("reports.growth_trend")}
                            </Text>
                            <div
                                className={`flex items-center text-3xl font-bold ${
                                    trend > 0
                                        ? "text-white"
                                        : trend < 0
                                          ? "text-white"
                                          : "text-white"
                                }`}
                            >
                                {trend > 0 ? (
                                    <ArrowUpOutlined className="mr-2 text-[#44F3F0] text-xl" />
                                ) : trend < 0 ? (
                                    <ArrowDownOutlined className="mr-2 text-rose-400 text-xl" />
                                ) : null}
                                {trend > 0 ? "+" : ""}
                                {trend.toFixed(1)}%
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                        <div className="w-full h-80 sm:h-96 lg:h-[420px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart
                                    data={chartData}
                                    margin={{
                                        top: 10,
                                        right: 10,
                                        left: 0,
                                        bottom: 10,
                                    }}
                                >
                                    <defs>
                                        <linearGradient
                                            id="colorSales"
                                            x1="0"
                                            y1="0"
                                            x2="0"
                                            y2="1"
                                        >
                                            <stop
                                                offset="5%"
                                                stopColor="#3b82f6"
                                                stopOpacity={0.3}
                                            />
                                            <stop
                                                offset="95%"
                                                stopColor="#3b82f6"
                                                stopOpacity={0.05}
                                            />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        vertical={false}
                                        stroke="rgba(255,255,255,0.08)"
                                    />
                                    <XAxis
                                        dataKey="date"
                                        axisLine={false}
                                        tickLine={false}
                                        tickMargin={12}
                                        tick={{
                                            fill: "#A9B3B8",
                                            fontSize: 11,
                                            fontWeight: 500,
                                        }}
                                    />
                                    <YAxis
                                        tickFormatter={formatRupees}
                                        axisLine={false}
                                        tickLine={false}
                                        tickMargin={12}
                                        tick={{
                                            fill: "#A9B3B8",
                                            fontSize: 11,
                                            fontWeight: 500,
                                        }}
                                        width={70}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area
                                        type="monotone"
                                        dataKey="sales"
                                        stroke="#44F3F0"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorSales)"
                                        activeDot={{
                                            r: 6,
                                            strokeWidth: 3,
                                            stroke: "#0B0B0B",
                                            fill: "#44F3F0",
                                        }}
                                        dot={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mt-5 pt-5 border-t border-white/10">
                        <span className="text-sm text-[#A9B3B8] font-medium">
                            {t("reports.average_daily_sales")}
                        </span>
                        <span className="text-lg font-bold text-white">
                            {formatCurrency(averageSales)}
                        </span>
                    </div>
                </div>
            ) : (
                <div className="py-32 flex items-center justify-center">
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                            <div className="text-center">
                                <div className="text-white font-semibold text-base mb-2">
                                    {t("reports.no_sales_data_available")}
                                </div>
                                <p className="text-sm text-[#A9B3B8] mb-0 max-w-xs mx-auto">
                                    {t(
                                        "reports.sales_data_will_be_displayed_here_once_orders_exist"
                                    )}
                                </p>
                            </div>
                        }
                    />
                </div>
            )}
        </section>
    );
};

export default SalesChart;
