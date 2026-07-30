// Frontend/src/pages/EpaycoCheckout.jsx
//
// Dedicated checkout page for ePayco (Colombia only).
// Loaded when the user selects "epayco" as payment method and the backend
// returns checkoutUrl pointing to /billing/epayco-checkout?requestId=...
//
// Flow:
//  1. Reads requestId from the query string
//  2. Fetches checkout params from the backend (JWT-authenticated)
//  3. Dynamically loads the ePayco JS widget script
//  4. Opens the payment modal automatically
//  5. On completion, ePayco redirects the browser to EPAYCO_RESPONSE_URL
//     which then redirects to /billing/payment-success or /billing

import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Spin } from "antd";
import { subscriptionService } from "../services/subscriptionService";
import useI18n from "../hooks/useI18n";

const EPAYCO_SCRIPT_URL = "https://checkout.epayco.co/checkout.js";
const EPAYCO_SCRIPT_ID = "epayco-checkout-script";

const EpaycoCheckout = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { t } = useI18n();

    const requestId = searchParams.get("requestId") || "";

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Keep a reference to the handler so it is not recreated on re-renders
    const handlerRef = useRef(null);

    useEffect(() => {
        if (!requestId) {
            setError("requestId no encontrado en la URL.");
            setLoading(false);
            return;
        }

        let isMounted = true;

        const init = async () => {
            try {
                // 1. Fetch checkout params from the backend
                const response = await subscriptionService.getEpaycoCheckoutParams(requestId);
                const params = response?.data;

                if (!isMounted) {
                    return;
                }

                if (!params?.publicKey || !params?.reference) {
                    throw new Error("Los parámetros de pago están incompletos. Intenta de nuevo.");
                }

                // 2. Load ePayco script (only once)
                const openWidget = () => {
                    if (!isMounted) {
                        return;
                    }

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
                        // external: "true" means ePayco will use the response and
                        // confirmation URLs set here (or from configure) instead of
                        // an embedded iframe
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
                    }
                };

                const existingScript = document.getElementById(EPAYCO_SCRIPT_ID);

                if (existingScript && window.ePayco) {
                    // Script already loaded
                    openWidget();
                    return;
                }

                const script = document.createElement("script");
                script.id = EPAYCO_SCRIPT_ID;
                script.src = EPAYCO_SCRIPT_URL;
                script.async = true;

                script.onload = () => {
                    if (!isMounted) {
                        return;
                    }
                    openWidget();
                };

                script.onerror = () => {
                    if (!isMounted) {
                        return;
                    }
                    setError(
                        "No se pudo cargar la pasarela de pago ePayco. " +
                            "Verifica tu conexión e intenta de nuevo."
                    );
                    setLoading(false);
                };

                document.head.appendChild(script);
            } catch (err) {
                if (!isMounted) {
                    return;
                }
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
        };
    }, [requestId]);

    // Error state
    if (error) {
        return (
            <div className="min-h-screen bg-[#050608] text-white flex flex-col items-center justify-center gap-5 px-4">
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
        <div className="min-h-screen bg-[#050608] text-white flex flex-col items-center justify-center gap-4 px-4">
            {loading && (
                <div className="flex flex-col items-center gap-4">
                    <Spin size="large" />
                    <p className="text-[#A9B3B8] text-sm text-center max-w-xs">
                        Cargando la pasarela de pago ePayco...
                        <br />
                        <span className="text-xs text-[#6b7a80] mt-1 block">
                            Si el formulario no aparece, verifica que tu navegador no
                            esté bloqueando ventanas emergentes.
                        </span>
                    </p>
                    <button
                        onClick={() => navigate("/billing")}
                        className="mt-2 text-xs text-[#A9B3B8] underline hover:text-white transition-colors"
                    >
                        Cancelar y volver
                    </button>
                </div>
            )}

            {/* Once the widget is open the page stays visible in the background */}
            {!loading && (
                <div className="flex flex-col items-center gap-3 text-center">
                    <p className="text-[#A9B3B8] text-sm">
                        Completa el pago en la ventana de ePayco.
                    </p>
                    <button
                        onClick={() => navigate("/billing")}
                        className="text-xs text-[#A9B3B8] underline hover:text-white transition-colors"
                    >
                        Cancelar y volver
                    </button>
                </div>
            )}
        </div>
    );
};

export default EpaycoCheckout;
