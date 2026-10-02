import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "antd";
import { LineChartOutlined, LockOutlined } from "@ant-design/icons";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import useI18n from "../../../hooks/useI18n";
import { useCurrency } from "../../../context/CurrencyContext";
import { useTheme } from "../../../context/ThemeContext";

// recharts takes raw SVG presentation attributes, where CSS custom
// properties aren't reliable - plot colors are picked in JS per theme.
const SERIES_COLOR = "#29D8D5";

const SalesTrendCard = ({ period, available, canUpgrade }) => {
    const { t, currentLanguage } = useI18n();
    const { formatCurrency } = useCurrency();
    const { isLite } = useTheme();
    const locale = currentLanguage === "es" ? "es-CO" : "en-US";
    const gridStroke = isLite ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.06)";
    const axisTickFill = isLite ? "#5b6b76" : "#A9B3B8";
    const activeDotStroke = isLite ? "#ffffff" : "#0B0B0B";

    const formatters = useMemo(() => {
        const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
        const longDay = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
        const month = new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit", timeZone: "UTC" });
        const longMonth = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
        const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
        return {
            tick: (date) => (period.isMonthly ? month : day).format(date),
            label: (date) => (period.isMonthly ? longMonth : longDay).format(date),
            axisValue: (value) => `$${compact.format(value)}`,
        };
    }, [locale, period.isMonthly]);

    const chartData = useMemo(
        () => period.points.map((point) => ({ ...point, ts: point.date.getTime() })),
        [period.points]
    );
    const hasSales = period.current.sales > 0;

    const ChartTooltip = ({ active, payload }) => {
        if (!active || !payload?.length) return null;
        const point = payload[0].payload;
        return (
            <div className="rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card-soft)] px-4 py-3 shadow-[var(--ohnix-shadow-dropdown)]">
                <p className="mb-1 text-xs font-medium capitalize text-[var(--ohnix-text-muted)]">
                    {formatters.label(point.date)}
                </p>
                <p className="mb-0 text-base font-bold tabular-nums text-[var(--ohnix-text-primary)]">
                    {formatCurrency(point.sales)}
                </p>
                <p className="mb-0 text-xs text-[var(--ohnix-text-muted)]">
                    {t("dashboard.orders_count", { count: point.orders })}
                </p>
            </div>
        );
    };

    return (
        <section className="flex h-full flex-col rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] p-5 shadow-[var(--ohnix-shadow-card)] sm:p-6">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="m-0 text-base font-semibold text-[var(--ohnix-text-primary)]">
                        {t("dashboard.sales_trend")}
                    </h2>
                    <p className="m-0 mt-0.5 text-xs text-[var(--ohnix-text-muted)]">
                        {t(period.isMonthly ? "dashboard.sales_trend_monthly" : "dashboard.sales_trend_daily")}
                    </p>
                </div>
                {available && hasSales && (
                    <div className="text-right">
                        <div className="text-xs text-[var(--ohnix-text-muted)]">{t("dashboard.period_total")}</div>
                        <div className="text-lg font-bold tabular-nums text-[var(--ohnix-text-primary)]">
                            {formatCurrency(period.current.sales)}
                        </div>
                    </div>
                )}
            </header>

            {!available ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
                    <LockOutlined className="text-2xl text-[var(--ohnix-text-muted)]" />
                    <p className="m-0 max-w-sm text-sm text-[var(--ohnix-text-muted)]">
                        {t("dashboard.sales_trend_locked")}
                    </p>
                    {canUpgrade && (
                        <Link to="/billing">
                            <Button type="default">{t("dashboard.see_plans")}</Button>
                        </Link>
                    )}
                </div>
            ) : !hasSales ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
                    <LineChartOutlined className="text-2xl text-[var(--ohnix-text-muted)]" />
                    <p className="m-0 text-sm font-semibold text-[var(--ohnix-text-primary)]">
                        {t("dashboard.no_sales_in_period")}
                    </p>
                    <p className="m-0 max-w-sm text-sm text-[var(--ohnix-text-muted)]">
                        {t("reports.sales_data_will_be_displayed_here_once_orders_exist")}
                    </p>
                </div>
            ) : (
                <div className="mt-5 h-64 w-full sm:h-72 lg:h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="dashboardSalesFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={SERIES_COLOR} stopOpacity={0.22} />
                                    <stop offset="100%" stopColor={SERIES_COLOR} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} stroke={gridStroke} />
                            <XAxis
                                dataKey="ts"
                                tickFormatter={(ts) => formatters.tick(new Date(ts))}
                                axisLine={false}
                                tickLine={false}
                                tickMargin={10}
                                minTickGap={28}
                                interval="preserveStartEnd"
                                tick={{ fill: axisTickFill, fontSize: 11 }}
                            />
                            <YAxis
                                tickFormatter={formatters.axisValue}
                                axisLine={false}
                                tickLine={false}
                                tickMargin={8}
                                width={56}
                                tick={{ fill: axisTickFill, fontSize: 11 }}
                            />
                            <Tooltip
                                content={<ChartTooltip />}
                                cursor={{ stroke: axisTickFill, strokeWidth: 1, strokeDasharray: "3 3" }}
                            />
                            <Area
                                type="monotone"
                                dataKey="sales"
                                stroke={SERIES_COLOR}
                                strokeWidth={2}
                                fill="url(#dashboardSalesFill)"
                                dot={false}
                                activeDot={{ r: 5, strokeWidth: 2, stroke: activeDotStroke, fill: SERIES_COLOR }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </section>
    );
};

export default SalesTrendCard;
