import { useEffect, useState } from "react";
import { Alert, Button, Table, Tag } from "antd";
import { SafetyCertificateOutlined, SyncOutlined } from "@ant-design/icons";
import { financeService } from "../../services/financeService";
import { useCurrency } from "../../context/CurrencyContext";
import useI18n from "../../hooks/useI18n";

const CashIntegrityPanel = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
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
        { title: t("finance.integrity_difference"), dataIndex: "difference", align: "right", render: (value) => <span className={Math.abs(value) >= 0.005 ? "text-red-400 font-semibold" : "text-[var(--ohnix-text-primary)]"}>{formatCurrency(value)}</span> },
        { title: t("finance.integrity_status"), dataIndex: "status", render: (value) => <Tag color={value === "ok" ? "success" : "error"}>{t(`finance.integrity_${value}`)}</Tag> },
    ];
    const accountingColumns = [
        { title: t("finance.integrity_chart_account"), dataIndex: "chart_account", render: (value) => `${value.code} · ${value.name}` },
        { title: t("finance.integrity_linked_accounts"), dataIndex: "cash_accounts", render: (rows) => rows.map((row) => row.name).join(", ") },
        { title: t("finance.integrity_operational"), dataIndex: "operational_balance", align: "right", render: formatCurrency },
        { title: t("finance.integrity_ledger"), dataIndex: "ledger_balance", align: "right", render: formatCurrency },
        { title: t("finance.integrity_difference"), dataIndex: "difference", align: "right", render: (value) => <span className={Math.abs(value) >= 0.005 ? "text-amber-400 font-semibold" : "text-[var(--ohnix-text-primary)]"}>{formatCurrency(value)}</span> },
        { title: t("finance.integrity_status"), dataIndex: "status", render: (value) => <Tag color={value === "ok" ? "success" : "warning"}>{t(`finance.integrity_${value}`)}</Tag> },
    ];
    return <section className="module-shell rounded-3xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#29D8D5]/30 bg-[rgba(41,216,213,0.1)]"><SafetyCertificateOutlined className="text-xl text-[#44F3F0]" /></div><div><h2 className="m-0 text-lg font-bold text-[var(--ohnix-text-primary)]">{t("finance.integrity_title")}</h2><p className="m-0 text-sm text-[var(--ohnix-text-muted)]">{t("finance.integrity_subtitle")}</p></div></div><Button icon={<SyncOutlined />} loading={loading} onClick={load}>{t("finance.integrity_refresh")}</Button></div>
        {error ? <Alert type="error" showIcon message={t("finance.integrity_failed")} action={<Button size="small" onClick={load}>{t("finance.integrity_retry")}</Button>} /> : <>
            {data && <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">{[["cash_accounts", "integrity_cash_accounts"], ["operational_differences", "integrity_operational_alerts"], ["accounting_groups", "integrity_accounting_groups"], ["accounting_differences", "integrity_accounting_alerts"]].map(([key, label]) => <div key={key} className="rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card-soft)] p-3"><span className="block text-xs text-[var(--ohnix-text-muted)]">{t(`finance.${label}`)}</span><strong className="text-xl text-[var(--ohnix-text-primary)]">{data.summary[key]}</strong></div>)}</div>}
            <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("finance.integrity_help_title")} description={t("finance.integrity_help_desc")} />
            <h3 className="text-sm uppercase tracking-wide text-[var(--ohnix-text-muted)]">{t("finance.integrity_operational_title")}</h3><Table loading={loading} className="module-dark-table mb-5" size="small" rowKey="id" dataSource={data?.operational || []} columns={operationalColumns} pagination={false} scroll={{ x: 700 }} locale={{ emptyText: t("finance.integrity_empty") }} />
            <h3 className="text-sm uppercase tracking-wide text-[var(--ohnix-text-muted)]">{t("finance.integrity_accounting_title")}</h3><Table loading={loading} className="module-dark-table" size="small" rowKey={(row) => row.chart_account.id} dataSource={data?.accounting || []} columns={accountingColumns} pagination={false} scroll={{ x: 850 }} locale={{ emptyText: t("finance.integrity_empty") }} />
        </>}
    </section>;
};

export default CashIntegrityPanel;
