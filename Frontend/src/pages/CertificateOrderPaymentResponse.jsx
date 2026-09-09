// Frontend/src/pages/CertificateOrderPaymentResponse.jsx
//
// Landing page after a CertificateOrder ePayco checkout concludes (either
// the on-page widget's onClosed, or a browser redirect back from a
// PSE/bank-redirect method - see certificateOrderPayment.controller.js's
// handleCertificateOrderEpaycoResponse). Polls the order's own paymentStatus
// instead of trusting the redirect itself, same "webhook is truth" rule as
// PaymentSuccess.jsx - just a much smaller page since there's no onboarding
// checklist attached to a certificate purchase.

import React, { useEffect, useState } from "react";
import { Button, Card, Spin } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { companyService } from "../services/companyService";
import useI18n from "../hooks/useI18n";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 15;
const FISCAL_SETUP_PATH = "/fiscal-setup";

const FAILED_STATUSES = ["rejected", "failed", "amount_mismatch", "expired", "cancelled"];

const CertificateOrderPaymentResponse = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { t } = useI18n();
    const orderId = searchParams.get("orderId") || "";

    const [loading, setLoading] = useState(true);
    const [order, setOrder] = useState(null);
    const [timedOut, setTimedOut] = useState(false);

    useEffect(() => {
        if (!orderId) {
            setLoading(false);
            return undefined;
        }

        // Redirect-based methods (PSE, etc.) never touch the on-page
        // widget's onResponse hook at all - the browser fully navigates
        // away to the bank and back through this exact URL instead. ePayco
        // forwards ref_payco in that redirect (see
        // handleCertificateOrderEpaycoResponse), so report it here as the
        // same kind of best-effort backstop EpaycoResponseRedirect.jsx uses
        // for subscriptions: it only ever fills in a lookup key, never
        // activates anything by itself.
        const refPayco = searchParams.get("ref_payco") || searchParams.get("x_ref_payco") || "";
        if (refPayco) {
            companyService.reportMyCertificateOrderTransactionReference(orderId, refPayco).catch(() => {});
        }

        let isMounted = true;
        let pollTimer;
        let pollCount = 0;

        const load = async () => {
            try {
                const response = await companyService.getMyCertificateOrders();
                if (!isMounted) return;
                const found = (response?.data?.orders || []).find((o) => o.id === orderId) || null;
                setOrder(found);

                if (found?.paymentStatus === "paid" || FAILED_STATUSES.includes(found?.paymentStatus)) {
                    setLoading(false);
                    return;
                }

                if (pollCount < MAX_POLLS) {
                    pollCount += 1;
                    pollTimer = setTimeout(load, POLL_INTERVAL_MS);
                } else {
                    setTimedOut(true);
                    setLoading(false);
                }
            } catch {
                if (isMounted) setLoading(false);
            }
        };

        load();
        return () => {
            isMounted = false;
            if (pollTimer) clearTimeout(pollTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId]);

    const paid = order?.paymentStatus === "paid";
    const failed = FAILED_STATUSES.includes(order?.paymentStatus);

    return (
        <div className="min-h-screen bg-[var(--ohnix-bg-alt)] px-4 py-12 text-[var(--ohnix-text-primary)]">
            <div className="mx-auto max-w-md">
                <Card className="!rounded-3xl !border !border-[var(--ohnix-line-4)] !bg-[var(--ohnix-surface-card)]">
                    {loading && !timedOut && (
                        <div className="flex flex-col items-center gap-4 py-8 text-center">
                            <Spin size="large" />
                            <p className="text-sm text-[var(--ohnix-text-muted)]">{t("fiscal_setup.certificate_payment_response_confirming")}</p>
                        </div>
                    )}

                    {!loading && paid && (
                        <div className="flex flex-col items-center gap-4 py-6 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/40 bg-emerald-500/10">
                                <CheckCircleOutlined className="text-2xl text-emerald-300" />
                            </div>
                            <h2 className="m-0 text-xl font-bold">{t("fiscal_setup.certificate_payment_response_success_title")}</h2>
                            <p className="mb-0 text-sm text-[var(--ohnix-text-muted)]">{t("fiscal_setup.certificate_payment_response_success_body")}</p>
                            <Button type="primary" className="mt-2" onClick={() => navigate(FISCAL_SETUP_PATH)}>
                                {t("fiscal_setup.certificate_payment_response_continue")}
                            </Button>
                        </div>
                    )}

                    {!loading && failed && (
                        <div className="flex flex-col items-center gap-4 py-6 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/40 bg-red-500/10">
                                <CloseCircleOutlined className="text-2xl text-red-300" />
                            </div>
                            <h2 className="m-0 text-xl font-bold">{t("fiscal_setup.certificate_payment_response_failed_title")}</h2>
                            <p className="mb-0 text-sm text-[var(--ohnix-text-muted)]">{t("fiscal_setup.certificate_payment_response_failed_body")}</p>
                            <Button type="primary" className="mt-2" onClick={() => navigate(FISCAL_SETUP_PATH)}>
                                {t("fiscal_setup.certificate_payment_response_back")}
                            </Button>
                        </div>
                    )}

                    {!loading && timedOut && !paid && !failed && (
                        <div className="flex flex-col items-center gap-4 py-6 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/40 bg-amber-500/10">
                                <ClockCircleOutlined className="text-2xl text-amber-300" />
                            </div>
                            <h2 className="m-0 text-xl font-bold">{t("fiscal_setup.certificate_payment_response_pending_title")}</h2>
                            <p className="mb-0 text-sm text-[var(--ohnix-text-muted)]">{t("fiscal_setup.certificate_payment_response_pending_body")}</p>
                            <Button className="mt-2" onClick={() => navigate(FISCAL_SETUP_PATH)}>
                                {t("fiscal_setup.certificate_payment_response_back")}
                            </Button>
                        </div>
                    )}

                    {!loading && !order && !timedOut && (
                        <div className="flex flex-col items-center gap-4 py-6 text-center">
                            <p className="mb-0 text-sm text-[var(--ohnix-text-muted)]">{t("fiscal_setup.certificate_payment_response_not_found")}</p>
                            <Button className="mt-2" onClick={() => navigate(FISCAL_SETUP_PATH)}>
                                {t("fiscal_setup.certificate_payment_response_back")}
                            </Button>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default CertificateOrderPaymentResponse;
