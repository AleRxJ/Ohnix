import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Input, InputNumber, Modal, Segmented, Select, Spin, Tooltip } from "antd";
import {
    BankOutlined,
    CreditCardOutlined,
    DollarOutlined,
    DownloadOutlined,
    FieldTimeOutlined,
    PrinterOutlined,
    QrcodeOutlined,
    SafetyCertificateOutlined,
    ThunderboltOutlined,
    WifiOutlined,
} from "@ant-design/icons";
import { QRCodeSVG } from "qrcode.react";
import useI18n from "../../hooks/useI18n";
import { formatCurrency, getCurrencyInputProps } from "../../utils/currency";
import { pickAccount } from "./posPayments";

const cop = (value) => formatCurrency(value, "COP");

// `accountType` picks the default cash account for the method. `bold` ones
// charge through the company's own Bold account and are confirmed by Bold
// itself (verified); card/transfer typed in by hand stay "por verificar"
// until the bank statement (or a person) confirms them.
const METHODS = [
    { key: "cash", icon: <DollarOutlined />, labelKey: "pos.method_cash", accountType: "cash" },
    { key: "bold_terminal", icon: <CreditCardOutlined />, labelKey: "pos.method_bold_terminal", accountType: "bank", bold: "terminal" },
    { key: "bold_link", icon: <QrcodeOutlined />, labelKey: "pos.method_bold_link", accountType: "bank", bold: "link" },
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

const KBD_ON_ACCENT = "pos-kbd border-[rgba(2,19,20,0.25)] text-[rgba(2,19,20,0.6)]";

const SuccessView = ({ result, onNewSale, onDownload, downloading, onPrint, printing }) => {
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
                {result.verification === "verified" && (
                    <div className="flex items-center gap-2 text-xs text-[var(--ohnix-status-success)]">
                        <SafetyCertificateOutlined /> {t("pos.payment_verified_by_bold")}
                    </div>
                )}
                {result.verification === "pending" && <div className="text-xs text-[var(--ohnix-status-amber)]">{t("pos.payment_pending_verification")}</div>}
                {result.method === "credit" && <div className="text-xs text-[var(--ohnix-status-amber)]">{t("pos.credit_note")}</div>}
            </div>

            {result.paymentError && (
                <Alert className="mt-4 w-full text-left" type="warning" showIcon message={t("pos.payment_failed")} description={result.paymentError} />
            )}
            {result.einvoiceDeferred && (
                <p className="mb-0 mt-4 text-xs text-[var(--ohnix-status-amber)]">{t("pos.einvoice_deferred_note")}</p>
            )}
            {result.einvoicing && !result.einvoiceDeferred && !result.offline && (
                <p className="mb-0 mt-4 flex items-center gap-2 text-xs text-[var(--ohnix-text-dim)]">
                    <ThunderboltOutlined className="text-[var(--ohnix-accent)]" /> {t("pos.einvoice_auto")}
                </p>
            )}

            <div className="mt-6 flex w-full flex-col-reverse gap-3 sm:flex-row">
                <Button size="large" icon={<PrinterOutlined />} onClick={onPrint} loading={printing} className="sm:flex-1">
                    {printing ? t("pos.printing") : t("pos.print_ticket")}
                </Button>
                {!result.offline && result.orderId && (
                    <Button size="large" icon={<DownloadOutlined />} onClick={onDownload} loading={downloading} className="sm:flex-1">
                        {t("pos.download_receipt")}
                    </Button>
                )}
                <button type="button" className="pos-charge sm:flex-1" onClick={onNewSale} autoFocus>
                    {t("pos.new_sale")}
                    <kbd className={KBD_ON_ACCENT}>Enter</kbd>
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
    onPrint: PropTypes.func.isRequired,
    printing: PropTypes.bool,
};

// Waiting on Bold: the sale already exists; only its payment is in flight.
const ChargingView = ({ charging, terminalName, busy, onCancel, onRetry, onCashInstead, onLeaveOnCredit }) => {
    const { t } = useI18n();
    const intent = charging.intent;
    const status = charging.error ? "error" : intent?.status || "pending";
    const waiting = status === "pending";

    if (waiting) {
        return (
            <div className="flex flex-col items-center py-2 text-center">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--ohnix-text-dim)]">{t("pos.sale_number", { number: charging.invoiceNo || "" })}</div>
                <div className="mt-1 text-4xl font-bold tabular-nums text-[var(--ohnix-text-primary)]">{cop(intent?.amount ?? charging.total)}</div>

                {charging.mode === "link" && intent?.checkout_url ? (
                    <>
                        <div className="mt-5 rounded-3xl bg-white p-4 shadow-[0_18px_50px_rgba(41,216,213,0.25)]">
                            <QRCodeSVG value={intent.checkout_url} size={216} level="M" />
                        </div>
                        <p className="mb-0 mt-4 max-w-xs text-sm text-[var(--ohnix-text-muted)]">{t("pos.scan_qr_hint")}</p>
                    </>
                ) : (
                    <>
                        <div className="relative mt-6 grid h-32 w-32 place-items-center">
                            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--ohnix-accent-soft)]" />
                            <span className="relative grid h-24 w-24 place-items-center rounded-full border border-[var(--ohnix-accent-line-strong)] bg-[var(--ohnix-accent-soft)] text-4xl text-[var(--ohnix-accent)]">
                                <WifiOutlined className="rotate-90" />
                            </span>
                        </div>
                        <p className="mb-0 mt-4 max-w-xs text-sm text-[var(--ohnix-text-muted)]">{t("pos.terminal_hint", { terminal: terminalName || "Bold" })}</p>
                    </>
                )}

                <div className="mt-5 flex items-center gap-2 text-xs text-[var(--ohnix-text-dim)]">
                    <Spin size="small" /> {t("pos.waiting_bold")}
                </div>
                <Button className="mt-5" onClick={onCancel} disabled={busy}>
                    {t("pos.cancel_charge")}
                </Button>
            </div>
        );
    }

    const messageKey =
        status === "error" ? null : status === "needs_review" ? "pos.charge_needs_review" : `pos.charge_${status}`;
    return (
        <div className="space-y-4 py-2">
            <Alert
                type={status === "needs_review" ? "warning" : "error"}
                showIcon
                message={status === "error" ? t("pos.charge_error") : t(messageKey)}
                description={charging.error || intent?.last_error || undefined}
            />
            <p className="m-0 text-sm text-[var(--ohnix-text-muted)]">{t("pos.charge_sale_kept", { number: charging.invoiceNo || "" })}</p>
            {status === "needs_review" ? (
                <button type="button" className="pos-charge" onClick={onLeaveOnCredit}>
                    {t("pos.finish")}
                </button>
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Button size="large" type="primary" onClick={onRetry} loading={busy}>
                        {t("pos.retry_charge")}
                    </Button>
                    <Button size="large" onClick={onCashInstead} disabled={busy}>
                        {t("pos.cash_instead")}
                    </Button>
                    <Button size="large" onClick={onLeaveOnCredit} disabled={busy}>
                        {t("pos.leave_on_credit")}
                    </Button>
                </div>
            )}
        </div>
    );
};

ChargingView.propTypes = {
    charging: PropTypes.object.isRequired,
    terminalName: PropTypes.string,
    busy: PropTypes.bool,
    onCancel: PropTypes.func.isRequired,
    onRetry: PropTypes.func.isRequired,
    onCashInstead: PropTypes.func.isRequired,
    onLeaveOnCredit: PropTypes.func.isRequired,
};

const PosCheckoutModal = ({
    open,
    total,
    cashAccounts,
    paymentMethods,
    canRegisterPayment,
    pointOfSaleId,
    online,
    bold,
    einvoiceAsk,
    canDeferEinvoice,
    submitting,
    result,
    charging,
    chargeBusy,
    onConfirm,
    onClose,
    onNewSale,
    onDownload,
    downloading,
    onPrint,
    printing,
    onCancelCharge,
    onRetryCharge,
    onCashInstead,
    onLeaveOnCredit,
}) => {
    const { t } = useI18n();
    const inputProps = getCurrencyInputProps("COP");
    const canPay = canRegisterPayment && cashAccounts.length > 0;
    const [method, setMethod] = useState("cash");
    const [received, setReceived] = useState(null);
    const [accountId, setAccountId] = useState(null);
    const [paymentMethodId, setPaymentMethodId] = useState(null);
    const [reference, setReference] = useState("");
    const [terminalSerial, setTerminalSerial] = useState(null);
    // "Preguntar en cada venta": "Emitir ahora" always preselected.
    const [deferEinvoice, setDeferEinvoice] = useState(false);
    const [deferReason, setDeferReason] = useState("");

    const availableMethods = useMemo(
        () =>
            METHODS.filter((m) => {
                if (m.bold === "terminal") return online && bold?.hasTerminalKey && bold.terminals?.length > 0;
                if (m.bold === "link") return online && bold?.hasLinkKey;
                return true;
            }),
        [online, bold]
    );
    const methodDef = availableMethods.find((m) => m.key === method) || availableMethods[0];

    useEffect(() => {
        if (!open) return;
        setMethod(canPay ? "cash" : "credit");
        setReceived(null);
        setPaymentMethodId(null);
        setReference("");
        setTerminalSerial(bold?.terminals?.[0]?.serial || null);
        setDeferEinvoice(false);
        setDeferReason("");
    }, [open, canPay, bold]);

    useEffect(() => {
        if (!methodDef?.accountType) return;
        setAccountId(pickAccount(cashAccounts, methodDef.accountType, pointOfSaleId)?._id || null);
    }, [methodDef, cashAccounts, pointOfSaleId]);

    const quickCash = useMemo(() => quickCashOptions(total), [total]);
    const cashGiven = method === "cash" ? Number(received ?? total) : total;
    const change = method === "cash" ? cashGiven - total : 0;
    const short = method === "cash" && received !== null && change < 0;
    const terminal = bold?.terminals?.find((x) => x.serial === terminalSerial);

    const deferral = { einvoiceDeferred: Boolean(einvoiceAsk && deferEinvoice), deferReason: deferReason.trim() || undefined };
    const confirm = () => {
        if (submitting || short) return;
        if (method === "credit") {
            onConfirm({ method: "credit", payment: null, change: 0, ...deferral });
            return;
        }
        if (methodDef.bold) {
            onConfirm({
                ...deferral,
                method,
                change: 0,
                payment: {
                    provider: "bold",
                    mode: methodDef.bold,
                    terminal_serial: methodDef.bold === "terminal" ? terminal?.serial : undefined,
                    terminal_model: methodDef.bold === "terminal" ? terminal?.model : undefined,
                    cash_account_id: accountId,
                    payment_method_id: paymentMethodId || undefined,
                },
            });
            return;
        }
        onConfirm({
            ...deferral,
            method,
            change: Math.max(0, change),
            payment: {
                cash_account_id: accountId,
                method: t(methodDef.labelKey),
                reference: reference.trim() || undefined,
                payment_method_id: paymentMethodId || undefined,
                requires_verification: method === "card" || method === "transfer",
            },
        });
    };

    let body;
    if (result) {
        body = <SuccessView result={result} onNewSale={onNewSale} onDownload={onDownload} downloading={downloading} onPrint={onPrint} printing={printing} />;
    } else if (charging) {
        body = (
            <ChargingView
                charging={charging}
                terminalName={terminal?.name}
                busy={chargeBusy}
                onCancel={onCancelCharge}
                onRetry={onRetryCharge}
                onCashInstead={onCashInstead}
                onLeaveOnCredit={onLeaveOnCredit}
            />
        );
    } else {
        body = (
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
                    {availableMethods.map((m) => (
                        <button
                            key={m.key}
                            type="button"
                            role="radio"
                            aria-checked={method === m.key}
                            className={`pos-tile ${method === m.key ? "is-active" : ""} ${m.bold ? "is-bold" : ""}`}
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
                            <span className={`text-2xl font-bold tabular-nums ${short ? "text-[var(--ohnix-status-danger)]" : "text-[var(--ohnix-status-success)]"}`}>
                                {cop(Math.abs(change))}
                            </span>
                        </div>
                    </div>
                )}

                {method === "bold_terminal" && (
                    <div className="space-y-3">
                        {bold.terminals.length > 1 && (
                            <Select
                                size="large"
                                className="w-full"
                                value={terminalSerial}
                                onChange={setTerminalSerial}
                                options={bold.terminals.map((x) => ({ value: x.serial, label: `${x.name} · ${x.model}` }))}
                            />
                        )}
                        <Alert type="success" showIcon icon={<SafetyCertificateOutlined />} message={t("pos.bold_terminal_hint", { terminal: terminal?.name || "Bold" })} />
                    </div>
                )}

                {method === "bold_link" && <Alert type="success" showIcon icon={<SafetyCertificateOutlined />} message={t("pos.bold_link_hint")} />}

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
                        <p className="m-0 text-xs text-[var(--ohnix-status-amber)]">{t("pos.manual_verification_hint")}</p>
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

                {einvoiceAsk && (
                    <div className="space-y-2 rounded-2xl border border-[var(--ohnix-line-4)] p-3">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ohnix-text-dim)]">{t("pos.dian_document")}</span>
                            <Segmented
                                size="small"
                                value={deferEinvoice ? "later" : "now"}
                                onChange={(value) => setDeferEinvoice(value === "later")}
                                options={[
                                    { value: "now", label: t("pos.issue_now") },
                                    {
                                        value: "later",
                                        disabled: !canDeferEinvoice,
                                        label: canDeferEinvoice ? t("pos.issue_later") : <Tooltip title={t("pos.issue_later_forbidden")}>{t("pos.issue_later")}</Tooltip>,
                                    },
                                ]}
                            />
                        </div>
                        {deferEinvoice && (
                            <>
                                <Input size="small" value={deferReason} onChange={(e) => setDeferReason(e.target.value)} maxLength={300} placeholder={t("pos.defer_reason_placeholder")} />
                                <p className="m-0 text-xs text-[var(--ohnix-status-amber)]">{t("pos.issue_later_hint")}</p>
                            </>
                        )}
                    </div>
                )}

                <button type="submit" className="pos-charge" disabled={submitting || short || (method !== "credit" && !accountId)}>
                    {submitting
                        ? t("pos.processing")
                        : method === "credit"
                          ? t("pos.confirm_credit")
                          : methodDef?.bold
                            ? t("pos.send_to_bold")
                            : t("pos.confirm_charge")}
                    {!submitting && <kbd className={KBD_ON_ACCENT}>Enter</kbd>}
                </button>
            </form>
        );
    }

    return (
        <Modal
            open={open}
            onCancel={result ? onNewSale : charging ? undefined : onClose}
            footer={null}
            width={Math.min(560, window.innerWidth * 0.96)}
            centered
            destroyOnClose
            maskClosable={!submitting && !charging}
            closable={!submitting && !charging}
            keyboard={!charging}
            styles={{
                content: {
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    borderRadius: 24,
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                },
            }}
        >
            {body}
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
    online: PropTypes.bool,
    bold: PropTypes.object,
    einvoiceAsk: PropTypes.bool,
    canDeferEinvoice: PropTypes.bool,
    submitting: PropTypes.bool,
    result: PropTypes.object,
    charging: PropTypes.object,
    chargeBusy: PropTypes.bool,
    onConfirm: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onNewSale: PropTypes.func.isRequired,
    onDownload: PropTypes.func.isRequired,
    downloading: PropTypes.bool,
    onPrint: PropTypes.func.isRequired,
    printing: PropTypes.bool,
    onCancelCharge: PropTypes.func.isRequired,
    onRetryCharge: PropTypes.func.isRequired,
    onCashInstead: PropTypes.func.isRequired,
    onLeaveOnCredit: PropTypes.func.isRequired,
};

export default PosCheckoutModal;
