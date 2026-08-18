// Currency market resolution for public-facing pricing (marketing pages,
// not the authenticated in-app currency.js used for invoice/product
// amounts). Mirrors Backend/services/payment.service.js's EUR_COUNTRY_CODES
// exactly - both lists must stay in sync since they encode the same
// business rule (which countries actually settle in EUR) from two separate
// runtimes that can't share a module. The actual prices themselves are
// NOT duplicated here - they always come from the backend's
// GET /api/v1/pricing/public endpoint, which is the single source of truth.
const EUR_COUNTRY_CODES = new Set([
    "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE",
    "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
]);

export const MARKET_CURRENCY = {
    CO: "COP",
    EU: "EUR",
    REST: "USD",
};

// country/currency are independent: es+CO -> COP, es+ES -> EUR, es+MX -> USD.
// Language must never be used as a proxy for currency.
export const resolveMarket = (countryCode) => {
    const normalized = `${countryCode || ""}`.trim().toUpperCase();
    if (normalized === "CO") return "CO";
    if (EUR_COUNTRY_CODES.has(normalized)) return "EU";
    return "REST";
};

export const resolveCurrencyForCountry = (countryCode) => MARKET_CURRENCY[resolveMarket(countryCode)];
