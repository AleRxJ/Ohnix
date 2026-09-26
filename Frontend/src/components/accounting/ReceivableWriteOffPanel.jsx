import { useEffect, useState } from "react";
import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select, Table, Tag } from "antd";
import { StopOutlined, UndoOutlined } from "@ant-design/icons";
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
    write_off_reason_required: "accounting.write_off_error_reason_required",
    write_off_date_invalid: "accounting.write_off_error_date_invalid",
    write_off_order_not_found: "accounting.write_off_error_order_not_found",
    write_off_amount_invalid: "accounting.write_off_error_amount_invalid",
    write_off_exceeds_pending: "accounting.write_off_error_exceeds_pending",
    write_off_concurrent_change: "accounting.write_off_error_concurrent_change",
    write_off_not_found: "accounting.write_off_error_not_found",
    write_off_already_reversed: "accounting.write_off_error_already_reversed",
    accounting_period_closed: "accounting.error_period_closed",
};
const errorMessage = (error, t) => resolveApiErrorMessage(error, t, ERROR_CODES, "accounting.failed");

// Castigo de cartera - backend: Backend/services/receivableWriteOff.service.js.
// Debits the allowance deterioro de cartera (ReceivableImpairmentTab, same
// tab) already built up, and whatever it doesn't cover as a direct expense -
// this is why the two live in the same tab, one section each.
const ReceivableWriteOffPanel = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canAdmin = hasPermission("accounting", "admin");
    const [form] = Form.useForm();
    const [receivables, setReceivables] = useState([]);
    const [writeOffs, setWriteOffs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [posting, setPosting] = useState(false);
    const [reverseTarget, setReverseTarget] = useState(null);
    const [reverseReason, setReverseReason] = useState("");
    const [reversing, setReversing] = useState(false);
    const selectedOrderId = Form.useWatch("order_id", form);
    const selectedOrder = receivables.find((row) => row.id === selectedOrderId);

    const load = async () => {
        setLoading(true);
        try {
            const [planResponse, writeOffResponse] = await Promise.all([
                financeService.getAccountsReceivablePlan(),
                accountingService.listWriteOffs(),
            ]);
            setReceivables((planResponse?.data?.documents || []).filter((row) => row.pending > 0.005));
            setWriteOffs(writeOffResponse?.data || []);
        } catch (error) {
            toast.error(errorMessage(error, t));
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = async (values) => {
        setPosting(true);
        try {
            await accountingService.writeOffReceivable({
                order_id: values.order_id,
                amount: values.amount,
                reason: values.reason.trim(),
                write_off_date: values.write_off_date.toISOString(),
            });
            toast.success(t("accounting.write_off_success"));
            form.resetFields();
            await load();
        } catch (error) {
            toast.error(errorMessage(error, t));
        } finally {
            setPosting(false);
        }
    };

    const confirmReverse = async () => {
        if (!reverseReason.trim()) return;
        setReversing(true);
        try {
            await accountingService.reverseWriteOff(reverseTarget._id, reverseReason.trim());
            toast.success(t("accounting.write_off_reversed"));
            setReverseTarget(null);
            setReverseReason("");
            await load();
        } catch (error) {
            toast.error(errorMessage(error, t));
        } finally {
            setReversing(false);
        }
    };

    return <>
        <h4 className="text-sm font-semibold text-[var(--ohnix-text-primary)] mb-2 mt-6">{t("accounting.write_off_title")}</h4>
        <Alert className="dark-alert dark-alert-amber mb-4" type="warning" showIcon message={t("accounting.write_off_intro_title")} description={t("accounting.write_off_intro_desc")} />
        {canAdmin && (
            <Form form={form} layout="vertical" onFinish={submit} className="mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Form.Item name="order_id" label={t("accounting.write_off_invoice")} rules={[{ required: true, message: t("validation.required_field") }]} className="mb-0 lg:col-span-2">
                        <Select
                            showSearch
                            optionFilterProp="label"
                            placeholder={t("accounting.write_off_invoice_placeholder")}
                            options={receivables.map((row) => ({ value: row.id, label: `${row.number} · ${row.customer?.name || t("common.na")} · ${formatCurrency(row.pending)}` }))}
                            onChange={(value) => { const row = receivables.find((r) => r.id === value); form.setFieldsValue({ amount: row?.pending }); }}
                        />
                    </Form.Item>
                    <Form.Item name="amount" label={t("accounting.write_off_amount")} extra={selectedOrder ? t("accounting.write_off_amount_hint", { pending: formatCurrency(selectedOrder.pending) }) : undefined} rules={[{ required: true, message: t("validation.required_field") }]} className="mb-0">
                        <InputNumber className="w-full" min={0.01} max={selectedOrder?.pending} precision={2} />
                    </Form.Item>
                    <Form.Item name="write_off_date" label={t("accounting.write_off_date")} rules={[{ required: true, message: t("validation.required_field") }]} initialValue={dayjs()} className="mb-0">
                        <DatePicker className="w-full" format="DD/MM/YYYY" disabledDate={(d) => d.isAfter(dayjs(), "day")} />
                    </Form.Item>
                </div>
                <Form.Item name="reason" label={t("accounting.write_off_reason")} rules={[{ required: true, whitespace: true, message: t("validation.required_field") }]} className="mt-3 mb-3">
                    <Input.TextArea rows={2} maxLength={300} showCount placeholder={t("accounting.write_off_reason_placeholder")} />
                </Form.Item>
                <Popconfirm title={t("accounting.write_off_confirm_title")} description={t("accounting.write_off_confirm_desc")} okText={t("accounting.write_off_cta")} cancelText={t("common.cancel")} onConfirm={() => form.submit()}>
                    <Button type="primary" danger icon={<StopOutlined />} loading={posting}>{t("accounting.write_off_cta")}</Button>
                </Popconfirm>
            </Form>
        )}

        <Table
            className="module-dark-table"
            size="small"
            rowKey="_id"
            loading={loading}
            dataSource={writeOffs}
            pagination={{ pageSize: 8 }}
            scroll={{ x: "max-content" }}
            locale={{ emptyText: <EmptyState compact title={t("accounting.write_off_empty")} /> }}
            columns={[
                { title: t("accounting.write_off_invoice"), render: (_, row) => <div><strong>{row.order?.invoice_no}</strong><small className="block text-[var(--ohnix-text-dim)]">{row.order?.customer?.name || t("common.na")}</small></div> },
                { title: t("accounting.write_off_date"), dataIndex: "write_off_date", render: (v) => dayjs(v).format("DD/MM/YYYY") },
                { title: t("accounting.write_off_amount"), dataIndex: "amount", align: "right", render: (v) => formatCurrency(v) },
                { title: t("accounting.write_off_col_allowance_used"), dataIndex: "allowance_used", align: "right", render: (v) => formatCurrency(v) },
                { title: t("accounting.write_off_col_expense"), dataIndex: "expense_amount", align: "right", render: (v) => formatCurrency(v) },
                { title: t("accounting.write_off_reason"), dataIndex: "reason", ellipsis: true },
                { title: t("common.status"), render: (_, row) => row.reversed_at ? <Tag color="default">{t("accounting.write_off_status_reversed")}</Tag> : <Tag color="error">{t("accounting.write_off_status_active")}</Tag> },
                ...(canAdmin ? [{ title: "", fixed: "right", width: 110, render: (_, row) => !row.reversed_at && <Button size="small" icon={<UndoOutlined />} onClick={() => setReverseTarget(row)}>{t("accounting.write_off_reverse_cta")}</Button> }] : []),
            ]}
        />

        <Modal title={t("accounting.write_off_reverse_title")} open={Boolean(reverseTarget)} onCancel={() => { setReverseTarget(null); setReverseReason(""); }} onOk={confirmReverse} confirmLoading={reversing} okButtonProps={{ disabled: !reverseReason.trim() }} okText={t("accounting.write_off_reverse_confirm")}>
            <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("accounting.write_off_reverse_help")} />
            <Input.TextArea rows={3} maxLength={300} showCount value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} placeholder={t("accounting.write_off_reverse_reason_placeholder")} />
        </Modal>
    </>;
};

export default ReceivableWriteOffPanel;
