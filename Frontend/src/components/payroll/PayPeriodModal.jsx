import React, { useEffect } from "react";
import { Modal, Form, Select, DatePicker, Button } from "antd";
import { BankOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";

// Settles a period's net pay + that period's own aportes against one cash
// account in a single entry - see accountingPosting.service.js#
// postPayrollPaymentJournalEntry for why the four prestaciones sociales
// provisions are deliberately NOT part of this payment.
const PayPeriodModal = ({ visible, period, cashAccounts, loading, onSubmit, onCancel }) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [form] = Form.useForm();

    useEffect(() => {
        if (visible) {
            form.resetFields();
        }
    }, [visible, form]);

    const handleOk = async () => {
        const values = await form.validateFields();
        await onSubmit({ cashAccountId: values.cash_account_id, paymentDate: values.payment_date?.toISOString() });
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <BankOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-bold text-[var(--ohnix-text-primary)]">{t("payroll.pay_period")}</span>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={460}
            centered
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    borderRadius: "20px",
                },
                body: { padding: "20px 24px 24px" },
            }}
        >
            {period && (
                <div className="mb-4 p-3 rounded-xl bg-[var(--ohnix-line-1)] border border-[var(--ohnix-line-4)] flex items-center justify-between">
                    <span className="text-sm text-[var(--ohnix-text-muted)]">{t("payroll.total_net_pay")}</span>
                    <span className="text-lg font-bold text-[#44F3F0]">{formatCurrency(period.total_net_pay)}</span>
                </div>
            )}
            <Form form={form} layout="vertical">
                <Form.Item name="cash_account_id" label={t("payroll.cash_account")} rules={[{ required: true, message: t("payroll.cash_account_required") }]}>
                    <Select size="large" options={(cashAccounts || []).map((a) => ({ value: a._id, label: a.name }))} />
                </Form.Item>
                <Form.Item name="payment_date" label={t("payroll.payment_date_optional")} className="mb-0">
                    <DatePicker size="large" className="w-full" format="YYYY-MM-DD" />
                </Form.Item>
            </Form>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-5 mt-5 border-t border-[var(--ohnix-line-4)]">
                <Button onClick={onCancel} disabled={loading} className="h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)]">
                    {t("common.cancel")}
                </Button>
                <Button
                    type="primary"
                    onClick={handleOk}
                    loading={loading}
                    className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium"
                >
                    {t("payroll.confirm_payment")}
                </Button>
            </div>
        </Modal>
    );
};

export default PayPeriodModal;
