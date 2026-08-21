import { useState } from "react";
import { toast } from "react-hot-toast";
import { message } from "antd";
import { api } from "../../api/api";
import { calculateOrderTotals } from "../../utils/orderHelpers";
import { formatCurrency } from "../../utils/currency";
import useI18n from "../useI18n";
import { useInventoryTour } from "../../context/InventoryTourContext";
import { resolveApiErrorMessage } from "../../utils/apiError";
import { idempotencyHeaders } from "../../utils/idempotency";

const UPDATE_STATUS_ERROR_CODES = {
    invalid_order_status_transition: "orders.invalid_status_transition",
};

export const useOrderOperations = (refreshOrders) => {
    const { t } = useI18n();
    const { isOpen: isTutorialActive, notifyAction, createdRefs } = useInventoryTour();
    const [orderDetails, setOrderDetails] = useState([]);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [returnPreviewData, setReturnPreviewData] = useState(null);
    // Which order's status Select is mid-request - the status PATCH gave no
    // visual feedback at all while in flight (no spinner, nothing disabled),
    // so a slow request looked like the click didn't register.
    const [updatingOrderId, setUpdatingOrderId] = useState(null);
    // Same gap on the "process return" button: it fetches the preview before
    // opening the modal, and with nothing showing meanwhile a slow request
    // looked like the click just opened an empty modal (or did nothing).
    const [returnPreviewLoadingId, setReturnPreviewLoadingId] = useState(null);

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
            await api.patch(
                `/orders/${orderId}/status`,
                { order_status: newStatus },
                idempotencyHeaders()
            );
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

            const response = await api.post("/orders", orderData, idempotencyHeaders());
            toast.success(t("orders.order_created"));
            // Awaited (not fire-and-forget) specifically so that when the
            // tour is active, the new row already exists in the DOM by the
            // time notifyAction() below starts the complete-order step's
            // target search - otherwise that search starts before this
            // refetch resolves and falls back to whichever pending order
            // happens to already be rendered (a real, pre-existing one), not
            // the practice order just created.
            await refreshOrders();
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

    const fetchReturnPreview = async (orderId) => {
        setReturnPreviewLoadingId(orderId);
        try {
            const response = await api.get(`/orders/${orderId}/return-preview`);
            if (response.data.success) {
                setReturnPreviewData(response.data.data);
                return response.data.data;
            }
            toast.error(
                response.data.message || t("orders.failed_fetch_return_preview")
            );
        } catch (error) {
            toast.error(t("orders.error_fetching_return_preview"));
            console.error("Error fetching return preview:", error);
        } finally {
            setReturnPreviewLoadingId(null);
        }
    };

    // Process a granular return: `lines` is [{ order_detail_id, quantity }],
    // chosen by the user in the return form - not auto-computed by the server.
    const processReturn = async (orderId, lines) => {
        setUpdatingOrderId(orderId);
        try {
            const response = await api.post(
                `/orders/${orderId}/returns`,
                { lines },
                idempotencyHeaders()
            );
            if (response.data.success) {
                const result = response.data.data;
                message.success(
                    t(
                        result.order_fully_returned
                            ? "orders.return_success_toast"
                            : "orders.return_partial_success_toast",
                        { amount: formatCurrency(result.total_refund_amount) }
                    )
                );
                await refreshOrders();
                return { success: true, result };
            }
            toast.error(response.data.message || t("orders.failed_process_return"));
            return { success: false };
        } catch (error) {
            toast.error(
                describeStockErrors(error) ||
                    resolveApiErrorMessage(error, t, {}, "orders.error_processing_return")
            );
            console.error("Error processing return:", error);
            return { success: false };
        } finally {
            setUpdatingOrderId(null);
        }
    };

    return {
        orderDetails,
        detailsLoading,
        returnPreviewData,
        updateOrderStatus,
        updatingOrderId,
        returnPreviewLoadingId,
        generateInvoice,
        createOrder,
        fetchOrderDetails,
        fetchReturnPreview,
        processReturn,
        setReturnPreviewData,
    };
};
