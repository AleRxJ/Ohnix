import { useState } from "react";
import { toast } from "react-hot-toast";
import { api } from "../../api/api";
import { calculateOrderTotals } from "../../utils/orderHelpers";
import useI18n from "../useI18n";
import { useInventoryTour } from "../../context/InventoryTourContext";
import { resolveApiErrorMessage } from "../../utils/apiError";

const UPDATE_STATUS_ERROR_CODES = {
    invalid_order_status_transition: "orders.invalid_status_transition",
};

export const useOrderOperations = (refreshOrders) => {
    const { t } = useI18n();
    const { isOpen: isTutorialActive, notifyAction, createdRefs } = useInventoryTour();
    const [orderDetails, setOrderDetails] = useState([]);
    const [detailsLoading, setDetailsLoading] = useState(false);
    // Which order's status Select is mid-request - the status PATCH gave no
    // visual feedback at all while in flight (no spinner, nothing disabled),
    // so a slow request looked like the click didn't register.
    const [updatingOrderId, setUpdatingOrderId] = useState(null);

    // The backend returns a per-product breakdown (name, requested vs
    // available) for 422 stock errors instead of just a flat message - show
    // the actual products/quantities involved instead of a generic
    // "insufficient stock" toast that leaves the user guessing which item.
    const describeStockErrors = (error) => {
        const items = error.response?.data?.errors;
        if (!Array.isArray(items) || items.length === 0) return null;

        return items
            .map((item) =>
                t("orders.insufficient_stock_detail", {
                    product: item.product_name || item.product_code || "?",
                    requested: item.requested,
                    available: item.available ?? 0,
                })
            )
            .join("\n");
    };

    const updateOrderStatus = async (orderId, newStatus) => {
        setUpdatingOrderId(orderId);
        try {
            await api.patch(`/orders/${orderId}/status`, {
                order_status: newStatus,
            });
            toast.success(t("orders.order_updated"));
            await refreshOrders();
            // Only the tutorial's OWN practice order counts - completing any
            // other (real, pre-existing) order shares the same status Select
            // and must not be mistaken for finishing this step.
            if (newStatus === "completed" && isTutorialActive && orderId === createdRefs?.order?.id) {
                notifyAction("order-completed");
            }
        } catch (error) {
            toast.error(
                describeStockErrors(error) ||
                    resolveApiErrorMessage(error, t, UPDATE_STATUS_ERROR_CODES, "orders.failed_update_status")
            );
            console.error("Error updating order status:", error);
        } finally {
            setUpdatingOrderId(null);
        }
    };

    const generateInvoice = async (orderId, invoiceNo) => {
        try {
            const response = await api.get(`/orders/${orderId}/invoice`, {
                responseType: "blob",
            });

            const blob = new Blob([response.data], { type: "application/pdf" });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `invoice-${invoiceNo}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success(t("orders.invoice_downloaded"));
        } catch (error) {
            toast.error(t("orders.failed_generate_invoice"));
            console.error("Error generating invoice:", error);
        }
    };

    const createOrder = async (values, products = []) => {
        try {
            const productsById = Object.fromEntries(
                products.map((product) => [product._id, product])
            );
            const { subTotal, gst, total } = calculateOrderTotals(
                values.orderItems,
                productsById
            );

            const orderData = {
                customer_id: values.customer_id,
                order_status: values.order_status || "pending",
                orderItems: values.orderItems.map((item) => ({
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unitcost: item.unitcost,
                })),
                sub_total: subTotal,
                gst,
                total,
                total_products: values.orderItems.length,
                ...(isTutorialActive && { is_tutorial_data: true }),
            };

            const response = await api.post("/orders", orderData);
            toast.success(t("orders.order_created"));
            refreshOrders();
            if (isTutorialActive) {
                const created = response.data?.data;
                // Tracking the exact row id lets complete-order target THIS
                // order specifically instead of whichever row happens to
                // render first for the shared data-tour attribute (real,
                // pre-existing orders share it too).
                notifyAction(
                    "order",
                    created ? { id: created._id, name: created.invoice_no } : undefined
                );
                // Created already "completed" - stock already dropped, so
                // the separate "complete it" step has nothing left to wait
                // for. Same reasoning as the purchase side.
                if (orderData.order_status === "completed") {
                    notifyAction("order-completed");
                }
            }
            return true;
        } catch (error) {
            toast.error(
                describeStockErrors(error) ||
                    error.response?.data?.message ||
                    t("orders.failed_create_order")
            );
            console.error("Error creating order:", error);
            return false;
        }
    };

    const fetchOrderDetails = async (orderId) => {
        setDetailsLoading(true);
        try {
            const response = await api.get(`/orders/${orderId}/details`);
            setOrderDetails(response.data.data);
        } catch (error) {
            toast.error(t("orders.failed_fetch_order_details"));
            console.error("Error fetching order details:", error);
        } finally {
            setDetailsLoading(false);
        }
    };

    return {
        orderDetails,
        detailsLoading,
        updateOrderStatus,
        updatingOrderId,
        generateInvoice,
        createOrder,
        fetchOrderDetails,
    };
};
