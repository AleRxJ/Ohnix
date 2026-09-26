import { useEffect, useState } from "react";
import { Alert, Button, Col, DatePicker, Drawer, Form, Input, InputNumber, Modal, Progress, Radio, Row, Select, Switch, Table, Tag } from "antd";
import { DollarOutlined, EyeOutlined, PlusOutlined, RiseOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import EmptyState from "../common/EmptyState";
import { accountingService } from "../../services/accountingService";
import { financeService } from "../../services/financeService";
import { useCurrency } from "../../context/CurrencyContext";
import { useTeam } from "../../context/TeamContext";
import useI18n from "../../hooks/useI18n";
import { resolveApiErrorMessage } from "../../utils/apiError";

const ERROR_CODES = {
    loan_insufficient_balance: "accounting.loan_error_insufficient_balance",
    loan_concurrent_change: "accounting.loan_error_concurrent_change",
    loan_first_payment_date_invalid: "accounting.loan_error_first_payment",
    loan_extra_exceeds_outstanding: "accounting.loan_error_extra_exceeds",
    accounting_period_closed: "accounting.error_period_closed",
};
const errorMessage = (error, t) => resolveApiErrorMessage(error, t, ERROR_CODES, "accounting.failed");
const STATUS_COLORS = { active: "green", paid: "blue", cancelled: "default" };

// Obligaciones financieras - backend: Backend/services/financialObligation.service.js.
const FinancialObligationsTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("accounting", "edit");
    const [form] = Form.useForm();
    const [payForm] = Form.useForm();
    const [rows, setRows] = useState([]);
    const [liabilityAccounts, setLiabilityAccounts] = useState([]);
    const [expenseAccounts, setExpenseAccounts] = useState([]);
    const [cashAccounts, setCashAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [schedulePreview, setSchedulePreview] = useState(null);
    const [detail, setDetail] = useState(null);
    const [payTarget, setPayTarget] = useState(null);
    const [paying, setPaying] = useState(false);
    const [extraForm] = Form.useForm();
    const [extraTarget, setExtraTarget] = useState(null);
    const [extraSaving, setExtraSaving] = useState(false);
    const disburseHere = Form.useWatch("disburse_here", form);

    const load = async () => {
        setLoading(true);
        try {
            const [listResponse, chartResponse, cashResponse] = await Promise.all([
                accountingService.listFinancialObligations(),
                accountingService.listChartOfAccounts(),
                financeService.listCashAccounts(),
            ]);
            setRows(listResponse?.data || []);
            const chart = (chartResponse?.data || []).filter((a) => a.is_active);
            setLiabilityAccounts(chart.filter((a) => a.account_type === "liability"));
            setExpenseAccounts(chart.filter((a) => a.account_type === "expense" || a.account_type === "cost"));
            setCashAccounts((cashResponse?.data || []).filter((a) => a.is_active));
        } catch { toast.error(t("accounting.failed")); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const showEditor = () => {
        form.setFieldsValue({
            lender_name: "", reference: "", principal: undefined, annual_rate: undefined, term_months: 12,
            disbursement_date: dayjs(), first_payment_date: dayjs().add(1, "month"),
            liability_account_id: liabilityAccounts.find((a) => a.code === "2105")?._id,
            interest_account_id: expenseAccounts.find((a) => a.code === "530525")?._id,
            disburse_here: false, cash_account_id: undefined,
        });
        setSchedulePreview(null);
        setOpen(true);
    };
    const termsPayload = (values) => ({
        principal: values.principal,
        annual_rate: values.annual_rate,
        term_months: values.term_months,
        disbursement_date: values.disbursement_date.toISOString(),
        first_payment_date: values.first_payment_date.toISOString(),
    });
    const previewSchedule = async () => {
        const values = await form.validateFields(["principal", "annual_rate", "term_months", "disbursement_date", "first_payment_date"]);
        try { setSchedulePreview((await accountingService.previewObligationSchedule(termsPayload(values)))?.data || null); }
        catch (error) { toast.error(errorMessage(error, t)); }
    };
    const save = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            await accountingService.createFinancialObligation({
                lender_name: values.lender_name,
                reference: values.reference,
                ...termsPayload(values),
                liability_account_id: values.liability_account_id,
                interest_account_id: values.interest_account_id,
                ...(values.disburse_here ? { cash_account_id: values.cash_account_id } : {}),
            });
            toast.success(t("accounting.loan_created"));
            setOpen(false);
            await load();
        } catch (error) {
            if (!error?.errorFields) toast.error(errorMessage(error, t));
        } finally { setSaving(false); }
    };
    const openPay = (row) => {
        setPayTarget(row);
        payForm.setFieldsValue({ cash_account_id: undefined, payment_date: dayjs(), interest: row.next_installment?.interest });
    };
    const confirmPay = async () => {
        const values = await payForm.validateFields();
        setPaying(true);
        try {
            const response = await accountingService.payObligationInstallment(payTarget._id, { cash_account_id: values.cash_account_id, payment_date: values.payment_date.toISOString(), interest: values.interest });
            toast.success(t("accounting.loan_paid"));
            setPayTarget(null);
            if (detail?._id === payTarget._id) setDetail(response?.data || null);
            await load();
        } catch (error) {
            if (!error?.errorFields) toast.error(errorMessage(error, t));
        } finally { setPaying(false); }
    };

    const openExtra = (row) => {
        setExtraTarget(row);
        extraForm.setFieldsValue({ amount: undefined, cash_account_id: undefined, payment_date: dayjs(), strategy: "reduce_installment" });
    };
    const confirmExtra = async () => {
        const values = await extraForm.validateFields();
        setExtraSaving(true);
        try {
            const response = await accountingService.payObligationExtra(extraTarget._id, { amount: values.amount, cash_account_id: values.cash_account_id, payment_date: values.payment_date.toISOString(), strategy: values.strategy });
            toast.success(t("accounting.loan_extra_success"));
            setExtraTarget(null);
            if (detail?._id === extraTarget._id) setDetail(response?.data || null);
            await load();
        } catch (error) {
            if (!error?.errorFields) toast.error(errorMessage(error, t));
        } finally { setExtraSaving(false); }
    };

    const scheduleColumns = [
        { title: "#", dataIndex: "number", width: 50 },
        { title: t("accounting.loan_col_due"), dataIndex: "due_date", render: (v) => dayjs(v).format("DD/MM/YYYY") },
        { title: t("accounting.loan_col_installment"), dataIndex: "installment", align: "right", render: (v) => formatCurrency(v) },
        { title: t("accounting.loan_col_principal"), dataIndex: "principal", align: "right", render: (v) => formatCurrency(v) },
        { title: t("accounting.loan_col_interest"), dataIndex: "interest", align: "right", render: (v, row) => formatCurrency(row.paid_interest ?? v) },
        { title: t("accounting.loan_col_balance"), dataIndex: "balance_after", align: "right", render: (v) => formatCurrency(v) },
    ];

    return <>
        <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("accounting.loan_intro_title")} description={t("accounting.loan_intro_desc")} />
        <div className="flex justify-end mb-4">{canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={showEditor}>{t("accounting.loan_new")}</Button>}</div>
        <Table
            className="module-dark-table"
            loading={loading}
            rowKey="_id"
            dataSource={rows}
            pagination={{ pageSize: 10 }}
            scroll={{ x: "max-content" }}
            locale={{ emptyText: <EmptyState compact title={t("accounting.loan_empty_title")} subtitle={t("accounting.loan_empty_help")} /> }}
            columns={[
                { title: t("accounting.loan_lender"), render: (_, row) => <div><strong>{row.lender_name}</strong><small className="block text-[var(--ohnix-text-dim)]">{row.reference || t("accounting.loan_rate_label", { rate: row.annual_rate })}</small></div> },
                { title: t("accounting.loan_principal"), dataIndex: "principal", align: "right", render: (v) => formatCurrency(v) },
                { title: t("accounting.loan_col_installment"), dataIndex: "installment", align: "right", render: (v) => formatCurrency(v) },
                { title: t("accounting.loan_outstanding"), dataIndex: "outstanding_principal", align: "right", render: (v) => formatCurrency(v) },
                { title: t("accounting.fixed_asset_progress"), render: (_, row) => <div className="min-w-32"><Progress percent={Math.round((row.installments_paid / row.term_months) * 100)} size="small" /><span className="text-xs text-[var(--ohnix-text-dim)]">{row.installments_paid}/{row.term_months}</span></div> },
                { title: t("accounting.col_status"), render: (_, row) => <div className="flex flex-col gap-1"><Tag color={STATUS_COLORS[row.status]}>{t(`accounting.loan_status_${row.status}`)}</Tag>{row.next_installment && <span className="text-xs text-[var(--ohnix-text-dim)]">{t("accounting.loan_next", { date: dayjs(row.next_installment.due_date).format("DD/MM/YYYY"), amount: formatCurrency(row.next_installment.installment) })}</span>}</div> },
                {
                    title: t("common.actions"),
                    render: (_, row) => (
                        <div className="flex gap-2">
                            <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(row)}>{t("accounting.loan_schedule")}</Button>
                            {canEdit && row.status === "active" && <Button size="small" type="primary" ghost icon={<DollarOutlined />} onClick={() => openPay(row)}>{t("accounting.loan_pay_cta")}</Button>}
                            {canEdit && row.status === "active" && <Button size="small" icon={<RiseOutlined />} onClick={() => openExtra(row)}>{t("accounting.loan_extra_cta")}</Button>}
                        </div>
                    ),
                },
            ]}
        />

        <Modal className="accounting-modal" title={t("accounting.loan_new")} open={open} onCancel={() => setOpen(false)} onOk={save} confirmLoading={saving} width={720} destroyOnHidden>
            <Form form={form} layout="vertical">
                <Row gutter={12}>
                    <Col xs={24} sm={14}><Form.Item name="lender_name" label={t("accounting.loan_lender")} rules={[{ required: true, whitespace: true }]}><Input maxLength={160} /></Form.Item></Col>
                    <Col xs={24} sm={10}><Form.Item name="reference" label={t("accounting.loan_reference")}><Input maxLength={80} /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col xs={24} sm={10}><Form.Item name="principal" label={t("accounting.loan_principal")} rules={[{ required: true, type: "number" }]}><InputNumber min={1} step={100000} className="w-full" onChange={() => setSchedulePreview(null)} /></Form.Item></Col>
                    <Col xs={12} sm={7}><Form.Item name="annual_rate" label={t("accounting.loan_annual_rate")} extra={t("accounting.loan_annual_rate_help")} rules={[{ required: true, type: "number", min: 0, max: 200 }]}><InputNumber min={0} max={200} step={0.1} addonAfter="%" className="w-full" onChange={() => setSchedulePreview(null)} /></Form.Item></Col>
                    <Col xs={12} sm={7}><Form.Item name="term_months" label={t("accounting.loan_term")} rules={[{ required: true, type: "number", min: 1, max: 360 }]}><InputNumber min={1} max={360} className="w-full" onChange={() => setSchedulePreview(null)} /></Form.Item></Col>
                </Row>
                <Row gutter={12}>
                    <Col xs={12}><Form.Item name="disbursement_date" label={t("accounting.loan_disbursement_date")} rules={[{ required: true }]}><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item></Col>
                    <Col xs={12}><Form.Item name="first_payment_date" label={t("accounting.loan_first_payment")} rules={[{ required: true }]}><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item></Col>
                </Row>
                <Button className="mb-4" onClick={previewSchedule}>{t("accounting.loan_preview_schedule")}</Button>
                {schedulePreview && (
                    <>
                        <Alert className="dark-alert dark-alert-purple mb-3" type="info" showIcon message={t("accounting.loan_preview_summary", { installment: formatCurrency(schedulePreview.installment), rate: schedulePreview.monthly_rate_percent })} />
                        <Table className="module-dark-table mb-4" size="small" rowKey="number" dataSource={schedulePreview.rows} pagination={{ pageSize: 6 }} columns={scheduleColumns} />
                    </>
                )}
                <Row gutter={12}>
                    <Col xs={24} sm={12}><Form.Item name="liability_account_id" label={t("accounting.loan_liability_account")} rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={liabilityAccounts.map((a) => ({ value: a._id, label: `${a.code} · ${a.name}` }))} /></Form.Item></Col>
                    <Col xs={24} sm={12}><Form.Item name="interest_account_id" label={t("accounting.loan_interest_account")} rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={expenseAccounts.map((a) => ({ value: a._id, label: `${a.code} · ${a.name}` }))} /></Form.Item></Col>
                </Row>
                <Form.Item name="disburse_here" valuePropName="checked" label={t("accounting.loan_disburse_here")} extra={t(disburseHere ? "accounting.loan_disburse_here_on" : "accounting.loan_disburse_here_off")}><Switch /></Form.Item>
                {disburseHere && <Form.Item name="cash_account_id" label={t("accounting.loan_disbursement_account")} rules={[{ required: true, message: t("validation.required_field") }]}><Select options={cashAccounts.map((a) => ({ value: a._id, label: a.name }))} /></Form.Item>}
            </Form>
        </Modal>

        <Modal className="accounting-modal" title={payTarget ? t("accounting.loan_pay_title", { number: payTarget.installments_paid + 1, total: payTarget.term_months, lender: payTarget.lender_name }) : ""} open={Boolean(payTarget)} onCancel={() => setPayTarget(null)} onOk={confirmPay} confirmLoading={paying} okText={t("accounting.loan_pay_cta")} destroyOnHidden>
            {payTarget?.next_installment && <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("accounting.loan_pay_help", { principal: formatCurrency(payTarget.next_installment.principal), interest: formatCurrency(payTarget.next_installment.interest) })} />}
            <Form form={payForm} layout="vertical">
                <Form.Item name="cash_account_id" label={t("accounting.vat_pay_cash_account")} rules={[{ required: true, message: t("validation.required_field") }]}><Select options={cashAccounts.map((a) => ({ value: a._id, label: `${a.name} · ${formatCurrency(a.balance)}` }))} /></Form.Item>
                <Row gutter={12}>
                    <Col xs={12}><Form.Item name="payment_date" label={t("accounting.vat_pay_date")} rules={[{ required: true }]}><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item></Col>
                    <Col xs={12}><Form.Item name="interest" label={t("accounting.loan_col_interest")} extra={t("accounting.loan_interest_override_help")} rules={[{ required: true, type: "number", min: 0 }]}><InputNumber min={0} className="w-full" /></Form.Item></Col>
                </Row>
            </Form>
        </Modal>

        <Modal className="accounting-modal" title={extraTarget ? t("accounting.loan_extra_title", { lender: extraTarget.lender_name }) : ""} open={Boolean(extraTarget)} onCancel={() => setExtraTarget(null)} onOk={confirmExtra} confirmLoading={extraSaving} okText={t("accounting.loan_extra_cta")} destroyOnHidden>
            {extraTarget && <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("accounting.loan_extra_help", { outstanding: formatCurrency(extraTarget.outstanding_principal) })} />}
            <Form form={extraForm} layout="vertical">
                <Form.Item name="amount" label={t("accounting.loan_extra_amount")} rules={[{ required: true, type: "number", min: 0.01, max: extraTarget?.outstanding_principal }]}><InputNumber min={0.01} max={extraTarget?.outstanding_principal} className="w-full" /></Form.Item>
                <Form.Item name="strategy" label={t("accounting.loan_extra_strategy")} rules={[{ required: true }]}>
                    <Radio.Group options={[{ value: "reduce_installment", label: t("accounting.loan_extra_reduce_installment") }, { value: "reduce_term", label: t("accounting.loan_extra_reduce_term") }]} />
                </Form.Item>
                <Row gutter={12}>
                    <Col xs={24} sm={14}><Form.Item name="cash_account_id" label={t("accounting.vat_pay_cash_account")} rules={[{ required: true, message: t("validation.required_field") }]}><Select options={cashAccounts.map((a) => ({ value: a._id, label: `${a.name} · ${formatCurrency(a.balance)}` }))} /></Form.Item></Col>
                    <Col xs={24} sm={10}><Form.Item name="payment_date" label={t("accounting.vat_pay_date")} rules={[{ required: true }]}><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item></Col>
                </Row>
            </Form>
        </Modal>

        <Drawer title={detail ? `${detail.lender_name} · ${formatCurrency(detail.principal)}` : ""} open={Boolean(detail)} onClose={() => setDetail(null)} width={760}>
            {detail?.extra_payments?.length > 0 && <div className="flex flex-wrap gap-2 mb-3">{detail.extra_payments.map((p) => <Tag key={p._id} color="blue">{t("accounting.loan_extra_tag", { amount: formatCurrency(p.amount), date: dayjs(p.paid_at).format("DD/MM/YYYY") })}</Tag>)}</div>}
            {detail && <Table className="module-dark-table" size="small" rowKey="number" dataSource={detail.schedule} pagination={false} scroll={{ x: "max-content" }} columns={[...scheduleColumns, { title: t("accounting.col_status"), render: (_, row) => row.paid ? <Tag color="success">{t("accounting.loan_installment_paid", { date: dayjs(row.paid_at).format("DD/MM/YYYY") })}</Tag> : row.accrued ? <Tag color="warning">{t("accounting.loan_installment_accrued")}</Tag> : <Tag>{t("accounting.loan_installment_pending")}</Tag> }]} />}
        </Drawer>
    </>;
};

export default FinancialObligationsTab;
