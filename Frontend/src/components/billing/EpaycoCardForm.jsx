// Frontend/src/components/billing/EpaycoCardForm.jsx
//
// Card form tokenized by ePayco in the browser (utils/epaycoTokenizer.js).
// The card number / CVC never leave this browser except towards ePayco;
// onSubmit only receives the token id, the cardholder identification ePayco
// requires on every charge, and display-only metadata (brand + last 4 +
// expiry). Used by CardCheckout.jsx (pay a plan and save the card) and by
// PaymentMethodCard.jsx ("Cambiar tarjeta").

import { useRef, useState } from "react";
import { Alert, Spin } from "antd";
import useI18n from "../../hooks/useI18n";
import { detectCardBrand, tokenizeEpaycoCard } from "../../utils/epaycoTokenizer";

const DEFAULT_DOC_TYPES = ["CC", "CE", "NIT", "PPN", "TI"];

const inputClass =
    "w-full rounded-lg border border-[#29D8D5]/20 bg-transparent px-3 py-2 text-sm text-[var(--ohnix-text-primary)] outline-none focus:border-[#29D8D5]/60";
const labelClass = "block text-xs text-[var(--ohnix-text-muted)] mb-1";

const EpaycoCardForm = ({
    publicKey,
    email,
    docTypes = DEFAULT_DOC_TYPES,
    submitLabel,
    consentText,
    disabled = false,
    onSubmit,
}) => {
    const { t } = useI18n();
    const formRef = useRef(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const [holderName, setHolderName] = useState("");
    const [docType, setDocType] = useState(docTypes[0] || "CC");
    const [docNumber, setDocNumber] = useState("");
    const [cardNumber, setCardNumber] = useState("");
    const [expMonth, setExpMonth] = useState("");
    const [expYear, setExpYear] = useState("");
    const [cvc, setCvc] = useState("");

    const handleSubmit = async (evt) => {
        evt.preventDefault();
        if (submitting || disabled) return;
        setError("");
        setSubmitting(true);
        try {
            const tokenCard = await tokenizeEpaycoCard({
                formElement: formRef.current,
                publicKey,
                messages: {
                    missingPublicKey: t("auto_renew.card_form.missing_public_key", "El pago con tarjeta no está disponible en este momento."),
                    scriptError: t("auto_renew.card_form.script_error", "No se pudo cargar ePayco. Revisa tu conexión o bloqueador de anuncios."),
                    cardError: t("auto_renew.card_form.card_error", "No pudimos validar la tarjeta. Revisa los datos."),
                },
            });
            const digits = cardNumber.replace(/\D/g, "");
            await onSubmit({
                tokenCard,
                docType,
                docNumber: docNumber.trim(),
                holderName: holderName.trim(),
                cardMeta: {
                    brand: detectCardBrand(digits),
                    last4: digits.slice(-4),
                    expMonth,
                    expYear,
                },
            });
        } catch (err) {
            setError(
                err?.response?.data?.message ||
                    err?.message ||
                    t("auto_renew.card_form.card_error", "No pudimos validar la tarjeta. Revisa los datos.")
            );
        } finally {
            setSubmitting(false);
        }
    };

    const busy = submitting || disabled;

    return (
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && <Alert type="error" showIcon message={error} />}

            {/* ePayco reads the email from the form too - not user-editable here. */}
            <input type="hidden" data-epayco="card[email]" value={email || ""} readOnly />

            <div>
                <label className={labelClass}>{t("auto_renew.card_form.holder_name", "Nombre del titular (como aparece en la tarjeta)")}</label>
                <input
                    type="text"
                    data-epayco="card[name]"
                    autoComplete="cc-name"
                    required
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value)}
                    className={inputClass}
                />
            </div>

            <div className="grid grid-cols-[110px_1fr] gap-3">
                <div>
                    <label className={labelClass}>{t("auto_renew.card_form.doc_type", "Documento")}</label>
                    <select
                        value={docType}
                        onChange={(e) => setDocType(e.target.value)}
                        className={`${inputClass} bg-[var(--ohnix-bg)]`}
                    >
                        {docTypes.map((type) => (
                            <option key={type} value={type}>
                                {t(`auto_renew.doc_types.${type}`, type)}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={labelClass}>{t("auto_renew.card_form.doc_number", "Número de documento")}</label>
                    <input
                        type="text"
                        inputMode="numeric"
                        required
                        value={docNumber}
                        onChange={(e) => setDocNumber(e.target.value)}
                        className={inputClass}
                    />
                </div>
            </div>

            <div>
                <label className={labelClass}>{t("auto_renew.card_form.card_number", "Número de tarjeta")}</label>
                <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    data-epayco="card[number]"
                    required
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    className={inputClass}
                />
            </div>

            <div className="grid grid-cols-3 gap-3">
                <div>
                    <label className={labelClass}>{t("auto_renew.card_form.exp_month", "Mes")}</label>
                    <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="cc-exp-month"
                        placeholder="MM"
                        maxLength={2}
                        data-epayco="card[exp_month]"
                        required
                        value={expMonth}
                        onChange={(e) => setExpMonth(e.target.value)}
                        className={inputClass}
                    />
                </div>
                <div>
                    <label className={labelClass}>{t("auto_renew.card_form.exp_year", "Año")}</label>
                    <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="cc-exp-year"
                        placeholder={t("auto_renew.card_form.year_placeholder", "AAAA")}
                        maxLength={4}
                        data-epayco="card[exp_year]"
                        required
                        value={expYear}
                        onChange={(e) => setExpYear(e.target.value)}
                        className={inputClass}
                    />
                </div>
                <div>
                    <label className={labelClass}>CVC</label>
                    <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="cc-csc"
                        maxLength={4}
                        data-epayco="card[cvc]"
                        required
                        value={cvc}
                        onChange={(e) => setCvc(e.target.value)}
                        className={inputClass}
                    />
                </div>
            </div>

            {consentText && (
                <p className="rounded-lg border border-[#29D8D5]/15 bg-[#29D8D5]/5 px-3 py-2 text-xs leading-relaxed text-[var(--ohnix-text-muted)]">
                    {consentText}
                </p>
            )}

            <button
                type="submit"
                disabled={busy}
                className="px-5 py-2.5 rounded-lg bg-[#29D8D5] text-[#021314] font-semibold text-sm hover:bg-[#44F3F0] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
                {submitting ? <Spin size="small" /> : submitLabel}
            </button>

            <p className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--ohnix-text-muted)]">
                <svg className="h-3 w-3 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944z" clipRule="evenodd" />
                </svg>
                {t("auto_renew.card_form.security_note", "Tu tarjeta se cifra y la guarda ePayco (PCI DSS). Ohnix nunca ve el número completo.")}
            </p>
        </form>
    );
};

export default EpaycoCardForm;
