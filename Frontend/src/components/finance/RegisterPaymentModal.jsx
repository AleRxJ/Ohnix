import { Modal, Form, InputNumber, Select, Input, Checkbox, Alert, Collapse, Button } from "antd";
import { WalletOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { getCurrencyInputProps } from "../../utils/currency";

const { Option } = Select;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Shared by Orders (OrderDetailsDrawer) and Purchases (PurchaseDetails) -
// same "parent owns the Form instance, Modal is purely presentational"
// pattern as CreateOrderModal.jsx. `pendingBalance` drives both the helper
// text and the max-amount validation; the caller decides what "pending"
// means for its own document (order.total - paid, or purchase total - paid).
// `isForeignCurrency` (Fase 4/multi-moneda) unlocks the "liquidar completo"
// checkbox - only a foreign-currency document can carry a diferencia en
// cambio (see Backend/services/orderPayment.service.js#registerOrderPayment);
// for a COP document this prop is simply false and nothing here changes
// from before that phase.
// `paymentMethods` (Fase 5/causación automática) is the optional list of
// configured PaymentMethod records - selecting one previews the fee that
// accountingPosting.service.js will automatically cause into 530520.
// `feeDirection`: "subtract" (order - the gateway keeps its cut before
// depositing) or "add" (purchase - the fee is an extra cost on top of what
// the supplier receives), mirrors the cashDelta sign in
// orderPayment.service.js/purchasePayment.service.js.
// `showWithholdings` (orders only): retenciones the CUSTOMER practiced on
// this payment - part of `amount` (the receivable clears in full) but they
// never reach the cash account. `withholdingSuggestion` is what the
// customer's configured rates say is still due on this sale
// (GET /finance/orders/:id/withholding-suggestion), offered as a one-click
// pre-fill, never applied silently.
const WITHHOLDING_FIELDS = [
    ["withheld_income_tax", "finance.withheld_income_tax_label"],
    ["withheld_vat", "finance.withheld_vat_label"],
    ["withheld_ica", "finance.withheld_ica_label"],
];
const RegisterPaymentModal = ({ visible, onCancel, onSubmit, submitting, form, pendingBalance, cashAccounts, isForeignCurrency = false, paymentMethods = [], feeDirection = "subtract", showWithholdings = false, withholdingSuggestion = null }) => {
    const { t } = useI18n();
    const { formatCurrency, currency } = useCurrency();
    const currencyInputProps = getCurrencyInputProps(currency.code);
    const settleInFull = Form.useWatch("settle_in_full", form);
    const amount = Form.useWatch("amount", form);
    const paymentMethodId = Form.useWatch("payment_method_id", form);
    const withheldIncomeTax = Form.useWatch("withheld_income_tax", form);
    const withheldVat = Form.useWatch("withheld_vat", form);
    const withheldIca = Form.useWatch("withheld_ica", form);
    const withheldTotal = showWithholdings ? round2(Number(withheldIncomeTax || 0) + Number(withheldVat || 0) + Number(withheldIca || 0)) : 0;
    const selectedMethod = paymentMethods.find((method) => method.id === paymentMethodId);
    // Same base the backend uses: the processor only handled what the
    // customer actually paid, i.e. amount minus the retenciones.
    const processedAmount = Math.max(Number(amount || 0) - withheldTotal, 0);
    const estimatedFee = selectedMethod && amount > 0
        ? Math.min(round2((processedAmount * Number(selectedMethod.fee_percent)) / 100 + Number(selectedMethod.fee_fixed_amount)), feeDirection === "subtract" ? processedAmount : Infinity)
        : 0;
    const estimatedNet = feeDirection === "subtract" ? processedAmount - estimatedFee : Number(amount || 0) + estimatedFee;
    const hasSuggestion = Boolean(withholdingSuggestion) && WITHHOLDING_FIELDS.some(([name]) => Number(withholdingSuggestion[name]) > 0);
    const applySuggestion = () => {
        form.setFieldsValue({
            ...Object.fromEntries(WITHHOLDING_FIELDS.map(([name]) => [name, Number(withholdingSuggestion[name]) || undefined])),
            ...(!amount ? { amount: pendingBalance } : {}),
        });
    };

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
                {isForeignCurrency && (
                    <Form.Item name="settle_in_full" valuePropName="checked" className="mb-2">
                        <Checkbox>{t("finance.settle_in_full_label")}</Checkbox>
                    </Form.Item>
                )}
                {isForeignCurrency && settleInFull && (
                    <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("finance.settle_in_full_hint")} />
                )}
                <Form.Item
                    name="amount"
                    label={t("finance.amount_label")}
                    rules={[
                        { required: true, message: t("validation.required_field") },
                        {
                            validator: (_, value) => {
                                if (isForeignCurrency && settleInFull) {
                                    // The service layer enforces the real
                                    // sanity bound (variance vs. pending) -
                                    // this only blocks an obviously-wrong
                                    // zero/negative entry client-side.
                                    return value > 0 ? Promise.resolve() : Promise.reject(new Error(t("finance.amount_exceeds_pending")));
                                }
                                return value > 0 && value <= pendingBalance
                                    ? Promise.resolve()
                                    : Promise.reject(new Error(t("finance.amount_exceeds_pending")));
                            },
                        },
                    ]}
                >
                    <InputNumber
                        className="w-full"
                        min={0.01}
                        max={isForeignCurrency && settleInFull ? undefined : pendingBalance}
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

                {paymentMethods.length > 0 && (
                    <Form.Item name="payment_method_id" label={t("finance.payment_method_configured_label")} extra={t("finance.payment_method_configured_hint")}>
                        <Select size="large" allowClear placeholder={t("finance.payment_method_configured_placeholder")}>
                            {paymentMethods.map((method) => (
                                <Option key={method.id} value={method.id}>
                                    {method.name} ({method.fee_percent}% + {formatCurrency(method.fee_fixed_amount)})
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                )}

                {selectedMethod && amount > 0 && (
                    <Alert
                        className="dark-alert dark-alert-teal mb-4"
                        type="info"
                        showIcon
                        message={t("finance.payment_method_fee_preview_title")}
                        description={t("finance.payment_method_fee_preview_desc", { fee: formatCurrency(estimatedFee), net: formatCurrency(estimatedNet) })}
                    />
                )}

                {showWithholdings && (
                    <Collapse
                        className="mb-4"
                        defaultActiveKey={hasSuggestion ? ["withholdings"] : []}
                        items={[{
                            key: "withholdings",
                            label: t("finance.withholdings_section_title"),
                            children: (
                                <>
                                    <p className="text-xs text-[var(--ohnix-text-muted)] mt-0 mb-3">{t("finance.withholdings_section_help")}</p>
                                    {hasSuggestion && (
                                        <Alert
                                            className="dark-alert dark-alert-teal mb-3"
                                            type="info"
                                            showIcon
                                            message={t("finance.withholdings_suggestion_title")}
                                            description={t("finance.withholdings_suggestion_desc", { income: formatCurrency(withholdingSuggestion.withheld_income_tax), vat: formatCurrency(withholdingSuggestion.withheld_vat), ica: formatCurrency(withholdingSuggestion.withheld_ica) })}
                                            action={<Button size="small" onClick={applySuggestion}>{t("finance.withholdings_suggestion_apply")}</Button>}
                                        />
                                    )}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {WITHHOLDING_FIELDS.map(([name, label]) => (
                                            <Form.Item key={name} name={name} label={t(label)} className="mb-0">
                                                <InputNumber className="w-full" min={0} prefix={currency.symbol} formatter={currencyInputProps.formatter} parser={currencyInputProps.parser} />
                                            </Form.Item>
                                        ))}
                                    </div>
                                    {withheldTotal > 0 && Number(amount) > 0 && (
                                        withheldTotal >= Number(amount)
                                            ? <Alert className="dark-alert dark-alert-amber mt-3" type="warning" showIcon message={t("finance.withholdings_exceed_amount")} />
                                            : <p className="text-sm text-[var(--ohnix-text-primary)] mt-3 mb-0">{t("finance.withholdings_net_preview", { net: formatCurrency(estimatedNet) })}</p>
                                    )}
                                </>
                            ),
                        }]}
                    />
                )}

                <Form.Item name="reference" label={t("finance.reference_label")}>
                    <Input size="large" placeholder={t("finance.reference_placeholder")} maxLength={80} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default RegisterPaymentModal;
