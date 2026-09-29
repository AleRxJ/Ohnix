import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Input, InputNumber, Modal, Select } from "antd";
import {
    BankOutlined,
    CreditCardOutlined,
    DollarOutlined,
    DownloadOutlined,
    FieldTimeOutlined,
    ThunderboltOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { formatCurrency, getCurrencyInputProps } from "../../utils/currency";

const cop = (value) => formatCurrency(value, "COP");

// `method` is the free-text label the payment keeps (same field the regular
// "registrar pago" modal fills by hand); `accountType` picks the default
// cash account for it.
const METHODS = [
    { key: "cash", icon: <DollarOutlined />, labelKey: "pos.method_cash", accountType: "cash" },
    { key: "card", icon: <CreditCardOutlined />, labelKey: "pos.method_card", accountType: "bank" },
    { key: "transfer", icon: <BankOutlined />, labelKey: "pos.method_transfer", accountType: "bank" },
    { key: "credit", icon: <FieldTimeOutlined />, labelKey: "pos.method_credit", accountType: null },
];

// Bills a Colombian cashier actually receives - offered as one-tap amounts
// just above the total (plus "exacto").
const BILLS = [2000, 5000, 10000, 20000, 50000, 100000];
const quickCashOptions = (total) => {
    const options = new Set();
    for (const bill of BILLS) {
        const rounded = Math.ceil(total / bill) * bill;
        if (rounded > total) options.add(rounded);
        if (options.size >= 3) break;
    }
    return [...options].sort((a, b) => a - b);
};

const pickAccount = (cashAccounts, accountType, pointOfSaleId) => {
    const ofType = cashAccounts.filter((a) => a.is_active !== false && (!accountType || a.account_type === accountType));
    const pool = ofType.length ? ofType : cashAccounts.filter((a) => a.is_active !== false);
    return (
        pool.find((a) => pointOfSaleId && String(a.point_of_sale?._id) === String(pointOfSaleId)) ||
        pool.find((a) => !a.point_of_sale?._id) ||
        pool[0] ||
        null
    );
};

const SuccessView = ({ result, onNewSale, onDownload, downloading }) => {
    const { t } = useI18n();
    return (
        <div className="pos-success">
            <svg className={`pos-success-check ${result.offline ? "is-offline" : ""}`} viewBox="0 0 88 88" fill="none" aria-hidden="true">
                <circle cx="44" cy="44" r="40" strokeWidth="5" strokeLinecap="round" />
                <path d="M28 45 L39 56 L61 33" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h3 className="mb-1 mt-4 text-2xl font-bold text-[var(--ohnix-text-primary)]">
                {result.offline ? t("pos.saved_offline_title") : t("pos.sale_done_title")}
            </h3>
            <p className="m-0 text-sm text-[var(--ohnix-text-muted)]">
                {result.offline ? t("pos.saved_offline_hint") : result.invoiceNo ? t("pos.sale_number", { number: result.invoiceNo }) : null}
            </p>

            <div className="mt-5 w-full space-y-2 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 text-left">
                <div className="flex justify-between text-sm text-[var(--ohnix-text-muted)]">
                    <span>{t("pos.total")}</span>
                    <span className="font-semibold tabular-nums text-[var(--ohnix-text-primary)]">{cop(result.total)}</span>
                </div>
                {result.change > 0 && (
                    <div className="flex items-baseline justify-between">
                        <span className="text-sm text-[var(--ohnix-text-muted)]">{t("pos.change_to_give")}</span>
                        <span className="text-3xl font-bold tabular-nums text-[var(--ohnix-status-success)]">{cop(result.change)}</span>
                    </div>
                )}
                {result.method === "credit" && <div className="text-xs text-[var(--ohnix-status-amber)]">{t("pos.credit_note")}</div>}
            </div>

            {result.paymentError && (
                <Alert className="mt-4 w-full text-left" type="warning" showIcon message={t("pos.payment_failed")} description={result.paymentError} />
            )}
            {result.einvoicing && !result.offline && (
                <p className="mt-4 mb-0 flex items-center gap-2 text-xs text-[var(--ohnix-text-dim)]">
                    <ThunderboltOutlined className="text-[var(--ohnix-accent)]" /> {t("pos.einvoice_auto")}
                </p>
            )}

            <div className="mt-6 flex w-full flex-col-reverse gap-3 sm:flex-row">
                {!result.offline && result.orderId && (
                    <Button size="large" icon={<DownloadOutlined />} onClick={onDownload} loading={downloading} className="sm:flex-1">
                        {t("pos.download_receipt")}
                    </Button>
                )}
                <button type="button" className="pos-charge sm:flex-1" onClick={onNewSale} autoFocus>
                    {t("pos.new_sale")}
                    <kbd className="pos-kbd border-[rgba(2,19,20,0.25)] text-[rgba(2,19,20,0.6)]">Enter</kbd>
                </button>
            </div>
        </div>
    );
};

SuccessView.propTypes = {
    result: PropTypes.object.isRequired,
    onNewSale: PropTypes.func.isRequired,
    onDownload: PropTypes.func.isRequired,
    downloading: PropTypes.bool,
};

const PosCheckoutModal = ({
    open,
    total,
    cashAccounts,
    paymentMethods,
    canRegisterPayment,
    pointOfSaleId,
    submitting,
    result,
    onConfirm,
    onClose,
    onNewSale,
    onDownload,
    downloading,
}) => {
    const { t } = useI18n();
    const inputProps = getCurrencyInputProps("COP");
    const canPay = canRegisterPayment && cashAccounts.length > 0;
    const [method, setMethod] = useState("cash");
    const [received, setReceived] = useState(null);
    const [accountId, setAccountId] = useState(null);
    const [paymentMethodId, setPaymentMethodId] = useState(null);
    const [reference, setReference] = useState("");

    const methodDef = METHODS.find((m) => m.key === method);

    useEffect(() => {
        if (!open) return;
        setMethod(canPay ? "cash" : "credit");
        setReceived(null);
        setPaymentMethodId(null);
        setReference("");
    }, [open, canPay]);

    useEffect(() => {
        if (!methodDef?.accountType) return;
        setAccountId(pickAccount(cashAccounts, methodDef.accountType, pointOfSaleId)?._id || null);
    }, [methodDef, cashAccounts, pointOfSaleId]);

    const quickCash = useMemo(() => quickCashOptions(total), [total]);
    const cashGiven = method === "cash" ? Number(received ?? total) : total;
    const change = method === "cash" ? cashGiven - total : 0;
    const short = method === "cash" && received !== null && change < 0;

    const confirm = () => {
        if (submitting || short) return;
        if (method === "credit") {
            onConfirm({ method: "credit", payment: null, change: 0 });
            return;
        }
        onConfirm({
            method,
            change: Math.max(0, change),
            payment: {
                cash_account_id: accountId,
                method: t(methodDef.labelKey),
                reference: reference.trim() || undefined,
                payment_method_id: paymentMethodId || undefined,
            },
        });
    };

    return (
        <Modal
            open={open}
            onCancel={result ? onNewSale : onClose}
            footer={null}
            width={Math.min(560, window.innerWidth * 0.96)}
            centered
            destroyOnClose
            maskClosable={!submitting}
            closable={!submitting}
            styles={{
                content: {
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    borderRadius: 24,
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                },
            }}
        >
            {result ? (
                <SuccessView result={result} onNewSale={onNewSale} onDownload={onDownload} downloading={downloading} />
            ) : (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        confirm();
                    }}
                    className="space-y-5"
                >
                    <div className="pt-2 text-center">
                        <div className="text-xs uppercase tracking-[0.18em] text-[var(--ohnix-text-dim)]">{t("pos.to_charge")}</div>
                        <div className="mt-1 text-5xl font-bold tabular-nums tracking-tight text-[var(--ohnix-text-primary)]">{cop(total)}</div>
                    </div>

                    {!canRegisterPayment && <Alert type="info" showIcon message={t("pos.no_finance_permission")} />}
                    {canRegisterPayment && cashAccounts.length === 0 && <Alert type="warning" showIcon message={t("pos.no_cash_accounts")} />}

                    <div className="pos-tiles" role="radiogroup">
                        {METHODS.map((m) => (
                            <button
                                key={m.key}
                                type="button"
                                role="radio"
                                aria-checked={method === m.key}
                                className={`pos-tile ${method === m.key ? "is-active" : ""}`}
                                onClick={() => setMethod(m.key)}
                                disabled={m.key !== "credit" && !canPay}
                            >
                                {m.icon}
                                {t(m.labelKey)}
                            </button>
                        ))}
                    </div>

                    {method === "cash" && (
                        <div className="space-y-3">
                            <InputNumber
                                autoFocus
                                size="large"
                                className="w-full"
                                min={0}
                                value={received}
                                placeholder={t("pos.received_placeholder")}
                                onChange={setReceived}
                                prefix="$"
                                formatter={inputProps.formatter}
                                parser={inputProps.parser}
                            />
                            <div className="pos-quick-cash">
                                <Button onClick={() => setReceived(total)}>{t("pos.exact")}</Button>
                                {quickCash.map((amount) => (
                                    <Button key={amount} onClick={() => setReceived(amount)}>
                                        {cop(amount)}
                                    </Button>
                                ))}
                            </div>
                            <div className={`pos-change ${short ? "is-short" : ""}`}>
                                <span className="text-sm text-[var(--ohnix-text-muted)]">{short ? t("pos.missing") : t("pos.change_to_give")}</span>
                                <span
                                    className={`text-2xl font-bold tabular-nums ${short ? "text-[var(--ohnix-status-danger)]" : "text-[var(--ohnix-status-success)]"}`}
                                >
                                    {cop(Math.abs(change))}
                                </span>
                            </div>
                        </div>
                    )}

                    {(method === "card" || method === "transfer") && (
                        <div className="space-y-3">
                            {paymentMethods.length > 0 && (
                                <Select
                                    size="large"
                                    className="w-full"
                                    allowClear
                                    value={paymentMethodId}
                                    onChange={setPaymentMethodId}
                                    placeholder={t("finance.payment_method_configured_placeholder")}
                                    options={paymentMethods.map((pm) => ({ value: pm.id, label: pm.name }))}
                                />
                            )}
                            <Input size="large" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t("pos.reference_placeholder")} maxLength={60} />
                        </div>
                    )}

                    {method === "credit" && <Alert type="warning" showIcon message={t("pos.credit_hint")} />}

                    {methodDef?.accountType && canPay && (
                        <div className="flex items-center gap-2 text-xs text-[var(--ohnix-text-dim)]">
                            <span className="shrink-0">{t("pos.deposit_to")}</span>
                            <Select
                                size="small"
                                variant="borderless"
                                className="min-w-0 flex-1"
                                value={accountId}
                                onChange={setAccountId}
                                options={cashAccounts.map((a) => ({ value: a._id, label: a.name }))}
                            />
                        </div>
                    )}

                    <button type="submit" className="pos-charge" disabled={submitting || short || (method !== "credit" && !accountId)}>
                        {submitting ? t("pos.processing") : method === "credit" ? t("pos.confirm_credit") : t("pos.confirm_charge")}
                        {!submitting && <kbd className="pos-kbd border-[rgba(2,19,20,0.25)] text-[rgba(2,19,20,0.6)]">Enter</kbd>}
                    </button>
                </form>
            )}
        </Modal>
    );
};

PosCheckoutModal.propTypes = {
    open: PropTypes.bool.isRequired,
    total: PropTypes.number.isRequired,
    cashAccounts: PropTypes.array.isRequired,
    paymentMethods: PropTypes.array.isRequired,
    canRegisterPayment: PropTypes.bool,
    pointOfSaleId: PropTypes.string,
    submitting: PropTypes.bool,
    result: PropTypes.object,
    onConfirm: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onNewSale: PropTypes.func.isRequired,
    onDownload: PropTypes.func.isRequired,
    downloading: PropTypes.bool,
};

export default PosCheckoutModal;
