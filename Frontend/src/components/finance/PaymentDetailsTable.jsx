import { useState } from "react";
import { Alert, Button, Checkbox, Descriptions, Form, InputNumber, Modal, Table } from "antd";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { financeService } from "../../services/financeService";

export default function PaymentDetailsTable({ payments = [], documentId, payable = false, pending = 0, canEdit = false, onApplied }) {
    const { t } = useI18n(); const { formatCurrency } = useCurrency();
    const [selected, setSelected] = useState(null); const [saving, setSaving] = useState(false); const [form] = Form.useForm();
    const [confirmed, setConfirmed] = useState(false);
    const [error, setError] = useState("");
    const amount = Number(Form.useWatch("amount", form) || 0);
    const maximum = Math.min(Number(selected?.available || 0), Number(pending || 0));
    const valid = Number.isFinite(amount) && amount > 0 && amount <= maximum;
    const close = () => { if (saving) return; setSelected(null); setConfirmed(false); setError(""); form.resetFields(); };
    const submit = async ({ amount }) => {
        if (saving || !canEdit || !confirmed || !selected) return;
        const value = Number(amount); const max = Math.min(Number(selected?.available || 0), Number(pending || 0));
        if (!Number.isFinite(value) || value <= 0 || value > max) { form.setFields([{ name: "amount", errors: [t("finance.payment_apply_invalid")] }]); return; }
        setSaving(true);
        try {
            if (payable) await financeService.allocatePurchasePayment(documentId, selected.id, value);
            else await financeService.allocateOrderPayment(documentId, selected.id, value);
            setSelected(null); form.resetFields(); setConfirmed(false); setError("");
            toast.success(t("finance.payment_allocated_success"));
            await onApplied?.();
        } catch { setError(t("finance.payment_allocation_failed")); }
        finally { setSaving(false); }
    };
    const columns = [{ title: t("finance.payment_reference"), dataIndex: "reference", render: (v) => v || "—" }, { title: t("finance.payment_amount"), dataIndex: "amount", render: formatCurrency }, { title: t("finance.payment_allocated"), dataIndex: "allocated", render: formatCurrency }, { title: t("finance.payment_available"), dataIndex: "available", render: formatCurrency }, { title: t("common.actions"), render: (_, row) => row.available > 0.005 && pending > 0.005 ? <Button type="link" onClick={() => { setSelected(row); form.setFieldsValue({ amount: Math.min(row.available, pending) }); }}>{t("finance.payment_apply")}</Button> : null }];
    return <><Table size="small" pagination={false} rowKey="id" dataSource={payments} columns={columns} locale={{ emptyText: t("finance.payment_no_details") }} />
        <Modal className="accounting-modal" open={Boolean(selected)} title={t("finance.payment_apply_title")} onCancel={close} onOk={() => form.submit()} confirmLoading={saving} okButtonProps={{ disabled: !canEdit || !valid || !confirmed }} cancelButtonProps={{ disabled: saving }} closable={!saving} maskClosable={!saving} okText={t("common.save")}>
            <Alert type="info" className="dark-alert dark-alert-teal mb-4" message={t("finance.payment_effect")} />
            {error && <Alert type="error" className="mb-4" showIcon message={error} />}
            <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("finance.payment_apply_help", { available: formatCurrency(Math.min(selected?.available || 0, pending || 0)) })} />
            <Form form={form} layout="vertical" onValuesChange={() => setConfirmed(false)} onFinish={submit}><Form.Item name="amount" label={t("finance.payment_apply_amount")} rules={[{ required: true, message: t("validation.required_field") }, { validator: (_, value) => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= maximum ? Promise.resolve() : Promise.reject(new Error(t("finance.payment_apply_invalid"))) }]}><InputNumber min={0.01} max={maximum} disabled={saving} precision={2} className="w-full" /></Form.Item></Form>
            <Descriptions column={1} items={[
                { key: "applied", label: t("finance.payment_allocated"), children: formatCurrency(Number(selected?.allocated || 0) + (valid ? amount : 0)) },
                { key: "available", label: t("finance.payment_available"), children: formatCurrency(Number(selected?.available || 0) - (valid ? amount : 0)) },
                { key: "pending", label: t("finance.payables_pending"), children: formatCurrency(pending) },
            ]} />
            <Checkbox className="mt-4" disabled={saving || !valid} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}>{t("finance.payment_confirmation")}</Checkbox>
        </Modal>
    </>;
}
