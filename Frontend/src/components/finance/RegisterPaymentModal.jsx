import { Modal, Form, InputNumber, Select, Input } from "antd";
import { WalletOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { getCurrencyInputProps } from "../../utils/currency";

const { Option } = Select;

// Shared by Orders (OrderDetailsDrawer) and Purchases (PurchaseDetails) -
// same "parent owns the Form instance, Modal is purely presentational"
// pattern as CreateOrderModal.jsx. `pendingBalance` drives both the helper
// text and the max-amount validation; the caller decides what "pending"
// means for its own document (order.total - paid, or purchase total - paid).
const RegisterPaymentModal = ({ visible, onCancel, onSubmit, submitting, form, pendingBalance, cashAccounts }) => {
    const { t } = useI18n();
    const { formatCurrency, currency } = useCurrency();
    const currencyInputProps = getCurrencyInputProps(currency.code);

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <WalletOutlined className="text-[var(--ohnix-accent-2)]" />
                    </div>
                    <span className="text-lg font-bold text-[var(--ohnix-text-primary)]">
                        {t("finance.register_payment_modal_title")}
                    </span>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            onOk={() => form.submit()}
            confirmLoading={submitting}
            okText={t("finance.register_payment")}
            cancelText={t("common.cancel")}
            destroyOnClose
        >
            <p className="text-sm text-[var(--ohnix-text-muted)] mb-4">
                {t("finance.pending_balance_label")}: <span className="font-semibold text-[var(--ohnix-text-primary)]">{formatCurrency(pendingBalance)}</span>
            </p>

            <Form form={form} layout="vertical" onFinish={onSubmit}>
                <Form.Item
                    name="amount"
                    label={t("finance.amount_label")}
                    rules={[
                        { required: true, message: t("validation.required_field") },
                        {
                            validator: (_, value) =>
                                value > 0 && value <= pendingBalance
                                    ? Promise.resolve()
                                    : Promise.reject(new Error(t("finance.amount_exceeds_pending"))),
                        },
                    ]}
                >
                    <InputNumber
                        className="w-full"
                        min={0.01}
                        max={pendingBalance}
                        prefix={currency.symbol}
                        formatter={currencyInputProps.formatter}
                        parser={currencyInputProps.parser}
                        size="large"
                    />
                </Form.Item>

                <Form.Item
                    name="cash_account_id"
                    label={t("finance.cash_account_label")}
                    rules={[{ required: true, message: t("validation.required_field") }]}
                    extra={cashAccounts.length === 0 ? t("finance.no_cash_accounts_hint") : undefined}
                >
                    <Select size="large" placeholder={t("finance.cash_account_placeholder")}>
                        {cashAccounts.map((acc) => (
                            <Option key={acc._id} value={acc._id}>
                                {acc.name}
                            </Option>
                        ))}
                    </Select>
                </Form.Item>

                <Form.Item name="method" label={t("finance.method_label")}>
                    <Input size="large" placeholder={t("finance.method_placeholder")} maxLength={40} />
                </Form.Item>

                <Form.Item name="reference" label={t("finance.reference_label")}>
                    <Input size="large" placeholder={t("finance.reference_placeholder")} maxLength={80} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default RegisterPaymentModal;
