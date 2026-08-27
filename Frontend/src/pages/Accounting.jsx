import { useEffect, useState } from "react";
import { Tabs, Table, Card, DatePicker, Select, Button, Popconfirm, Tag, Row, Col, Alert, Tooltip, Drawer, Empty, Collapse, Form, Switch, Input, InputNumber } from "antd";
import { BookOutlined, CalendarOutlined, InfoCircleOutlined, WarningOutlined, EyeOutlined, ArrowRightOutlined, ClockCircleOutlined, DownOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import PageHeader from "../components/common/PageHeader";
import StatCard from "../components/dashboard/StatCard";
import PlanGate from "../components/common/PlanGate";
import EmptyState from "../components/common/EmptyState";
import useIsMobile from "../hooks/useIsMobile";
import { accountingService } from "../services/accountingService";
import { companyService } from "../services/companyService";
import { useCurrency } from "../context/CurrencyContext";
import { useTeam } from "../context/TeamContext";
import useI18n from "../hooks/useI18n";
import useSubscription from "../hooks/useSubscription";

// Codes from chartOfAccounts.service.js's default PUC seed - matched by code
// (not name) so a renamed-but-not-recoded account still nets correctly.
const VAT_GENERATED_CODE = "240805";
const VAT_DEDUCTIBLE_CODE = "240810";

const { RangePicker } = DatePicker;

const ACCOUNT_TYPE_LABEL_KEYS = {
    asset: "accounting.account_type_asset",
    liability: "accounting.account_type_liability",
    equity: "accounting.account_type_equity",
    revenue: "accounting.account_type_revenue",
    expense: "accounting.account_type_expense",
    cost: "accounting.account_type_cost",
};

// "Costo" vs "Gasto" is the classic non-accountant confusion (COGS vs
// operating expense) - only these two get a tooltip, the rest (activo,
// pasivo, patrimonio, ingreso) are self-explanatory enough on their own.
const ACCOUNT_TYPE_HINT_KEYS = {
    expense: "accounting.account_type_expense_hint",
    cost: "accounting.account_type_cost_hint",
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
    credit_note_financial: "accounting.source_credit_note_financial",
    period_close: "accounting.source_period_close",
};

// Libro mayor for one account: opening balance + every movement in range
// with a running balance, opened from the Chart of Accounts row so a total
// on the balance sheet can always be traced back to what produced it.
const AccountLedgerDrawer = ({ account, onClose }) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const isMobile = useIsMobile();
    const [dateRange, setDateRange] = useState([dayjs().startOf("year"), dayjs()]);
    const [ledger, setLedger] = useState(null);
    const [loading, setLoading] = useState(false);

    const fetchLedger = async () => {
        if (!account) return;
        setLoading(true);
        try {
            const res = await accountingService.getAccountLedger(account._id, {
                from: dateRange[0].format("YYYY-MM-DD"),
                to: dateRange[1].format("YYYY-MM-DD"),
            });
            setLedger(res?.data || null);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLedger();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [account]);

    const columns = [
        { title: t("accounting.col_date"), dataIndex: "date", key: "date", render: (v) => dayjs(v).format("DD/MM/YYYY"), width: 110 },
        { title: t("accounting.col_description"), dataIndex: "description", key: "description", ellipsis: true },
        {
            title: t("accounting.col_source_type"),
            dataIndex: "source_type",
            key: "source_type",
            render: (v) => <Tag>{t(SOURCE_TYPE_LABEL_KEYS[v] || v)}</Tag>,
        },
        { title: t("accounting.lines_col_debit"), dataIndex: "debit", key: "debit", align: "right", render: (v) => (v > 0 ? formatCurrency(v) : "") },
        { title: t("accounting.lines_col_credit"), dataIndex: "credit", key: "credit", align: "right", render: (v) => (v > 0 ? formatCurrency(v) : "") },
        { title: t("accounting.ledger_col_running_balance"), dataIndex: "running_balance", key: "running_balance", align: "right", render: (v) => formatCurrency(v) },
    ];

    return (
        <Drawer
            open={Boolean(account)}
            onClose={onClose}
            width={isMobile ? "100vw" : 720}
            title={account ? `${account.code} · ${account.name}` : ""}
            styles={{ body: { padding: isMobile ? 16 : 24 } }}
        >
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <RangePicker
                    value={dateRange}
                    onChange={(dates) => dates && setDateRange(dates)}
                    format="YYYY-MM-DD"
                    allowClear={false}
                    className="w-full sm:w-auto"
                />
                <Button icon={<CalendarOutlined />} onClick={fetchLedger} loading={loading} block={isMobile}>
                    {t("reports.refresh_report")}
                </Button>
            </div>
            {ledger && (
                <Row gutter={[16, 16]} className="mb-4">
                    <Col xs={12}>
                        <StatCard title={t("accounting.ledger_opening_balance")} value={ledger.opening_balance} formatter={formatCurrency} />
                    </Col>
                    <Col xs={12}>
                        <StatCard title={t("accounting.ledger_closing_balance")} value={ledger.closing_balance} formatter={formatCurrency} valueStyle={{ fontWeight: 700 }} />
                    </Col>
                </Row>
            )}
            {isMobile ? (
                loading ? (
                    <div className="text-center py-8 text-[var(--ohnix-text-muted)]">{t("common.loading")}</div>
                ) : !ledger?.movements?.length ? (
                    <EmptyState title={t("accounting.ledger_empty")} compact />
                ) : (
                    <div className="space-y-2">
                        {ledger.movements.map((m) => (
                            <div key={m.entry_id} className="rounded-xl p-3 border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)]">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-xs text-[var(--ohnix-text-muted)]">{dayjs(m.date).format("DD/MM/YYYY")}</span>
                                    <Tag className="m-0">{t(SOURCE_TYPE_LABEL_KEYS[m.source_type] || m.source_type)}</Tag>
                                </div>
                                <p className="text-sm text-[var(--ohnix-text-primary)] m-0 mb-2 truncate">{m.description}</p>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-[var(--ohnix-text-muted)]">
                                        {m.debit > 0 && `${t("accounting.lines_col_debit")}: ${formatCurrency(m.debit)}`}
                                        {m.credit > 0 && `${t("accounting.lines_col_credit")}: ${formatCurrency(m.credit)}`}
                                    </span>
                                    <span className="font-semibold text-[#44F3F0]">{formatCurrency(m.running_balance)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : (
                <Table
                    columns={columns}
                    dataSource={ledger?.movements || []}
                    rowKey="entry_id"
                    loading={loading}
                    pagination={{ pageSize: 15 }}
                    className="module-dark-table"
                    size="small"
                    scroll={{ x: "max-content" }}
                    locale={{ emptyText: <Empty description={t("accounting.ledger_empty")} /> }}
                />
            )}
        </Drawer>
    );
};

const ChartOfAccountsTab = () => {
    const { t } = useI18n();
    const isMobile = useIsMobile();
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [ledgerAccount, setLedgerAccount] = useState(null);

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
            render: (v) => {
                const label = t(ACCOUNT_TYPE_LABEL_KEYS[v] || v);
                const hintKey = ACCOUNT_TYPE_HINT_KEYS[v];
                return hintKey ? <Tooltip title={t(hintKey)}>{label}</Tooltip> : label;
            },
        },
        {
            title: t("accounting.col_status"),
            dataIndex: "is_active",
            key: "is_active",
            render: (v) =>
                v ? <Tag color="green">{t("accounting.status_active")}</Tag> : <Tag color="default">{t("accounting.status_inactive")}</Tag>,
        },
        {
            title: "",
            key: "actions",
            width: 160,
            render: (_, record) => (
                <Button size="small" icon={<EyeOutlined />} onClick={() => setLedgerAccount(record)}>
                    {t("accounting.ledger_view_button")}
                </Button>
            ),
        },
    ];

    return (
        <>
            <p className="mb-4 text-sm text-[var(--ohnix-text-muted)]">{t("accounting.tab_chart_of_accounts_caption")}</p>
            {isMobile ? (
                loading ? (
                    <div className="text-center py-8 text-[var(--ohnix-text-muted)]">{t("common.loading")}</div>
                ) : accounts.length === 0 ? (
                    <EmptyState title={t("accounting.no_chart_accounts")} />
                ) : (
                    <div className="space-y-2">
                        {accounts.map((acc) => {
                            const hintKey = ACCOUNT_TYPE_HINT_KEYS[acc.account_type];
                            return (
                                <Card key={acc._id} size="small" className="module-shell overflow-hidden" bodyStyle={{ padding: 12 }}>
                                    <div className="flex items-start justify-between gap-2 mb-1.5">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-[var(--ohnix-text-primary)] m-0 truncate">
                                                {acc.code} · {acc.name}
                                            </p>
                                            <Tooltip title={hintKey ? t(hintKey) : null}>
                                                <span className="text-xs text-[var(--ohnix-text-muted)]">
                                                    {t(ACCOUNT_TYPE_LABEL_KEYS[acc.account_type] || acc.account_type)}
                                                </span>
                                            </Tooltip>
                                        </div>
                                        {acc.is_active ? (
                                            <Tag color="green" className="m-0 shrink-0">{t("accounting.status_active")}</Tag>
                                        ) : (
                                            <Tag className="m-0 shrink-0">{t("accounting.status_inactive")}</Tag>
                                        )}
                                    </div>
                                    <Button block size="small" icon={<EyeOutlined />} onClick={() => setLedgerAccount(acc)}>
                                        {t("accounting.ledger_view_button")}
                                    </Button>
                                </Card>
                            );
                        })}
                    </div>
                )
            ) : (
                <Card className="module-shell border border-[var(--ohnix-line-4)]">
                    <Table
                        columns={columns}
                        dataSource={accounts}
                        rowKey="_id"
                        loading={loading}
                        pagination={false}
                        className="module-dark-table"
                        scroll={{ x: "max-content" }}
                        locale={{ emptyText: t("accounting.no_chart_accounts") }}
                    />
                </Card>
            )}
            <AccountLedgerDrawer account={ledgerAccount} onClose={() => setLedgerAccount(null)} />
        </>
    );
};

const JournalTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const isMobile = useIsMobile();
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
            <p className="mb-4 text-sm text-[var(--ohnix-text-muted)]">{t("accounting.tab_journal_caption")}</p>
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
                    <Button type="primary" className="hover:shadow-[0_0_26px_rgba(41,216,213,0.22)] w-full sm:w-auto" icon={<CalendarOutlined />} onClick={fetchEntries} loading={loading}>
                        {t("reports.refresh_report")}
                    </Button>
                </div>
            </Card>
            {isMobile ? (
                loading ? (
                    <div className="text-center py-8 text-[var(--ohnix-text-muted)]">{t("common.loading")}</div>
                ) : entries.length === 0 ? (
                    <EmptyState title={t("accounting.no_entries")} />
                ) : (
                    <Collapse
                        expandIconPosition="end"
                        expandIcon={({ isActive }) => <DownOutlined rotate={isActive ? 180 : 0} className="text-[var(--ohnix-text-muted)]" />}
                        className="custom-tabs"
                        items={entries.map((entry) => ({
                            key: entry._id,
                            label: (
                                <div className="flex items-center justify-between gap-2 min-w-0 pr-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-[var(--ohnix-text-primary)] m-0 truncate">{entry.description}</p>
                                        <p className="text-xs text-[var(--ohnix-text-muted)] m-0">{dayjs(entry.entry_date).format("DD/MM/YYYY")}</p>
                                    </div>
                                    <span className="text-sm font-semibold text-[#44F3F0] shrink-0">
                                        {formatCurrency(entry.lines.reduce((sum, l) => sum + l.debit, 0))}
                                    </span>
                                </div>
                            ),
                            children: (
                                <div className="space-y-2">
                                    <Tag className="mb-1">{t(SOURCE_TYPE_LABEL_KEYS[entry.source_type] || entry.source_type)}</Tag>
                                    {entry.lines.map((l) => (
                                        <div key={l._id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-[var(--ohnix-line-3)] last:border-0">
                                            <span className="text-[var(--ohnix-text-soft)] truncate">{l.chart_account.code} · {l.chart_account.name}</span>
                                            <span className="text-[var(--ohnix-text-primary)] font-medium shrink-0">
                                                {l.debit > 0 ? formatCurrency(l.debit) : `(${formatCurrency(l.credit)})`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ),
                        }))}
                    />
                )
            ) : (
                <Card className="module-shell border border-[var(--ohnix-line-4)]">
                    <Table
                        columns={columns}
                        dataSource={entries}
                        rowKey="_id"
                        loading={loading}
                        pagination={{ pageSize: 15 }}
                        className="module-dark-table"
                        scroll={{ x: "max-content" }}
                        locale={{ emptyText: t("accounting.no_entries") }}
                        expandable={{
                            expandedRowRender: (entry) => <Table columns={linesColumns} dataSource={entry.lines} rowKey="_id" pagination={false} size="small" scroll={{ x: "max-content" }} />,
                        }}
                    />
                </Card>
            )}
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
        <>
            <p className="mb-4 text-sm text-[var(--ohnix-text-muted)]">{t("accounting.tab_periods_caption")}</p>
            <Card className="module-shell border border-[var(--ohnix-line-4)]">
                <Table
                    columns={columns}
                    dataSource={periods}
                    rowKey="_id"
                    loading={loading}
                    pagination={false}
                    className="module-dark-table"
                    scroll={{ x: "max-content" }}
                    locale={{ emptyText: t("accounting.no_periods") }}
                />
            </Card>
        </>
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
        {
            title: t("accounting.col_account"),
            dataIndex: "name",
            key: "name",
            // "Resultado del ejercicio" is a computed row appended in the
            // equity table below, not a real chart-of-accounts entry - it
            // has no code, which is the tell used here to style it as
            // derived rather than let it silently look like a real account.
            render: (name, record) =>
                record.code ? (
                    name
                ) : (
                    <Tooltip title={t("accounting.current_earnings_row_hint")}>
                        <span className="italic text-[var(--ohnix-text-muted)]">
                            {name}
                            <span className="ml-2 inline-flex items-center rounded-full bg-[var(--ohnix-hover-overlay)] px-1.5 py-0.5 text-[9px] font-semibold uppercase not-italic tracking-wide text-[var(--ohnix-text-dim)]">
                                {t("accounting.calculated_row_badge")}
                            </span>
                        </span>
                    </Tooltip>
                ),
        },
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
                        <Button type="primary" className="hover:shadow-[0_0_26px_rgba(41,216,213,0.22)]" icon={<CalendarOutlined />} onClick={fetchIncome} loading={incomeLoading}>
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
                                    <Table columns={accountColumns} dataSource={income.revenue} rowKey="code" pagination={false} loading={incomeLoading} size="small" className="module-dark-table" scroll={{ x: "max-content" }} />
                                </Card>
                            </Col>
                            <Col xs={24} md={12}>
                                <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.section_costs")}>
                                    <Table columns={accountColumns} dataSource={income.costs} rowKey="code" pagination={false} loading={incomeLoading} size="small" className="module-dark-table" scroll={{ x: "max-content" }} />
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
                        <Button type="primary" className="hover:shadow-[0_0_26px_rgba(41,216,213,0.22)]" icon={<CalendarOutlined />} onClick={fetchBalance} loading={balanceLoading}>
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
                                    <Table columns={accountColumns} dataSource={balance.assets} rowKey="code" pagination={false} loading={balanceLoading} size="small" className="module-dark-table" scroll={{ x: "max-content" }} />
                                </Card>
                            </Col>
                            <Col xs={24} md={8}>
                                <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.section_liabilities")}>
                                    <Table columns={accountColumns} dataSource={balance.liabilities} rowKey="code" pagination={false} loading={balanceLoading} size="small" className="module-dark-table" scroll={{ x: "max-content" }} />
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
                                        scroll={{ x: "max-content" }}
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

// Landing tab: the handful of numbers a non-accountant actually wants at a
// glance, plus links out to the CxC/CxP, IVA and bank-reconciliation tools
// that already exist in Reports/Finance - linked, not rebuilt here, so
// there's exactly one place each of those numbers is computed.
const OverviewTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [income, setIncome] = useState(null);
    const [balance, setBalance] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            accountingService.getIncomeStatement({ from: dayjs().startOf("month").format("YYYY-MM-DD"), to: dayjs().format("YYYY-MM-DD") }),
            accountingService.getBalanceSheet({ asOf: dayjs().format("YYYY-MM-DD") }),
        ])
            .then(([incomeRes, balanceRes]) => {
                setIncome(incomeRes?.data || null);
                setBalance(balanceRes?.data || null);
            })
            .catch(() => toast.error(t("accounting.failed")))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const netVat = balance
        ? (balance.liabilities.find((a) => a.code === VAT_GENERATED_CODE)?.amount || 0) -
          (balance.liabilities.find((a) => a.code === VAT_DEDUCTIBLE_CODE)?.amount || 0)
        : 0;

    const relatedLinks = [
        { to: "/reports", titleKey: "accounting.overview_link_cartera_title", descKey: "accounting.overview_link_cartera_desc" },
        { to: "/reports", titleKey: "accounting.overview_link_vat_title", descKey: "accounting.overview_link_vat_desc" },
        { to: "/finance", titleKey: "accounting.overview_link_reconciliation_title", descKey: "accounting.overview_link_reconciliation_desc" },
    ];

    return (
        <div className="space-y-6">
            <p className="text-sm text-[var(--ohnix-text-muted)]">{t("accounting.tab_overview_caption")}</p>
            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard title={t("accounting.overview_gross_profit")} value={income?.gross_profit || 0} formatter={formatCurrency} loading={loading} valueStyle={{ color: "#1890ff", fontWeight: 700 }} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard title={t("accounting.overview_total_assets")} value={balance?.total_assets || 0} formatter={formatCurrency} loading={loading} valueStyle={{ color: "#52c41a" }} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard title={t("accounting.overview_total_liabilities")} value={balance?.total_liabilities || 0} formatter={formatCurrency} loading={loading} valueStyle={{ color: "#f97316" }} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title={netVat >= 0 ? t("accounting.overview_net_vat_payable") : t("accounting.overview_net_vat_credit")}
                        value={Math.abs(netVat)}
                        formatter={formatCurrency}
                        loading={loading}
                        valueStyle={{ color: netVat >= 0 ? "#f5222d" : "#52c41a", fontWeight: 700 }}
                    />
                </Col>
            </Row>
            <div>
                <h3 className="text-base font-semibold text-[var(--ohnix-text-primary)] mb-3">{t("accounting.overview_related_tools_title")}</h3>
                <Row gutter={[16, 16]}>
                    {relatedLinks.map((link) => (
                        <Col xs={24} md={8} key={link.titleKey}>
                            <Link to={link.to}>
                                <Card className="module-shell border border-[var(--ohnix-line-4)] h-full hover:border-[var(--ohnix-accent)] transition-colors" size="small">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="font-semibold text-[var(--ohnix-text-primary)] mb-1">{t(link.titleKey)}</p>
                                            <p className="text-xs text-[var(--ohnix-text-muted)]">{t(link.descKey)}</p>
                                        </div>
                                        <ArrowRightOutlined className="text-[var(--ohnix-text-dim)] shrink-0 mt-1" />
                                    </div>
                                </Card>
                            </Link>
                        </Col>
                    ))}
                </Row>
            </div>
        </div>
    );
};

// "Próximamente" cards for withholdings Ohnix doesn't calculate yet -
// ReteICA/Retefuente/renta are deliberately NOT presented as menu items
// with forms behind them, since none of that logic exists server-side.
// IVA is the one concept here that's real today, so it links out to what
// already computes it instead of duplicating a second IVA UI.
const ComingSoonTaxCard = ({ titleKey, descKey }) => {
    const { t } = useI18n();
    return (
        <Card className="module-shell border border-[var(--ohnix-line-4)] h-full" size="small">
            <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-semibold text-[var(--ohnix-text-primary)]">{t(titleKey)}</p>
                <Tag icon={<ClockCircleOutlined />} color="default">{t("accounting.taxes_coming_soon_badge")}</Tag>
            </div>
            <p className="text-xs text-[var(--ohnix-text-muted)]">{t(descKey)}</p>
        </Card>
    );
};

// Captures the facts a future retención en la fuente / ReteICA engine will
// need (agente retenedor status, municipio, actividad CIIU, tarifa ICA) -
// deliberately does NOT calculate or post anything itself yet, since no
// automatic withholding logic exists server-side (see chartOfAccounts.
// service.js's PUC seed, which still has no Retefuente/ReteICA accounts).
// Saving this now just means the company doesn't have to re-enter it once
// that engine ships, and gives their accountant something concrete to
// review ahead of time.
const WithholdingConfigCard = () => {
    const { t } = useI18n();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await companyService.getMyCompany();
            const company = res?.data?.company || res?.data || null;
            form.setFieldsValue({
                isWithholdingAgent: company?.isWithholdingAgent || false,
                icaMunicipalityCode: company?.icaMunicipalityCode || undefined,
                icaActivityCode: company?.icaActivityCode || undefined,
                icaRatePerThousand: company?.icaRatePerThousand ?? undefined,
            });
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

    const handleSave = async (values) => {
        setSaving(true);
        try {
            await companyService.updateMyCompany(values);
            toast.success(t("accounting.taxes_config_saved"));
        } catch (err) {
            toast.error(err?.response?.data?.message || t("accounting.failed"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card
            className="module-shell border border-[var(--ohnix-line-4)]"
            title={t("accounting.taxes_withholding_config_title")}
            extra={<Tag icon={<ClockCircleOutlined />} color="default">{t("accounting.taxes_coming_soon_badge")}</Tag>}
            loading={loading}
        >
            <p className="text-sm text-[var(--ohnix-text-muted)] mb-4">{t("accounting.taxes_withholding_config_desc")}</p>
            <Form form={form} layout="vertical" onFinish={handleSave} disabled={loading || saving}>
                <Form.Item
                    name="isWithholdingAgent"
                    label={t("accounting.taxes_is_withholding_agent_label")}
                    valuePropName="checked"
                    extra={t("accounting.taxes_is_withholding_agent_hint")}
                >
                    <Switch />
                </Form.Item>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ohnix-text-dim)] mb-2 mt-2">{t("accounting.taxes_reteica_title")}</p>
                <Row gutter={16}>
                    <Col xs={24} sm={8}>
                        <Form.Item
                            name="icaMunicipalityCode"
                            label={t("accounting.taxes_ica_municipality_label")}
                            extra={t("accounting.taxes_ica_municipality_hint")}
                            rules={[{ pattern: /^\d{5}$/, message: t("accounting.taxes_ica_municipality_error") }]}
                        >
                            <Input placeholder="11001" maxLength={5} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                        <Form.Item
                            name="icaActivityCode"
                            label={t("accounting.taxes_ica_activity_label")}
                            extra={t("accounting.taxes_ica_activity_hint")}
                            rules={[{ pattern: /^\d{4}$/, message: t("accounting.taxes_ica_activity_error") }]}
                        >
                            <Input placeholder="4711" maxLength={4} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                        <Form.Item
                            name="icaRatePerThousand"
                            label={t("accounting.taxes_ica_rate_label")}
                            extra={t("accounting.taxes_ica_rate_hint")}
                        >
                            <InputNumber className="w-full" min={0} max={50} step={0.1} placeholder="6.9" />
                        </Form.Item>
                    </Col>
                </Row>
                <Button type="primary" htmlType="submit" loading={saving}>
                    {t("common.save")}
                </Button>
            </Form>
        </Card>
    );
};

const TaxesTab = () => {
    const { t } = useI18n();
    return (
        <div className="space-y-6">
            <p className="text-sm text-[var(--ohnix-text-muted)]">{t("accounting.tab_taxes_caption")}</p>
            <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.taxes_vat_title")}>
                <p className="text-sm text-[var(--ohnix-text-muted)] mb-3">{t("accounting.taxes_vat_desc")}</p>
                <Link to="/reports">
                    <Button icon={<ArrowRightOutlined />}>{t("accounting.taxes_vat_link")}</Button>
                </Link>
            </Card>
            <WithholdingConfigCard />
            <ComingSoonTaxCard titleKey="accounting.taxes_renta_title" descKey="accounting.taxes_renta_desc" />
            <Alert type="warning" showIcon message={t("accounting.taxes_professional_review_notice")} />
        </div>
    );
};

const Accounting = () => {
    const { t } = useI18n();
    const { can, loading: subscriptionLoading } = useSubscription();
    const [activeTab, setActiveTab] = useState("overview");
    const [status, setStatus] = useState(null);
    const hasAccounting = can("accounting");

    useEffect(() => {
        if (!hasAccounting) return;
        accountingService
            .getStatus()
            .then(({ data }) => setStatus(data))
            .catch(() => setStatus(null));
    }, [hasAccounting]);

    const tabItems = [
        { key: "overview", label: t("accounting.tab_overview"), children: <OverviewTab /> },
        { key: "chart", label: t("accounting.tab_chart_of_accounts"), children: <ChartOfAccountsTab /> },
        { key: "journal", label: t("accounting.tab_journal"), children: <JournalTab /> },
        { key: "periods", label: t("accounting.tab_periods"), children: <PeriodsTab /> },
        { key: "statements", label: t("accounting.tab_financial_statements"), children: <FinancialStatementsTab /> },
        { key: "taxes", label: t("accounting.tab_taxes"), children: <TaxesTab /> },
    ];

    return (
        <div className="min-h-screen bg-transparent text-[var(--ohnix-text-primary)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                <div className="space-y-6">
                    <PageHeader title={t("accounting.page_title")} subtitle={t("accounting.page_subtitle")} icon={<BookOutlined />} />
                    {subscriptionLoading ? null : !hasAccounting ? (
                        <PlanGate featureKey="accounting" />
                    ) : (
                        <>
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
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Accounting;
