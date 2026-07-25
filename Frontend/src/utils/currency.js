export const DEFAULT_CURRENCY_CODE = "COP";

export const CURRENCIES = {
    COP: {
        code: "COP",
        label: "Peso colombiano",
        symbol: "$",
        locale: "es-CO",
        currencyDisplay: "symbol",
    },
    USD: {
        code: "USD",
        label: "Dólar estadounidense",
        symbol: "$",
        locale: "en-US",
        currencyDisplay: "symbol",
    },
    EUR: {
        code: "EUR",
        label: "Euro",
        symbol: "€",
        locale: "es-ES",
        currencyDisplay: "symbol",
    },
    INR: {
        code: "INR",
        label: "Rupia india",
        symbol: "₹",
        locale: "en-IN",
        currencyDisplay: "symbol",
    },
};

export const CURRENCY_OPTIONS = Object.values(CURRENCIES).map((currency) => ({
    value: currency.code,
    label: `${currency.label} (${currency.code})`,
}));

export const getCurrencyConfig = (currencyCode = DEFAULT_CURRENCY_CODE) => {
    return CURRENCIES[currencyCode] || CURRENCIES[DEFAULT_CURRENCY_CODE];
};

export const formatCurrency = (value, currencyCode = DEFAULT_CURRENCY_CODE) => {
    const currency = getCurrencyConfig(currencyCode);
    const amount = Number(value ?? 0);

    if (!Number.isFinite(amount)) {
        return new Intl.NumberFormat(currency.locale, {
            style: "currency",
            currency: currency.code,
            currencyDisplay: currency.currencyDisplay,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(0);
    }

    return new Intl.NumberFormat(currency.locale, {
        style: "currency",
        currency: currency.code,
        currencyDisplay: currency.currencyDisplay,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(amount);
};

export const formatCurrencyNumber = (
    value,
    currencyCode = DEFAULT_CURRENCY_CODE,
    options = {}
) => {
    const currency = getCurrencyConfig(currencyCode);
    const amount = Number(value ?? 0);

    return new Intl.NumberFormat(currency.locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
        ...options,
    }).format(Number.isFinite(amount) ? amount : 0);
};

const getLocaleSeparators = (currencyCode = DEFAULT_CURRENCY_CODE) => {
    const currency = getCurrencyConfig(currencyCode);
    const parts = new Intl.NumberFormat(currency.locale).formatToParts(12345.6);

    const decimal = parts.find((part) => part.type === "decimal")?.value || ".";
    const group = parts.find((part) => part.type === "group")?.value || ",";

    return { decimal, group };
};

export const parseCurrencyInput = (
    value,
    currencyCode = DEFAULT_CURRENCY_CODE
) => {
    if (value === undefined || value === null) return "";

    const raw = String(value).trim();
    if (!raw) return "";

    // Keep only digits and common separators for robust cross-locale parsing.
    let normalized = raw.replace(/[^0-9,.-]/g, "");

    // Preserve a single leading sign and strip any additional minus chars.
    const hasNegativeSign = normalized.startsWith("-");
    normalized = normalized.replace(/-/g, "");

    if (!normalized) return hasNegativeSign ? "-" : "";

    const { decimal: localeDecimal, group: localeGroup } = getLocaleSeparators(currencyCode);
    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
        const lastComma = normalized.lastIndexOf(",");
        const lastDot = normalized.lastIndexOf(".");
        const decimalIndex = Math.max(lastComma, lastDot);
        const intPart = normalized.slice(0, decimalIndex).replace(/[.,]/g, "");
        const decimalPart = normalized.slice(decimalIndex + 1).replace(/[.,]/g, "");
        normalized = decimalPart ? `${intPart}.${decimalPart}` : intPart;
    } else if (hasComma || hasDot) {
        const sep = hasComma ? "," : ".";

        if (sep === localeGroup && sep !== localeDecimal) {
            normalized = normalized.replace(/[.,]/g, "");
        } else if (sep === localeDecimal && sep !== localeGroup) {
            const pieces = normalized.split(sep);
            const intPart = (pieces.shift() || "").replace(/[.,]/g, "");
            const decimalPart = pieces.join("").replace(/[.,]/g, "");
            normalized = decimalPart ? `${intPart}.${decimalPart}` : intPart;
        } else {
            // Fallback for unusual locale settings.
            const lastIndex = normalized.lastIndexOf(sep);
            const intPart = normalized.slice(0, lastIndex).replace(/[.,]/g, "");
            const decimalPart = normalized.slice(lastIndex + 1).replace(/[.,]/g, "");
            normalized = decimalPart ? `${intPart}.${decimalPart}` : intPart;
        }
    } else {
        normalized = normalized.replace(/[.,]/g, "");
    }

    if (!normalized) return hasNegativeSign ? "-" : "";
    return hasNegativeSign ? `-${normalized}` : normalized;
};

export const formatCurrencyInput = (
    value,
    currencyCode = DEFAULT_CURRENCY_CODE,
    options = {}
) => {
    if (value === undefined || value === null || value === "") return "";

    const parsed = Number(parseCurrencyInput(value, currencyCode));
    if (!Number.isFinite(parsed)) return "";

    return formatCurrencyNumber(parsed, currencyCode, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
        ...options,
    });
};

export const getCurrencyInputProps = (
    currencyCode = DEFAULT_CURRENCY_CODE,
    options = {}
) => ({
    formatter: (value) => formatCurrencyInput(value, currencyCode, options),
    parser: (value) => parseCurrencyInput(value, currencyCode),
});
