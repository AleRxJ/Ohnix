import { useEffect, useState } from "react";
import { Alert, Button, Drawer, Table, Tag } from "antd";
import { EyeOutlined, SafetyCertificateOutlined, SyncOutlined } from "@ant-design/icons";
import { financeService } from "../../services/financeService";
import { accountingService } from "../../services/accountingService";
import { useCurrency } from "../../context/CurrencyContext";
import useI18n from "../../hooks/useI18n";
import dayjs from "dayjs";

const CashIntegrityPanel = ({ onOpenMovements }) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [ledger, setLedger] = useState(null);
    const [ledgerLoading, setLedgerLoading] = useState(false);
    const [ledgerError, setLedgerError] = useState(false);
    const load = async () => {
        setLoading(true); setError(false);
        try { const response = await financeService.getCashIntegrity(); setData(response?.data || null); }
        catch { setError(true); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);
    const operationalColumns = [
        { title: t("finance.integrity_account"), dataIndex: "name" },
        { title: t("finance.integrity_stored"), dataIndex: "stored_balance", align: "right", render: formatCurrency },
        { title: t("finance.integrity_movements"), dataIndex: "movement_balance", align: "right", render: formatCurrency },
        { title: t("finance.integrity_difference"), dataIndex: "difference", align: "right", render: (value) => <span className={Math.abs(value) >= 0.005 ? "text-[var(--ohnix-status-danger)] font-semibold" : "text-[var(--ohnix-text-primary)]"}>{formatCurrency(value)}</span> },
        { title: t("finance.integrity_status"), dataIndex: "status", render: (value) => <Tag color={value === "ok" ? "success" : "error"}>{t(`finance.integrity_${value}`)}</Tag> },
        { title: "", width: 130, render: (_, row) => <Button size="small" icon={<EyeOutlined />} onClick={() => onOpenMovements?.({ _id: row.id, name: row.name, account_type: row.account_type, balance: row.stored_balance, is_active: row.is_active, chart_account: row.chart_account ? { _id: row.chart_account.id, ...row.chart_account } : null })}>{t("finance.integrity_view_movements")}</Button> },
    ];
    const accountingColumns = [
        { title: t("finance.integrity_chart_account"), dataIndex: "chart_account", render: (value) => `${value.code} · ${value.name}` },
        { title: t("finance.integrity_linked_accounts"), dataIndex: "cash_accounts", render: (rows) => rows.map((row) => row.name).join(", ") },
        { title: t("finance.integrity_operational"), dataIndex: "operational_balance", align: "right", render: formatCurrency },
        { title: t("finance.integrity_ledger"), dataIndex: "ledger_balance", align: "right", render: formatCurrency },
        { title: t("finance.integrity_difference"), dataIndex: "difference", align: "right", render: (value) => <span className={Math.abs(value) >= 0.005 ? "text-[var(--ohnix-status-warning)] font-semibold" : "text-[var(--ohnix-text-primary)]"}>{formatCurrency(value)}</span> },
        { title: t("finance.integrity_status"), dataIndex: "status", render: (value) => <Tag color={value === "ok" ? "success" : "warning"}>{t(`finance.integrity_${value}`)}</Tag> },
        { title: "", width: 125, render: (_, row) => <Button size="small" icon={<EyeOutlined />} onClick={async () => { setLedgerLoading(true); setLedgerError(false); setLedger({ account: row.chart_account, movements: [] }); try { const response = await accountingService.getAccountLedger(row.chart_account.id); setLedger(response?.data || null); } catch { setLedgerError(true); } finally { setLedgerLoading(false); } }}>{t("finance.integrity_investigate")}</Button> },
    ];
    return <><section className="module-shell rounded-3xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--ohnix-accent-line)] bg-[var(--ohnix-accent-soft)]"><SafetyCertificateOutlined className="text-xl text-[var(--ohnix-accent-2)]" /></div><div><h2 className="m-0 text-lg font-bold text-[var(--ohnix-text-primary)]">{t("finance.integrity_title")}</h2><p className="m-0 text-sm text-[var(--ohnix-text-muted)]">{t("finance.integrity_subtitle")}</p></div></div><Button icon={<SyncOutlined />} loading={loading} onClick={load}>{t("finance.integrity_refresh")}</Button></div>
        {error ? <Alert type="error" showIcon message={t("finance.integrity_failed")} action={<Button size="small" onClick={load}>{t("finance.integrity_retry")}</Button>} /> : <>
            {data && <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">{[["cash_accounts", "integrity_cash_accounts"], ["operational_differences", "integrity_operational_alerts"], ["accounting_groups", "integrity_accounting_groups"], ["accounting_differences", "integrity_accounting_alerts"]].map(([key, label]) => <div key={key} className="rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card-soft)] p-3"><span className="block text-xs text-[var(--ohnix-text-muted)]">{t(`finance.${label}`)}</span><strong className="text-xl text-[var(--ohnix-text-primary)]">{data.summary[key]}</strong></div>)}</div>}
            <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("finance.integrity_help_title")} description={t("finance.integrity_help_desc")} />
            <h3 className="text-sm uppercase tracking-wide text-[var(--ohnix-text-muted)]">{t("finance.integrity_operational_title")}</h3><Table loading={loading} className="module-dark-table mb-5" size="small" rowKey="id" dataSource={data?.operational || []} columns={operationalColumns} pagination={false} scroll={{ x: 700 }} locale={{ emptyText: t("finance.integrity_empty") }} />
            <h3 className="text-sm uppercase tracking-wide text-[var(--ohnix-text-muted)]">{t("finance.integrity_accounting_title")}</h3><Table loading={loading} className="module-dark-table" size="small" rowKey={(row) => row.chart_account.id} dataSource={data?.accounting || []} columns={accountingColumns} pagination={false} scroll={{ x: 850 }} locale={{ emptyText: t("finance.integrity_empty") }} />
        </>}
    </section><Drawer width={720} open={Boolean(ledger)} onClose={() => setLedger(null)} title={t("finance.integrity_ledger_detail_title", { account: ledger?.account ? `${ledger.account.code} · ${ledger.account.name}` : "" })} styles={{ body: { background: "var(--ohnix-surface-card-soft)" }, header: { background: "var(--ohnix-surface-card-soft)", borderBottom: "1px solid var(--ohnix-line-3)" } }}>
        <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("finance.integrity_ledger_help_title")} description={t("finance.integrity_ledger_help_desc")} />
        {ledgerError && <Alert className="mb-4" type="error" showIcon message={t("finance.integrity_ledger_failed")} />}
        <div className="grid grid-cols-2 gap-3 mb-4"><div className="rounded-xl border border-[var(--ohnix-line-4)] p-3"><span className="block text-xs text-[var(--ohnix-text-muted)]">{t("accounting.ledger_opening_balance")}</span><strong>{formatCurrency(ledger?.opening_balance || 0)}</strong></div><div className="rounded-xl border border-[var(--ohnix-line-4)] p-3"><span className="block text-xs text-[var(--ohnix-text-muted)]">{t("accounting.ledger_closing_balance")}</span><strong>{formatCurrency(ledger?.closing_balance || 0)}</strong></div></div>
        <Table loading={ledgerLoading} className="module-dark-table" size="small" rowKey={(row) => `${row.entry_id}-${row.date}-${row.debit}-${row.credit}`} dataSource={ledger?.movements || []} pagination={{ pageSize: 12 }} scroll={{ x: 680 }} locale={{ emptyText: t("finance.integrity_ledger_empty") }} columns={[{ title: t("finance.col_date"), dataIndex: "date", width: 105, render: (value) => dayjs(value).format("DD/MM/YYYY") }, { title: t("finance.entry_description_label"), dataIndex: "description", ellipsis: true, render: (value) => value || t("common.na") }, { title: t("finance.col_source"), dataIndex: "source_type", render: (value) => t(`accounting.source_${value}`) }, { title: t("finance.integrity_debit"), dataIndex: "debit", align: "right", render: formatCurrency }, { title: t("finance.integrity_credit"), dataIndex: "credit", align: "right", render: formatCurrency }, { title: t("accounting.ledger_col_running_balance"), dataIndex: "running_balance", align: "right", render: formatCurrency }]} />
    </Drawer></>;
};

export default CashIntegrityPanel;
