// Frontend/src/components/billing/PaymentMethodCard.jsx
//
// "Método de pago" section of Billing: the stored card, the next automatic
// charge, the automatic-renewal switch and the failed-charge banner.
// Rules mirror Backend/services/subscriptionAutoRenew.service.js - the card
// can be REPLACED any time, but only DELETED once automatic renewal is off
// (turning it off means the plan simply ends at its current end date).

import { useCallback, useEffect, useState } from "react";
import { Button, Modal, Switch, Tooltip } from "antd";
import { CreditCardOutlined, WarningOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { useAuth } from "../../hooks/useAuth";
import { subscriptionService } from "../../services/subscriptionService";
import EpaycoCardForm from "./EpaycoCardForm";

const BRAND_LABELS = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    diners: "Diners Club",
    discover: "Discover",
};

const formatAmount = (amount, currency, locale) => {
    const cur = `${currency || "cop"}`.toUpperCase();
    const value = cur === "COP" ? amount : amount / 100; // Stripe usd/eur are in cents
    try {
        return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CO", {
            style: "currency",
            currency: cur,
            maximumFractionDigits: cur === "COP" ? 0 : 2,
        }).format(value);
    } catch {
        return `${value} ${cur}`;
    }
};

const formatDate = (date, locale) =>
    new Date(date).toLocaleDateString(locale === "en" ? "en-US" : "es-CO", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });

const PaymentMethodCard = ({ endsAt, disabled = false, onChanged }) => {
    const { t, currentLanguage } = useI18n();
    const { user } = useAuth();
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [cardModalOpen, setCardModalOpen] = useState(false);

    const load = useCallback(async () => {
        try {
            const response = await subscriptionService.getMyPaymentMethod();
            setInfo(response?.data || null);
        } catch {
            setInfo(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Back from Stripe's "cambiar tarjeta" page (?card=updated) - the webhook
    // may land a moment later, so refresh once more shortly after.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get("card") === "updated") {
            toast.success(t("auto_renew.card_updated", "Tarjeta actualizada"));
            const timer = setTimeout(load, 4000);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [load, t]);

    const refreshAll = async () => {
        await load();
        onChanged?.();
    };

    const card = info?.card;
    const brand = card ? BRAND_LABELS[card.brand] || (card.brand ? card.brand.toUpperCase() : t("auto_renew.card", "Tarjeta")) : "";

    const handleToggle = (enabled) => {
        const apply = async () => {
            setBusy(true);
            try {
                await subscriptionService.setMyAutoRenew(enabled);
                toast.success(
                    enabled
                        ? t("auto_renew.enabled_toast", "Renovación automática activada")
                        : t("auto_renew.disabled_toast", "Renovación automática desactivada")
                );
                await refreshAll();
            } catch (error) {
                toast.error(error?.response?.data?.message || t("auto_renew.generic_error", "No se pudo completar la acción."));
            } finally {
                setBusy(false);
            }
        };

        if (enabled) {
            apply();
            return;
        }
        Modal.confirm({
            title: t("auto_renew.disable_confirm_title", "¿Desactivar la renovación automática?"),
            content: endsAt
                ? t("auto_renew.disable_confirm_body", "No volveremos a cobrar tu tarjeta. Tu plan seguirá activo hasta el {{date}} y después tendrás que renovarlo manualmente.", {
                      date: formatDate(endsAt, currentLanguage),
                  })
                : t("auto_renew.disable_confirm_body_no_date", "No volveremos a cobrar tu tarjeta automáticamente."),
            okText: t("auto_renew.disable_confirm_ok", "Desactivar"),
            cancelText: t("auto_renew.cancel", "Cancelar"),
            okButtonProps: { danger: true },
            onOk: apply,
        });
    };

    const handleChangeCard = async () => {
        if (card?.provider === "stripe") {
            setBusy(true);
            try {
                const response = await subscriptionService.updateMyPaymentMethod({ provider: "stripe" });
                const url = response?.data?.checkoutUrl;
                if (url) window.location.assign(url);
            } catch (error) {
                toast.error(error?.response?.data?.message || t("auto_renew.generic_error", "No se pudo completar la acción."));
            } finally {
                setBusy(false);
            }
            return;
        }
        setCardModalOpen(true);
    };

    const handleSubmitNewCard = async (payload) => {
        const response = await subscriptionService.updateMyPaymentMethod({ provider: "epayco", ...payload });
        setCardModalOpen(false);
        const outcome = response?.data?.outcome?.status;
        if (outcome === "paid") {
            toast.success(t("auto_renew.card_saved_and_charged", "Tarjeta guardada y plan renovado."));
        } else if (outcome === "failed" || outcome === "exhausted") {
            toast.error(t("auto_renew.card_saved_charge_failed", "Guardamos la tarjeta, pero el cobro fue rechazado. Prueba con otra tarjeta."));
        } else {
            toast.success(t("auto_renew.card_updated", "Tarjeta actualizada"));
        }
        await refreshAll();
    };

    const handleDeleteCard = () => {
        Modal.confirm({
            title: t("auto_renew.delete_confirm_title", "¿Eliminar la tarjeta guardada?"),
            okText: t("auto_renew.delete", "Eliminar tarjeta"),
            cancelText: t("auto_renew.cancel", "Cancelar"),
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await subscriptionService.deleteMyPaymentMethod();
                    toast.success(t("auto_renew.deleted_toast", "Tarjeta eliminada"));
                    await refreshAll();
                } catch (error) {
                    toast.error(error?.response?.data?.message || t("auto_renew.generic_error", "No se pudo completar la acción."));
                }
            },
        });
    };

    if (loading || !info) return null;
    // Nothing to show or offer (no card, and ePayco card enrollment unavailable).
    if (!card && !info.canUseEpaycoCard) return null;

    const controlsDisabled = disabled || busy;

    return (
        <div className="mt-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 sm:p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--ohnix-text-primary)]">
                <CreditCardOutlined className="text-[#44F3F0]" />
                {t("auto_renew.section_title", "Método de pago")}
            </div>

            {info.failedAttempts > 0 && info.autoRenew && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-[var(--ohnix-text-primary)]">
                    <WarningOutlined className="mt-0.5 shrink-0 text-red-400" />
                    <span>
                        {info.nextAttemptAt
                            ? t("auto_renew.failed_banner", "No pudimos cobrar tu tarjeta. Volveremos a intentarlo el {{date}}. Actualiza tu tarjeta para evitar que tu cuenta quede en pausa.", {
                                  date: formatDate(info.nextAttemptAt, currentLanguage),
                              })
                            : t("auto_renew.failed_banner_no_date", "No pudimos cobrar tu tarjeta. Actualízala para renovar tu plan.")}
                    </span>
                </div>
            )}

            {card ? (
                <>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-[var(--ohnix-text-primary)]">
                                {brand} •••• {card.last4 || "····"}
                            </div>
                            {card.expMonth && card.expYear ? (
                                <div className="text-xs text-[var(--ohnix-text-muted)]">
                                    {t("auto_renew.expires", "Vence {{date}}", {
                                        date: `${String(card.expMonth).padStart(2, "0")}/${card.expYear}`,
                                    })}
                                </div>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button size="small" onClick={handleChangeCard} disabled={controlsDisabled}>
                                {t("auto_renew.change_card", "Cambiar tarjeta")}
                            </Button>
                            <Tooltip
                                title={info.autoRenew ? t("auto_renew.delete_blocked", "Desactiva la renovación automática para poder eliminar la tarjeta.") : ""}
                            >
                                <Button size="small" danger onClick={handleDeleteCard} disabled={controlsDisabled || info.autoRenew}>
                                    {t("auto_renew.delete", "Eliminar tarjeta")}
                                </Button>
                            </Tooltip>
                        </div>
                    </div>

                    <div className="mt-4 flex items-start justify-between gap-3 border-t border-[var(--ohnix-line-4)] pt-3">
                        <div className="min-w-0">
                            <div className="text-sm text-[var(--ohnix-text-primary)]">
                                {t("auto_renew.toggle_label", "Renovación automática")}
                            </div>
                            <div className="text-xs text-[var(--ohnix-text-muted)]">
                                {info.autoRenew && info.nextCharge
                                    ? t("auto_renew.next_charge", "Próximo cobro: {{amount}} el {{date}}", {
                                          amount: formatAmount(info.nextCharge.amount, info.nextCharge.currency, currentLanguage),
                                          date: formatDate(info.nextCharge.date, currentLanguage),
                                      })
                                    : info.autoRenew
                                      ? t("auto_renew.on_no_date", "Tu tarjeta se cobrará automáticamente en cada renovación.")
                                      : t("auto_renew.off_hint", "Desactivada: tu plan no se cobrará solo; tendrás que renovarlo manualmente.")}
                            </div>
                        </div>
                        <Switch checked={info.autoRenew} onChange={handleToggle} disabled={controlsDisabled} loading={busy} />
                    </div>
                </>
            ) : (
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-[var(--ohnix-text-muted)]">
                        {t("auto_renew.no_card", "No tienes una tarjeta guardada. Agrégala para que tu plan se renueve automáticamente, sin pagos manuales.")}
                    </div>
                    <Button size="small" type="primary" onClick={() => setCardModalOpen(true)} disabled={controlsDisabled} className="!bg-[#29D8D5] !text-[#021314] !border-0 !font-semibold shrink-0">
                        {t("auto_renew.add_card", "Agregar tarjeta")}
                    </Button>
                </div>
            )}

            <Modal
                open={cardModalOpen}
                onCancel={() => setCardModalOpen(false)}
                footer={null}
                destroyOnClose
                title={card ? t("auto_renew.change_card", "Cambiar tarjeta") : t("auto_renew.add_card", "Agregar tarjeta")}
            >
                <EpaycoCardForm
                    publicKey={info.epayco?.publicKey}
                    email={user?.email}
                    docTypes={info.docTypes}
                    submitLabel={t("auto_renew.save_card", "Guardar tarjeta")}
                    consentText={t(
                        "auto_renew.save_consent",
                        "Autorizas a Ohnix a cobrar automáticamente esta tarjeta en cada renovación de tu plan, hasta que desactives la renovación automática. Si tu plan está vencido, haremos el cobro de inmediato."
                    )}
                    onSubmit={handleSubmitNewCard}
                />
            </Modal>
        </div>
    );
};

export default PaymentMethodCard;
