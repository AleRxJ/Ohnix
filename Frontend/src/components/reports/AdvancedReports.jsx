import React, { useState, useEffect, useContext } from "react";
import { Card, DatePicker, Button, Tabs, Table, Row, Col, Tag, Alert, Select } from "antd";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { CalendarOutlined, RiseOutlined, FallOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { api } from "../../api/api";
import AuthContext from "../../context/AuthContext";
import { useCurrency } from "../../context/CurrencyContext";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import StatCard from "../dashboard/StatCard";
import ReportExportButtons from "./ReportExportButtons";
import { downloadCsv, downloadExcel, downloadPdfReport } from "../../utils/exportReport";
import useI18n from "../../hooks/useI18n";

const { RangePicker } = DatePicker;

// Colombia files IVA on a fixed bimestral calendar (Ene-Feb, Mar-Abr, ...,
// Nov-Dic) - a generic "last 30 days" range almost never lines up with a
// real filing period, which is the actual reason the VAT tab read as
// unfinished despite already computing correct numbers. index is 0-5.
const BIMONTHLY_LABEL_KEYS = ["vat_bimonthly_1", "vat_bimonthly_2", "vat_bimonthly_3", "vat_bimonthly_4", "vat_bimonthly_5", "vat_bimonthly_6"];
const getBimonthlyRange = (year, index) => {
    const start = dayjs(`${year}-${String(index * 2 + 1).padStart(2, "0")}-01`);
    return [start, start.add(1, "month").endOf("month")];
};
const getCurrentBimonthlyIndex = (date = dayjs()) => Math.floor(date.month() / 2);
const rangesMatch = (a, b) => a[0].isSame(b[0], "day") && a[1].isSame(b[1], "day");

const ChangeBadge = ({ value }) => {
    const positive = value >= 0;
    const Icon = positive ? RiseOutlined : FallOutlined;
    return (
        <span className={`inline-flex items-center gap-1 text-sm font-medium ${positive ? "text-[var(--ohnix-status-success)]" : "text-[var(--ohnix-status-danger)]"}`}>
            <Icon /> {positive ? "+" : ""}{value}%
        </span>
    );
};

const AdvancedReports = ({ defaultSubTab } = {}) => {
    const [activeTab, setActiveTab] = useState(defaultSubTab || "margin");
    // A visitor landing directly on "vat" (e.g. Accounting.jsx's overview
    // card deep-link) should see the current bimestre out of the gate, not
    // an arbitrary 30-day window they'd have to immediately replace.
    const [dateRange, setDateRange] = useState(() =>
        defaultSubTab === "vat" ? getBimonthlyRange(dayjs().year(), getCurrentBimonthlyIndex()) : [dayjs().subtract(30, "days"), dayjs()]
    );
    const [loading, setLoading] = useState(false);
    const [marginData, setMarginData] = useState(null);
    const [customersData, setCustomersData] = useState(null);
    const [teamData, setTeamData] = useState(null);
    const [comparisonData, setComparisonData] = useState(null);
    const [vatData, setVatData] = useState(null);
    const [carteraData, setCarteraData] = useState(null);
    const { user } = useContext(AuthContext);
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();

    const dateParams = (range = dateRange) => ({
        start_date: range[0].format("YYYY-MM-DD"),
        end_date: range[1].format("YYYY-MM-DD"),
    });

    // Independent per-report requests (allSettled, not all) - each sub-tab's
    // data only depends on its own request having succeeded. With Promise.all
    // any single report failing (e.g. sales-by-team erroring on an edge case)
    // rejected the whole batch and left every OTHER tab's state - including
    // vatData - stuck at null, so a genuinely working VAT report looked
    // exactly like a missing feature.
    const fetchAll = async (range = dateRange) => {
        setLoading(true);
        const params = dateParams(range);
        const requests = [
            { key: "margin_tab", url: "/reports/profit-margin", setData: setMarginData },
            { key: "customers_tab", url: "/reports/top-customers", setData: setCustomersData },
            { key: "team_tab", url: "/reports/sales-by-team", setData: setTeamData },
            { key: "comparison_tab", url: "/reports/period-comparison", setData: setComparisonData },
            { key: "vat_tab", url: "/reports/vat", setData: setVatData },
            { key: "cartera_tab", url: "/reports/cartera", setData: setCarteraData },
        ];
        const results = await Promise.allSettled(requests.map((r) => api.get(r.url, { params })));

        const failedLabels = [];
        results.forEach((result, index) => {
            const { key, setData } = requests[index];
            if (result.status === "fulfilled") {
                setData(result.value.data.data);
            } else {
                failedLabels.push(t(`reports.advanced.${key}`));
            }
        });
        if (failedLabels.length > 0) {
            toast.error(t("reports.advanced.partial_failure", { reports: failedLabels.join(", ") }));
        }
        setLoading(false);
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

    // Current year's bimestres up to the one in progress, then all six of
    // last year (for a late/backdated filing) - newest first.
    const bimonthlyOptions = () => {
        const now = dayjs();
        const options = [];
        for (const year of [now.year(), now.year() - 1]) {
            const maxIndex = year === now.year() ? getCurrentBimonthlyIndex(now) : 5;
            for (let index = maxIndex; index >= 0; index--) {
                options.push({ year, index });
            }
        }
        return options.map(({ year, index }) => ({
            value: `${year}-${index}`,
            label: `${t(`reports.advanced.${BIMONTHLY_LABEL_KEYS[index]}`)} ${year}`,
        }));
    };
    const selectedBimonthlyValue = (() => {
        for (const year of [dateRange[0].year(), dateRange[0].year() - 1, dateRange[0].year() + 1]) {
            for (let index = 0; index < 6; index++) {
                if (rangesMatch(dateRange, getBimonthlyRange(year, index))) return `${year}-${index}`;
            }
        }
        return undefined;
    })();
    const handleBimonthlySelect = (value) => {
        const [year, index] = value.split("-").map(Number);
        const range = getBimonthlyRange(year, index);
        setDateRange(range);
        fetchAll(range);
    };

    const marginColumns = [
        { title: t("products.product_name"), dataIndex: "product_name", key: "product_name", ellipsis: true },
        { title: t("reports.quantity_sold"), dataIndex: "quantity", key: "quantity", width: 100, responsive: ["sm"] },
        { title: t("reports.total_sales"), dataIndex: "revenue", key: "revenue", render: (v) => formatCurrency(v), width: 130 },
        { title: t("reports.advanced.margin"), dataIndex: "margin", key: "margin", render: (v) => <span className={v >= 0 ? "text-[var(--ohnix-status-success)]" : "text-[var(--ohnix-status-danger)]"}>{formatCurrency(v)}</span>, width: 130 },
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

    const vatColumns = [
        { title: t("reports.advanced.vat_rate_column"), dataIndex: "rate", key: "rate", render: (v) => `${v}%`, width: 90 },
        { title: t("reports.advanced.vat_base_column"), dataIndex: "base", key: "base", render: (v) => formatCurrency(v), width: 130 },
        { title: t("reports.advanced.vat_tax_column"), dataIndex: "taxAmount", key: "taxAmount", render: (v) => formatCurrency(v), width: 130 },
        { title: t("reports.advanced.vat_lines_column"), dataIndex: "lineCount", key: "lineCount", width: 90, responsive: ["sm"] },
    ];

    // Mirrors SalesReport.jsx's export shape (buildReportRows for CSV/Excel,
    // a title/subtitle/sections payload for the server-rendered PDF) - the
    // VAT tab was the one advanced report with no export path at all, which
    // undercuts its entire "listo para tu declaración bimestral" promise: a
    // number a user can't hand to their accountant might as well not exist.
    const buildVatReportRows = () => {
        const rows = [
            [t("reports.advanced.vat_tab")],
            [`${dateRange[0].format("YYYY-MM-DD")} - ${dateRange[1].format("YYYY-MM-DD")}`],
            [],
        ];
        rows.push([t("reports.sales")]);
        rows.push([t("reports.advanced.vat_taxed_base"), formatCurrency(vatData.summary.taxedBase)]);
        rows.push([t("reports.advanced.vat_excluded_base"), formatCurrency(vatData.summary.excludedBase)]);
        rows.push([t("reports.advanced.vat_exempt_base"), formatCurrency(vatData.summary.exemptBase)]);
        rows.push([t("reports.advanced.vat_collected"), formatCurrency(vatData.summary.taxCollected)]);
        rows.push([]);
        rows.push([t("reports.purchases")]);
        rows.push([t("reports.advanced.vat_taxed_base_purchases"), formatCurrency(vatData.summary.taxedBasePurchases)]);
        rows.push([t("reports.advanced.vat_excluded_base_purchases"), formatCurrency(vatData.summary.excludedBasePurchases)]);
        rows.push([t("reports.advanced.vat_exempt_base_purchases"), formatCurrency(vatData.summary.exemptBasePurchases)]);
        rows.push([t("reports.advanced.vat_credited"), formatCurrency(vatData.summary.taxCredited)]);
        rows.push([]);
        rows.push([vatData.summary.netVat >= 0 ? t("reports.advanced.vat_net_payable") : t("reports.advanced.vat_net_credit_balance"), formatCurrency(Math.abs(vatData.summary.netVat))]);
        rows.push([]);

        rows.push([t("reports.advanced.vat_by_rate")]);
        rows.push([t("reports.advanced.vat_rate_column"), t("reports.advanced.vat_base_column"), t("reports.advanced.vat_tax_column"), t("reports.advanced.vat_lines_column")]);
        vatData.byRate.forEach((row) => rows.push([`${row.rate}%`, formatCurrency(row.base), formatCurrency(row.taxAmount), String(row.lineCount)]));
        rows.push([]);

        if (vatData.byRatePurchases?.length > 0) {
            rows.push([t("reports.advanced.vat_credited_by_rate")]);
            rows.push([t("reports.advanced.vat_rate_column"), t("reports.advanced.vat_base_column"), t("reports.advanced.vat_tax_column"), t("reports.advanced.vat_lines_column")]);
            vatData.byRatePurchases.forEach((row) => rows.push([`${row.rate}%`, formatCurrency(row.base), formatCurrency(row.taxAmount), String(row.lineCount)]));
            rows.push([]);
        }

        if (vatData.manualAdjustments?.length > 0) {
            rows.push([t("reports.advanced.vat_manual_adjustments_title")]);
            rows.push([t("reports.advanced.vat_manual_adjustments_col_date"), t("reports.advanced.vat_manual_adjustments_col_description"), t("reports.advanced.vat_manual_adjustments_col_generated"), t("reports.advanced.vat_manual_adjustments_col_deductible")]);
            vatData.manualAdjustments.forEach((row) => rows.push([dayjs(row.entryDate).format("DD/MM/YYYY"), row.description || "", row.generatedDelta ? formatCurrency(row.generatedDelta) : "", row.deductibleDelta ? formatCurrency(row.deductibleDelta) : ""]));
        }

        return rows;
    };

    const exportVatCsv = async () => {
        if (!vatData) { toast.error(t("reports.no_data_to_export")); return; }
        try {
            await downloadCsv(buildVatReportRows(), `iva-${dateRange[0].format("YYYY-MM-DD")}_${dateRange[1].format("YYYY-MM-DD")}.csv`);
            toast.success(t("reports.advanced.vat_report_exported"));
        } catch (error) {
            toast.error(error.response?.data?.message || t("reports.export_csv_failed"));
        }
    };

    const exportVatExcel = async () => {
        if (!vatData) { toast.error(t("reports.no_data_to_export")); return; }
        try {
            await downloadExcel(buildVatReportRows(), `iva-${dateRange[0].format("YYYY-MM-DD")}_${dateRange[1].format("YYYY-MM-DD")}.xlsx`, t("reports.advanced.vat_tab"));
            toast.success(t("reports.advanced.vat_report_exported"));
        } catch (error) {
            toast.error(error.response?.data?.message || t("reports.export_excel_failed"));
        }
    };

    const exportVatPdf = async () => {
        if (!vatData) { toast.error(t("reports.no_data_to_export")); return; }
        try {
            await downloadPdfReport(
                {
                    title: t("reports.advanced.vat_tab"),
                    subtitle: `${dateRange[0].format("YYYY-MM-DD")} - ${dateRange[1].format("YYYY-MM-DD")}`,
                    sections: [
                        {
                            heading: t("reports.sales"),
                            summary: [
                                [t("reports.advanced.vat_taxed_base"), formatCurrency(vatData.summary.taxedBase)],
                                [t("reports.advanced.vat_excluded_base"), formatCurrency(vatData.summary.excludedBase)],
                                [t("reports.advanced.vat_exempt_base"), formatCurrency(vatData.summary.exemptBase)],
                                [t("reports.advanced.vat_collected"), formatCurrency(vatData.summary.taxCollected)],
                            ],
                        },
                        {
                            heading: t("reports.purchases"),
                            summary: [
                                [t("reports.advanced.vat_taxed_base_purchases"), formatCurrency(vatData.summary.taxedBasePurchases)],
                                [t("reports.advanced.vat_excluded_base_purchases"), formatCurrency(vatData.summary.excludedBasePurchases)],
                                [t("reports.advanced.vat_exempt_base_purchases"), formatCurrency(vatData.summary.exemptBasePurchases)],
                                [t("reports.advanced.vat_credited"), formatCurrency(vatData.summary.taxCredited)],
                            ],
                        },
                        {
                            summary: [
                                [vatData.summary.netVat >= 0 ? t("reports.advanced.vat_net_payable") : t("reports.advanced.vat_net_credit_balance"), formatCurrency(Math.abs(vatData.summary.netVat))],
                            ],
                        },
                        {
                            heading: t("reports.advanced.vat_by_rate"),
                            table: {
                                headers: [t("reports.advanced.vat_rate_column"), t("reports.advanced.vat_base_column"), t("reports.advanced.vat_tax_column"), t("reports.advanced.vat_lines_column")],
                                rows: vatData.byRate.map((row) => [`${row.rate}%`, formatCurrency(row.base), formatCurrency(row.taxAmount), String(row.lineCount)]),
                            },
                        },
                        ...(vatData.byRatePurchases?.length > 0 ? [{
                            heading: t("reports.advanced.vat_credited_by_rate"),
                            table: {
                                headers: [t("reports.advanced.vat_rate_column"), t("reports.advanced.vat_base_column"), t("reports.advanced.vat_tax_column"), t("reports.advanced.vat_lines_column")],
                                rows: vatData.byRatePurchases.map((row) => [`${row.rate}%`, formatCurrency(row.base), formatCurrency(row.taxAmount), String(row.lineCount)]),
                            },
                        }] : []),
                        ...(vatData.manualAdjustments?.length > 0 ? [{
                            heading: t("reports.advanced.vat_manual_adjustments_title"),
                            table: {
                                headers: [t("reports.advanced.vat_manual_adjustments_col_date"), t("reports.advanced.vat_manual_adjustments_col_description"), t("reports.advanced.vat_manual_adjustments_col_generated"), t("reports.advanced.vat_manual_adjustments_col_deductible")],
                                rows: vatData.manualAdjustments.map((row) => [dayjs(row.entryDate).format("DD/MM/YYYY"), row.description || "", row.generatedDelta ? formatCurrency(row.generatedDelta) : "", row.deductibleDelta ? formatCurrency(row.deductibleDelta) : ""]),
                            },
                        }] : []),
                    ],
                },
                `iva-${dateRange[0].format("YYYY-MM-DD")}_${dateRange[1].format("YYYY-MM-DD")}.pdf`
            );
            toast.success(t("reports.advanced.vat_report_exported"));
        } catch (error) {
            toast.error(error.response?.data?.message || t("reports.export_pdf_failed"));
        }
    };

    const carteraPartyColumns = (nameKey, nameTitle) => [
        { title: nameTitle, dataIndex: "name", key: "name", ellipsis: true },
        { title: t("reports.advanced.cartera_documents_column"), dataIndex: "documentCount", key: "documentCount", width: 100 },
        { title: t("reports.advanced.cartera_total_column"), dataIndex: "total", key: "total", render: (v) => formatCurrency(v), width: 120 },
        { title: t("reports.advanced.cartera_paid_column"), dataIndex: "paid", key: "paid", render: (v) => formatCurrency(v), width: 120, responsive: ["sm"] },
        { title: t("reports.advanced.cartera_pending_column"), dataIndex: "pending", key: "pending", render: (v) => <span className="font-semibold text-[var(--ohnix-status-danger)]">{formatCurrency(v)}</span>, width: 130 },
    ];

    const carteraDocumentColumns = (docKey, docTitle, partyKey, partyTitle) => [
        { title: docTitle, dataIndex: docKey, key: docKey, width: 120 },
        { title: partyTitle, dataIndex: partyKey, key: partyKey, render: (v) => v?.name || t("common.na"), ellipsis: true },
        { title: t("common.total"), dataIndex: "total", key: "total", render: (v) => formatCurrency(v), width: 120, responsive: ["sm"] },
        { title: t("finance.pending_balance_label"), dataIndex: "pending", key: "pending", render: (v) => <span className="font-semibold text-[var(--ohnix-status-danger)]">{formatCurrency(v)}</span>, width: 130 },
        { title: t("reports.advanced.cartera_due_date_column"), dataIndex: "due_date", key: "due_date", width: 125, render: (v) => v ? dayjs(v).format("DD/MM/YYYY") : <Tag>{t("reports.advanced.cartera_unscheduled")}</Tag> },
        {
            title: t("reports.advanced.cartera_days_overdue_column"),
            dataIndex: "days_overdue",
            key: "days_overdue",
            width: 110,
            render: (v) => v === null || v === undefined ? "—" : <span className={v > 30 ? "text-[var(--ohnix-status-danger)] font-semibold" : v > 0 ? "text-[var(--ohnix-status-warning)]" : ""}>{v}</span>,
        },
    ];

    const filterBar = (
        <Card className="module-shell border border-[var(--ohnix-line-4)] overflow-hidden hover-lift mb-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div className="flex flex-col sm:flex-row gap-3">
                    {activeTab === "vat" && (
                        <Select
                            placeholder={t("reports.advanced.vat_bimonthly_placeholder")}
                            className="w-full sm:w-48"
                            value={selectedBimonthlyValue}
                            onChange={handleBimonthlySelect}
                            options={bimonthlyOptions()}
                        />
                    )}
                    <RangePicker
                        value={dateRange}
                        onChange={handleDateRangeChange}
                        format="YYYY-MM-DD"
                        allowClear={false}
                        className="w-full sm:w-auto auth-ohnix-input"
                    />
                    <Button type="primary" icon={<CalendarOutlined />} onClick={() => fetchAll()} loading={loading}>
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
                            <StatCard title={t("reports.total_sales")} value={marginData.summary.totalRevenue} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-info)" }} />
                        </Col>
                        <Col xs={24} sm={8}>
                            <StatCard title={t("reports.advanced.margin")} value={marginData.summary.totalMargin} formatter={formatCurrency} valueStyle={{ color: marginData.summary.totalMargin >= 0 ? "var(--ohnix-status-success)" : "var(--ohnix-status-danger)" }} />
                        </Col>
                        <Col xs={24} sm={8}>
                            <StatCard title={t("reports.advanced.margin_percent")} value={marginData.summary.marginPercent} suffix="%" valueStyle={{ color: "var(--ohnix-status-purple)" }} />
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
                                    <Bar dataKey="margin" fill="var(--ohnix-status-success)" radius={[4, 4, 0, 0]} />
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
                                    <Bar dataKey="totalRevenue" fill="var(--ohnix-accent)" radius={[4, 4, 0, 0]} />
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
                                    <Bar dataKey="totalRevenue" fill="var(--ohnix-status-amber)" radius={[4, 4, 0, 0]} />
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
        {
            key: "vat",
            label: t("reports.advanced.vat_tab"),
            children: vatData && (
                <>
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card-soft)] p-3 text-xs text-[var(--ohnix-text-muted)]">
                        <InfoCircleOutlined className="mt-0.5 text-[var(--ohnix-accent-2)]" />
                        <span>{t("reports.advanced.vat_disclaimer")}</span>
                    </div>
                    <div className="flex justify-end mb-4">
                        <ReportExportButtons hasData={Boolean(vatData)} onExportCsv={exportVatCsv} onExportExcel={exportVatExcel} onExportPdf={exportVatPdf} />
                    </div>
                    <h4 className="text-sm font-semibold text-[var(--ohnix-text-primary)] mb-2">{t("reports.sales")}</h4>
                    <Row gutter={[16, 16]} className="mb-4">
                        <Col xs={12} sm={6}>
                            <StatCard title={t("reports.advanced.vat_taxed_base")} value={vatData.summary.taxedBase} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-info)" }} />
                        </Col>
                        <Col xs={12} sm={6}>
                            <StatCard title={t("reports.advanced.vat_excluded_base")} value={vatData.summary.excludedBase} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-purple)" }} />
                        </Col>
                        <Col xs={12} sm={6}>
                            <StatCard title={t("reports.advanced.vat_exempt_base")} value={vatData.summary.exemptBase} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-amber)" }} />
                        </Col>
                        <Col xs={12} sm={6}>
                            <StatCard title={t("reports.advanced.vat_collected")} value={vatData.summary.taxCollected} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-success)" }} />
                        </Col>
                    </Row>
                    <h4 className="text-sm font-semibold text-[var(--ohnix-text-primary)] mb-2">{t("reports.purchases")}</h4>
                    <Row gutter={[16, 16]} className="mb-4">
                        <Col xs={12} sm={6}>
                            <StatCard title={t("reports.advanced.vat_taxed_base_purchases")} value={vatData.summary.taxedBasePurchases} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-info)" }} />
                        </Col>
                        <Col xs={12} sm={6}>
                            <StatCard title={t("reports.advanced.vat_excluded_base_purchases")} value={vatData.summary.excludedBasePurchases} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-purple)" }} />
                        </Col>
                        <Col xs={12} sm={6}>
                            <StatCard title={t("reports.advanced.vat_exempt_base_purchases")} value={vatData.summary.exemptBasePurchases} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-amber)" }} />
                        </Col>
                        <Col xs={12} sm={6}>
                            <StatCard title={t("reports.advanced.vat_credited")} value={vatData.summary.taxCredited} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-warning)" }} />
                        </Col>
                    </Row>
                    <Row gutter={[16, 16]} className="mb-4">
                        <Col xs={24}>
                            <StatCard
                                title={vatData.summary.netVat >= 0 ? t("reports.advanced.vat_net_payable") : t("reports.advanced.vat_net_credit_balance")}
                                value={Math.abs(vatData.summary.netVat)}
                                formatter={formatCurrency}
                                valueStyle={{ color: vatData.summary.netVat >= 0 ? "var(--ohnix-status-danger)" : "var(--ohnix-status-success)", fontWeight: 700 }}
                            />
                        </Col>
                    </Row>
                    {vatData.byPeriod.length > 0 && (
                        <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4" title={t("reports.advanced.vat_by_period")}>
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={vatData.byPeriod}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                                    <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                                    <Tooltip formatter={(v) => formatCurrency(v)} />
                                    <Bar dataKey="taxAmount" fill="var(--ohnix-status-success)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>
                    )}
                    <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4" title={t("reports.advanced.vat_by_rate")}>
                        <Table columns={vatColumns} dataSource={vatData.byRate} rowKey="rate" loading={loading} pagination={false} className="module-dark-table" scroll={{ x: 400 }} />
                    </Card>
                    {vatData.byRatePurchases?.length > 0 && (
                        <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4" title={t("reports.advanced.vat_credited_by_rate")}>
                            <Table columns={vatColumns} dataSource={vatData.byRatePurchases} rowKey="rate" loading={loading} pagination={false} className="module-dark-table" scroll={{ x: 400 }} />
                        </Card>
                    )}
                    {vatData.manualAdjustments?.length > 0 && (
                        <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("reports.advanced.vat_manual_adjustments_title")}>
                            <div className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card-soft)] p-3 text-xs text-[var(--ohnix-text-muted)]">
                                <InfoCircleOutlined className="mt-0.5 text-[var(--ohnix-accent-2)]" />
                                <span>{t("reports.advanced.vat_manual_adjustments_help")}</span>
                            </div>
                            <Table
                                columns={[
                                    { title: t("reports.advanced.vat_manual_adjustments_col_date"), dataIndex: "entryDate", key: "entryDate", width: 110, render: (v) => dayjs(v).format("DD/MM/YYYY") },
                                    { title: t("reports.advanced.vat_manual_adjustments_col_description"), dataIndex: "description", key: "description", ellipsis: true },
                                    { title: t("reports.advanced.vat_manual_adjustments_col_generated"), dataIndex: "generatedDelta", key: "generatedDelta", align: "right", width: 150, render: (v) => v ? formatCurrency(v) : "" },
                                    { title: t("reports.advanced.vat_manual_adjustments_col_deductible"), dataIndex: "deductibleDelta", key: "deductibleDelta", align: "right", width: 150, render: (v) => v ? formatCurrency(v) : "" },
                                ]}
                                dataSource={vatData.manualAdjustments}
                                rowKey="id"
                                loading={loading}
                                pagination={false}
                                className="module-dark-table"
                                scroll={{ x: 500 }}
                            />
                        </Card>
                    )}
                </>
            ),
        },
        {
            key: "cartera",
            label: t("reports.advanced.cartera_tab"),
            children: carteraData && (
                <>
                    <Row gutter={[16, 16]} className="mb-4">
                        <Col xs={12} sm={6}>
                            <StatCard title={t("reports.advanced.cartera_receivables_total")} value={carteraData.receivables.summary.totalPending} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-danger)" }} />
                        </Col>
                        <Col xs={12} sm={6}>
                            <StatCard title={t("reports.advanced.cartera_receivables_count")} value={carteraData.receivables.summary.documentCount} />
                        </Col>
                        <Col xs={12} sm={6}>
                            <StatCard title={t("reports.advanced.cartera_payables_total")} value={carteraData.payables.summary.totalPending} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-amber)" }} />
                        </Col>
                        <Col xs={12} sm={6}>
                            <StatCard title={t("reports.advanced.cartera_payables_count")} value={carteraData.payables.summary.documentCount} />
                        </Col>
                    </Row>
                    <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4" title={t("reports.advanced.cartera_by_customer")}>
                        <Table
                            columns={carteraPartyColumns("customer", t("reports.advanced.cartera_customer_column"))}
                            dataSource={carteraData.receivables.byCustomer}
                            rowKey="_id"
                            loading={loading}
                            pagination={{ pageSize: 10 }}
                            className="module-dark-table"
                            scroll={{ x: 500 }}
                        />
                    </Card>
                    <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4" title={t("reports.advanced.cartera_by_document_receivable")}>
                        <Table
                            columns={carteraDocumentColumns("invoice_no", t("reports.advanced.cartera_document_column"), "customer", t("reports.advanced.cartera_customer_column"))}
                            dataSource={carteraData.receivables.byDocument}
                            rowKey="_id"
                            loading={loading}
                            pagination={{ pageSize: 10 }}
                            className="module-dark-table"
                            scroll={{ x: 550 }}
                        />
                    </Card>
                    <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4" title={t("reports.advanced.cartera_by_supplier")}>
                        <Table
                            columns={carteraPartyColumns("supplier", t("reports.advanced.cartera_supplier_column"))}
                            dataSource={carteraData.payables.bySupplier}
                            rowKey="_id"
                            loading={loading}
                            pagination={{ pageSize: 10 }}
                            className="module-dark-table"
                            scroll={{ x: 500 }}
                        />
                    </Card>
                    {carteraData.payables.aging && <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4" title={t("reports.advanced.cartera_aging_title")}><Alert type="info" showIcon className="dark-alert dark-alert-teal mb-4" message={t("reports.advanced.cartera_aging_help")} /><Row gutter={[12, 12]}>{[["current", "cartera_aging_current"], ["dueSoon", "cartera_aging_due_soon"], ["overdue1To30", "cartera_aging_1_30"], ["overdue31To60", "cartera_aging_31_60"], ["overdue61Plus", "cartera_aging_61_plus"], ["unscheduled", "cartera_aging_unscheduled"]].map(([key, label]) => <Col xs={12} md={8} key={key}><div className="withholding-report-kpi"><span>{t(`reports.advanced.${label}`)}</span><strong>{formatCurrency(carteraData.payables.aging[key])}</strong></div></Col>)}</Row></Card>}
                    <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("reports.advanced.cartera_by_document_payable")}>
                        <Table
                            columns={carteraDocumentColumns("purchase_no", t("reports.advanced.cartera_document_column"), "supplier", t("reports.advanced.cartera_supplier_column"))}
                            dataSource={carteraData.payables.byDocument}
                            rowKey="_id"
                            loading={loading}
                            pagination={{ pageSize: 10 }}
                            className="module-dark-table"
                            scroll={{ x: 550 }}
                        />
                    </Card>
                </>
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
