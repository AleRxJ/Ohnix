// Frontend/src/pages/EpaycoCheckout.jsx
//
// Dedicated checkout page for ePayco (Colombia only).
//
// Flow:
//  1. Reads requestId from the query string
//  2. Fetches checkout params from the backend (JWT-authenticated)
//  3. Dynamically loads the ePayco JS widget and opens it automatically
//  4. Starts background polling: as soon as the ePayco confirmation webhook
//     fires and the plan is activated, the page redirects automatically to
//     /billing/payment-success — no action required from the user.
//  5. Primary path: ePayco also redirects the browser via EPAYCO_RESPONSE_URL.

import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Spin } from "antd";
import { subscriptionService } from "../services/subscriptionService";
import useI18n from "../hooks/useI18n";

const EPAYCO_SCRIPT_URL = "https://checkout.epayco.co/checkout.js";
const EPAYCO_SCRIPT_ID = "epayco-checkout-script";

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 23; // ~92 s total

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
    const pollCountRef = useRef(0);

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
        pollCountRef.current = 0;

        const tick = async () => {
            if (pollCountRef.current >= POLL_MAX_ATTEMPTS) {
                setPolling(false);
                return;
            }
            pollCountRef.current += 1;

            try {
                const res = await subscriptionService.getUpgradeCheckoutStatus(rid);
                const { request, targetPlanActive } = res?.data || {};

                if (request?.status === "closed" && targetPlanActive) {
                    // Plan activated — redirect to success automatically
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
                        external: "true",
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
                        onClick={() => navigate("/billing")}
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
                        onClick={() => { stopPolling(); navigate("/billing"); }}
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
