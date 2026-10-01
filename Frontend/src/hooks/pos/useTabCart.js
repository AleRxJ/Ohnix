import { useCallback, useMemo, useState } from "react";
import { calculateOrderTotals } from "../../utils/orderHelpers";

// Makes an open table tab look exactly like usePosCart's cart, so the same
// PosCart panel and checkout work for a table. Lines are keyed by the tab
// line id (a product can have a sent and an unsent line); every change goes
// through usePosTables, which persists it (online or queued).
export const useTabCart = (tab, tablesApi, products) => {
    const [lastAddedId, setLastAddedId] = useState(null);
    const [bump, setBump] = useState(0);

    const productsById = useMemo(() => Object.fromEntries(products.map((p) => [p._id, p])), [products]);

    const lines = useMemo(
        () =>
            (tab?.items || []).map((item) => ({
                key: item._id,
                // The catalog entry when we have it (stock, tax); otherwise a
                // stub from what the tab stored, so an item never vanishes.
                product: productsById[item.product_id] || {
                    _id: item.product_id,
                    product_name: item.product_name,
                    selling_price: item.unit_price,
                    // Not in this location's catalog: nothing more can be added.
                    stock: 0,
                },
                quantity: item.quantity,
                unitPrice: item.unit_price,
                sent: Boolean(item.sent_at),
                note: item.note,
            })),
        [tab, productsById]
    );

    const totals = useMemo(() => {
        const { subTotal, gst, total } = calculateOrderTotals(
            lines.map((l) => ({ product_id: l.product._id, quantity: l.quantity, unitcost: l.unitPrice })),
            Object.fromEntries(lines.map((l) => [l.product._id, l.product]))
        );
        return { subTotal, gst, total, units: lines.reduce((sum, l) => sum + l.quantity, 0) };
    }, [lines]);

    const lineByKey = useCallback((key) => lines.find((l) => l.key === key), [lines]);

    return {
        lines,
        totals,
        lastAddedId,
        bump,
        isTab: true,
        quantityOf: (productId) => lines.filter((l) => l.product._id === productId).reduce((sum, l) => sum + l.quantity, 0),
        add: (product) => {
            if (!tab) return;
            tablesApi.addProduct(tab._id, product);
            setLastAddedId(product._id);
            setBump((b) => b + 1);
        },
        setQuantity: (key, quantity) => {
            const line = lineByKey(key);
            if (!tab || !line) return;
            const delta = Math.max(0, Math.floor(quantity) || 0) - line.quantity;
            if (delta) tablesApi.changeQuantity(tab._id, { lineId: key, product: line.product, delta });
        },
        setPrice: (key, price) => tab && tablesApi.setLinePrice(tab._id, key, Math.max(0, Number(price) || 0)),
        setNote: (key, note) => tab && tablesApi.setLineNote(tab._id, key, note),
        remove: (key) => {
            const line = lineByKey(key);
            if (tab && line) tablesApi.changeQuantity(tab._id, { lineId: key, product: line.product, delta: -line.quantity });
        },
        // A tab is emptied by cancelling it, never by "vaciar venta".
        clear: null,
    };
};
