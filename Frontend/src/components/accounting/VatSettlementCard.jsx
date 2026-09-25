import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, DatePicker, Form, Input, Modal, Popconfirm, Select, Table, Tag } from "antd";
import { CalculatorOutlined, CheckCircleOutlined, DollarOutlined, StopOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import EmptyState from "../common/EmptyState";
import { accountingService } from "../../services/accountingService";
import { financeService } from "../../services/financeService";
import { useCurrency } from "../../context/CurrencyContext";
import useI18n from "../../hooks/useI18n";
import { resolveApiErrorMessage } from "../../utils/apiError";

const MONTHS_PER_PERIOD = { bimonthly: 2, four_monthly: 4 };
const STATUS_COLORS = { posted: "processing", paid: "success", voided: "default" };

const VAT_ERROR_CODES = {
    vat_settlement_already_exists: "accounting.vat_blocker_vat_settlement_already_exists",
    vat_settlement_period_not_ended: "accounting.vat_blocker_vat_settlement_period_not_ended",
    vat_settlement_overlap: "accounting.vat_blocker_vat_settlement_overlap",
    vat_settlement_out_of_order: "accounting.vat_blocker_vat_settlement_out_of_order",
    vat_settlement_not_latest: "accounting.vat_error_not_latest",
    vat_settlement_already_paid: "accounting.vat_error_already_paid",
    vat_settlement_concurrent_change: "accounting.vat_error_concurrent_change",
    vat_settlement_void_reason_required: "accounting.vat_error_void_reason_required",
    vat_payment_insufficient_balance: "accounting.vat_error_insufficient_balance",
    vat_payment_date_before_period: "accounting.vat_error_payment_date_before_period",
    accounting_period_closed: "accounting.error_period_closed",
};
const vatErrorMessage = (error, t) => resolveApiErrorMessage(error, t, VAT_ERROR_CODES, "accounting.failed");

// The last period that has fully ended - the one a user normally comes here
// to declare.
const lastEndedPeriod = (periodicity) => {
    const months = MONTHS_PER_PERIOD[periodicity];
    const now = dayjs();
    const current = Math.floor(now.month() / months) + 1;
    return current === 1 ? { year: now.year() - 1, period: 12 / months } : { year: now.year(), period: current - 1 };
};

// Liquidación de IVA - backend: Backend/services/vatSettlement.service.js.
// The declaration figures themselves (bases, rates) stay in Reports > IVA;
// this card closes the IVA accounts for a declared period and pays the DIAN.
const VatSettlementCard = () => {
    const { t, currentLanguage } = useI18n();
    const { formatCurrency } = useCurrency();
    const [periodicity, setPeriodicity] = useState("bimonthly");
    const [year, setYear] = useState(() => lastEndedPeriod("bimonthly").year);
    const [period, setPeriod] = useState(() => lastEndedPeriod("bimonthly").period);
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [settling, setSettling] = useState(false);
    const [settlements, setSettlements] = useState([]);
    const [listLoading, setListLoading] = useState(false);
    const [cashAccounts, setCashAccounts] = useState([]);
    const [payTarget, setPayTarget] = useState(null);
    const [voidTarget, setVoidTarget] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [payForm] = Form.useForm();
    const [voidForm] = Form.useForm();

    const monthName = (month) => new Date(Date.UTC(2026, month, 1)).toLocaleString(currentLanguage === "en" ? "en" : "es", { month: "short", timeZone: "UTC" });
    const periodLabel = (row) => {
        const months = MONTHS_PER_PERIOD[row.periodicity];
        const start = (row.period_number - 1) * months;
        return `${monthName(start)} – ${monthName(start + months - 1)} ${row.year}`;
    };
    const periodOptions = useMemo(() => Array.from({ length: 12 / MONTHS_PER_PERIOD[periodicity] }, (_, index) => ({
        value: index + 1,
        label: periodLabel({ periodicity, period_number: index + 1, year }),
    })), [periodicity, year, currentLanguage]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadSettlements = async () => {
        setListLoading(true);
        try {
            const response = await accountingService.listVatSettlements();
            setSettlements(response?.data || []);
        } catch (error) {
            toast.error(vatErrorMessage(error, t));
        } finally { setListLoading(false); }
    };
    useEffect(() => { loadSettlements(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const loadPreview = async () => {
        setPreviewLoading(true);
        try {
            const response = await accountingService.previewVatSettlement({ periodicity, year, period_number: period });
            setPreview(response?.data || null);
        } catch (error) {
            toast.error(vatErrorMessage(error, t));
        } finally { setPreviewLoading(false); }
    };

    const changeSelection = (next) => {
        setPreview(null);
        if (next.periodicity) {
            const last = lastEndedPeriod(next.periodicity);
            setPeriodicity(next.periodicity);
            setYear(last.year);
            setPeriod(last.period);
        }
        if (next.year) setYear(next.year);
        if (next.period) setPeriod(next.period);
    };

    const settle = async () => {
        setSettling(true);
        try {
            await accountingService.settleVatPeriod({ periodicity, year, period_number: period });
            toast.success(t("accounting.vat_settle_success"));
            setPreview(null);
            await loadSettlements();
        } catch (error) {
            toast.error(vatErrorMessage(error, t));
        } finally { setSettling(false); }
    };

    const openPay = async (row) => {
        try {
            const response = await financeService.listCashAccounts();
            setCashAccounts((response?.data || []).filter((account) => account.is_active));
            setPayTarget(row);
            payForm.setFieldsValue({ cash_account_id: undefined, payment_date: dayjs() });
        } catch (error) {
            toast.error(vatErrorMessage(error, t));
        }
    };
    const confirmPay = async (values) => {
        setSubmitting(true);
        try {
            await accountingService.payVatSettlement(payTarget._id, { cash_account_id: values.cash_account_id, payment_date: values.payment_date.toISOString() });
            toast.success(t("accounting.vat_pay_success"));
            setPayTarget(null);
            await loadSettlements();
        } catch (error) {
            toast.error(vatErrorMessage(error, t));
        } finally { setSubmitting(false); }
    };
    const confirmVoid = async (values) => {
        setSubmitting(true);
        try {
            await accountingService.voidVatSettlement(voidTarget._id, values.reason.trim());
            toast.success(t("accounting.vat_void_success"));
            setVoidTarget(null);
            voidForm.resetFields();
            setPreview(null);
            await loadSettlements();
        } catch (error) {
            toast.error(vatErrorMessage(error, t));
        } finally { setSubmitting(false); }
    };

    const hasPriorAdjustments = preview && (preview.prior_adjustment_generated !== 0 || preview.prior_adjustment_deductible !== 0);
    const previewRows = preview ? [
        ["vat_generated_period", preview.activity_generated],
        ["vat_deductible_period", -preview.activity_deductible],
        ...(hasPriorAdjustments ? [["vat_prior_adjustments", preview.prior_adjustment_generated - preview.prior_adjustment_deductible]] : []),
        ["vat_net", preview.net, true],
        ...(preview.withheld_vat > 0 ? [["vat_withheld_applied", -preview.withheld_vat]] : []),
        ...(preview.carry_forward_applied > 0 ? [["vat_carry_forward_applied", -preview.carry_forward_applied]] : []),
    ] : [];

    return (
        <Card className="module-shell border border-[var(--ohnix-line-4)]" title={t("accounting.vat_settlement_title")}>
            <p className="text-sm text-[var(--ohnix-text-muted)] mb-4">{t("accounting.vat_settlement_desc")}</p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <Select className="w-full sm:w-44" value={periodicity} onChange={(value) => changeSelection({ periodicity: value })} options={[{ value: "bimonthly", label: t("accounting.vat_periodicity_bimonthly") }, { value: "four_monthly", label: t("accounting.vat_periodicity_four_monthly") }]} />
                <Select className="w-full sm:w-28" value={year} onChange={(value) => changeSelection({ year: value })} options={Array.from({ length: 4 }, (_, i) => dayjs().year() - i).map((y) => ({ value: y, label: y }))} />
                <Select className="w-full sm:w-44" value={period} onChange={(value) => changeSelection({ period: value })} options={periodOptions} />
                <Button icon={<CalculatorOutlined />} loading={previewLoading} onClick={loadPreview}>{t("accounting.vat_preview_cta")}</Button>
            </div>

            {preview && (
                <div className="rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 mb-5">
                    <div className="space-y-1 text-sm">
                        {previewRows.map(([key, value, strong]) => (
                            <div key={key} className={`flex justify-between gap-3 ${strong ? "border-t border-[var(--ohnix-line-4)] pt-1 font-semibold text-[var(--ohnix-text-primary)]" : ""}`}>
                                <span className={strong ? "" : "text-[var(--ohnix-text-muted)]"}>{t(`accounting.${key}`)}</span>
                                <span className="tabular-nums text-[var(--ohnix-text-primary)]">{formatCurrency(value)}</span>
                            </div>
                        ))}
                        <div className="flex justify-between items-center gap-3 border-t border-[var(--ohnix-line-4)] pt-2 mt-1">
                            <strong className="text-[var(--ohnix-text-primary)]">{t(preview.credit_balance > 0 ? "accounting.vat_credit_balance" : "accounting.vat_net_payable")}</strong>
                            <strong className="tabular-nums text-base text-[var(--ohnix-text-primary)]">{formatCurrency(preview.credit_balance > 0 ? preview.credit_balance : preview.net_payable)}</strong>
                        </div>
                    </div>
                    {hasPriorAdjustments && <Alert className="dark-alert dark-alert-amber mt-3" type="warning" showIcon message={t("accounting.vat_prior_adjustments_help")} />}
                    {preview.available_credit > 0 && preview.carry_forward_applied === 0 && preview.credit_balance > 0 && <Alert className="dark-alert dark-alert-teal mt-3" type="info" showIcon message={t("accounting.vat_available_credit_help", { amount: formatCurrency(preview.available_credit) })} />}
                    {preview.blockers.map((code) => <Alert key={code} className="dark-alert dark-alert-amber mt-3" type="warning" showIcon message={t(`accounting.vat_blocker_${code}`)} />)}
                    <div className="flex justify-end mt-4">
                        <Popconfirm title={t("accounting.vat_settle_confirm_title")} description={t("accounting.vat_settle_confirm_desc")} okText={t("accounting.vat_settle_cta")} cancelText={t("common.cancel")} onConfirm={settle} disabled={preview.blockers.length > 0}>
                            <Button type="primary" icon={<CheckCircleOutlined />} loading={settling} disabled={preview.blockers.length > 0}>{t("accounting.vat_settle_cta")}</Button>
                        </Popconfirm>
                    </div>
                </div>
            )}

            <Table
                className="module-dark-table"
                loading={listLoading}
                rowKey="_id"
                size="small"
                dataSource={settlements}
                pagination={{ pageSize: 6 }}
                scroll={{ x: "max-content" }}
                locale={{ emptyText: <EmptyState compact title={t("accounting.vat_settlements_empty")} subtitle={t("accounting.vat_settlements_empty_help")} /> }}
                columns={[
                    { title: t("accounting.vat_col_period"), render: (_, row) => <div><strong>{periodLabel(row)}</strong><small className="block text-[var(--ohnix-text-dim)]">{t(`accounting.vat_periodicity_${row.periodicity}`)}</small></div> },
                    { title: t("accounting.vat_col_generated"), dataIndex: "generated_total", align: "right", render: (v) => formatCurrency(v) },
                    { title: t("accounting.vat_col_deductible"), dataIndex: "deductible_total", align: "right", render: (v) => formatCurrency(v) },
                    { title: t("accounting.vat_col_result"), align: "right", render: (_, row) => row.credit_balance > 0 ? <span>{formatCurrency(row.credit_balance)} <Tag className="m-0 ml-1">{t("accounting.vat_tag_credit")}</Tag></span> : formatCurrency(row.net_payable) },
                    { title: t("accounting.vat_col_status"), dataIndex: "status", render: (value, row) => <div><Tag color={STATUS_COLORS[value]}>{t(`accounting.vat_status_${value}`)}</Tag>{row.paid_at && <small className="block text-[var(--ohnix-text-dim)]">{dayjs(row.paid_at).format("DD/MM/YYYY")}</small>}{row.void_reason && <small className="block text-[var(--ohnix-text-dim)]">{row.void_reason}</small>}</div> },
                    {
                        title: "",
                        key: "actions",
                        render: (_, row) => row.status === "posted" ? (
                            <div className="flex gap-1">
                                {row.net_payable > 0 && <Button size="small" type="primary" ghost icon={<DollarOutlined />} onClick={() => openPay(row)}>{t("accounting.vat_pay_cta")}</Button>}
                                <Button size="small" danger icon={<StopOutlined />} onClick={() => { voidForm.resetFields(); setVoidTarget(row); }}>{t("accounting.vat_void_cta")}</Button>
                            </div>
                        ) : null,
                    },
                ]}
            />

            <Modal title={t("accounting.vat_pay_title")} open={Boolean(payTarget)} onCancel={() => setPayTarget(null)} onOk={() => payForm.submit()} confirmLoading={submitting} okText={t("accounting.vat_pay_confirm")} destroyOnHidden>
                {payTarget && <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("accounting.vat_pay_help", { amount: formatCurrency(payTarget.net_payable), period: periodLabel(payTarget) })} />}
                <Form form={payForm} layout="vertical" onFinish={confirmPay}>
                    <Form.Item name="cash_account_id" label={t("accounting.vat_pay_cash_account")} rules={[{ required: true, message: t("validation.required_field") }]}>
                        <Select options={cashAccounts.map((account) => ({ value: account._id, label: `${account.name} · ${formatCurrency(account.balance)}` }))} />
                    </Form.Item>
                    <Form.Item name="payment_date" label={t("accounting.vat_pay_date")} rules={[{ required: true, message: t("validation.required_field") }]}>
                        <DatePicker className="w-full" format="DD/MM/YYYY" />
                    </Form.Item>
                </Form>
            </Modal>
            <Modal title={t("accounting.vat_void_title")} open={Boolean(voidTarget)} onCancel={() => setVoidTarget(null)} onOk={() => voidForm.submit()} confirmLoading={submitting} okText={t("accounting.vat_void_cta")} okButtonProps={{ danger: true }} destroyOnHidden>
                <Alert className="dark-alert dark-alert-amber mb-4" type="warning" showIcon message={t("accounting.vat_void_help")} />
                <Form form={voidForm} layout="vertical" onFinish={confirmVoid}>
                    <Form.Item name="reason" label={t("accounting.vat_void_reason")} rules={[{ required: true, whitespace: true, message: t("validation.required_field") }]}>
                        <Input.TextArea rows={3} maxLength={500} />
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default VatSettlementCard;
