import { useCallback, useMemo, useReducer } from "react";
import { calculateOrderTotals } from "../../utils/orderHelpers";

// Every product is held to its stock at checkout (order.service.js claims
// location stock for all of them - is_physical is shipping metadata, NOT
// "doesn't track inventory"), so the Caja caps every line at what the
// catalog reports for this location (GET /products?point_of_sale_id=...).
export const availableStock = (product) => Math.max(0, Number(product?.stock) || 0);

const initialState = { lines: [], lastAddedId: null, bump: 0 };

function reducer(state, action) {
    switch (action.type) {
        case "add": {
            const { product } = action;
            const max = availableStock(product);
            const existing = state.lines.find((line) => line.product._id === product._id);
            if (existing) {
                if (existing.quantity >= max) return state;
                return {
                    lines: state.lines.map((line) =>
                        line.product._id === product._id ? { ...line, quantity: line.quantity + 1 } : line
                    ),
                    lastAddedId: product._id,
                    bump: state.bump + 1,
                };
            }
            if (max < 1) return state;
            return {
                // Newest first - the line the cashier just touched is the
                // one they're most likely to adjust next.
                lines: [{ product, quantity: 1, unitPrice: Number(product.selling_price) || 0 }, ...state.lines],
                lastAddedId: product._id,
                bump: state.bump + 1,
            };
        }
        case "setQuantity": {
            const lines = state.lines
                .map((line) => {
                    if (line.product._id !== action.productId) return line;
                    const max = availableStock(line.product);
                    return { ...line, quantity: Math.min(Math.max(0, Math.floor(action.quantity) || 0), max) };
                })
                .filter((line) => line.quantity > 0);
            return { ...state, lines };
        }
        case "setPrice":
            return {
                ...state,
                lines: state.lines.map((line) =>
                    line.product._id === action.productId ? { ...line, unitPrice: Math.max(0, Number(action.price) || 0) } : line
                ),
            };
        case "remove":
            return { ...state, lines: state.lines.filter((line) => line.product._id !== action.productId) };
        case "clear":
            return initialState;
        default:
            return state;
    }
}

export const usePosCart = () => {
    const [state, dispatch] = useReducer(reducer, initialState);

    // Same preview math as the order modal (utils/orderHelpers.js) - the
    // server recomputes totals/tax itself and never trusts these.
    const totals = useMemo(() => {
        const productsById = Object.fromEntries(state.lines.map((line) => [line.product._id, line.product]));
        const items = state.lines.map((line) => ({
            product_id: line.product._id,
            quantity: line.quantity,
            unitcost: line.unitPrice,
        }));
        const { subTotal, gst, total } = calculateOrderTotals(items, productsById);
        const units = state.lines.reduce((sum, line) => sum + line.quantity, 0);
        return { subTotal, gst, total, units };
    }, [state.lines]);

    const quantityOf = useCallback(
        (productId) => state.lines.find((line) => line.product._id === productId)?.quantity || 0,
        [state.lines]
    );

    // `key` identifies a line for PosCart (a table tab can have two lines of
    // the same product - see useTabCart); here one line per product.
    const lines = useMemo(() => state.lines.map((line) => ({ ...line, key: line.product._id })), [state.lines]);

    return {
        lines,
        lastAddedId: state.lastAddedId,
        bump: state.bump,
        totals,
        quantityOf,
        add: (product) => dispatch({ type: "add", product }),
        setQuantity: (productId, quantity) => dispatch({ type: "setQuantity", productId, quantity }),
        setPrice: (productId, price) => dispatch({ type: "setPrice", productId, price }),
        remove: (productId) => dispatch({ type: "remove", productId }),
        clear: () => dispatch({ type: "clear" }),
    };
};
