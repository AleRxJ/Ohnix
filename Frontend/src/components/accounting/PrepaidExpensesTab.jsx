import { useEffect, useState } from "react";
import { Alert, Button, Col, DatePicker, Form, Input, InputNumber, Modal, Progress, Row, Select, Switch, Table, Tag, Tooltip } from "antd";
import { PlusOutlined, WarningOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import EmptyState from "../common/EmptyState";
import { accountingService } from "../../services/accountingService";
import { financeService } from "../../services/financeService";
import { useCurrency } from "../../context/CurrencyContext";
import { useTeam } from "../../context/TeamContext";
import useI18n from "../../hooks/useI18n";
import { resolveApiErrorMessage } from "../../utils/apiError";

const PREPAID_ERROR_CODES = {
    prepaid_insufficient_balance: "accounting.prepaid_error_insufficient_balance",
    prepaid_schedule_locked: "accounting.prepaid_error_schedule_locked",
    prepaid_amount_locked: "accounting.prepaid_error_amount_locked",
    prepaid_nothing_due: "accounting.prepaid_error_nothing_due",
    prepaid_concurrent_change: "accounting.prepaid_error_concurrent_change",
    prepaid_amortization_failed: "accounting.prepaid_error_amortization_failed",
    accounting_period_closed: "accounting.error_period_closed",
};
const errorMessage = (error, t) => resolveApiErrorMessage(error, t, PREPAID_ERROR_CODES, "accounting.failed");
const STATUS_COLORS = { active: "green", completed: "blue", cancelled: "default" };

// Diferidos / gastos pagados por anticipado - backend:
// Backend/services/prepaidExpense.service.js. Same layout as the fixed
// assets tab: a table with progress, "amortizar ahora", edit and cancel.
const PrepaidExpensesTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("accounting", "edit");
    const canAdmin = hasPermission("accounting", "admin");
    const [form] = Form.useForm();
    const [cancelForm] = Form.useForm();
    const [rows, setRows] = useState([]);
    const [assetAccounts, setAssetAccounts] = useState([]);
    const [expenseAccounts, setExpenseAccounts] = useState([]);
    const [costCenters, setCostCenters] = useState([]);
    const [cashAccounts, setCashAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(null);
    const [open, setOpen] = useState(false);
    const [runningId, setRunningId] = useState(null);
    const [cancelTarget, setCancelTarget] = useState(null);
    const [cancelling, setCancelling] = useState(false);
    const payHere = Form.useWatch("pay_here", form);
    const watchedAmount = Form.useWatch("total_amount", form);
    const watchedMonths = Form.useWatch("months", form);
    const monthlyPreview = Number(watchedAmount) > 0 && Number(watchedMonths) > 0 ? Number(watchedAmount) / Number(watchedMonths) : null;
    const scheduleLocked = Boolean(editing) && editing.months_amortized > 0;
    const amountLocked = Boolean(editing) && (editing.months_amortized > 0 || editing.funded_here);

    const load = async () => {
        setLoading(true);
        try {
            const [listResponse, chartResponse, costCenterResponse, cashResponse] = await Promise.all([
                accountingService.listPrepaidExpenses({ includeInactive: true }),
                accountingService.listChartOfAccounts(),
                accountingService.listCostCenters(),
                financeService.listCashAccounts(),
            ]);
            setRows(listResponse?.data || []);
            const chart = (chartResponse?.data || []).filter((a) => a.is_active);
            setAssetAccounts(chart.filter((a) => a.account_type === "asset"));
            setExpenseAccounts(chart.filter((a) => a.account_type === "expense" || a.account_type === "cost"));
            setCostCenters((costCenterResponse?.data || []).filter((c) => c.is_active));
            setCashAccounts((cashResponse?.data || []).filter((a) => a.is_active));
        } catch { toast.error(t("accounting.failed")); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const showEditor = (row = null) => {
        setEditing(row);
        form.setFieldsValue({
            name: row?.name || "",
            description: row?.description || "",
            total_amount: row?.total_amount ?? undefined,
            months: row?.months ?? 12,
            start_period: row ? dayjs(`${row.start_period}-01`) : dayjs().startOf("month"),
            asset_account_id: row?.asset_account?._id ?? assetAccounts.find((a) => a.code === "1705")?._id,
            expense_account_id: row?.expense_account?._id,
            cost_center_id: row?.cost_center?._id,
            pay_here: false,
            cash_account_id: undefined,
            payment_date: dayjs(),
        });
        setOpen(true);
    };
    const save = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            const payload = {
                name: values.name,
                description: values.description,
                total_amount: values.total_amount,
                months: values.months,
                start_period: values.start_period.format("YYYY-MM"),
                asset_account_id: values.asset_account_id,
                expense_account_id: values.expense_account_id,
                cost_center_id: values.cost_center_id || null,
                ...(!editing && values.pay_here ? { cash_account_id: values.cash_account_id, payment_date: values.payment_date.toISOString() } : {}),
            };
            if (editing) {
                if (scheduleLocked) { delete payload.months; delete payload.start_period; }
                if (amountLocked) delete payload.total_amount;
                await accountingService.updatePrepaidExpense(editing._id, payload);
            } else {
                await accountingService.createPrepaidExpense(payload);
            }
            toast.success(t(editing ? "accounting.prepaid_updated" : "accounting.prepaid_created"));
            setOpen(false);
            form.resetFields();
            await load();
        } catch (error) {
            if (!error?.errorFields) toast.error(errorMessage(error, t));
        } finally { setSaving(false); }
    };
    const runNow = async (row) => {
        setRunningId(row._id);
        try {
            await accountingService.runPrepaidAmortizationNow(row._id);
            toast.success(t("accounting.prepaid_run_success"));
            await load();
        } catch (error) {
            toast.error(errorMessage(error, t));
        } finally { setRunningId(null); }
    };
    const confirmCancel = async () => {
        const values = await cancelForm.validateFields();
        setCancelling(true);
        try {
            await accountingService.cancelPrepaidExpense(cancelTarget._id, values.reason.trim());
            toast.success(t("accounting.prepaid_cancelled"));
            setCancelTarget(null);
            cancelForm.resetFields();
            await load();
        } catch (error) {
            if (!error?.errorFields) toast.error(errorMessage(error, t));
        } finally { setCancelling(false); }
    };
    const formatPeriod = (period) => dayjs(`${period}-01`).format("MMM YYYY");

    return <>
        <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("accounting.prepaid_intro_title")} description={t("accounting.prepaid_intro_desc")} />
        <div className="flex justify-end mb-4">{canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => showEditor()}>{t("accounting.prepaid_new")}</Button>}</div>
        <Table
            className="module-dark-table"
            loading={loading}
            rowKey="_id"
            dataSource={rows}
            pagination={{ pageSize: 15 }}
            scroll={{ x: "max-content" }}
            locale={{ emptyText: <EmptyState compact title={t("accounting.prepaid_empty_title")} subtitle={t("accounting.prepaid_empty_help")} action={canEdit ? <Button type="primary" icon={<PlusOutlined />} onClick={() => showEditor()}>{t("accounting.prepaid_new")}</Button> : null} /> }}
            columns={[
                { title: t("accounting.col_description"), render: (_, row) => <div><strong>{row.name}</strong><small className="block text-[var(--ohnix-text-dim)]">{formatPeriod(row.start_period)} – {formatPeriod(row.end_period)}</small></div> },
                { title: t("accounting.prepaid_total"), dataIndex: "total_amount", align: "right", render: (v) => formatCurrency(v) },
                { title: t("accounting.prepaid_monthly"), dataIndex: "monthly_amount", align: "right", render: (v) => formatCurrency(v) },
                { title: t("accounting.prepaid_remaining"), dataIndex: "remaining_amount", align: "right", render: (v) => formatCurrency(v) },
                {
                    title: t("accounting.fixed_asset_progress"),
                    render: (_, row) => (
                        <div className="min-w-32">
                            <Progress percent={Math.round((row.months_amortized / row.months) * 100)} size="small" status={row.status === "cancelled" ? "exception" : undefined} />
                            <span className="text-xs text-[var(--ohnix-text-dim)]">{row.months_amortized}/{row.months} {t("accounting.fixed_asset_months")}</span>
                        </div>
                    ),
                },
                {
                    title: t("accounting.col_status"),
                    render: (_, row) => (
                        <div className="flex flex-col gap-1">
                            <Tag color={STATUS_COLORS[row.status]}>{t(`accounting.prepaid_status_${row.status}`)}</Tag>
                            {row.pending_months > 0 && <span className="text-xs text-[var(--ohnix-status-warning)]">{t("accounting.prepaid_pending", { count: row.pending_months, amount: formatCurrency(row.pending_amount) })}</span>}
                            {row.last_run_status === "failed" && (
                                <Tooltip title={t(PREPAID_ERROR_CODES[row.last_run_error] || "accounting.prepaid_error_amortization_failed")}>
                                    <Tag color="red" icon={<WarningOutlined />}>{t("accounting.fixed_asset_last_run_failed")}</Tag>
                                </Tooltip>
                            )}
                        </div>
                    ),
                },
                {
                    title: t("common.actions"),
                    width: 280,
                    render: (_, row) => row.status === "active" ? (
                        <div className="flex gap-2">
                            {canEdit && <Button size="small" disabled={row.pending_months === 0} loading={runningId === row._id} onClick={() => runNow(row)}>{t("accounting.prepaid_run_now")}</Button>}
                            {canEdit && <Button size="small" onClick={() => showEditor(row)}>{t("common.edit")}</Button>}
                            {canAdmin && <Button size="small" danger onClick={() => { cancelForm.resetFields(); setCancelTarget(row); }}>{t("accounting.prepaid_cancel_action")}</Button>}
                        </div>
                    ) : null,
                },
            ]}
        />
        <Modal className="accounting-modal" title={editing ? t("accounting.prepaid_edit") : t("accounting.prepaid_new")} open={open} onCancel={() => setOpen(false)} onOk={save} confirmLoading={saving} destroyOnHidden>
            {scheduleLocked && <Alert className="mb-4" type="warning" showIcon message={t("accounting.prepaid_schedule_locked_help")} />}
            <Form form={form} layout="vertical">
                <Form.Item name="name" label={t("accounting.col_description")} rules={[{ required: true, max: 160 }]}><Input placeholder={t("accounting.prepaid_name_placeholder")} /></Form.Item>
                <Form.Item name="description" label={t("accounting.note_content_label")}><Input.TextArea rows={2} maxLength={2000} /></Form.Item>
                <Row gutter={12}>
                    <Col xs={24} sm={12}><Form.Item name="total_amount" label={t("accounting.prepaid_total")} rules={[{ required: true, type: "number" }]}><InputNumber min={0.01} step={1000} className="w-full" disabled={amountLocked} /></Form.Item></Col>
                    <Col xs={12} sm={6}><Form.Item name="months" label={t("accounting.prepaid_months")} rules={[{ required: true, type: "number", min: 1, max: 120 }]}><InputNumber min={1} max={120} className="w-full" disabled={scheduleLocked} /></Form.Item></Col>
                    <Col xs={12} sm={6}><Form.Item name="start_period" label={t("accounting.prepaid_start")} rules={[{ required: true }]}><DatePicker picker="month" format="MM/YYYY" className="w-full" allowClear={false} disabled={scheduleLocked} /></Form.Item></Col>
                </Row>
                {monthlyPreview !== null && <Alert className="dark-alert dark-alert-purple mb-4" type="info" showIcon message={t("accounting.prepaid_monthly_preview", { amount: formatCurrency(monthlyPreview) })} />}
                <Form.Item name="asset_account_id" label={t("accounting.prepaid_asset_account")} extra={t("accounting.prepaid_asset_account_help")} rules={[{ required: true }]}>
                    <Select showSearch optionFilterProp="label" disabled={Boolean(editing?.funded_here)} options={assetAccounts.map((a) => ({ value: a._id, label: `${a.code} · ${a.name}` }))} />
                </Form.Item>
                <Form.Item name="expense_account_id" label={t("accounting.prepaid_expense_account")} rules={[{ required: true }]}>
                    <Select showSearch optionFilterProp="label" options={expenseAccounts.map((a) => ({ value: a._id, label: `${a.code} · ${a.name}` }))} />
                </Form.Item>
                <Form.Item name="cost_center_id" label={t("accounting.cost_center_optional")}>
                    <Select allowClear showSearch optionFilterProp="label" options={costCenters.map((c) => ({ value: c._id, label: `${c.code} · ${c.name}` }))} />
                </Form.Item>
                {!editing && (
                    <>
                        <Form.Item name="pay_here" valuePropName="checked" label={t("accounting.prepaid_pay_here")} extra={t(payHere ? "accounting.prepaid_pay_here_on_help" : "accounting.prepaid_pay_here_off_help")}>
                            <Switch />
                        </Form.Item>
                        {payHere && (
                            <Row gutter={12}>
                                <Col xs={24} sm={14}><Form.Item name="cash_account_id" label={t("accounting.prepaid_cash_account")} rules={[{ required: true, message: t("validation.required_field") }]}><Select options={cashAccounts.map((a) => ({ value: a._id, label: `${a.name} · ${formatCurrency(a.balance)}` }))} /></Form.Item></Col>
                                <Col xs={24} sm={10}><Form.Item name="payment_date" label={t("accounting.prepaid_payment_date")} rules={[{ required: true }]}><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item></Col>
                            </Row>
                        )}
                    </>
                )}
            </Form>
        </Modal>
        <Modal className="accounting-modal" title={cancelTarget ? t("accounting.prepaid_cancel_title", { name: cancelTarget.name }) : ""} open={Boolean(cancelTarget)} onCancel={() => setCancelTarget(null)} onOk={confirmCancel} confirmLoading={cancelling} okButtonProps={{ danger: true }} okText={t("accounting.prepaid_cancel_action")} destroyOnHidden>
            {cancelTarget && <Alert className="dark-alert dark-alert-amber mb-4" type="warning" showIcon message={t("accounting.prepaid_cancel_help", { amount: formatCurrency(cancelTarget.remaining_amount) })} />}
            <Form form={cancelForm} layout="vertical">
                <Form.Item name="reason" label={t("accounting.vat_void_reason")} rules={[{ required: true, whitespace: true, message: t("validation.required_field") }]}><Input.TextArea rows={3} maxLength={500} /></Form.Item>
            </Form>
        </Modal>
    </>;
};

export default PrepaidExpensesTab;
