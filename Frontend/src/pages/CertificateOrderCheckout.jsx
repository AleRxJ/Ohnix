// Frontend/src/pages/CertificateOrderCheckout.jsx
//
// Checkout page for a Viafirma CertificateOrder purchase (1 or 2 years) -
// same on-page ePayco widget pattern as EpaycoCheckout.jsx (see that file's
// own module comment for the full reasoning on why onpage/external:"false"
// + onClosed, not the poll, decides when a checkout session is actually
// over). Kept as its own page rather than reusing EpaycoCheckout.jsx since
// that one is hardcoded to PlanUpgradeRequest's endpoints/fields.

import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Spin } from "antd";
import { companyService } from "../services/companyService";
import useI18n from "../hooks/useI18n";

const EPAYCO_SCRIPT_URL = "https://checkout.epayco.co/checkout.js";
const EPAYCO_SCRIPT_ID = "epayco-checkout-script";
const POLL_INTERVAL_MS = 4000;
const FISCAL_SETUP_PATH = "/fiscal-setup";

const CertificateOrderCheckout = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { t } = useI18n();

    const orderId = searchParams.get("orderId") || "";

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [polling, setPolling] = useState(false);

    const pollTimerRef = useRef(null);
    const gotResponseRef = useRef(false);

    const stopPolling = () => {
        if (pollTimerRef.current) {
            clearTimeout(pollTimerRef.current);
            pollTimerRef.current = null;
        }
        setPolling(false);
    };

    const startPolling = (oid) => {
        if (!oid) return;
        setPolling(true);

        const tick = async () => {
            try {
                const res = await companyService.getMyCertificateOrders();
                const orders = res?.data?.orders || [];
                const order = orders.find((o) => o.id === oid);

                if (order?.paymentStatus === "paid") {
                    gotResponseRef.current = true;
                    navigate(`${FISCAL_SETUP_PATH}/certificate-payment-response?orderId=${encodeURIComponent(oid)}`, { replace: true });
                    return;
                }
            } catch {
                // Ignore, keep polling
            }
            pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
        };

        pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    };

    useEffect(() => {
        if (!orderId) {
            setError(t("fiscal_setup.certificate_checkout_missing_order"));
            setLoading(false);
            return;
        }

        let isMounted = true;

        const init = async () => {
            try {
                const response = await companyService.getMyCertificateOrderCheckoutParams(orderId);
                const params = response?.data;
                if (!isMounted) return;

                if (!params?.publicKey || !params?.reference) {
                    throw new Error(t("fiscal_setup.certificate_checkout_incomplete_params"));
                }

                const openWidget = () => {
                    if (!isMounted) return;
                    const handler = window.ePayco.checkout.configure({
                        key: params.publicKey,
                        test: params.test === "TRUE",
                    });

                    if (typeof handler.setHooks === "function") {
                        handler.setHooks({
                            onResponse: (response) => {
                                gotResponseRef.current = true;
                                // The server-to-server confirmation webhook
                                // can't reach a localhost/private dev
                                // backend at all (and can miss a Render cold
                                // start even in prod) - this gives the
                                // live-query fallback a real ref_payco to
                                // check instead of getting stuck on our own
                                // placeholder reference forever.
                                const refPayco =
                                    response?.x_ref_payco ||
                                    response?.ref_payco ||
                                    response?.data?.x_ref_payco ||
                                    response?.data?.ref_payco ||
                                    "";
                                if (refPayco) {
                                    companyService
                                        .reportMyCertificateOrderTransactionReference(orderId, refPayco)
                                        .catch(() => {});
                                }
                            },
                            onClosed: () => {
                                if (!isMounted) return;
                                stopPolling();
                                if (!gotResponseRef.current) {
                                    // Closed with no transaction result ever
                                    // reported - a real abandonment. Best-effort:
                                    // if this fails, the 48h backstop in
                                    // resolvePendingCertificateOrderPaymentStatus
                                    // still applies, so nothing is lost, just slower.
                                    companyService.reportMyCertificateOrderCheckoutClosed(orderId).catch(() => {});
                                    navigate(FISCAL_SETUP_PATH);
                                    return;
                                }
                                // The widget concluded after at least one real
                                // attempt - same "don't yank a mid-retry
                                // widget" reasoning as EpaycoCheckout.jsx: this
                                // is the one reliable "session is actually
                                // over" signal, so hand off to the response
                                // page instead of treating an interim
                                // rejection as final here.
                                navigate(`${FISCAL_SETUP_PATH}/certificate-payment-response?orderId=${encodeURIComponent(orderId)}`, { replace: true });
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
                        startPolling(orderId);
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
                    setError(t("fiscal_setup.certificate_checkout_script_error"));
                    setLoading(false);
                };
                document.head.appendChild(script);
            } catch (err) {
                if (!isMounted) return;
                setError(err?.response?.data?.message || err?.message || t("fiscal_setup.certificate_checkout_load_error"));
                setLoading(false);
            }
        };

        init();

        return () => {
            isMounted = false;
            stopPolling();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId]);

    // NOT mirroring EpaycoCheckout.jsx's pagehide/sendBeacon abandonment
    // fallback here - confirmed (2026-09-09, a real production card payment)
    // that ePayco's onpage widget genuinely navigates the WHOLE browser away
    // to secure.epayco.co to process a real card (this matches ePayco's own
    // official reference implementation, so it isn't a config bug on our
    // side - see epayco/resources' Angular sample, which uses these exact
    // same handler.open params). That navigation fires pagehide with
    // gotResponseRef.current still false (onResponse never gets a chance to
    // run first), so a beacon here would race the in-flight payment and
    // wrongly cancel an order that's actually about to be approved - which
    // is exactly what happened. billing/EpaycoCheckout.jsx likely carries
    // the same latent risk; not touched here since only this flow has been
    // confirmed broken by it. onClosed below and the explicit "Cancelar"
    // button remain safe: neither fires during this kind of navigation.

    const handleCancelAndReturn = () => {
        gotResponseRef.current = true;
        if (orderId) {
            companyService.reportMyCertificateOrderCheckoutClosed(orderId).catch(() => {});
        }
        stopPolling();
        navigate(FISCAL_SETUP_PATH);
    };

    if (error) {
        return (
            <div className="min-h-screen bg-[var(--ohnix-bg-alt)] text-[var(--ohnix-text-primary)] flex flex-col items-center justify-center gap-5 px-4">
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 max-w-md w-full text-center">
                    <p className="text-red-300 text-sm font-medium mb-4">{error}</p>
                    <button
                        onClick={handleCancelAndReturn}
                        className="px-5 py-2 rounded-lg bg-[#29D8D5] text-[#021314] font-medium text-sm hover:bg-[#44F3F0] transition-colors"
                    >
                        {t("fiscal_setup.certificate_checkout_back")}
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
                        {t("fiscal_setup.certificate_checkout_loading")}
                    </p>
                    <button
                        onClick={handleCancelAndReturn}
                        className="mt-2 text-xs text-[var(--ohnix-text-muted)] underline hover:text-[var(--ohnix-text-primary)] transition-colors"
                    >
                        {t("fiscal_setup.certificate_checkout_cancel")}
                    </button>
                </div>
            )}

            {!loading && (
                <div className="flex flex-col items-center gap-4 text-center max-w-sm">
                    <p className="text-[var(--ohnix-text-muted)] text-sm">{t("fiscal_setup.certificate_checkout_in_progress")}</p>
                    {polling && (
                        <div className="flex items-center gap-2 rounded-full border border-[#29D8D5]/20 bg-[#29D8D5]/8 px-4 py-2">
                            <div className="h-2 w-2 animate-pulse rounded-full bg-[#29D8D5]" />
                            <span className="text-xs text-[#29D8D5]">{t("fiscal_setup.certificate_checkout_verifying")}</span>
                        </div>
                    )}
                    <button
                        onClick={handleCancelAndReturn}
                        className="text-xs text-[#6b7a80] underline hover:text-[var(--ohnix-text-primary)] transition-colors"
                    >
                        {t("fiscal_setup.certificate_checkout_cancel")}
                    </button>
                </div>
            )}
        </div>
    );
};

export default CertificateOrderCheckout;
