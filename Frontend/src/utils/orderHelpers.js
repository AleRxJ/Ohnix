export const getStatusColor = (status) => {
    const colors = {
        pending: "orange",
        processing: "blue",
        completed: "green",
        cancelled: "red",
    };
    return colors[status] || "default";
};

// This is only a client-side preview shown while building the order - the
// backend always recomputes subTotal/gst/total from each product's own
// taxTreatment/taxRate (and the company's VAT responsibility) before
// persisting, so it stays the source of truth.
export const calculateOrderTotals = (orderItems, productsById = {}) => {
    let subTotal = 0;
    let gst = 0;

    for (const item of orderItems) {
        const lineTotal = item.quantity * item.unitcost;
        subTotal += lineTotal;

        const product = productsById[item.product_id];
        if (product && product.tax_treatment === "taxed") {
            const rate = Number(product.tax_rate) || 0;
            gst += (lineTotal * rate) / 100;
        }
    }

    const total = subTotal + gst;
    return { subTotal, gst, total };
};

export const calculateStats = (orders, pagination) => {
    const nonCancelledOrders = orders.filter(
        (order) => order.order_status !== "cancelled"
    );

    return {
        total: pagination.total,
        pending: orders.filter((o) => o.order_status === "pending").length,
        completed: orders.filter((o) => o.order_status === "completed").length,
        revenue: nonCancelledOrders.reduce(
            (sum, order) => sum + order.total,
            0
        ),
    };
};

export const TERMINAL_STATUSES = ["completed", "cancelled"];

// Mirrors Backend/services/order.service.js's validTransitions - kept here
// purely so the status Select only ever offers moves the backend will
// actually accept (e.g. pending can't jump straight to completed, it has to
// pass through processing first). The backend remains the real authority;
// this is just so the UI doesn't invite a click that's guaranteed to fail.
export const ORDER_STATUS_TRANSITIONS = {
    pending: ["processing", "cancelled"],
    processing: ["completed", "cancelled"],
    // completed -> cancelled is real but handled by OrdersTable's separate
    // "cancel completed order" Popconfirm button, not this select.
    completed: [],
    cancelled: [],
};

export const ORDER_STATUSES = [
    { value: "pending", labelKey: "orders.pending" },
    { value: "processing", labelKey: "orders.processing" },
    { value: "completed", labelKey: "orders.completed" },
    { value: "cancelled", labelKey: "orders.cancelled" },
];
