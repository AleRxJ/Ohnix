// Frontend/src/pages/CardCheckout.jsx
//
// Colombia card checkout for an Ohnix plan (upgrade or renewal) that also
// saves the card for automatic renewal - the "card_token" payment method
// (see Backend/services/subscriptionAutoRenew.service.js#payRequestWithNewCard).
// The card is tokenized by ePayco in the browser (EpaycoCardForm); the
// backend creates the ePayco customer, charges the first payment and stores
// the token. PSE / Nequi / cash keep going through the ePayco widget
// (EpaycoCheckout.jsx) as one-off manual payments.
//
// The recurring-charge authorization is the text right above the pay button
// (same model as Netflix/LinkedIn - paying with a card is subscribing); it can
// be turned off any time from Billing.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Spin } from "antd";
import { subscriptionService } from "../services/subscriptionService";
import useI18n from "../hooks/useI18n";
import { useAuth } from "../hooks/useAuth";
import EpaycoCardForm from "../components/billing/EpaycoCardForm";

const formatCop = (amount, locale) =>
    new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
    }).format(amount || 0);

const CardCheckout = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { t, currentLanguage } = useI18n();
    const { user } = useAuth();
    const requestId = searchParams.get("requestId") || "";

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [params, setParams] = useState(null);
    const [pending, setPending] = useState(false);

    useEffect(() => {
        let active = true;
        (async () => {
            if (!requestId) {
                setError(t("auto_renew.checkout.missing_request", "Falta la solicitud de pago. Vuelve a Facturación e inténtalo de nuevo."));
                setLoading(false);
                return;
            }
            try {
                const response = await subscriptionService.getCardCheckoutParams(requestId);
                if (active) setParams(response?.data || null);
            } catch (err) {
                if (active) {
                    setError(err?.response?.data?.message || t("auto_renew.checkout.load_error", "No pudimos cargar el pago. Inténtalo de nuevo."));
                }
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, [requestId, t]);

    const amountLabel = useMemo(() => (params ? formatCop(params.amount, currentLanguage) : ""), [params, currentLanguage]);
    const cycleLabel =
        params?.billingCycle === "ANNUAL"
            ? t("auto_renew.cycle_year", "año")
            : t("auto_renew.cycle_month", "mes");

    const handlePay = async (payload) => {
        const response = await subscriptionService.payRequestWithCard(requestId, payload);
        if (response?.data?.status === "pending") {
            setPending(true);
            return;
        }
        navigate(`/billing/payment-success?requestId=${encodeURIComponent(requestId)}`, { replace: true });
    };

    const backToBilling = () => navigate("/dashboard/billing");

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--ohnix-bg-alt)] flex items-center justify-center">
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--ohnix-bg-alt)] text-[var(--ohnix-text-primary)] flex flex-col items-center justify-center gap-6 px-4 py-10">
            <div className="max-w-md w-full rounded-2xl border border-[#29D8D5]/15 bg-[var(--ohnix-bg)] p-6 sm:p-8">
                <img src="/Ohnix_Icon_Transparent.png" alt="Ohnix" className="h-8 w-8 mb-4 ohnix-logo-adaptive" />

                {error && !params && (
                    <>
                        <Alert type="error" showIcon message={error} className="mb-4" />
                        <button onClick={backToBilling} className="text-sm text-[#29D8D5] hover:underline">
                            {t("auto_renew.checkout.back", "Volver a Facturación")}
                        </button>
                    </>
                )}

                {params && pending && (
                    <>
                        <Alert
                            type="info"
                            showIcon
                            message={t("auto_renew.checkout.pending_title", "Tu pago está en verificación")}
                            description={t(
                                "auto_renew.checkout.pending_description",
                                "ePayco está revisando la transacción. Te avisaremos por email en cuanto se confirme y tu plan se activará solo."
                            )}
                            className="mb-4"
                        />
                        <button onClick={backToBilling} className="text-sm text-[#29D8D5] hover:underline">
                            {t("auto_renew.checkout.back", "Volver a Facturación")}
                        </button>
                    </>
                )}

                {params && !pending && (
                    <>
                        <h1 className="text-xl font-semibold mb-1">
                            {params.isRenewal
                                ? t("auto_renew.checkout.title_renew", "Renovar plan {{plan}}", { plan: t(`profile.subscription.plan_${params.targetPlan}`) })
                                : t("auto_renew.checkout.title_upgrade", "Activar plan {{plan}}", { plan: t(`profile.subscription.plan_${params.targetPlan}`) })}
                        </h1>
                        <div className="mb-6 flex items-baseline gap-1">
                            <span className="text-2xl font-bold text-[#29D8D5]">{amountLabel}</span>
                            <span className="text-sm text-[var(--ohnix-text-muted)]">/ {cycleLabel}</span>
                        </div>

                        <EpaycoCardForm
                            publicKey={params.publicKey}
                            email={user?.email}
                            docTypes={params.docTypes}
                            submitLabel={t("auto_renew.checkout.submit", "Pagar {{amount}} y activar renovación automática", { amount: amountLabel })}
                            consentText={t(
                                "auto_renew.checkout.consent",
                                "Al pagar autorizas a Ohnix a guardar esta tarjeta y cobrarle automáticamente {{amount}} cada {{cycle}} para renovar tu plan, hasta que desactives la renovación automática en Facturación. Te avisaremos por email antes de cada cobro.",
                                { amount: amountLabel, cycle: cycleLabel }
                            )}
                            onSubmit={handlePay}
                        />

                        <button
                            onClick={backToBilling}
                            className="mt-4 block w-full text-center text-xs text-[var(--ohnix-text-muted)] underline hover:text-[var(--ohnix-text-primary)]"
                        >
                            {t("auto_renew.checkout.other_methods", "Prefiero pagar con PSE u otro medio (sin renovación automática)")}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default CardCheckout;
