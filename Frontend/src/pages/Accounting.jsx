import { useEffect, useState } from "react";
import { Tabs, Table, Card, DatePicker, Select, Button, Popconfirm, Tag, Row, Col, Alert, Tooltip, Drawer, Empty, Collapse, Form, Switch, Input, InputNumber, Modal } from "antd";
import { BookOutlined, CalendarOutlined, InfoCircleOutlined, WarningOutlined, EyeOutlined, ArrowRightOutlined, ClockCircleOutlined, DownOutlined, PlusOutlined, StopOutlined, CheckCircleOutlined, DashboardOutlined, ApartmentOutlined, UnorderedListOutlined, FileTextOutlined, TeamOutlined, CalculatorOutlined, LockOutlined, BarChartOutlined, SafetyCertificateOutlined, BulbOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { Link, useLocation } from "react-router-dom";
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

const AccountingSectionGuide = ({ sectionKey, title, summary, steps = [], result, concepts = [] }) => {
    const { t } = useI18n();
    const storageKey = `ohnix:accounting-guide:${sectionKey}`;
    const [openKeys, setOpenKeys] = useState(() => {
        try { return localStorage.getItem(storageKey) ? [] : ["guide"]; }
        catch { return ["guide"]; }
    });
    const handleChange = (keys) => {
        const normalized = Array.isArray(keys) ? keys : [keys].filter(Boolean);
        setOpenKeys(normalized);
        try { localStorage.setItem(storageKey, "seen"); } catch { /* browser storage may be disabled */ }
    };
    return (
        <div className="accounting-section-guide">
            <div className="accounting-section-guide__summary">
                <span className="accounting-section-guide__icon"><BulbOutlined /></span>
                <div><strong>{title}</strong><p>{summary}</p></div>
            </div>
            <Collapse
                ghost
                activeKey={openKeys}
                onChange={handleChange}
                expandIconPosition="end"
                items={[{
                    key: "guide",
                    label: <span className="accounting-section-guide__toggle"><QuestionCircleOutlined />{t("accounting.guide_how_it_works")}</span>,
                    children: (
                        <div className="accounting-section-guide__content">
                            {steps.length > 0 && <div><span>{t("accounting.guide_what_to_do")}</span><ol>{steps.map((step, index) => <li key={index}>{step}</li>)}</ol></div>}
                            {result && <div className="accounting-section-guide__result"><span>{t("accounting.guide_result")}</span><p>{result}</p></div>}
                            {concepts.length > 0 && <div className="accounting-section-guide__concepts"><span>{t("accounting.guide_key_concepts")}</span><div>{concepts.map((concept) => <Tooltip key={concept.label} title={concept.help}><Tag icon={<InfoCircleOutlined />}>{concept.label}</Tag></Tooltip>)}</div></div>}
                        </div>
                    ),
                }]}
            />
        </div>
    );
};

const ContextLabel = ({ children, help }) => (
    <span className="inline-flex items-center gap-1.5">
        {children}
        <Tooltip title={help}><QuestionCircleOutlined className="text-[var(--ohnix-text-dim)] cursor-help" /></Tooltip>
    </span>
);

const AccountingQuickStart = ({ onOpenTab }) => {
    const { t } = useI18n();
    return (
        <Card className="accounting-quick-start">
            <div className="accounting-quick-start__heading">
                <div><span>{t("accounting.quick_start_eyebrow")}</span><h3>{t("accounting.onboarding_new_title")}</h3><p>{t("accounting.onboarding_new_body")}</p></div>
                <Tag color="cyan">{t("accounting.quick_start_time")}</Tag>
            </div>
            <div className="accounting-quick-start__steps">
                <button type="button" onClick={() => onOpenTab("chart")}><b>1</b><span><strong>{t("accounting.quick_start_chart")}</strong><small>{t("accounting.quick_start_chart_help")}</small></span><ArrowRightOutlined /></button>
                <Link to="/purchases"><b>2</b><span><strong>{t("accounting.quick_start_operation")}</strong><small>{t("accounting.quick_start_operation_help")}</small></span><ArrowRightOutlined /></Link>
                <button type="button" onClick={() => onOpenTab("journal")}><b>3</b><span><strong>{t("accounting.quick_start_journal")}</strong><small>{t("accounting.quick_start_journal_help")}</small></span><ArrowRightOutlined /></button>
            </div>
        </Card>
    );
};

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
    period_reopen: "accounting.source_period_reopen",
    period_reclose: "accounting.source_period_reclose",
    inventory_adjustment: "accounting.source_inventory_adjustment",
    transfer_discrepancy: "accounting.source_transfer_discrepancy",
    manual_journal: "accounting.source_manual_journal",
    manual_journal_reversal: "accounting.source_manual_journal_reversal",
    manual_expense: "accounting.source_manual_expense",
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
        { title: <ContextLabel help={t("accounting.guide_debit_help")}>{t("accounting.lines_col_debit")}</ContextLabel>, dataIndex: "debit", key: "debit", align: "right", render: (v) => (v > 0 ? formatCurrency(v) : "") },
        { title: <ContextLabel help={t("accounting.guide_credit_help")}>{t("accounting.lines_col_credit")}</ContextLabel>, dataIndex: "credit", key: "credit", align: "right", render: (v) => (v > 0 ? formatCurrency(v) : "") },
        { title: t("accounting.ledger_col_running_balance"), dataIndex: "running_balance", key: "running_balance", align: "right", render: (v) => formatCurrency(v) },
    ];

    return (
        <Drawer
            rootClassName="accounting-drawer"
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

// Custom accounts are additive to the 9-account default seed - e.g. a
// company's own class-5 expense accounts (never auto-posted to, see
// accountingPosting.service.js's scope note) or a finer split of an
// existing class. parentId is optional: the schema has always supported a
// hierarchy (ChartAccount.parentId), this is just the first UI to use it.
const NewAccountModal = ({ open, accounts, onClose, onCreated }) => {
    const { t } = useI18n();
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (values) => {
        setSaving(true);
        try {
            await accountingService.createChartOfAccount(values);
            toast.success(t("accounting.new_account_created"));
            form.resetFields();
            onCreated();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("accounting.failed"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            className="accounting-modal"
            open={open}
            onCancel={onClose}
            title={t("accounting.new_account_title")}
            okText={t("common.save")}
            cancelText={t("common.cancel")}
            onOk={() => form.submit()}
            confirmLoading={saving}
            destroyOnClose
        >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
                <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("accounting.new_account_guidance")} />
                <Form.Item name="code" label={t("accounting.col_code")} extra={t("accounting.new_account_code_hint")} rules={[{ required: true, message: t("accounting.new_account_code_required") }]}>
                    <Input placeholder="5105" />
                </Form.Item>
                <Form.Item name="name" label={t("accounting.col_name")} rules={[{ required: true, message: t("accounting.new_account_name_required") }]}>
                    <Input placeholder="Arrendamientos" />
                </Form.Item>
                <Form.Item name="accountType" label={t("accounting.col_type")} extra={t("accounting.new_account_type_hint")} rules={[{ required: true, message: t("accounting.new_account_type_required") }]}>
                    <Select options={Object.entries(ACCOUNT_TYPE_LABEL_KEYS).map(([value, key]) => ({ value, label: t(key) }))} />
                </Form.Item>
                <Form.Item name="parentId" label={t("accounting.new_account_parent_label")} extra={t("accounting.new_account_parent_hint")}>
                    <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        options={accounts.map((a) => ({ value: a._id, label: `${a.code} · ${a.name}` }))}
                    />
                </Form.Item>
            </Form>
        </Modal>
    );
};

const ChartOfAccountsTab = () => {
    const { t } = useI18n();
    const isMobile = useIsMobile();
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [ledgerAccount, setLedgerAccount] = useState(null);
    const [newAccountOpen, setNewAccountOpen] = useState(false);

    const load = () => {
        setLoading(true);
        accountingService
            .listChartOfAccounts()
            .then((res) => setAccounts(res?.data || []))
            .catch(() => toast.error(t("accounting.failed")))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggleActive = async (account) => {
        try {
            await accountingService.setChartOfAccountActive(account._id, !account.is_active);
            toast.success(account.is_active ? t("accounting.account_deactivated") : t("accounting.account_activated"));
            load();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("accounting.failed"));
        }
    };

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
            width: 260,
            render: (_, record) => (
                <div className="flex gap-2">
                    <Button size="small" icon={<EyeOutlined />} onClick={() => setLedgerAccount(record)}>
                        {t("accounting.ledger_view_button")}
                    </Button>
                    <Popconfirm
                        title={record.is_active ? t("accounting.deactivate_account_confirm") : t("accounting.activate_account_confirm")}
                        okText={t("common.yes")}
                        cancelText={t("common.no")}
                        onConfirm={() => toggleActive(record)}
                    >
                        <Button size="small" icon={record.is_active ? <StopOutlined /> : <CheckCircleOutlined />}>
                            {record.is_active ? t("accounting.deactivate_account") : t("accounting.activate_account")}
                        </Button>
                    </Popconfirm>
                </div>
            ),
        },
    ];

    return (
        <>
            <AccountingSectionGuide sectionKey="chart" title={t("accounting.guide_chart_title")} summary={t("accounting.tab_chart_of_accounts_caption")} steps={[t("accounting.guide_chart_step_1"), t("accounting.guide_chart_step_2"), t("accounting.guide_chart_step_3")]} result={t("accounting.guide_chart_result")} concepts={[{ label: t("accounting.col_type"), help: t("accounting.guide_chart_type_help") }, { label: t("accounting.ledger_view_button"), help: t("accounting.guide_ledger_help") }]} />
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                <span />
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setNewAccountOpen(true)} className="shrink-0">
                    {t("accounting.new_account_button")}
                </Button>
            </div>
            {isMobile ? (
                loading ? (
                    <div className="text-center py-8 text-[var(--ohnix-text-muted)]">{t("common.loading")}</div>
                ) : accounts.length === 0 ? (
                    <EmptyState title={t("accounting.no_chart_accounts")} subtitle={t("accounting.empty_chart_help")} action={<Button type="primary" icon={<PlusOutlined />} onClick={() => setNewAccountOpen(true)}>{t("accounting.new_account_button")}</Button>} />
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
                                    <div className="flex gap-2">
                                        <Button block size="small" icon={<EyeOutlined />} onClick={() => setLedgerAccount(acc)}>
                                            {t("accounting.ledger_view_button")}
                                        </Button>
                                        <Popconfirm
                                            title={acc.is_active ? t("accounting.deactivate_account_confirm") : t("accounting.activate_account_confirm")}
                                            okText={t("common.yes")}
                                            cancelText={t("common.no")}
                                            onConfirm={() => toggleActive(acc)}
                                        >
                                            <Button block size="small" icon={acc.is_active ? <StopOutlined /> : <CheckCircleOutlined />} />
                                        </Popconfirm>
                                    </div>
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
                        locale={{ emptyText: <EmptyState compact title={t("accounting.no_chart_accounts")} subtitle={t("accounting.empty_chart_help")} action={<Button type="primary" icon={<PlusOutlined />} onClick={() => setNewAccountOpen(true)}>{t("accounting.new_account_button")}</Button>} /> }}
                    />
                </Card>
            )}
            <AccountLedgerDrawer account={ledgerAccount} onClose={() => setLedgerAccount(null)} />
            <NewAccountModal
                open={newAccountOpen}
                accounts={accounts}
                onClose={() => setNewAccountOpen(false)}
                onCreated={() => {
                    setNewAccountOpen(false);
                    load();
                }}
            />
        </>
    );
};

const ThirdPartyLedgerTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [dateRange, setDateRange] = useState([dayjs().startOf("year"), dayjs()]);
    const [type, setType] = useState(undefined);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const params = () => ({ from: dateRange[0].format("YYYY-MM-DD"), to: dateRange[1].format("YYYY-MM-DD") });
    const load = async () => {
        setLoading(true);
        try {
            const response = await accountingService.listThirdPartyBalances({ ...params(), type });
            setRows(response?.data || []);
        } catch { toast.error(t("accounting.failed")); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const openDetail = async (party) => {
        setDetailLoading(true);
        setDetail({ thirdParty: party, movements: [] });
        try {
            const response = await accountingService.getThirdPartyMovements(party.type, party.id, params());
            setDetail(response?.data || null);
        } catch { toast.error(t("accounting.failed")); }
        finally { setDetailLoading(false); }
    };

    return (
        <>
            <AccountingSectionGuide sectionKey="third-parties" title={t("accounting.guide_third_parties_title")} summary={t("accounting.tab_third_parties_caption")} steps={[t("accounting.guide_third_step_1"), t("accounting.guide_third_step_2")]} result={t("accounting.guide_third_result")} concepts={[{ label: t("accounting.ledger_opening_balance"), help: t("accounting.guide_opening_help") }, { label: t("accounting.ledger_closing_balance"), help: t("accounting.guide_closing_help") }]} />
            <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4">
                <div className="flex flex-col sm:flex-row gap-3">
                    <RangePicker value={dateRange} onChange={(dates) => dates && setDateRange(dates)} allowClear={false} />
                    <Select allowClear value={type} onChange={setType} placeholder={t("accounting.third_party_all_types")} options={[
                        { value: "customer", label: t("accounting.third_party_customer") },
                        { value: "supplier", label: t("accounting.third_party_supplier") },
                        { value: "other", label: t("accounting.third_party_other") },
                    ]} className="w-full sm:w-48" />
                    <Button type="primary" onClick={load} loading={loading}>{t("reports.refresh_report")}</Button>
                </div>
            </Card>
            <Table
                className="module-dark-table"
                rowKey={(row) => `${row.type}:${row.id}`}
                dataSource={rows}
                loading={loading}
                pagination={{ pageSize: 15 }}
                locale={{ emptyText: <EmptyState compact title={t("accounting.empty_third_title")} subtitle={t("accounting.empty_third_help")} /> }}
                columns={[
                    { title: t("accounting.third_party_name"), dataIndex: "name" },
                    { title: t("accounting.third_party_document"), dataIndex: "document" },
                    { title: t("accounting.col_type"), dataIndex: "type", render: (value) => t(`accounting.third_party_${value}`) },
                    { title: t("accounting.ledger_closing_balance"), dataIndex: "balance", align: "right", render: formatCurrency },
                    { title: "", render: (_, party) => <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(party)}>{t("accounting.ledger_view_button")}</Button> },
                ]}
            />
            <Drawer rootClassName="accounting-drawer" open={Boolean(detail)} onClose={() => setDetail(null)} width={760} title={detail?.thirdParty?.name || t("accounting.tab_third_parties")}>
                <Row gutter={12} className="mb-4">
                    <Col span={12}><StatCard title={t("accounting.ledger_opening_balance")} value={detail?.openingBalance || 0} formatter={formatCurrency} /></Col>
                    <Col span={12}><StatCard title={t("accounting.ledger_closing_balance")} value={detail?.closingBalance || 0} formatter={formatCurrency} /></Col>
                </Row>
                <Table className="module-dark-table" scroll={{ x: 760 }} loading={detailLoading} rowKey="id" pagination={false} dataSource={detail?.movements || []} columns={[
                    { title: t("accounting.col_date"), dataIndex: "date", render: (value) => dayjs(value).format("DD/MM/YYYY") },
                    { title: t("accounting.lines_col_account"), dataIndex: "chartAccount", render: (account) => `${account.code} · ${account.name}` },
                    { title: t("accounting.lines_col_debit"), dataIndex: "debit", align: "right", render: (value) => value ? formatCurrency(value) : "" },
                    { title: t("accounting.lines_col_credit"), dataIndex: "credit", align: "right", render: (value) => value ? formatCurrency(value) : "" },
                    { title: t("accounting.ledger_col_running_balance"), dataIndex: "runningBalance", align: "right", render: formatCurrency },
                ]} />
            </Drawer>
        </>
    );
};

const ManualVouchersTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("accounting", "edit");
    const canAdmin = hasPermission("accounting", "admin");
    const [form] = Form.useForm();
    const [vouchers, setVouchers] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const watchedLines = Form.useWatch("lines", form) || [];
    const totalDebit = watchedLines.reduce((sum, line) => sum + Number(line?.debit || 0), 0);
    const totalCredit = watchedLines.reduce((sum, line) => sum + Number(line?.credit || 0), 0);
    const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100) && totalDebit > 0;

    const load = async () => {
        setLoading(true);
        try {
            const [voucherRes, accountRes] = await Promise.all([
                accountingService.listManualVouchers(),
                accountingService.listChartOfAccounts(),
            ]);
            setVouchers(voucherRes?.data || []);
            setAccounts((accountRes?.data || []).filter((account) => account.is_active));
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const showEditor = (voucher = null) => {
        setEditing(voucher);
        form.setFieldsValue({
            entry_date: voucher ? dayjs(voucher.entry_date) : dayjs(),
            description: voucher?.description || "",
            support_url: voucher?.support_url || "",
            lines: voucher?.lines?.map((line) => ({
                chart_account_id: line.chart_account._id,
                debit: line.debit || undefined,
                credit: line.credit || undefined,
                description: line.description || "",
                third_party: line.third_party || undefined,
            })) || [{ debit: undefined, credit: undefined }, { debit: undefined, credit: undefined }],
        });
        setOpen(true);
    };

    const save = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            const payload = {
                ...values,
                entry_date: values.entry_date.format("YYYY-MM-DD"),
                lines: values.lines.map((line) => ({
                    ...line,
                    debit: Number(line.debit || 0),
                    credit: Number(line.credit || 0),
                })),
            };
            if (editing) await accountingService.updateManualVoucher(editing._id, payload);
            else await accountingService.createManualVoucher(payload);
            toast.success(t("accounting.voucher_saved"));
            setOpen(false);
            form.resetFields();
            await load();
        } catch (error) {
            if (error?.errorFields) return;
            toast.error(error?.response?.data?.message || t("accounting.failed"));
        } finally {
            setSaving(false);
        }
    };

    const post = async (voucher) => {
        try {
            await accountingService.postManualVoucher(voucher._id);
            toast.success(t("accounting.voucher_posted"));
            await load();
        } catch (error) {
            toast.error(error?.response?.data?.message || t("accounting.failed"));
        }
    };

    const voidVoucher = (voucher) => {
        let reason = "";
        Modal.confirm({
            className: "accounting-modal",
            title: t("accounting.voucher_void_title"),
            content: <Input.TextArea rows={3} placeholder={t("accounting.voucher_void_reason")} onChange={(event) => { reason = event.target.value; }} />,
            okText: t("accounting.voucher_void"),
            okButtonProps: { danger: true },
            onOk: async () => {
                if (!reason.trim()) throw new Error(t("accounting.voucher_void_reason_required"));
                await accountingService.voidManualVoucher(voucher._id, { reason });
                toast.success(t("accounting.voucher_voided"));
                await load();
            },
        });
    };

    const statusTag = (status) => ({
        draft: <Tag>{t("accounting.voucher_status_draft")}</Tag>,
        posted: <Tag color="green">{t("accounting.voucher_status_posted")}</Tag>,
        voided: <Tag color="red">{t("accounting.voucher_status_voided")}</Tag>,
    }[status]);

    const columns = [
        { title: t("accounting.col_date"), dataIndex: "entry_date", key: "date", render: (value) => dayjs(value).format("DD/MM/YYYY") },
        { title: t("accounting.col_description"), dataIndex: "description", key: "description", ellipsis: true },
        { title: t("accounting.col_status"), dataIndex: "status", key: "status", render: statusTag },
        { title: t("accounting.col_total"), key: "total", align: "right", render: (_, voucher) => formatCurrency(voucher.lines.reduce((sum, line) => sum + line.debit, 0)) },
        {
            title: t("common.actions"), key: "actions", render: (_, voucher) => (
                <div className="flex gap-2">
                    {voucher.status === "draft" && canEdit && <Button size="small" onClick={() => showEditor(voucher)}>{t("common.edit")}</Button>}
                    {voucher.status === "draft" && canEdit && (
                        <Popconfirm title={t("accounting.voucher_post_confirm")} onConfirm={() => post(voucher)}>
                            <Button size="small" type="primary">{t("accounting.voucher_post")}</Button>
                        </Popconfirm>
                    )}
                    {voucher.status === "posted" && canAdmin && <Button size="small" danger onClick={() => voidVoucher(voucher)}>{t("accounting.voucher_void")}</Button>}
                </div>
            ),
        },
    ];

    return (
        <>
            <AccountingSectionGuide sectionKey="vouchers" title={t("accounting.guide_vouchers_title")} summary={t("accounting.tab_vouchers_caption")} steps={[t("accounting.guide_voucher_step_1"), t("accounting.guide_voucher_step_2"), t("accounting.guide_voucher_step_3")]} result={t("accounting.guide_voucher_result")} concepts={[{ label: t("accounting.voucher_status_draft"), help: t("accounting.guide_draft_help") }, { label: t("accounting.voucher_status_posted"), help: t("accounting.guide_posted_help") }]} />
            <div className="flex items-center justify-between gap-3 mb-4">
                <span />
                {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => showEditor()}>{t("accounting.voucher_new")}</Button>}
            </div>
            <Table
                className="module-dark-table"
                columns={columns}
                dataSource={vouchers}
                rowKey="_id"
                loading={loading}
                scroll={{ x: "max-content" }}
                pagination={{ pageSize: 15 }}
                locale={{ emptyText: <EmptyState compact title={t("accounting.empty_vouchers_title")} subtitle={t("accounting.empty_vouchers_help")} action={canEdit ? <Button type="primary" icon={<PlusOutlined />} onClick={() => showEditor()}>{t("accounting.voucher_new")}</Button> : null} /> }}
                expandable={{
                    expandedRowRender: (voucher) => (
                        <div className="space-y-3">
                            {voucher.support_url && <a href={voucher.support_url} target="_blank" rel="noreferrer">{t("accounting.voucher_open_support")}</a>}
                            <Table
                                className="module-dark-table"
                                size="small"
                                pagination={false}
                                rowKey="_id"
                                dataSource={voucher.lines}
                                columns={[
                                    { title: t("accounting.lines_col_account"), render: (_, line) => `${line.chart_account.code} · ${line.chart_account.name}` },
                                    { title: t("accounting.lines_col_debit"), dataIndex: "debit", align: "right", render: (value) => value ? formatCurrency(value) : "" },
                                    { title: t("accounting.lines_col_credit"), dataIndex: "credit", align: "right", render: (value) => value ? formatCurrency(value) : "" },
                                ]}
                            />
                            {voucher.void_reason && <Alert type="error" showIcon message={voucher.void_reason} />}
                        </div>
                    ),
                }}
            />
            <Modal className="accounting-modal" title={editing ? t("accounting.voucher_edit") : t("accounting.voucher_new")} open={open} onCancel={() => setOpen(false)} onOk={save} confirmLoading={saving} width={980} destroyOnHidden>
                <Form form={form} layout="vertical">
                    <Alert className="dark-alert dark-alert-purple mb-4" type="info" showIcon message={t("accounting.voucher_editor_guidance")} />
                    <Row gutter={16}>
                        <Col xs={24} md={8}><Form.Item name="entry_date" label={t("accounting.col_date")} rules={[{ required: true }]}><DatePicker className="w-full" /></Form.Item></Col>
                        <Col xs={24} md={16}><Form.Item name="description" label={t("accounting.col_description")} rules={[{ required: true }]}><Input /></Form.Item></Col>
                    </Row>
                    <Form.Item name="support_url" label={t("accounting.voucher_support_url")} extra={t("accounting.voucher_support_hint")}><Input type="url" /></Form.Item>
                    <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("accounting.voucher_third_party_guidance")} />
                    <Form.List name="lines">
                        {(fields, { add, remove }) => (
                            <div className="space-y-3">
                                {fields.map(({ key, name }) => (
                                    <div key={key} className="border-b border-[var(--ohnix-line-3)] pb-2">
                                        <Row gutter={8} align="middle">
                                            <Col xs={24} md={9}><Form.Item name={[name, "chart_account_id"]} rules={[{ required: true }]}><Select showSearch optionFilterProp="label" placeholder={t("accounting.lines_col_account")} options={accounts.map((account) => ({ value: account._id, label: `${account.code} · ${account.name}` }))} /></Form.Item></Col>
                                            <Col xs={10} md={5}><Form.Item name={[name, "debit"]}><InputNumber min={0} precision={2} className="w-full" placeholder={t("accounting.lines_col_debit")} /></Form.Item></Col>
                                            <Col xs={10} md={5}><Form.Item name={[name, "credit"]}><InputNumber min={0} precision={2} className="w-full" placeholder={t("accounting.lines_col_credit")} /></Form.Item></Col>
                                            <Col xs={4} md={5}><Button danger disabled={fields.length <= 2} onClick={() => remove(name)}>{t("common.delete")}</Button></Col>
                                        </Row>
                                        <Row gutter={8}>
                                            <Col xs={24} md={5}><Form.Item name={[name, "third_party", "type"]}><Select allowClear placeholder={t("accounting.col_type")} options={[{ value: "customer", label: t("accounting.third_party_customer") }, { value: "supplier", label: t("accounting.third_party_supplier") }, { value: "other", label: t("accounting.third_party_other") }]} /></Form.Item></Col>
                                            <Col xs={24} md={10}><Form.Item name={[name, "third_party", "name"]}><Input placeholder={t("accounting.third_party_name")} /></Form.Item></Col>
                                            <Col xs={24} md={9}><Form.Item name={[name, "third_party", "document"]}><Input placeholder={t("accounting.third_party_document")} /></Form.Item></Col>
                                        </Row>
                                    </div>
                                ))}
                                <Button onClick={() => add({})} icon={<PlusOutlined />}>{t("accounting.voucher_add_line")}</Button>
                            </div>
                        )}
                    </Form.List>
                    <Alert className="mt-4" type={balanced ? "success" : "warning"} showIcon message={`${t("accounting.lines_col_debit")}: ${formatCurrency(totalDebit)} · ${t("accounting.lines_col_credit")}: ${formatCurrency(totalCredit)}`} description={balanced ? t("accounting.voucher_balanced") : t("accounting.voucher_unbalanced")} />
                </Form>
            </Modal>
        </>
    );
};

const JournalTab = ({ initialSourceType, initialSourceId }) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const isMobile = useIsMobile();
    const [dateRange, setDateRange] = useState([dayjs().subtract(30, "days"), dayjs()]);
    const [sourceType, setSourceType] = useState(initialSourceType);
    const [sourceId, setSourceId] = useState(initialSourceId);
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchEntries = async (overrides = {}) => {
        // "sourceId" in overrides (not a !== undefined check) so an explicit
        // clear - {sourceId: undefined}, e.g. dropping the deep-link pin -
        // is distinguishable from "no override passed, keep current state".
        const effectiveSourceType = "sourceType" in overrides ? overrides.sourceType : sourceType;
        const effectiveSourceId = "sourceId" in overrides ? overrides.sourceId : sourceId;
        setLoading(true);
        try {
            const res = await accountingService.listJournalEntries({
                from: dateRange[0].format("YYYY-MM-DD"),
                to: dateRange[1].format("YYYY-MM-DD"),
                sourceType: effectiveSourceType,
                sourceId: effectiveSourceId,
            });
            setEntries(res?.data || []);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEntries({ sourceType: initialSourceType, sourceId: initialSourceId });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialSourceType, initialSourceId]);

    // A deep link (e.g. "view in accounting" from a transfer discrepancy)
    // pins one entry by sourceId; any manual filter change below should
    // drop that pin instead of silently re-applying it underneath.
    const handleSourceTypeChange = (value) => {
        setSourceType(value);
        setSourceId(undefined);
        fetchEntries({ sourceType: value, sourceId: undefined });
    };

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
            <AccountingSectionGuide sectionKey="journal" title={t("accounting.guide_journal_title")} summary={t("accounting.tab_journal_caption")} steps={[t("accounting.guide_journal_step_1"), t("accounting.guide_journal_step_2")]} result={t("accounting.guide_journal_result")} concepts={[{ label: t("accounting.lines_col_debit"), help: t("accounting.guide_debit_help") }, { label: t("accounting.lines_col_credit"), help: t("accounting.guide_credit_help") }]} />
            <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <RangePicker value={dateRange} onChange={(dates) => dates && setDateRange(dates)} format="YYYY-MM-DD" allowClear={false} />
                    <Select
                        allowClear
                        placeholder={t("accounting.source_type_filter_placeholder")}
                        className="w-full sm:w-56"
                        value={sourceType}
                        onChange={handleSourceTypeChange}
                        options={Object.entries(SOURCE_TYPE_LABEL_KEYS).map(([value, key]) => ({ value, label: t(key) }))}
                    />
                    <Button type="primary" className="hover:shadow-[0_0_26px_rgba(41,216,213,0.22)] w-full sm:w-auto" icon={<CalendarOutlined />} onClick={() => fetchEntries()} loading={loading}>
                        {t("reports.refresh_report")}
                    </Button>
                    {sourceId && (
                        <Tag
                            closable
                            color="gold"
                            onClose={(e) => {
                                e.preventDefault();
                                setSourceId(undefined);
                                fetchEntries({ sourceId: undefined });
                            }}
                        >
                            {t("accounting.source_id_filter_active")}
                        </Tag>
                    )}
                </div>
            </Card>
            {isMobile ? (
                loading ? (
                    <div className="text-center py-8 text-[var(--ohnix-text-muted)]">{t("common.loading")}</div>
                ) : entries.length === 0 ? (
                    <EmptyState title={t("accounting.no_entries")} subtitle={t("accounting.empty_journal_help")} />
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
                        locale={{ emptyText: <EmptyState compact title={t("accounting.no_entries")} subtitle={t("accounting.empty_journal_help")} /> }}
                        expandable={{
                            expandedRowRender: (entry) => <Table className="module-dark-table" columns={linesColumns} dataSource={entry.lines} rowKey="_id" pagination={false} size="small" scroll={{ x: "max-content" }} />,
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
    const [checkingPeriodId, setCheckingPeriodId] = useState(null);

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

    const reviewAndClose = async (period) => {
        setCheckingPeriodId(period._id);
        try {
            const response = await accountingService.getAccountingPeriodCloseReadiness(period._id);
            const readiness = response?.data;
            const blockers = readiness?.blockers?.operational_differences || [];
            const warnings = readiness?.warnings || {};
            Modal.confirm({
                className: "accounting-modal",
                title: t("accounting.close_readiness_title", { period: `${String(period.month).padStart(2, "0")}/${period.year}` }),
                width: 620,
                icon: null,
                content: <div className="space-y-3 mt-4">
                    {blockers.length > 0 ? <Alert type="error" showIcon message={t("accounting.close_readiness_blocked_title")} description={t("accounting.close_readiness_blocked_desc", { count: blockers.length })} /> : <Alert className="dark-alert dark-alert-teal" type="success" showIcon message={t("accounting.close_readiness_ok_title")} description={t("accounting.close_readiness_ok_desc")} />}
                    {(warnings.unmatched_statement_entries > 0 || warnings.unmatched_cash_movements > 0) && <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("accounting.close_readiness_reconciliation_title")} description={t("accounting.close_readiness_reconciliation_desc", { entries: warnings.unmatched_statement_entries || 0, movements: warnings.unmatched_cash_movements || 0 })} />}
                    {(warnings.accounting_differences || []).length > 0 && <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("accounting.close_readiness_accounting_title")} description={t("accounting.close_readiness_accounting_desc", { count: warnings.accounting_differences.length })} />}
                    <p className="text-xs text-[var(--ohnix-text-muted)] m-0">{t("accounting.close_readiness_footer")}</p>
                </div>,
                okText: blockers.length > 0 ? t("accounting.close_readiness_blocked_cta") : t("accounting.close_period"),
                okButtonProps: { disabled: blockers.length > 0 },
                cancelText: t("common.cancel"),
                onOk: blockers.length > 0 ? undefined : () => handleClose(period._id),
            });
        } catch (err) { toast.error(err?.response?.data?.message || t("accounting.close_readiness_failed")); }
        finally { setCheckingPeriodId(null); }
    };

    const handleReopen = (period) => {
        let reason = "";
        let durationHours = 24;
                        Modal.confirm({
            className: "accounting-modal",
            title: t("accounting.reopen_period_title"),
            content: (
                <div className="space-y-3 mt-4">
                    <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("accounting.reopen_period_guidance")} />
                    <Input.TextArea rows={3} placeholder={t("accounting.reopen_period_reason")} onChange={(event) => { reason = event.target.value; }} />
                    <InputNumber min={1} max={168} defaultValue={24} addonAfter={t("accounting.hours")} onChange={(value) => { durationHours = value; }} />
                </div>
            ),
            okText: t("accounting.reopen_period"),
            onOk: async () => {
                if (!reason.trim()) throw new Error(t("accounting.reopen_period_reason_required"));
                await accountingService.reopenAccountingPeriod(period._id, { reason, durationHours });
                toast.success(t("accounting.period_reopened"));
                await load();
            },
        });
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
            render: (v, p) => v === "closed"
                ? <Tag color="default">{t("accounting.status_closed")}</Tag>
                : p.reopened_until
                  ? <Tag color={dayjs(p.reopened_until).isAfter(dayjs()) ? "orange" : "red"}>{t(dayjs(p.reopened_until).isAfter(dayjs()) ? "accounting.status_reopened" : "accounting.status_reopening_expired")}</Tag>
                  : <Tag color="green">{t("accounting.status_open")}</Tag>,
        },
        {
            title: t("accounting.col_closed_at"),
            dataIndex: "closed_at",
            key: "closed_at",
            render: (v) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "—"),
        },
        {
            title: t("accounting.reopened_until"),
            dataIndex: "reopened_until",
            key: "reopened_until",
            render: (value) => value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "—",
        },
        {
            title: "",
            key: "actions",
            render: (_, p) =>
                p.status === "open" && canClose ? (
                    <Button size="small" loading={checkingPeriodId === p._id} onClick={() => reviewAndClose(p)}>{t("accounting.close_period")}</Button>
                ) : p.status === "closed" && canClose ? (
                    <Button size="small" onClick={() => handleReopen(p)}>{t("accounting.reopen_period")}</Button>
                ) : null,
        },
    ];

    return (
        <>
            <AccountingSectionGuide sectionKey="periods" title={t("accounting.guide_periods_title")} summary={t("accounting.tab_periods_caption")} steps={[t("accounting.guide_period_step_1"), t("accounting.guide_period_step_2"), t("accounting.guide_period_step_3")]} result={t("accounting.guide_period_result")} concepts={[{ label: t("accounting.close_period"), help: t("accounting.guide_close_help") }, { label: t("accounting.reopen_period"), help: t("accounting.guide_reopen_help") }]} />
            <Card className="module-shell border border-[var(--ohnix-line-4)]">
                <Table
                    columns={columns}
                    dataSource={periods}
                    rowKey="_id"
                    loading={loading}
                    pagination={false}
                    className="module-dark-table"
                    scroll={{ x: "max-content" }}
                    locale={{ emptyText: <EmptyState compact title={t("accounting.no_periods")} subtitle={t("accounting.empty_periods_help")} /> }}
                    expandable={{
                        rowExpandable: (period) => period.reopenings?.length > 0,
                        expandedRowRender: (period) => (
                            <Table className="module-dark-table" size="small" pagination={false} rowKey="_id" dataSource={period.reopenings} columns={[
                                { title: t("accounting.reopen_period_reason"), dataIndex: "reason" },
                                { title: t("accounting.reopened_at"), dataIndex: "reopened_at", render: (value) => dayjs(value).format("DD/MM/YYYY HH:mm") },
                                { title: t("accounting.reopened_until"), dataIndex: "expires_at", render: (value) => dayjs(value).format("DD/MM/YYYY HH:mm") },
                                { title: t("accounting.reclosed_at"), dataIndex: "reclosed_at", render: (value) => value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "—" },
                            ]} />
                        ),
                    }}
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
            <AccountingSectionGuide sectionKey="statements" title={t("accounting.guide_statements_title")} summary={t("accounting.guide_statements_summary")} steps={[t("accounting.guide_statements_step_1"), t("accounting.guide_statements_step_2")]} result={t("accounting.guide_statements_result")} concepts={[{ label: t("accounting.income_statement_title"), help: t("accounting.guide_income_help") }, { label: t("accounting.balance_sheet_title"), help: t("accounting.guide_balance_help") }]} />
            <div>
                <h3 className="text-base font-semibold text-[var(--ohnix-text-primary)] mb-3">{t("accounting.income_statement_title")}</h3>
                <Alert
                    message={t("accounting.gross_margin_disclaimer")}
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                    className="mb-4 dark-alert dark-alert-purple"
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
                                <StatCard title={t("accounting.total_revenue")} value={income.total_revenue} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-success)" }} />
                            </Col>
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.total_costs")} value={income.total_costs} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-warning)" }} />
                            </Col>
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.gross_profit")} value={income.gross_profit} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-info)", fontWeight: 700 }} />
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
                            <Alert message={t("accounting.not_balanced_warning")} type="error" showIcon icon={<WarningOutlined />} className="mb-4 dark-alert dark-alert-rose" />
                        )}
                        <Row gutter={[16, 16]} className="mb-4">
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.total_assets")} value={balance.total_assets} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-info)" }} />
                            </Col>
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.total_liabilities")} value={balance.total_liabilities} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-warning)" }} />
                            </Col>
                            <Col xs={24} sm={8}>
                                <StatCard title={t("accounting.total_equity")} value={balance.total_equity} formatter={formatCurrency} valueStyle={{ color: "var(--ohnix-status-success)", fontWeight: 700 }} />
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
            <AccountingSectionGuide sectionKey="overview" title={t("accounting.guide_overview_title")} summary={t("accounting.tab_overview_caption")} steps={[t("accounting.guide_overview_step_1"), t("accounting.guide_overview_step_2")]} result={t("accounting.guide_overview_result")} concepts={[{ label: t("accounting.overview_gross_profit"), help: t("accounting.guide_profit_help") }, { label: t("accounting.overview_net_vat_payable"), help: t("accounting.guide_vat_help") }]} />
            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard title={t("accounting.overview_gross_profit")} value={income?.gross_profit || 0} formatter={formatCurrency} loading={loading} valueStyle={{ color: "var(--ohnix-status-info)", fontWeight: 700 }} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard title={t("accounting.overview_total_assets")} value={balance?.total_assets || 0} formatter={formatCurrency} loading={loading} valueStyle={{ color: "var(--ohnix-status-success)" }} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard title={t("accounting.overview_total_liabilities")} value={balance?.total_liabilities || 0} formatter={formatCurrency} loading={loading} valueStyle={{ color: "var(--ohnix-status-warning)" }} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title={netVat >= 0 ? t("accounting.overview_net_vat_payable") : t("accounting.overview_net_vat_credit")}
                        value={Math.abs(netVat)}
                        formatter={formatCurrency}
                        loading={loading}
                        valueStyle={{ color: netVat >= 0 ? "var(--ohnix-status-danger)" : "var(--ohnix-status-success)", fontWeight: 700 }}
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
const WithholdingConceptsCard = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canAdmin = hasPermission("accounting", "admin");
    const [form] = Form.useForm();
    const [concepts, setConcepts] = useState([]);
    const [liabilityAccounts, setLiabilityAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [open, setOpen] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [conceptResponse, accountResponse] = await Promise.all([
                accountingService.listWithholdingConcepts(),
                accountingService.listChartOfAccounts(),
            ]);
            setConcepts(conceptResponse?.data || []);
            setLiabilityAccounts((accountResponse?.data || []).filter((account) => account.account_type === "liability" && account.is_active));
        } catch (error) {
            toast.error(error?.response?.data?.message || t("accounting.failed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const showCreate = () => {
        form.resetFields();
        form.setFieldsValue({ tax_type: "income", base_type: "subtotal", effective_from: dayjs(), minimum_base_amount: 0 });
        setOpen(true);
    };

    const save = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            await accountingService.createWithholdingConcept({
                ...values,
                effective_from: values.effective_from.startOf("day").toISOString(),
                effective_to: values.effective_to?.endOf("day").toISOString() || null,
            });
            toast.success(t("accounting.withholding_created"));
            setOpen(false);
            await load();
        } catch (error) {
            toast.error(error?.response?.data?.message || t("accounting.failed"));
        } finally {
            setSaving(false);
        }
    };

    const toggle = async (concept) => {
        try {
            await accountingService.setWithholdingConceptActive(concept.id, !concept.is_active);
            toast.success(t("accounting.withholding_status_updated"));
            await load();
        } catch (error) {
            toast.error(error?.response?.data?.message || t("accounting.failed"));
        }
    };

    const activeCount = concepts.filter((concept) => concept.is_active).length;
    const columns = [
        { title: t("accounting.withholding_code"), dataIndex: "code", width: 110, render: (value) => <Tag color="cyan">{value}</Tag> },
        { title: t("accounting.withholding_concept"), dataIndex: "name", width: 210 },
        { title: t("accounting.col_type"), dataIndex: "tax_type", render: (value) => t(`accounting.withholding_type_${value}`) },
        { title: t("accounting.withholding_rate"), dataIndex: "rate_percent", align: "right", render: (value) => `${value}%` },
        { title: t("accounting.withholding_minimum_base"), dataIndex: "minimum_base_amount", align: "right", render: formatCurrency },
        { title: t("accounting.lines_col_account"), dataIndex: "chart_account", width: 210, render: (account) => account ? `${account.code} · ${account.name}` : "—" },
        { title: t("common.status"), dataIndex: "is_active", render: (active) => <Tag color={active ? "success" : "default"}>{t(active ? "common.active" : "common.inactive")}</Tag> },
        ...(canAdmin ? [{ title: "", fixed: "right", width: 105, render: (_, concept) => <Button size="small" onClick={() => toggle(concept)}>{t(concept.is_active ? "accounting.deactivate_account" : "accounting.activate_account")}</Button> }] : []),
    ];

    return (
        <>
            <Card className="module-shell withholding-concepts-card border border-[var(--ohnix-line-4)]" title={<span className="flex items-center gap-2"><SafetyCertificateOutlined className="text-[var(--ohnix-accent)]" />{t("accounting.withholding_concepts_title")}</span>} extra={canAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={showCreate}>{t("accounting.withholding_new")}</Button>}>
                <div className="withholding-concepts-hero">
                    <div><span>{t("accounting.withholding_engine_label")}</span><strong>{t("accounting.withholding_engine_active")}</strong><p>{t("accounting.withholding_concepts_desc")}</p></div>
                    <div className="withholding-concepts-count"><strong>{activeCount}</strong><span>{t("accounting.withholding_active_count")}</span></div>
                </div>
                <Table className="module-dark-table" loading={loading} rowKey="id" columns={columns} dataSource={concepts} scroll={{ x: 1100 }} pagination={{ pageSize: 8, hideOnSinglePage: true }} locale={{ emptyText: <Empty description={t("accounting.withholding_empty")} /> }} />
            </Card>
            <Modal className="accounting-modal" open={open} onCancel={() => setOpen(false)} onOk={save} confirmLoading={saving} title={t("accounting.withholding_new_title")} width={760} destroyOnHidden>
                <Alert className="dark-alert dark-alert-teal mb-5" showIcon type="info" message={t("accounting.withholding_immutable_notice")} />
                <Form form={form} layout="vertical"><Row gutter={16}>
                    <Col xs={24} sm={8}><Form.Item name="code" label={t("accounting.withholding_code")} rules={[{ required: true }]}><Input maxLength={30} /></Form.Item></Col>
                    <Col xs={24} sm={16}><Form.Item name="name" label={t("accounting.withholding_concept")} rules={[{ required: true }]}><Input maxLength={120} /></Form.Item></Col>
                    <Col xs={24} sm={8}><Form.Item name="tax_type" label={t("accounting.col_type")} extra={t("accounting.withholding_type_hint")} rules={[{ required: true }]}><Select options={["income", "vat", "ica"].map((value) => ({ value, label: t(`accounting.withholding_type_${value}`) }))} /></Form.Item></Col>
                    <Col xs={24} sm={8}><Form.Item name="base_type" label={t("accounting.withholding_base_type")} extra={t("accounting.withholding_base_hint")} rules={[{ required: true }]}><Select options={["subtotal", "vat", "total"].map((value) => ({ value, label: t(`accounting.withholding_base_${value}`) }))} /></Form.Item></Col>
                    <Col xs={24} sm={8}><Form.Item name="rate_percent" label={t("accounting.withholding_rate")} extra={t("accounting.withholding_rate_hint")} rules={[{ required: true }]}><InputNumber className="w-full" min={0.0001} max={100} precision={4} addonAfter="%" /></Form.Item></Col>
                    <Col xs={24} sm={12}><Form.Item name="minimum_base_amount" label={t("accounting.withholding_minimum_base")} extra={t("accounting.withholding_minimum_hint")} rules={[{ required: true }]}><InputNumber className="w-full" min={0} precision={2} /></Form.Item></Col>
                    <Col xs={24} sm={12}><Form.Item name="chart_account_id" label={t("accounting.withholding_liability_account")} extra={t("accounting.withholding_account_hint")} rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={liabilityAccounts.map((account) => ({ value: account._id, label: `${account.code} · ${account.name}` }))} /></Form.Item></Col>
                    <Col xs={24} sm={12}><Form.Item name="effective_from" label={t("accounting.withholding_effective_from")} rules={[{ required: true }]}><DatePicker className="w-full" /></Form.Item></Col>
                    <Col xs={24} sm={12}><Form.Item name="effective_to" label={t("accounting.withholding_effective_to")}><DatePicker className="w-full" /></Form.Item></Col>
                    <Form.Item noStyle shouldUpdate={(prev, next) => prev.tax_type !== next.tax_type}>{({ getFieldValue }) => getFieldValue("tax_type") === "ica" && <Col span={24}><Form.Item name="municipality_code" label={t("accounting.taxes_ica_municipality_label")} rules={[{ required: true }, { pattern: /^\d{5}$/, message: t("accounting.taxes_ica_municipality_error") }]}><Input maxLength={5} placeholder="11001" /></Form.Item></Col>}</Form.Item>
                </Row></Form>
            </Modal>
        </>
    );
};

const WithholdingReportCard = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const isMobile = useIsMobile();
    const [dateRange, setDateRange] = useState([dayjs().startOf("year"), dayjs()]);
    const [taxType, setTaxType] = useState();
    const [report, setReport] = useState({ totals: {}, by_type: [], rows: [] });
    const [loading, setLoading] = useState(false);
    const [certificate, setCertificate] = useState(null);
    const [certificateLoadingId, setCertificateLoadingId] = useState(null);
    const [pdfLoading, setPdfLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const response = await accountingService.getWithholdingReport({ from: dateRange?.[0]?.format("YYYY-MM-DD"), to: dateRange?.[1]?.format("YYYY-MM-DD"), taxType });
            setReport(response?.data || { totals: {}, by_type: [], rows: [] });
        } catch (error) {
            toast.error(error?.response?.data?.message || t("accounting.failed"));
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const showCertificate = async (row) => {
        setCertificateLoadingId(row.id);
        try {
            const response = await accountingService.getWithholdingCertificate(row.supplier.id, dayjs(row.purchase.date).year());
            setCertificate(response?.data || null);
        } catch (error) {
            toast.error(error?.response?.data?.message || t("accounting.failed"));
        } finally { setCertificateLoadingId(null); }
    };

    const columns = [
        { title: t("accounting.withholding_report_date"), dataIndex: ["purchase", "date"], width: 120, render: (value) => dayjs(value).format("DD MMM YYYY") },
        { title: t("accounting.withholding_report_document"), dataIndex: ["purchase", "number"], width: 130, render: (value) => <strong>{value}</strong> },
        { title: t("accounting.withholding_report_supplier"), dataIndex: ["supplier", "name"], width: 210, render: (value, row) => <div><strong>{value}</strong><small className="block text-[var(--ohnix-text-dim)]">{row.supplier.document || "—"}</small></div> },
        { title: t("accounting.withholding_concept"), dataIndex: "concept_name", width: 210, render: (value, row) => <div>{value}<Tag className="ml-2" color="cyan">{t(`accounting.withholding_type_${row.tax_type}`)}</Tag></div> },
        { title: t("accounting.withholding_report_base"), dataIndex: "base_amount", align: "right", render: formatCurrency },
        { title: t("accounting.withholding_rate"), dataIndex: "rate_percent", align: "right", render: (value) => `${value}%` },
        { title: t("accounting.withholding_report_net"), dataIndex: "net_withheld_amount", align: "right", render: (value) => <strong className="text-[var(--ohnix-accent)]">{formatCurrency(value)}</strong> },
        { title: "", fixed: "right", width: 125, render: (_, row) => <Button size="small" icon={<SafetyCertificateOutlined />} loading={certificateLoadingId === row.id} onClick={() => showCertificate(row)}>{t("accounting.withholding_certificate_view")}</Button> },
    ];

    const downloadCertificate = async () => {
        setPdfLoading(true);
        try {
            await accountingService.downloadWithholdingCertificate(certificate.supplier.id, certificate.year, certificate.supplier.identification);
            toast.success(t("accounting.withholding_certificate_downloaded"));
        } catch (error) {
            toast.error(error?.response?.data?.message || t("accounting.failed"));
        } finally { setPdfLoading(false); }
    };

    return <>
        <Card className="module-shell withholding-report-card border border-[var(--ohnix-line-4)]" title={<span className="flex items-center gap-2"><BarChartOutlined className="text-[var(--ohnix-accent)]" />{t("accounting.withholding_report_title")}</span>}>
            <div className="withholding-report-intro"><div><span>{t("accounting.withholding_report_eyebrow")}</span><h3>{t("accounting.withholding_report_heading")}</h3><p>{t("accounting.withholding_report_desc")}</p></div><SafetyCertificateOutlined /></div>
            <div className="withholding-report-filters"><RangePicker value={dateRange} onChange={setDateRange} allowClear={false} /><Select allowClear value={taxType} onChange={setTaxType} placeholder={t("accounting.withholding_report_all_types")} options={["income", "vat", "ica"].map((value) => ({ value, label: t(`accounting.withholding_type_${value}`) }))} /><Button type="primary" icon={<CalculatorOutlined />} loading={loading} onClick={load}>{t("accounting.withholding_report_consult")}</Button></div>
            <Row gutter={[12, 12]} className="mb-5">{[["base", "withholding_report_total_base"], ["withheld", "withholding_report_caused"], ["reversed", "withholding_report_reversed"], ["net", "withholding_report_current"]].map(([key, label]) => <Col xs={12} lg={6} key={key}><div className={`withholding-report-kpi withholding-report-kpi--${key}`}><span>{t(`accounting.${label}`)}</span><strong>{formatCurrency(report.totals?.[key] || 0)}</strong></div></Col>)}</Row>
            <Table className="module-dark-table" loading={loading} rowKey="id" columns={columns} dataSource={report.rows || []} scroll={{ x: 1180 }} pagination={{ pageSize: 8, hideOnSinglePage: true }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<div><strong>{t("accounting.withholding_report_empty_title")}</strong><p>{t("accounting.withholding_report_empty_desc")}</p></div>} /> }} />
        </Card>
        <Drawer className="accounting-drawer withholding-certificate-drawer" width={isMobile ? "100%" : 620} open={Boolean(certificate)} onClose={() => setCertificate(null)} title={t("accounting.withholding_certificate_title")} extra={<Button type="primary" icon={<FileTextOutlined />} loading={pdfLoading} onClick={downloadCertificate}>{t("accounting.withholding_certificate_download")}</Button>}>
            {certificate && <div className="withholding-certificate" id="withholding-certificate-print"><div className="withholding-certificate__brand"><span>OHNIX</span><small>{t("accounting.withholding_certificate_generated")}</small></div><h2>{t("accounting.withholding_certificate_heading")}</h2><p>{t("accounting.withholding_certificate_period", { year: certificate.year })}</p><div className="withholding-certificate__party"><span>{t("accounting.withholding_certificate_withholder")}</span><strong>{certificate.company?.legalName || certificate.company?.name || t("accounting.withholding_certificate_company_missing")}</strong><small>{certificate.company?.taxIdentification ? `NIT ${certificate.company.taxIdentification}${certificate.company.taxIdentificationDv ? `-${certificate.company.taxIdentificationDv}` : ""}` : t("accounting.withholding_certificate_nit_missing")}</small></div><div className="withholding-certificate__party"><span>{t("accounting.withholding_report_supplier")}</span><strong>{certificate.supplier.name}</strong><small>{certificate.supplier.identification || "—"}</small></div><Row gutter={[12, 12]}>{certificate.by_type.map((item) => <Col span={24} key={item.tax_type}><div className="withholding-certificate__line"><div><strong>{t(`accounting.withholding_type_${item.tax_type}`)}</strong><small>{t("accounting.withholding_certificate_documents", { count: item.documents })}</small></div><div><span>{t("accounting.withholding_report_current")}</span><strong>{formatCurrency(item.net)}</strong></div></div></Col>)}</Row><div className="withholding-certificate__total"><span>{t("accounting.withholding_certificate_total")}</span><strong>{formatCurrency(certificate.totals.net || 0)}</strong></div>{!certificate.company?.taxIdentification && <Alert className="dark-alert dark-alert-amber mt-5" type="warning" showIcon message={t("accounting.withholding_certificate_complete_company")} />}<Alert className="dark-alert dark-alert-teal mt-5" type="info" showIcon message={t("accounting.withholding_certificate_notice")} /></div>}
        </Drawer>
    </>;
};

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
            extra={<Tag icon={<CheckCircleOutlined />} color="success">{t("accounting.withholding_engine_active")}</Tag>}
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
            <AccountingSectionGuide sectionKey="taxes" title={t("accounting.guide_taxes_title")} summary={t("accounting.tab_taxes_caption")} steps={[t("accounting.guide_taxes_step_1"), t("accounting.guide_taxes_step_2"), t("accounting.guide_taxes_step_3")]} result={t("accounting.guide_taxes_result")} concepts={[{ label: t("accounting.taxes_vat_title"), help: t("accounting.guide_tax_vat_help") }, { label: t("accounting.withholding_concepts_title"), help: t("accounting.guide_withholding_help") }]} />
            <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.taxes_vat_title")}>
                <p className="text-sm text-[var(--ohnix-text-muted)] mb-3">{t("accounting.taxes_vat_desc")}</p>
                <Link to="/reports">
                    <Button icon={<ArrowRightOutlined />}>{t("accounting.taxes_vat_link")}</Button>
                </Link>
            </Card>
            <WithholdingConfigCard />
            <WithholdingConceptsCard />
            <WithholdingReportCard />
            <ComingSoonTaxCard titleKey="accounting.taxes_renta_title" descKey="accounting.taxes_renta_desc" />
            <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("accounting.taxes_professional_review_notice")} />
        </div>
    );
};

// Balance de comprobación: every account with its opening balance, this
// period's debit/credit movement, and closing balance - the "does
// everything still tie out" check, distinct from the Estados Financieros
// tab which only shows one slice of the chart (revenue/cost/expense or
// asset/liability/equity) at a time.
const TrialBalanceTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const isMobile = useIsMobile();
    const [dateRange, setDateRange] = useState([dayjs().startOf("month"), dayjs()]);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchRows = async () => {
        setLoading(true);
        try {
            const res = await accountingService.getTrialBalance({
                from: dateRange[0].format("YYYY-MM-DD"),
                to: dateRange[1].format("YYYY-MM-DD"),
            });
            setRows(res?.data || []);
        } catch {
            toast.error(t("accounting.failed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRows();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const totals = rows.reduce(
        (acc, r) => ({ debit: acc.debit + r.debit, credit: acc.credit + r.credit }),
        { debit: 0, credit: 0 }
    );

    const columns = [
        { title: t("accounting.col_code"), dataIndex: "code", key: "code", width: 100 },
        { title: t("accounting.col_name"), dataIndex: "name", key: "name" },
        { title: <ContextLabel help={t("accounting.guide_opening_help")}>{t("accounting.trial_balance_col_opening")}</ContextLabel>, dataIndex: "opening_balance", key: "opening_balance", align: "right", render: (v) => formatCurrency(v) },
        { title: <ContextLabel help={t("accounting.guide_debit_help")}>{t("accounting.lines_col_debit")}</ContextLabel>, dataIndex: "debit", key: "debit", align: "right", render: (v) => (v > 0 ? formatCurrency(v) : "") },
        { title: <ContextLabel help={t("accounting.guide_credit_help")}>{t("accounting.lines_col_credit")}</ContextLabel>, dataIndex: "credit", key: "credit", align: "right", render: (v) => (v > 0 ? formatCurrency(v) : "") },
        { title: <ContextLabel help={t("accounting.guide_closing_help")}>{t("accounting.trial_balance_col_closing")}</ContextLabel>, dataIndex: "closing_balance", key: "closing_balance", align: "right", render: (v) => <strong>{formatCurrency(v)}</strong> },
    ];

    return (
        <>
            <AccountingSectionGuide sectionKey="trial-balance" title={t("accounting.guide_trial_title")} summary={t("accounting.tab_trial_balance_caption")} steps={[t("accounting.guide_trial_step_1"), t("accounting.guide_trial_step_2")]} result={t("accounting.guide_trial_result")} concepts={[{ label: t("accounting.trial_balance_col_opening"), help: t("accounting.guide_opening_help") }, { label: t("accounting.trial_balance_col_closing"), help: t("accounting.guide_closing_help") }]} />
            <Card className="module-shell border border-[var(--ohnix-line-4)] mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <RangePicker value={dateRange} onChange={(dates) => dates && setDateRange(dates)} format="YYYY-MM-DD" allowClear={false} className="w-full sm:w-auto" />
                    <Button type="primary" className="hover:shadow-[0_0_26px_rgba(41,216,213,0.22)] w-full sm:w-auto" icon={<CalendarOutlined />} onClick={fetchRows} loading={loading}>
                        {t("reports.refresh_report")}
                    </Button>
                </div>
            </Card>
            <Card className="module-shell border border-[var(--ohnix-line-4)]">
                <Table
                    columns={columns}
                    dataSource={rows}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    className="module-dark-table"
                    scroll={{ x: "max-content" }}
                    size={isMobile ? "small" : "middle"}
                    locale={{ emptyText: t("accounting.no_chart_accounts") }}
                    summary={() =>
                        rows.length > 0 && (
                            <Table.Summary.Row>
                                <Table.Summary.Cell index={0} colSpan={3}>{t("accounting.trial_balance_totals_row")}</Table.Summary.Cell>
                                <Table.Summary.Cell index={1} align="right"><strong>{formatCurrency(totals.debit)}</strong></Table.Summary.Cell>
                                <Table.Summary.Cell index={2} align="right"><strong>{formatCurrency(totals.credit)}</strong></Table.Summary.Cell>
                                <Table.Summary.Cell index={3} />
                            </Table.Summary.Row>
                        )
                    }
                />
            </Card>
        </>
    );
};

const Accounting = () => {
    const { t } = useI18n();
    const { can, loading: subscriptionLoading } = useSubscription();
    const location = useLocation();
    const deepLink = location.state || {};
    const [activeTab, setActiveTab] = useState(deepLink.tab || "overview");
    const [status, setStatus] = useState(null);
    const hasAccounting = can("accounting");

    useEffect(() => {
        if (!hasAccounting) return;
        accountingService
            .getStatus()
            .then(({ data }) => setStatus(data))
            .catch(() => setStatus(null));
    }, [hasAccounting]);

    const tabLabel = (icon, key) => <span className="accounting-tab-label">{icon}<span>{t(key)}</span></span>;
    const tabItems = [
        { key: "overview", label: tabLabel(<DashboardOutlined />, "accounting.tab_overview"), children: <OverviewTab /> },
        { key: "chart", label: tabLabel(<ApartmentOutlined />, "accounting.tab_chart_of_accounts"), children: <ChartOfAccountsTab /> },
        { key: "journal", label: tabLabel(<UnorderedListOutlined />, "accounting.tab_journal"), children: <JournalTab initialSourceType={deepLink.sourceType} initialSourceId={deepLink.sourceId} /> },
        { key: "vouchers", label: tabLabel(<FileTextOutlined />, "accounting.tab_vouchers"), children: <ManualVouchersTab /> },
        { key: "third_parties", label: tabLabel(<TeamOutlined />, "accounting.tab_third_parties"), children: <ThirdPartyLedgerTab /> },
        { key: "trial_balance", label: tabLabel(<CalculatorOutlined />, "accounting.tab_trial_balance"), children: <TrialBalanceTab /> },
        { key: "periods", label: tabLabel(<LockOutlined />, "accounting.tab_periods"), children: <PeriodsTab /> },
        { key: "statements", label: tabLabel(<BarChartOutlined />, "accounting.tab_financial_statements"), children: <FinancialStatementsTab /> },
        { key: "taxes", label: tabLabel(<SafetyCertificateOutlined />, "accounting.tab_taxes"), children: <TaxesTab /> },
    ];

    return (
        <div className="accounting-page min-h-screen bg-transparent text-[var(--ohnix-text-primary)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                <div className="space-y-6">
                    <PageHeader title={t("accounting.page_title")} subtitle={t("accounting.page_subtitle")} icon={<BookOutlined />} />
                    {subscriptionLoading ? null : !hasAccounting ? (
                        <PlanGate featureKey="accounting" />
                    ) : (
                        <>
                            {status && !status.has_journal_entries && (
                                <AccountingQuickStart onOpenTab={setActiveTab} />
                            )}
                            {status && status.has_journal_entries && status.has_backfilled_entries && (
                                <Alert
                                    className="dark-alert dark-alert-purple"
                                    type="info"
                                    showIcon
                                    closable
                                    icon={<InfoCircleOutlined />}
                                    message={t("accounting.onboarding_backfilled_title")}
                                    description={t("accounting.onboarding_backfilled_body")}
                                />
                            )}
                            <Card className="accounting-workspace">
                                <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} className="accounting-tabs" destroyInactiveTabPane={false} />
                            </Card>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Accounting;
