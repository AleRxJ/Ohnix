// Frontend/src/pages/EnrollApiBilling.jsx
//
// Public, unauthenticated - reached only via the single-use, 7-day link an
// admin generates for an external API client (a company with NO Ohnix
// account, see AdminApiClients.jsx) so they can enroll their own card for
// automatic recurring billing (see Backend/utils/apiClientBillingScheduler.js
// for what gets charged and when). The card itself is tokenized entirely
// client-side by ePayco's own JS - it goes straight from this browser to
// ePayco's servers and never reaches Ohnix's backend at any point; only the
// resulting opaque token id is ever sent to
// Backend/controllers/externalApiBilling.controller.js.
//
// Uses ePayco's tokenization script (checkout.epayco.co/epayco.min.js), a
// DIFFERENT library from the on-page checkout widget used elsewhere
// (CertificateOrderCheckout.jsx, EpaycoCheckout.jsx use checkout.js's
// `ePayco.checkout.configure` widget for one-time payments). Tokenization's
// own ePayco.token.create($form, callback) expects a jQuery-wrapped form
// element (confirmed from ePayco's own docs) - jQuery is loaded from a CDN
// script tag rather than added as an npm dependency. The loading/tokenizing
// lives in utils/epaycoTokenizer.js, shared with EpaycoCardForm.jsx (plan
// checkout with automatic renewal).

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Spin, Alert } from "antd";
import { api } from "../api/api";
import useI18n from "../hooks/useI18n";
import ThemeToggle from "../components/common/ThemeToggle";
import LanguageSwitcher from "../components/LanguageSwitcher/LanguageSwitcher";
import { tokenizeEpaycoCard } from "../utils/epaycoTokenizer";

const EnrollApiBilling = () => {
    const { token } = useParams();
    const { t } = useI18n();
    const formRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [epaycoPublicKey, setEpaycoPublicKey] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    const [cardName, setCardName] = useState("");
    const [cardEmail, setCardEmail] = useState("");
    const [cardNumber, setCardNumber] = useState("");
    const [cardCvc, setCardCvc] = useState("");
    const [cardExpMonth, setCardExpMonth] = useState("");
    const [cardExpYear, setCardExpYear] = useState("");

    useEffect(() => {
        let isMounted = true;

        (async () => {
            try {
                const response = await api.get(`/api-billing/enroll/${token}`);
                if (!isMounted) return;
                setCompanyName(response?.data?.data?.companyName || "");
                setEpaycoPublicKey(response?.data?.data?.publicKey || "");
            } catch (err) {
                if (!isMounted) return;
                setError(err?.response?.data?.message || t("api_billing_enroll.load_error"));
            } finally {
                if (isMounted) setLoading(false);
            }
        })();

        return () => { isMounted = false; };
    }, [token, t]);

    const handleSubmit = async (evt) => {
        evt.preventDefault();
        setError("");
        setSubmitting(true);

        try {
            const tokenCard = await tokenizeEpaycoCard({
                formElement: formRef.current,
                publicKey: epaycoPublicKey,
                messages: {
                    missingPublicKey: t("api_billing_enroll.missing_public_key"),
                    scriptError: t("api_billing_enroll.script_error"),
                    cardError: t("api_billing_enroll.card_error"),
                },
            });

            await api.post(`/api-billing/enroll/${token}`, { tokenCard });
            setDone(true);
        } catch (err) {
            setError(err?.response?.data?.message || err?.message || t("api_billing_enroll.card_error"));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--ohnix-bg-alt)] flex items-center justify-center">
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--ohnix-bg-alt)] text-[var(--ohnix-text-primary)] flex flex-col items-center justify-center gap-6 px-4 py-10">
            <div className="flex items-center gap-3 self-end max-w-md w-full justify-end">
                <LanguageSwitcher />
                <ThemeToggle compact />
            </div>

            <div className="max-w-md w-full rounded-2xl border border-[#29D8D5]/15 bg-[var(--ohnix-bg)] p-6 sm:p-8">
                <img src="/Ohnix_Icon_Transparent.png" alt="Ohnix" className="h-8 w-8 mb-4 ohnix-logo-adaptive" />
                <h1 className="text-xl font-semibold mb-1">{t("api_billing_enroll.title")}</h1>
                {companyName && (
                    <p className="text-sm text-[var(--ohnix-text-muted)] mb-6">
                        {t("api_billing_enroll.subtitle", { companyName })}
                    </p>
                )}

                {error && (
                    <Alert
                        type="error"
                        showIcon
                        message={error}
                        className="mb-4"
                    />
                )}

                {done ? (
                    <Alert
                        type="success"
                        showIcon
                        message={t("api_billing_enroll.success_title")}
                        description={t("api_billing_enroll.success_description")}
                    />
                ) : (
                    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div>
                            <label className="block text-xs text-[var(--ohnix-text-muted)] mb-1">{t("api_billing_enroll.field_name")}</label>
                            <input
                                type="text"
                                data-epayco="card[name]"
                                required
                                value={cardName}
                                onChange={(e) => setCardName(e.target.value)}
                                className="w-full rounded-lg border border-[#29D8D5]/20 bg-transparent px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--ohnix-text-muted)] mb-1">{t("api_billing_enroll.field_email")}</label>
                            <input
                                type="email"
                                data-epayco="card[email]"
                                required
                                value={cardEmail}
                                onChange={(e) => setCardEmail(e.target.value)}
                                className="w-full rounded-lg border border-[#29D8D5]/20 bg-transparent px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--ohnix-text-muted)] mb-1">{t("api_billing_enroll.field_card_number")}</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                data-epayco="card[number]"
                                required
                                value={cardNumber}
                                onChange={(e) => setCardNumber(e.target.value)}
                                className="w-full rounded-lg border border-[#29D8D5]/20 bg-transparent px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs text-[var(--ohnix-text-muted)] mb-1">{t("api_billing_enroll.field_exp_month")}</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="MM"
                                    data-epayco="card[exp_month]"
                                    required
                                    value={cardExpMonth}
                                    onChange={(e) => setCardExpMonth(e.target.value)}
                                    className="w-full rounded-lg border border-[#29D8D5]/20 bg-transparent px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[var(--ohnix-text-muted)] mb-1">{t("api_billing_enroll.field_exp_year")}</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="AAAA"
                                    data-epayco="card[exp_year]"
                                    required
                                    value={cardExpYear}
                                    onChange={(e) => setCardExpYear(e.target.value)}
                                    className="w-full rounded-lg border border-[#29D8D5]/20 bg-transparent px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[var(--ohnix-text-muted)] mb-1">{t("api_billing_enroll.field_cvc")}</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    data-epayco="card[cvc]"
                                    required
                                    value={cardCvc}
                                    onChange={(e) => setCardCvc(e.target.value)}
                                    className="w-full rounded-lg border border-[#29D8D5]/20 bg-transparent px-3 py-2 text-sm"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="mt-2 px-5 py-2.5 rounded-lg bg-[#29D8D5] text-[#021314] font-medium text-sm hover:bg-[#44F3F0] transition-colors disabled:opacity-60"
                        >
                            {submitting ? <Spin size="small" /> : t("api_billing_enroll.submit")}
                        </button>
                        <p className="text-[11px] text-[var(--ohnix-text-muted)] text-center">
                            {t("api_billing_enroll.disclaimer")}
                        </p>
                    </form>
                )}
            </div>

            {/* Occasional, low-key cross-sell - this client already has a
                working API-only integration, so this must never compete for
                attention with the card form above (card details are the only
                thing that actually matters on this page). A plain text link,
                not a colored card/CTA button. */}
            <p className="max-w-md w-full text-center text-xs text-[var(--ohnix-text-muted)]">
                {t("api_billing_enroll.upsell_text")}{" "}
                <a href="/signup" className="text-[#29D8D5] hover:underline">
                    {t("api_billing_enroll.upsell_link")}
                </a>
            </p>
        </div>
    );
};

export default EnrollApiBilling;
