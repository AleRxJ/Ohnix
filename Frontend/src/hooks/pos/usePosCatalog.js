import { useCallback, useContext, useEffect, useState } from "react";
import { api } from "../../api/api";
import AuthContext from "../../context/AuthContext";
import { financeService } from "../../services/financeService";
import { paymentProviderService } from "../../services/paymentProviderService";
import { getConnectivityState } from "../../offline/connectivity";
import { readMirrorAll } from "../../offline/entityQueue";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { useDataInvalidation } from "../useDataInvalidation";

// Cash accounts / payment methods aren't mirror entities (see db.js), but a
// cashier who opened the Caja online and then lost signal must still be able
// to charge - so the last list seen online is kept per browser as a fallback.
const FINANCE_CACHE_KEY = "ohnix.pos.financeCache";

const readFinanceCache = () => {
    try {
        return JSON.parse(localStorage.getItem(FINANCE_CACHE_KEY)) || null;
    } catch {
        return null;
    }
};

const writeFinanceCache = (value) => {
    try {
        localStorage.setItem(FINANCE_CACHE_KEY, JSON.stringify(value));
    } catch {
        // Private mode / quota - the in-memory lists still work this session.
    }
};

// Same online-then-mirror fallback as useOrders.js, so the Caja works with
// exactly the data the rest of the app already keeps warm offline.
const loadWithMirror = async (entity, fetcher) => {
    if (!getConnectivityState()) return readMirrorAll(entity);
    try {
        return await fetcher();
    } catch (error) {
        if (!error.response) return readMirrorAll(entity);
        throw error;
    }
};

export const isFinalConsumer = (customer) => customer?.type === "final_consumer";

export const usePosCatalog = ({ pointOfSaleId, canRegisterPayment, ready = true }) => {
    const { user } = useContext(AuthContext);
    const [products, setProducts] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [cashAccounts, setCashAccounts] = useState(() => readFinanceCache()?.cashAccounts || []);
    const [paymentMethods, setPaymentMethods] = useState(() => readFinanceCache()?.paymentMethods || []);
    const [finalConsumer, setFinalConsumer] = useState(null);
    const [loading, setLoading] = useState(true);
    // The company's own Bold account (datáfono / QR). Online-only by nature -
    // nothing cached: offline the Caja simply doesn't offer it.
    const [bold, setBold] = useState({ connected: false, hasTerminalKey: false, hasLinkKey: false, terminals: [] });

    const fetchProducts = useCallback(async () => {
        try {
            const rows = await loadWithMirror("products", async () => {
                const response = await api.get("/products");
                return response.data.data.products || response.data.data;
            });
            setProducts(rows || []);
        } catch (error) {
            console.error("Error fetching POS products:", error);
        }
    }, []);

    const fetchCustomers = useCallback(async () => {
        try {
            const rows = await loadWithMirror("customers", async () => {
                const response = await api.get(user?.role === "admin" ? "/customers/all" : "/customers");
                return response.data.data;
            });
            setCustomers(rows || []);
            return rows || [];
        } catch (error) {
            console.error("Error fetching POS customers:", error);
            return [];
        }
    }, [user?.role]);

    const fetchFinance = useCallback(async () => {
        if (!canRegisterPayment || !getConnectivityState()) return;
        try {
            const [accountsRes, methodsRes] = await Promise.all([
                financeService.listCashAccounts(),
                financeService.listPaymentMethods({ activeOnly: true }).catch(() => ({ data: [] })),
            ]);
            const nextAccounts = accountsRes?.data || [];
            const nextMethods = methodsRes?.data || [];
            setCashAccounts(nextAccounts);
            setPaymentMethods(nextMethods);
            writeFinanceCache({ cashAccounts: nextAccounts, paymentMethods: nextMethods });
        } catch (error) {
            // Keeps the cached lists - the checkout falls back to "a crédito"
            // only if there's genuinely no account to put the money in.
            console.error("Error fetching POS finance data:", error);
        }
    }, [canRegisterPayment]);

    const fetchBold = useCallback(async () => {
        if (!canRegisterPayment || !getConnectivityState()) return;
        try {
            const connection = await paymentProviderService.getConnection("bold");
            const connected = connection?.status === "connected";
            let terminals = [];
            if (connected && connection.has_terminal_key) {
                terminals = await paymentProviderService.listTerminals("bold").catch(() => []);
            }
            setBold({
                connected,
                hasTerminalKey: Boolean(connected && connection.has_terminal_key),
                hasLinkKey: Boolean(connected && connection.has_link_key),
                terminals,
            });
        } catch {
            setBold({ connected: false, hasTerminalKey: false, hasLinkKey: false, terminals: [] });
        }
    }, [canRegisterPayment]);

    // Online: find-or-create server-side (POST /customers/final-consumer).
    // Offline: whatever final consumer is already cached for this location -
    // if none was ever created, the cashier just picks a real customer.
    const resolveFinalConsumer = useCallback(
        async (knownCustomers) => {
            const matchesLocation = (c) =>
                isFinalConsumer(c) && (!pointOfSaleId || String(c.point_of_sale?._id) === String(pointOfSaleId));
            // Already known (it's in the customer list after the first visit) -
            // use it right away so "Cobrar" isn't disabled while the
            // find-or-create round-trip below confirms it.
            const known = knownCustomers.find(matchesLocation);
            if (known) setFinalConsumer(known);
            if (getConnectivityState()) {
                try {
                    const response = await api.post("/customers/final-consumer", pointOfSaleId ? { pointOfSaleId } : {});
                    const customer = response.data.data;
                    setFinalConsumer(customer);
                    setCustomers((prev) => (prev.some((c) => c._id === customer._id) ? prev : [customer, ...prev]));
                    return;
                } catch (error) {
                    if (error.response) {
                        console.error("Error resolving final consumer:", error);
                    }
                }
            }
            setFinalConsumer(knownCustomers.find(matchesLocation) || null);
        },
        [pointOfSaleId]
    );

    const reload = useCallback(async () => {
        const [, loadedCustomers] = await Promise.all([fetchProducts(), fetchCustomers(), fetchFinance(), fetchBold()]);
        await resolveFinalConsumer(loadedCustomers);
    }, [fetchProducts, fetchCustomers, fetchFinance, fetchBold, resolveFinalConsumer]);

    useEffect(() => {
        if (!ready) return undefined;
        let cancelled = false;
        setLoading(true);
        reload().finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [reload, ready]);

    // Another register (or tab) selling moves stock - keep the grid honest.
    useDataInvalidation(["product", "order"], fetchProducts);
    useEffect(() => subscribeSyncCompleted(reload), [reload]);

    // Optimistic local stock drop after a sale, so the grid doesn't show
    // units that were just sold while the refetch (or, offline, the sync) is
    // still pending. The server stays authoritative on the next fetch.
    const applyLocalSale = useCallback((lines) => {
        const soldById = new Map(lines.map((line) => [line.product._id, line.quantity]));
        setProducts((prev) =>
            prev.map((p) => (soldById.has(p._id) ? { ...p, stock: Math.max(0, Number(p.stock || 0) - soldById.get(p._id)) } : p))
        );
    }, []);

    return {
        products,
        customers,
        cashAccounts,
        paymentMethods,
        finalConsumer,
        bold,
        loading,
        reload,
        applyLocalSale,
    };
};
