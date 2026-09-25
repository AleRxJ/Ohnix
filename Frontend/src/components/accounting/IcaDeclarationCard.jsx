import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select, Table, Tag } from "antd";
import { CalculatorOutlined, CheckCircleOutlined, DollarOutlined, StopOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import EmptyState from "../common/EmptyState";
import { accountingService } from "../../services/accountingService";
import { financeService } from "../../services/financeService";
import { useCurrency } from "../../context/CurrencyContext";
import useI18n from "../../hooks/useI18n";
import { resolveApiErrorMessage } from "../../utils/apiError";

const MONTHS = { annual: 12, bimonthly: 2 };
const STATUS_COLORS = { posted: "processing", paid: "success", voided: "default" };
const ERROR_CODES = {
    ica_rate_missing: "accounting.ica_blocker_ica_rate_missing",
    ica_already_exists: "accounting.ica_blocker_ica_already_exists",
    ica_period_not_ended: "accounting.ica_blocker_ica_period_not_ended",
    ica_overlap: "accounting.ica_blocker_ica_overlap",
    ica_out_of_order: "accounting.ica_blocker_ica_out_of_order",
    ica_not_latest: "accounting.vat_error_not_latest",
    ica_already_paid: "accounting.vat_error_already_paid",
    ica_concurrent_change: "accounting.vat_error_concurrent_change",
    ica_payment_insufficient_balance: "accounting.vat_error_insufficient_balance",
    ica_payment_date_before_period: "accounting.vat_error_payment_date_before_period",
    accounting_period_closed: "accounting.error_period_closed",
};
const errorMessage = (error, t) => resolveApiErrorMessage(error, t, ERROR_CODES, "accounting.failed");

const lastEnded = (periodicity) => {
    const now = dayjs();
    if (periodicity === "annual") return { year: now.year() - 1, period: 1 };
    const current = Math.floor(now.month() / 2) + 1;
    return current === 1 ? { year: now.year() - 1, period: 6 } : { year: now.year(), period: current - 1 };
};

// Declaración de ICA - backend: Backend/services/icaDeclaration.service.js.
// The rate per thousand comes from the company's tax settings
// (TaxRegimeConfigCard / WithholdingConfigCard), overridable here.
const IcaDeclarationCard = () => {
    const { t, currentLanguage } = useI18n();
    const { formatCurrency } = useCurrency();
    const [periodicity, setPeriodicity] = useState("annual");
    const [year, setYear] = useState(() => lastEnded("annual").year);
    const [period, setPeriod] = useState(1);
    const [excluded, setExcluded] = useState(0);
    const [rate, setRate] = useState(null);
    const [avisos, setAvisos] = useState(false);
    const [bomberil, setBomberil] = useState(0);
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [settling, setSettling] = useState(false);
    const [rows, setRows] = useState([]);
    const [cashAccounts, setCashAccounts] = useState([]);
    const [payTarget, setPayTarget] = useState(null);
    const [voidTarget, setVoidTarget] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [payForm] = Form.useForm();
    const [voidForm] = Form.useForm();

    const monthName = (m) => new Date(Date.UTC(2026, m, 1)).toLocaleString(currentLanguage === "en" ? "en" : "es", { month: "short", timeZone: "UTC" });
    const periodLabel = (row) => row.periodicity === "annual" ? `${row.year}` : `${monthName((row.period_number - 1) * 2)} – ${monthName((row.period_number - 1) * 2 + 1)} ${row.year}`;
    const periodOptions = useMemo(() => Array.from({ length: 12 / MONTHS[periodicity] }, (_, i) => ({ value: i + 1, label: periodLabel({ periodicity, period_number: i + 1, year }) })), [periodicity, year, currentLanguage]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadRows = async () => {
        try { setRows((await accountingService.listIcaDeclarations())?.data || []); } catch (error) { toast.error(errorMessage(error, t)); }
    };
    useEffect(() => { loadRows(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const params = () => ({ periodicity, year, period_number: period, excluded_income: excluded || 0, avisos_tableros: avisos, bomberil_percent: bomberil || 0, ...(rate !== null && rate !== undefined ? { rate_per_thousand: rate } : {}) });
    const loadPreview = async () => {
        setLoading(true);
        try {
            const data = (await accountingService.previewIcaDeclaration(params()))?.data || null;
            setPreview(data);
            if (rate === null && data?.rate_per_thousand != null) setRate(data.rate_per_thousand);
        } catch (error) { toast.error(errorMessage(error, t)); }
        finally { setLoading(false); }
    };
    const change = (fn) => (value) => { fn(value); setPreview(null); };
    const changePeriodicity = (value) => { const last = lastEnded(value); setPeriodicity(value); setYear(last.year); setPeriod(last.period); setPreview(null); };

    const settle = async () => {
        setSettling(true);
        try {
            await accountingService.settleIcaDeclaration(params());
            toast.success(t("accounting.ica_settle_success"));
            setPreview(null);
            await loadRows();
        } catch (error) { toast.error(errorMessage(error, t)); }
        finally { setSettling(false); }
    };
    const openPay = async (row) => {
        try {
            setCashAccounts(((await financeService.listCashAccounts())?.data || []).filter((a) => a.is_active));
            setPayTarget(row);
            payForm.setFieldsValue({ cash_account_id: undefined, payment_date: dayjs() });
        } catch (error) { toast.error(errorMessage(error, t)); }
    };
    const confirmPay = async (values) => {
        setSubmitting(true);
        try {
            await accountingService.payIcaDeclaration(payTarget._id, { cash_account_id: values.cash_account_id, payment_date: values.payment_date.toISOString() });
            toast.success(t("accounting.ica_pay_success"));
            setPayTarget(null);
            await loadRows();
        } catch (error) { toast.error(errorMessage(error, t)); }
        finally { setSubmitting(false); }
    };
    const confirmVoid = async (values) => {
        setSubmitting(true);
        try {
            await accountingService.voidIcaDeclaration(voidTarget._id, values.reason.trim());
            toast.success(t("accounting.vat_void_success"));
            setVoidTarget(null);
            setPreview(null);
            await loadRows();
        } catch (error) { toast.error(errorMessage(error, t)); }
        finally { setSubmitting(false); }
    };

    const summaryRows = preview && preview.total !== undefined ? [
        ["ica_gross_income", preview.gross_income],
        ["ica_excluded_line", -preview.excluded_income],
        ["ica_taxable_base", preview.taxable_base, true],
        ["ica_tax_line", preview.ica_tax, false, { rate: preview.rate_per_thousand }],
        ...(preview.avisos_tableros > 0 ? [["ica_avisos", preview.avisos_tableros]] : []),
        ...(preview.bomberil_surcharge > 0 ? [["ica_bomberil", preview.bomberil_surcharge]] : []),
        ["ica_total", preview.total, true],
        ...(preview.withheld_ica_applied > 0 ? [["ica_withheld", -preview.withheld_ica_applied]] : []),
    ] : [];

    return (
        <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.ica_title")}>
            <p className="text-sm text-[var(--ohnix-text-muted)] mb-4">{t("accounting.ica_desc")}</p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 mb-4">
                <Select className="w-full sm:w-36" value={periodicity} onChange={changePeriodicity} options={[{ value: "annual", label: t("accounting.ica_periodicity_annual") }, { value: "bimonthly", label: t("accounting.vat_periodicity_bimonthly") }]} />
                <Select className="w-full sm:w-28" value={year} onChange={change(setYear)} options={Array.from({ length: 4 }, (_, i) => dayjs().year() - i).map((y) => ({ value: y, label: y }))} />
                {periodicity === "bimonthly" && <Select className="w-full sm:w-44" value={period} onChange={change(setPeriod)} options={periodOptions} />}
                <div><label className="block text-xs text-[var(--ohnix-text-muted)] mb-1">{t("accounting.ica_rate")}</label><InputNumber className="w-full sm:w-32" min={0} max={50} step={0.1} value={rate} onChange={change(setRate)} addonAfter="‰" /></div>
                <div><label className="block text-xs text-[var(--ohnix-text-muted)] mb-1">{t("accounting.ica_excluded")}</label><InputNumber className="w-full sm:w-44" min={0} step={100000} value={excluded} onChange={change(setExcluded)} /></div>
                <div><label className="block text-xs text-[var(--ohnix-text-muted)] mb-1">{t("accounting.ica_bomberil_percent")}</label><InputNumber className="w-full sm:w-28" min={0} max={100} value={bomberil} onChange={change(setBomberil)} addonAfter="%" /></div>
                <Checkbox checked={avisos} onChange={(e) => { setAvisos(e.target.checked); setPreview(null); }}>{t("accounting.ica_avisos_toggle")}</Checkbox>
                <Button icon={<CalculatorOutlined />} loading={loading} onClick={loadPreview}>{t("accounting.vat_preview_cta")}</Button>
            </div>

            {preview && (
                <div className="rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 mb-5">
                    {preview.revenue_lines?.length > 0 && (
                        <div className="mb-3 text-xs text-[var(--ohnix-text-muted)]">
                            <span className="block mb-1">{t("accounting.ica_revenue_lines")}</span>
                            <div className="flex flex-wrap gap-1">{preview.revenue_lines.map((line) => <Tag key={line.code} className="m-0">{line.code} · {line.name}: {formatCurrency(line.amount)}</Tag>)}</div>
                        </div>
                    )}
                    <div className="space-y-1 text-sm">
                        {summaryRows.map(([key, value, strong, vars]) => (
                            <div key={key} className={`flex justify-between gap-3 ${strong ? "border-t border-[var(--ohnix-line-4)] pt-1 font-semibold text-[var(--ohnix-text-primary)]" : ""}`}>
                                <span className={strong ? "" : "text-[var(--ohnix-text-muted)]"}>{t(`accounting.${key}`, vars)}</span>
                                <span className="tabular-nums text-[var(--ohnix-text-primary)]">{formatCurrency(value)}</span>
                            </div>
                        ))}
                        {preview.total !== undefined && (
                            <div className="flex justify-between items-center gap-3 border-t border-[var(--ohnix-line-4)] pt-2 mt-1">
                                <strong className="text-[var(--ohnix-text-primary)]">{t("accounting.vat_net_payable")}</strong>
                                <strong className="tabular-nums text-base text-[var(--ohnix-text-primary)]">{formatCurrency(preview.net_payable)}</strong>
                            </div>
                        )}
                    </div>
                    {preview.blockers.map((code) => <Alert key={code} className="dark-alert dark-alert-amber mt-3" type="warning" showIcon message={t(`accounting.ica_blocker_${code}`)} />)}
                    {preview.total !== undefined && (
                        <div className="flex justify-end mt-4">
                            <Popconfirm title={t("accounting.ica_settle_confirm_title")} description={t("accounting.vat_settle_confirm_desc")} okText={t("accounting.ica_settle_cta")} cancelText={t("common.cancel")} onConfirm={settle} disabled={preview.blockers.length > 0}>
                                <Button type="primary" icon={<CheckCircleOutlined />} loading={settling} disabled={preview.blockers.length > 0}>{t("accounting.ica_settle_cta")}</Button>
                            </Popconfirm>
                        </div>
                    )}
                </div>
            )}

            <Table
                className="module-dark-table"
                rowKey="_id"
                size="small"
                dataSource={rows}
                pagination={{ pageSize: 6 }}
                scroll={{ x: "max-content" }}
                locale={{ emptyText: <EmptyState compact title={t("accounting.ica_empty")} /> }}
                columns={[
                    { title: t("accounting.vat_col_period"), render: (_, row) => <strong>{periodLabel(row)}</strong> },
                    { title: t("accounting.ica_taxable_base"), dataIndex: "taxable_base", align: "right", render: (v) => formatCurrency(v) },
                    { title: t("accounting.ica_total"), align: "right", render: (_, row) => formatCurrency(row.ica_tax + row.avisos_tableros + row.bomberil_surcharge) },
                    { title: t("accounting.vat_net_payable"), dataIndex: "net_payable", align: "right", render: (v) => formatCurrency(v) },
                    { title: t("accounting.vat_col_status"), dataIndex: "status", render: (value, row) => <div><Tag color={STATUS_COLORS[value]}>{t(`accounting.vat_status_${value}`)}</Tag>{row.void_reason && <small className="block text-[var(--ohnix-text-dim)]">{row.void_reason}</small>}</div> },
                    { title: "", key: "actions", render: (_, row) => row.status === "posted" ? <div className="flex gap-1">{row.net_payable > 0 && <Button size="small" type="primary" ghost icon={<DollarOutlined />} onClick={() => openPay(row)}>{t("accounting.vat_pay_cta")}</Button>}<Button size="small" danger icon={<StopOutlined />} onClick={() => { voidForm.resetFields(); setVoidTarget(row); }}>{t("accounting.vat_void_cta")}</Button></div> : null },
                ]}
            />

            <Modal title={t("accounting.ica_pay_title")} open={Boolean(payTarget)} onCancel={() => setPayTarget(null)} onOk={() => payForm.submit()} confirmLoading={submitting} okText={t("accounting.vat_pay_confirm")} destroyOnHidden>
                {payTarget && <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("accounting.ica_pay_help", { amount: formatCurrency(payTarget.net_payable), period: periodLabel(payTarget) })} />}
                <Form form={payForm} layout="vertical" onFinish={confirmPay}>
                    <Form.Item name="cash_account_id" label={t("accounting.vat_pay_cash_account")} rules={[{ required: true, message: t("validation.required_field") }]}><Select options={cashAccounts.map((a) => ({ value: a._id, label: `${a.name} · ${formatCurrency(a.balance)}` }))} /></Form.Item>
                    <Form.Item name="payment_date" label={t("accounting.vat_pay_date")} rules={[{ required: true, message: t("validation.required_field") }]}><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item>
                </Form>
            </Modal>
            <Modal title={t("accounting.ica_void_title")} open={Boolean(voidTarget)} onCancel={() => setVoidTarget(null)} onOk={() => voidForm.submit()} confirmLoading={submitting} okText={t("accounting.vat_void_cta")} okButtonProps={{ danger: true }} destroyOnHidden>
                <Alert className="dark-alert dark-alert-amber mb-4" type="warning" showIcon message={t("accounting.vat_void_help")} />
                <Form form={voidForm} layout="vertical" onFinish={confirmVoid}>
                    <Form.Item name="reason" label={t("accounting.vat_void_reason")} rules={[{ required: true, whitespace: true, message: t("validation.required_field") }]}><Input.TextArea rows={3} maxLength={500} /></Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default IcaDeclarationCard;
