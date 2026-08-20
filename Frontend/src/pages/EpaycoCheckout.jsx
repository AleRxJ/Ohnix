// Frontend/src/pages/EpaycoCheckout.jsx
//
// Dedicated checkout page for ePayco (Colombia only).
//
// Flow:
//  1. Reads requestId from the query string
//  2. Fetches checkout params from the backend (JWT-authenticated)
//  3. Dynamically loads the ePayco JS widget and opens it embedded/onpage
//     (external: "false") so setHooks (onResponse/onClosed) actually fires -
//     the customer never leaves this page, unlike the old external/Standard
//     redirect flow.
//  4. Starts background polling: on a clean success, redirects immediately
//     to /billing/payment-success. That's the only outcome this poll acts
//     on by itself - a rejection is deliberately NOT treated as final here,
//     because ePayco's own onpage widget shows its own "Transacción
//     Rechazada" screen with a "Reintentar" button, letting the customer
//     submit a different card in the SAME session. Reacting to that first
//     attempt would yank the widget away mid-retry.
//  5. onClosed is what actually decides "this checkout is over": if the
//     widget never reported any result at all, it self-reports the
//     abandonment (so a genuinely-abandoned checkout doesn't sit blocking
//     retries for the full 48h paymentStatus-pending backstop); otherwise
//     (closed after at least one real attempt, retried or not) it hands off
//     to /billing/payment-success, which shows whatever the current truth
//     actually is.

import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Spin } from "antd";
import { subscriptionService } from "../services/subscriptionService";
import { api } from "../api/api";
import useI18n from "../hooks/useI18n";

const EPAYCO_SCRIPT_URL = "https://checkout.epayco.co/checkout.js";
const EPAYCO_SCRIPT_ID = "epayco-checkout-script";

const POLL_INTERVAL_MS = 4000;

const EpaycoCheckout = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { t } = useI18n();

    const requestId = searchParams.get("requestId") || "";

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [polling, setPolling] = useState(false);

    const handlerRef = useRef(null);
    const pollTimerRef = useRef(null);
    // True once ePayco has told us ANYTHING at all - onResponse firing (even
    // for a rejected attempt the customer might still retry within the same
    // widget session), the poll below catching a completed activation, or an
    // explicit "Cancelar y volver" click. onClosed uses this to tell a real
    // abandonment (never got any result) apart from the widget concluding
    // after a real attempt - see onClosed below for why that distinction,
    // not this poll, is what actually decides when the checkout is done.
    const gotResponseRef = useRef(false);

    const stopPolling = () => {
        if (pollTimerRef.current) {
            clearTimeout(pollTimerRef.current);
            pollTimerRef.current = null;
        }
        setPolling(false);
    };

    const startPolling = (rid) => {
        if (!rid) return;
        setPolling(true);

        const tick = async () => {
            // No upper bound on how long this keeps polling while the page
            // stays open. It used to give up after ~92s and either strand
            // the customer or (in an earlier version of this fix) navigate
            // them away on a definite rejection - both wrong once you
            // account for ePayco's own onpage widget having its own
            // multi-attempt retry flow: a rejected card shows ePayco's own
            // "Transacción Rechazada" screen with a "Reintentar" button
            // (confirmed against a real test), letting the customer submit
            // a second, different card in the SAME widget session. Reacting
            // to that first attempt's rejection - whether by navigating
            // away outright or by treating a stale poll count as "done" -
            // would yank the still-open widget out from under someone
            // mid-retry. onClosed (below) is the only reliable "the whole
            // session is actually over" signal; this poll's only job is to
            // catch a clean SUCCESS as early as possible, not to guess when
            // to give up.

            try {
                const res = await subscriptionService.getUpgradeCheckoutStatus(rid);
                const { request, targetPlanActive } = res?.data || {};

                if (request?.status === "closed" && targetPlanActive) {
                    // Plan activated — redirect to success automatically.
                    // Success is always final (no retry flow applies once
                    // paid), so this is the one outcome safe to act on
                    // immediately instead of waiting for onClosed.
                    gotResponseRef.current = true;
                    navigate(
                        `/billing/payment-success?requestId=${encodeURIComponent(rid)}`,
                        { replace: true }
                    );
                    return;
                }
            } catch {
                // Ignore errors, keep polling
            }

            pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
        };

        pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    };

    useEffect(() => {
        if (!requestId) {
            setError("requestId no encontrado en la URL.");
            setLoading(false);
            return;
        }

        let isMounted = true;

        const init = async () => {
            try {
                const response = await subscriptionService.getEpaycoCheckoutParams(requestId);
                const params = response?.data;

                if (!isMounted) return;

                if (!params?.publicKey || !params?.reference) {
                    throw new Error("Los parámetros de pago están incompletos. Intenta de nuevo.");
                }

                const openWidget = () => {
                    if (!isMounted) return;
                    const handler = window.ePayco.checkout.configure({
                        key: params.publicKey,
                        test: params.test === "TRUE",
                    });

                    handlerRef.current = handler;

                    // onpage (external: "false") keeps the checkout embedded on
                    // this page instead of navigating the browser away to
                    // ePayco's own hosted page - that's what makes setHooks
                    // below actually fire; ePayco's docs are explicit that
                    // these hooks (onClosed in particular) only exist for the
                    // onpage implementation type, not "external"/Standard.
                    if (typeof handler.setHooks === "function") {
                        handler.setHooks({
                            onResponse: (response) => {
                                gotResponseRef.current = true;
                                // ePayco's docs don't pin down this callback's
                                // exact field names, so check every plausible
                                // one defensively - reportEpaycoTransactionReference
                                // is a no-op if this is empty/wrong, never
                                // harmful either way.
                                const refPayco =
                                    response?.x_ref_payco ||
                                    response?.ref_payco ||
                                    response?.data?.x_ref_payco ||
                                    response?.data?.ref_payco ||
                                    "";
                                if (refPayco) {
                                    subscriptionService
                                        .reportEpaycoTransactionReference(requestId, refPayco)
                                        .catch(() => {});
                                }
                            },
                            onClosed: () => {
                                if (!isMounted) return;

                                if (!gotResponseRef.current) {
                                    // Closed with no transaction result ever
                                    // reported - a real abandonment. Best-effort:
                                    // if this fails, the 48h backstop in
                                    // resolvePendingPaymentStatus still applies,
                                    // so nothing is lost, just slower.
                                    subscriptionService
                                        .reportEpaycoCheckoutClosed(requestId)
                                        .catch(() => {});
                                    stopPolling();
                                    navigate("/billing");
                                    return;
                                }

                                // The widget concluded after at least one real
                                // attempt - whether that means a rejection the
                                // customer chose not to retry, ePayco's own
                                // 10s auto-close after showing a result, or a
                                // retry that already succeeded. This is the
                                // one reliable "the whole session is actually
                                // over" signal (see the long comment in tick()
                                // above for why the poll itself must not act
                                // on an interim rejection - the customer may
                                // still be mid-retry with a different card).
                                // Hand off to PaymentSuccess.jsx, whose own
                                // poll re-checks paymentStatus and renders
                                // whatever the current truth actually is.
                                stopPolling();
                                navigate(
                                    `/billing/payment-success?requestId=${encodeURIComponent(requestId)}`,
                                    { replace: true }
                                );
                            },
                        });
                    }

                    handler.open({
                        name: params.name,
                        description: params.description,
                        invoice: params.reference,
                        currency: params.currency,
                        amount: params.amount,
                        tax_base: "0",
                        tax: "0",
                        country: "CO",
                        lang: "es",
                        external: "false",
                        response: params.responseUrl,
                        confirmation: params.confirmationUrl,
                        email_billing: params.email,
                        extra1: params.extra1,
                        extra2: params.extra2,
                        extra3: params.extra3,
                    });

                    if (isMounted) {
                        setLoading(false);
                        startPolling(requestId);
                    }
                };

                const existingScript = document.getElementById(EPAYCO_SCRIPT_ID);
                if (existingScript && window.ePayco) {
                    openWidget();
                    return;
                }

                const script = document.createElement("script");
                script.id = EPAYCO_SCRIPT_ID;
                script.src = EPAYCO_SCRIPT_URL;
                script.async = true;
                script.onload = () => { if (isMounted) openWidget(); };
                script.onerror = () => {
                    if (!isMounted) return;
                    setError(
                        "No se pudo cargar la pasarela de pago ePayco. " +
                        "Verifica tu conexión e intenta de nuevo."
                    );
                    setLoading(false);
                };
                document.head.appendChild(script);

            } catch (err) {
                if (!isMounted) return;
                setError(
                    err?.response?.data?.message ||
                    err?.message ||
                    "Error al cargar los parámetros de pago."
                );
                setLoading(false);
            }
        };

        init();

        return () => {
            isMounted = false;
            stopPolling();
        };
    }, [requestId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Independent, SDK-agnostic fallback for real abandonment: whether or
    // not ePayco's own onClosed hook exists/fires in this widget version
    // (unverified - see EpaycoCheckout.jsx's module comment), the browser
    // itself always fires pagehide when the customer actually leaves this
    // page (closes the tab, hits back, types a new URL) with nothing
    // resolved yet. A normal axios/fetch call gets killed mid-flight during
    // page teardown, so this uses sendBeacon - built exactly for "fire this
    // request even as the page unloads". No body/headers needed: the
    // endpoint only reads :id from the URL, and sendBeacon still carries
    // the session cookie cross-origin the same way api.js's
    // withCredentials does for every other request.
    useEffect(() => {
        const reportAbandonmentViaBeacon = () => {
            if (gotResponseRef.current || !requestId) return;
            if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;
            navigator.sendBeacon(
                `${api.defaults.baseURL}/subscriptions/me/upgrade-requests/${requestId}/epayco-checkout-closed`
            );
        };

        window.addEventListener("pagehide", reportAbandonmentViaBeacon);
        return () => window.removeEventListener("pagehide", reportAbandonmentViaBeacon);
    }, [requestId]);

    // Explicit "Cancelar y volver" click - the clearest possible abandonment
    // signal there is, so report it immediately instead of leaving it to
    // onClosed/pagehide to eventually notice. Marking gotResponseRef here
    // too keeps those other two paths from redundantly reporting it again
    // (harmless either way since the backend call is idempotent, but no
    // reason to fire it three times for one cancellation).
    const handleCancelAndReturn = () => {
        gotResponseRef.current = true;
        if (requestId) {
            subscriptionService.reportEpaycoCheckoutClosed(requestId).catch(() => {});
        }
        stopPolling();
        navigate("/billing");
    };

    if (error) {
        return (
            <div className="min-h-screen bg-[var(--ohnix-bg-alt)] text-[var(--ohnix-text-primary)] flex flex-col items-center justify-center gap-5 px-4">
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 max-w-md w-full text-center">
                    <p className="text-red-300 text-sm font-medium mb-4">{error}</p>
                    <button
                        onClick={() => navigate("/billing")}
                        className="px-5 py-2 rounded-lg bg-[#29D8D5] text-[#021314] font-medium text-sm hover:bg-[#44F3F0] transition-colors"
                    >
                        Volver a facturación
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--ohnix-bg-alt)] text-[var(--ohnix-text-primary)] flex flex-col items-center justify-center gap-6 px-4">
            {loading && (
                <div className="flex flex-col items-center gap-4">
                    <Spin size="large" />
                    <p className="text-[var(--ohnix-text-muted)] text-sm text-center max-w-xs">
                        Cargando la pasarela de pago ePayco...
                        <br />
                        <span className="text-xs text-[#6b7a80] mt-1 block">
                            Si el formulario no aparece, verifica que tu navegador no
                            esté bloqueando ventanas emergentes.
                        </span>
                    </p>
                    <button
                        onClick={handleCancelAndReturn}
                        className="mt-2 text-xs text-[var(--ohnix-text-muted)] underline hover:text-[var(--ohnix-text-primary)] transition-colors"
                    >
                        Cancelar y volver
                    </button>
                </div>
            )}

            {!loading && (
                <div className="flex flex-col items-center gap-4 text-center max-w-sm">
                    <p className="text-[var(--ohnix-text-muted)] text-sm">
                        Completa el pago en la ventana de ePayco.
                    </p>

                    {polling && (
                        <div className="flex items-center gap-2 rounded-full border border-[#29D8D5]/20 bg-[#29D8D5]/8 px-4 py-2">
                            <div className="h-2 w-2 animate-pulse rounded-full bg-[#29D8D5]" />
                            <span className="text-xs text-[#29D8D5]">
                                Verificando pago automáticamente...
                            </span>
                        </div>
                    )}

                    <button
                        onClick={handleCancelAndReturn}
                        className="text-xs text-[#6b7a80] underline hover:text-[var(--ohnix-text-primary)] transition-colors"
                    >
                        Cancelar y volver
                    </button>
                </div>
            )}
        </div>
    );
};

export default EpaycoCheckout;
