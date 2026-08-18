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
    const [marketPricing, setMarketPricing] = useState(null);

    useEffect(() => {
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
                }
            } catch {
                // Network/backend failure - caller stays on its static fallback prices.
            }
        };

        resolvePricing();
        return () => {
            active = false;
        };
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
