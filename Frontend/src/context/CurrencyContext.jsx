import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
    CURRENCY_OPTIONS,
    DEFAULT_CURRENCY_CODE,
    getCurrencyConfig,
    formatCurrency,
} from "../utils/currency";

// Per-browser DISPLAY preference only (persisted to localStorage, never sent
// to the backend) - purely how numbers get FORMATTED app-wide ($/€/₹, decimal
// grouping). Fase 4 (multi-moneda) added a completely separate concept, the
// order/purchase's own real transaction currency (Order.currencyCode,
// Backend/services/order.service.js#createOrder) - an order created in USD
// still gets its stored COP amounts rendered through whatever currency the
// VIEWER picked here, unless a component explicitly reads the order's own
// currency_code/exchange_rate/foreign_total fields instead (see
// OrderDetailsDrawer.jsx). Never conflate the two.
const STORAGE_KEY = "ohnix.currencyCode";

const CurrencyContext = createContext(null);

const getStoredCurrency = () => {
    if (typeof window === "undefined") {
        return DEFAULT_CURRENCY_CODE;
    }

    const storedCurrency = window.localStorage.getItem(STORAGE_KEY);
    return storedCurrency || DEFAULT_CURRENCY_CODE;
};

export const CurrencyProvider = ({ children }) => {
    const [currencyCode, setCurrencyCode] = useState(getStoredCurrency);

    useEffect(() => {
        window.localStorage.setItem(STORAGE_KEY, currencyCode);
    }, [currencyCode]);

    const currency = useMemo(
        () => getCurrencyConfig(currencyCode),
        [currencyCode]
    );

    const value = useMemo(
        () => ({
            currencyCode,
            setCurrencyCode,
            currency,
            currencyOptions: CURRENCY_OPTIONS,
            formatCurrency: (amount) => formatCurrency(amount, currencyCode),
        }),
        [currencyCode, currency]
    );

    return (
        <CurrencyContext.Provider value={value}>
            {children}
        </CurrencyContext.Provider>
    );
};

export const useCurrency = () => {
    const context = useContext(CurrencyContext);

    if (!context) {
        throw new Error("useCurrency must be used within a CurrencyProvider");
    }

    return context;
};
