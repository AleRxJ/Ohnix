// Frontend/src/pages/EpaycoResponseRedirect.jsx
//
// ePayco's checkout "response" URL - the browser is redirected here right
// after the customer finishes (or abandons) checkout. This used to point
// straight at the backend (see epayco.service.js/getEpaycoConfig), which on
// Render's free tier can be asleep and cold-start for 15-50+ seconds -
// meaning a customer who just paid successfully would land on Render's own
// "waking up" splash screen instead of Ohnix before ever seeing our
// "Confirmando tu pago" UI. Pointing ePayco at this static frontend route
// instead removes the backend entirely from this first hop.
//
// Every outcome - accepted, rejected, abandoned, whatever - routes to
// /billing/payment-success. That page's own poll re-checks paymentStatus on
// every cycle (see PaymentSuccess.jsx) and renders the matching dedicated
// card (celebration / rejected+retry / still-verifying) itself, so there's
// no reason to branch on the transaction state code here and split outcomes
// across two different destinations (one polished, one a bare toast+redirect
// on the plain Billing page) - that split used to exist because this page's
// pending state used to misleadingly say "Pago recibido" for a rejection
// too, which is exactly the bug this whole flow was rebuilt to fix. A single
// destination with one continuous loading -> result transition is both
// simpler and the smoother UX a payment result deserves.
import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Spin } from "antd";
import { subscriptionService } from "../services/subscriptionService";

const EpaycoResponseRedirect = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    useEffect(() => {
        const requestId =
            searchParams.get("x_extra1") ||
            searchParams.get("extra1") ||
            searchParams.get("requestId") ||
            "";

        if (!requestId) {
            navigate("/billing", { replace: true });
            return;
        }

        // ePayco's own docs confirm this redirect's query string includes
        // ref_payco - report it as a backstop in case the signed
        // confirmation webhook never lands (see
        // reportEpaycoTransactionReference for why/how this is safe: it can
        // only ever fill in a lookup key, never activate anything by
        // itself). Best-effort and non-blocking - never delays the
        // redirect below on this.
        const refPayco = searchParams.get("ref_payco") || searchParams.get("x_ref_payco") || "";
        if (refPayco) {
            subscriptionService.reportEpaycoTransactionReference(requestId, refPayco).catch(() => {});
        }

        navigate(`/billing/payment-success?requestId=${encodeURIComponent(requestId)}`, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Rendered for at most one frame before the effect above navigates away -
    // exists only so a slower device shows Ohnix's own loading state instead
    // of a blank white flash.
    return (
        <div className="min-h-screen bg-[var(--ohnix-bg-alt)] flex items-center justify-center">
            <Spin size="large" />
        </div>
    );
};

export default EpaycoResponseRedirect;
