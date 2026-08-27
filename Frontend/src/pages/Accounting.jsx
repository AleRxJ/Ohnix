import { useEffect, useState } from "react";
import { Tabs, Table, Card, DatePicker, Select, Button, Popconfirm, Tag, Row, Col, Alert } from "antd";
import { BookOutlined, CalendarOutlined, InfoCircleOutlined, WarningOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import PageHeader from "../components/common/PageHeader";
import StatCard from "../components/dashboard/StatCard";
import { accountingService } from "../services/accountingService";
import { useCurrency } from "../context/CurrencyContext";
import { useTeam } from "../context/TeamContext";
import useI18n from "../hooks/useI18n";

const { RangePicker } = DatePicker;

const ACCOUNT_TYPE_LABEL_KEYS = {
    asset: "accounting.account_type_asset",
    liability: "accounting.account_type_liability",
    equity: "accounting.account_type_equity",
    revenue: "accounting.account_type_revenue",
    expense: "accounting.account_type_expense",
    cost: "accounting.account_type_cost",
};

const SOURCE_TYPE_LABEL_KEYS = {
    order_sale: "accounting.source_order_sale",
    purchase: "accounting.source_purchase",
    order_payment: "accounting.source_order_payment",
    purchase_payment: "accounting.source_purchase_payment",
    order_cancellation: "accounting.source_order_cancellation",
    order_return: "accounting.source_order_return",
    purchase_return: "accounting.source_purchase_return",
    credit_note_restock: "accounting.source_credit_note_restock",
};

const ChartOfAccountsTab = () => {
    const { t } = useI18n();
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        accountingService
            .listChartOfAccounts()
            .then((res) => setAccounts(res?.data || []))
            .catch(() => toast.error(t("accounting.failed")))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const columns = [
        { title: t("accounting.col_code"), dataIndex: "code", key: "code", width: 100 },
        { title: t("accounting.col_name"), dataIndex: "name", key: "name" },
        {
            title: t("accounting.col_type"),
            dataIndex: "account_type",
            key: "account_type",
            render: (v) => t(ACCOUNT_TYPE_LABEL_KEYS[v] || v),
        },
        {
            title: t("accounting.col_status"),
            dataIndex: "is_active",
            key: "is_active",
            render: (v) =>
                v ? <Tag color="green">{t("accounting.status_active")}</Tag> : <Tag color="default">{t("accounting.status_inactive")}</Tag>,
        },
    ];

    return (
        <Card className="module-shell border border-[var(--ohnix-line-4)]">
            <Table
                columns={columns}
                dataSource={accounts}
                rowKey="_id"
                loading={loading}
                pagination={false}
                className="module-dark-table"
                locale={{ emptyText: t("accounting.no_chart_accounts") }}
            />
        </Card>
    );
};

const JournalTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [dateRange, setDateRange] = useState([dayjs().subtract(30, "days"), dayjs()]);
    const [sourceType, setSourceType] = useState(undefined);
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchEntries = async () => {
        setLoading(true);
        try {
            const res = await accountingService.listJournalEntries({
                from: dateRange[0].format("YYYY-MM-DD"),
                to: dateRange[1].format("YYYY-MM-DD"),
                sourceType,
            });
            setEntries(res?.data || []);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEntries();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const linesColumns = [
        { title: t("accounting.lines_col_account"), key: "account", render: (_, l) => `${l.chart_account.code} · ${l.chart_account.name}` },
        { title: t("accounting.lines_col_debit"), dataIndex: "debit", key: "debit", align: "right", render: (v) => (v > 0 ? formatCurrency(v) : "") },
        { title: t("accounting.lines_col_credit"), dataIndex: "credit", key: "credit", align: "right", render: (v) => (v > 0 ? formatCurrency(v) : "") },
    ];

    const columns = [
        { title: t("accounting.col_date"), dataIndex: "entry_date", key: "entry_date", render: (v) => dayjs(v).format("DD/MM/YYYY"), width: 120 },
        { title: t("accounting.col_description"), dataIndex: "description", key: "description", ellipsis: true },
        {
            title: t("accounting.col_source_type"),
            dataIndex: "source_type",
            key: "source_type",
            render: (v) => <Tag>{t(SOURCE_TYPE_LABEL_KEYS[v] || v)}</Tag>,
        },
        {
            title: t("accounting.col_total"),
            key: "total",
            align: "right",
            render: (_, entry) => formatCurrency(entry.lines.reduce((sum, l) => sum + l.debit, 0)),
        },
    ];

    return (
        <>
            <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <RangePicker value={dateRange} onChange={(dates) => dates && setDateRange(dates)} format="YYYY-MM-DD" allowClear={false} />
                    <Select
                        allowClear
                        placeholder={t("accounting.source_type_filter_placeholder")}
                        className="w-full sm:w-56"
                        value={sourceType}
                        onChange={setSourceType}
                        options={Object.entries(SOURCE_TYPE_LABEL_KEYS).map(([value, key]) => ({ value, label: t(key) }))}
                    />
                    <Button type="primary" icon={<CalendarOutlined />} onClick={fetchEntries} loading={loading}>
                        {t("reports.refresh_report")}
                    </Button>
                </div>
            </Card>
            <Card className="module-shell border border-[var(--ohnix-line-4)]">
                <Table
                    columns={columns}
                    dataSource={entries}
                    rowKey="_id"
                    loading={loading}
                    pagination={{ pageSize: 15 }}
                    className="module-dark-table"
                    locale={{ emptyText: t("accounting.no_entries") }}
                    expandable={{
                        expandedRowRender: (entry) => <Table className="module-dark-table" columns={linesColumns} dataSource={entry.lines} rowKey="_id" pagination={false} size="small" />,
                    }}
                />
            </Card>
        </>
    );
};

const PeriodsTab = () => {
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    const canClose = hasPermission("accounting", "admin");
    const [periods, setPeriods] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const res = await accountingService.listAccountingPeriods();
            setPeriods(res?.data || []);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleClose = async (id) => {
        try {
            await accountingService.closeAccountingPeriod(id);
            toast.success(t("accounting.period_closed"));
            load();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("accounting.failed"));
        }
    };

    const columns = [
        {
            title: t("accounting.col_period"),
            key: "period",
            render: (_, p) => `${String(p.month).padStart(2, "0")}/${p.year}`,
        },
        {
            title: t("accounting.col_status"),
            dataIndex: "status",
            key: "status",
            render: (v) => (v === "closed" ? <Tag color="default">{t("accounting.status_closed")}</Tag> : <Tag color="green">{t("accounting.status_open")}</Tag>),
        },
        {
            title: t("accounting.col_closed_at"),
            dataIndex: "closed_at",
            key: "closed_at",
            render: (v) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "—"),
        },
        {
            title: "",
            key: "actions",
            render: (_, p) =>
                p.status === "open" && canClose ? (
                    <Popconfirm
                        title={t("accounting.close_period_confirm_title")}
                        description={t("accounting.close_period_confirm_content")}
                        okText={t("common.yes")}
                        cancelText={t("common.no")}
                        onConfirm={() => handleClose(p._id)}
                    >
                        <Button size="small">{t("accounting.close_period")}</Button>
                    </Popconfirm>
                ) : null,
        },
    ];

    return (
        <Card className="module-shell border border-[var(--ohnix-line-4)]">
            <Table
                columns={columns}
                dataSource={periods}
                rowKey="_id"
                loading={loading}
                pagination={false}
                className="module-dark-table"
                locale={{ emptyText: t("accounting.no_periods") }}
            />
        </Card>
    );
};

const FinancialStatementsTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [incomeRange, setIncomeRange] = useState([dayjs().subtract(30, "days"), dayjs()]);
    const [asOfDate, setAsOfDate] = useState(dayjs());
    const [income, setIncome] = useState(null);
    const [balance, setBalance] = useState(null);
    const [incomeLoading, setIncomeLoading] = useState(false);
    const [balanceLoading, setBalanceLoading] = useState(false);

    const fetchIncome = async () => {
        setIncomeLoading(true);
        try {
            const res = await accountingService.getIncomeStatement({
                from: incomeRange[0].format("YYYY-MM-DD"),
                to: incomeRange[1].format("YYYY-MM-DD"),
            });
            setIncome(res?.data || null);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setIncomeLoading(false);
        }
    };

    const fetchBalance = async () => {
        setBalanceLoading(true);
        try {
            const res = await accountingService.getBalanceSheet({ asOf: asOfDate.format("YYYY-MM-DD") });
            setBalance(res?.data || null);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setBalanceLoading(false);
        }
    };

    useEffect(() => {
        fetchIncome();
        fetchBalance();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const accountColumns = [
        { title: t("accounting.col_code"), dataIndex: "code", key: "code", width: 100 },
        { title: t("accounting.col_account"), dataIndex: "name", key: "name" },
        { title: t("accounting.col_amount"), dataIndex: "amount", key: "amount", align: "right", render: (v) => formatCurrency(v) },
    ];

    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-base font-semibold text-[var(--ohnix-text-primary)] mb-3">{t("accounting.income_statement_title")}</h3>
                <Alert
                    message={t("accounting.gross_margin_disclaimer")}
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                    className="mb-4"
                />
                <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <RangePicker value={incomeRange} onChange={(dates) => dates && setIncomeRange(dates)} format="YYYY-MM-DD" allowClear={false} />
                        <Button type="primary" icon={<CalendarOutlined />} onClick={fetchIncome} loading={incomeLoading}>
                            {t("reports.refresh_report")}
                        </Button>
                    </div>
                </Card>
                {income && (
                    <>
                        <Row gutter={[16, 16]} className="mb-4">
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.total_revenue")} value={income.total_revenue} formatter={formatCurrency} valueStyle={{ color: "#52c41a" }} />
                            </Col>
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.total_costs")} value={income.total_costs} formatter={formatCurrency} valueStyle={{ color: "#f97316" }} />
                            </Col>
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.gross_profit")} value={income.gross_profit} formatter={formatCurrency} valueStyle={{ color: "#1890ff", fontWeight: 700 }} />
                            </Col>
                        </Row>
                        <Row gutter={[16, 16]}>
                            <Col xs={24} md={12}>
                                <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.section_revenue")}>
                                    <Table columns={accountColumns} dataSource={income.revenue} rowKey="code" pagination={false} loading={incomeLoading} size="small" className="module-dark-table" />
                                </Card>
                            </Col>
                            <Col xs={24} md={12}>
                                <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.section_costs")}>
                                    <Table columns={accountColumns} dataSource={income.costs} rowKey="code" pagination={false} loading={incomeLoading} size="small" className="module-dark-table" />
                                </Card>
                            </Col>
                        </Row>
                    </>
                )}
            </div>

            <div>
                <h3 className="text-base font-semibold text-[var(--ohnix-text-primary)] mb-3">{t("accounting.balance_sheet_title")}</h3>
                <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <DatePicker value={asOfDate} onChange={(d) => d && setAsOfDate(d)} format="YYYY-MM-DD" allowClear={false} />
                        <Button type="primary" icon={<CalendarOutlined />} onClick={fetchBalance} loading={balanceLoading}>
                            {t("reports.refresh_report")}
                        </Button>
                    </div>
                </Card>
                {balance && (
                    <>
                        {!balance.balanced && (
                            <Alert message={t("accounting.not_balanced_warning")} type="error" showIcon icon={<WarningOutlined />} className="mb-4" />
                        )}
                        <Row gutter={[16, 16]} className="mb-4">
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.total_assets")} value={balance.total_assets} formatter={formatCurrency} valueStyle={{ color: "#1890ff" }} />
                            </Col>
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.total_liabilities")} value={balance.total_liabilities} formatter={formatCurrency} valueStyle={{ color: "#f97316" }} />
                            </Col>
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.total_equity")} value={balance.total_equity} formatter={formatCurrency} valueStyle={{ color: "#52c41a", fontWeight: 700 }} />
                            </Col>
                        </Row>
                        <Row gutter={[16, 16]}>
                            <Col xs={24} md={8}>
                                <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.section_assets")}>
                                    <Table columns={accountColumns} dataSource={balance.assets} rowKey="code" pagination={false} loading={balanceLoading} size="small" className="module-dark-table" />
                                </Card>
                            </Col>
                            <Col xs={24} md={8}>
                                <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.section_liabilities")}>
                                    <Table columns={accountColumns} dataSource={balance.liabilities} rowKey="code" pagination={false} loading={balanceLoading} size="small" className="module-dark-table" />
                                </Card>
                            </Col>
                            <Col xs={24} md={8}>
                                <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.section_equity")}>
                                    <Table
                                        columns={accountColumns}
                                        dataSource={[...balance.equity, { code: "", name: t("accounting.current_earnings_row"), amount: balance.current_earnings }]}
                                        rowKey={(r) => r.code || "current_earnings"}
                                        pagination={false}
                                        loading={balanceLoading}
                                        size="small"
                                        className="module-dark-table"
                                    />
                                </Card>
                            </Col>
                        </Row>
                    </>
                )}
            </div>
        </div>
    );
};

const Accounting = () => {
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState("chart");
    const [status, setStatus] = useState(null);

    useEffect(() => {
        accountingService
            .getStatus()
            .then(({ data }) => setStatus(data))
            .catch(() => setStatus(null));
    }, []);

    const tabItems = [
        { key: "chart", label: t("accounting.tab_chart_of_accounts"), children: <ChartOfAccountsTab /> },
        { key: "journal", label: t("accounting.tab_journal"), children: <JournalTab /> },
        { key: "periods", label: t("accounting.tab_periods"), children: <PeriodsTab /> },
        { key: "statements", label: t("accounting.tab_financial_statements"), children: <FinancialStatementsTab /> },
    ];

    return (
        <div className="min-h-screen bg-transparent text-[var(--ohnix-text-primary)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                <div className="space-y-6">
                    <PageHeader title={t("accounting.page_title")} subtitle={t("accounting.page_subtitle")} icon={<BookOutlined />} />
                    {status && !status.has_journal_entries && (
                        <Alert
                            type="info"
                            showIcon
                            icon={<InfoCircleOutlined />}
                            message={t("accounting.onboarding_new_title")}
                            description={t("accounting.onboarding_new_body")}
                        />
                    )}
                    {status && status.has_journal_entries && status.has_backfilled_entries && (
                        <Alert
                            type="info"
                            showIcon
                            closable
                            icon={<InfoCircleOutlined />}
                            message={t("accounting.onboarding_backfilled_title")}
                            description={t("accounting.onboarding_backfilled_body")}
                        />
                    )}
                    <Card className="module-shell border border-[var(--ohnix-line-4)] overflow-hidden">
                        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} className="custom-tabs" />
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default Accounting;
