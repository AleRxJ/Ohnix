import { useEffect, useMemo, useState } from "react";
import { detectCountryCode } from "../i18n/geoLanguage";
import { pricingService } from "../services/pricingService";
import { formatCurrency } from "../utils/currency";

// Shared by every public page that shows plan prices (Precios.jsx,
// LandingPage.jsx's pricing teaser, ...) so there is exactly one
// geo-detect -> fetch -> format pipeline, instead of each page growing its
// own copy (which is exactly the "second source of truth" this hook exists
// to prevent).
const DETECTED_COUNTRY_SESSION_KEY = "ohnix_pricing_detected_country";
// Caches the resolved GET /api/v1/pricing/public response itself, not just
// the detected country - without this, every mount of this hook (landing
// teaser, then Precios.jsx, then checkout, ...) re-ran the full geo-detect
// + fetch pipeline from scratch, so a single slow/blocked request anywhere
// in that chain would flash the (now COP) static fallback again even after
// the real market price had already been resolved once this session.
const MARKET_PRICING_SESSION_KEY = "ohnix_market_pricing";

const getSessionDetectedCountry = () => {
    if (typeof window === "undefined") return null;
    try {
        return window.sessionStorage.getItem(DETECTED_COUNTRY_SESSION_KEY);
    } catch {
        return null;
    }
};

const setSessionDetectedCountry = (countryCode) => {
    if (typeof window === "undefined" || !countryCode) return;
    try {
        window.sessionStorage.setItem(DETECTED_COUNTRY_SESSION_KEY, countryCode);
    } catch {
        // Best-effort only - a failed cache write shouldn't block pricing.
    }
};

const getSessionMarketPricing = () => {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.sessionStorage.getItem(MARKET_PRICING_SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const setSessionMarketPricing = (data) => {
    if (typeof window === "undefined" || !data) return;
    try {
        window.sessionStorage.setItem(MARKET_PRICING_SESSION_KEY, JSON.stringify(data));
    } catch {
        // Best-effort only - a failed cache write shouldn't block pricing.
    }
};

// Returns { label, currency } instead of a single concatenated string
// ("$38.000 COP") - callers render `label` at whatever size fits their
// layout and `currency` as a separately-styled badge only when it's "COP"
// (the ambiguous one, since "$" alone could be COP or USD). Concatenating
// them into one string made the on-page price cards wrap awkwardly (COP
// amounts run longer digit-wise than USD/EUR ones).
const formatPlanPrice = (amount, currency) => {
    if (amount === null || amount === undefined) return null;
    return { label: formatCurrency(amount, currency), currency };
};

// Returns { marketPricing, priceByPlanKey }. `marketPricing` is null until
// resolved (network/geo lookup in flight or failed) - callers should fall
// back to their existing static locale price strings in that case, same as
// Precios.jsx and LandingPage.jsx do.
export const useMarketPricing = () => {
    // Lazy-initialized from sessionStorage so a page mounted after this
    // session already resolved a price (e.g. navigating landing -> Precios
    // -> checkout) renders the real market price immediately, instead of
    // showing the static fallback again while a redundant fetch repeats.
    const [marketPricing, setMarketPricing] = useState(getSessionMarketPricing);

    useEffect(() => {
        // Already resolved earlier this session - nothing to (re-)fetch.
        if (marketPricing) return undefined;

        let active = true;

        const resolvePricing = async () => {
            // Country (market/currency) is resolved independently of the UI
            // language - es+CO must show COP, es+ES must show EUR, es+MX
            // must show USD, so language is never used as a currency proxy.
            let countryCode = getSessionDetectedCountry();
            if (!countryCode) {
                countryCode = await detectCountryCode();
                if (countryCode) setSessionDetectedCountry(countryCode);
            }

            try {
                const response = await pricingService.getPublicPricing(countryCode);
                if (active && response?.data) {
                    setMarketPricing(response.data);
                    setSessionMarketPricing(response.data);
                }
            } catch {
                // Network/backend failure - caller stays on its static fallback prices.
            }
        };

        resolvePricing();
        return () => {
            active = false;
        };
        // Intentionally run once per mount only: `marketPricing` is read here
        // just to skip an already-cached result, not to be reacted to.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const priceByPlanKey = useMemo(() => {
        if (!marketPricing?.plans) return {};
        // Backend returns Stripe-style lowercase currency codes ("cop");
        // formatCurrency/schema.org both expect uppercase ISO 4217 ("COP").
        const currency = marketPricing.currency?.toUpperCase();
        return marketPricing.plans.reduce((acc, plan) => {
            acc[plan.key] = formatPlanPrice(plan.amount, currency);
            return acc;
        }, {});
    }, [marketPricing]);

    return { marketPricing, priceByPlanKey };
};
