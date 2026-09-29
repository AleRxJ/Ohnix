import { useState } from "react";
import { toast } from "react-hot-toast";
import { message } from "antd";
import { api } from "../../api/api";
import { calculateOrderTotals } from "../../utils/orderHelpers";
import { formatCurrency } from "../../utils/currency";
import { financeService } from "../../services/financeService";
import useI18n from "../useI18n";
import { useInventoryTour } from "../../context/InventoryTourContext";
import { resolveApiErrorMessage } from "../../utils/apiError";
import { idempotencyHeaders } from "../../utils/idempotency";
import { getConnectivityState } from "../../offline/connectivity";
import { queueCreate, queueUpdate } from "../../offline/entityQueue";
import { enqueueOperation } from "../../offline/outbox";
import { financeErrorMessage } from "../../utils/financeError";

const UPDATE_STATUS_ERROR_CODES = {
    invalid_order_status_transition: "orders.invalid_status_transition",
};

export const useOrderOperations = (refreshOrders) => {
    const { t } = useI18n();
    const { isOpen: isTutorialActive, notifyAction, createdRefs } = useInventoryTour();
    const [orderDetails, setOrderDetails] = useState([]);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [orderPayments, setOrderPayments] = useState([]);
    const [paymentsLoading, setPaymentsLoading] = useState(false);
    const [registeringPayment, setRegisteringPayment] = useState(false);
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
        if (!getConnectivityState()) {
            // Only actionable on an order this device already knows about
            // (created offline this session, or cached from an earlier
            // online view - see db.js on why "orders" isn't a full mirror).
            await queueUpdate({
                entity: "orders",
                url: `/orders/${orderId}/status`,
                id: orderId,
                fields: { order_status: newStatus },
                optimisticPatch: { order_status: newStatus },
            });
            toast.success(t("common.offline_saved_locally"));
            await refreshOrders();
            setUpdatingOrderId(null);
            return;
        }
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

    const createOrder = async (values, products = [], customers = []) => {
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
                pointOfSaleId: values.pointOfSaleId,
                order_status: values.order_status || "pending",
                due_date: values.due_date ? values.due_date.endOf("day").toISOString() : null,
                orderItems: values.orderItems.map((item) => ({
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unitcost: item.unitcost,
                })),
                sub_total: subTotal,
                gst,
                total,
                total_products: values.orderItems.length,
                // Fase 4 (multi-moneda) - the server always recomputes
                // sub_total/gst/total itself in COP from orderItems (see the
                // comment above about these being preview-only); it never
                // trusts what's sent here. currency_code/exchange_rate are
                // the only fields it actually reads for this - omitted
                // (undefined) they default to COP/1 server-side, unchanged
                // from before this phase.
                ...(values.currency_code && values.currency_code !== "COP"
                    ? { currency_code: values.currency_code, exchange_rate: values.exchange_rate }
                    : {}),
                ...(isTutorialActive && { is_tutorial_data: true }),
                ...(values.einvoice_deferred === true
                    ? { einvoice_deferred: true, einvoice_defer_reason: values.einvoice_defer_reason }
                    : {}),
            };

            if (!getConnectivityState()) {
                // The server recomputes totals/tax and (if completed) claims
                // stock atomically at sync time - this is only ever a
                // preview render, never trusted as final. A completed order
                // that turns out to be short on stock by the time it syncs
                // surfaces as a CONFLICT (see syncEngine.js), never silently
                // auto-cancelled.
                const customer = customers.find((c) => c._id === values.customer_id);
                await queueCreate({
                    entity: "orders",
                    url: "/orders",
                    fields: orderData,
                    optimisticExtra: {
                        customer_id: customer ? { _id: customer._id, name: customer.name } : values.customer_id,
                        order_date: new Date().toISOString(),
                        invoice_no: t("orders.pending_sync_invoice_placeholder"),
                    },
                });
                toast.success(t("common.offline_saved_locally"));
                await refreshOrders();
                return true;
            }

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

    const fetchOrderPayments = async (orderId) => {
        setPaymentsLoading(true);
        try {
            const res = await financeService.listOrderPayments(orderId);
            setOrderPayments(res?.data || []);
        } catch (error) {
            toast.error(t("finance.failed"));
            console.error("Error fetching order payments:", error);
        } finally {
            setPaymentsLoading(false);
        }
    };

    const registerOrderPayment = async (orderId, values) => {
        setRegisteringPayment(true);
        if (!getConnectivityState()) {
            // Not routed through queueCreate/queueUpdate - a payment isn't a
            // record this app browses/mirrors on its own (see Etapa 2
            // scope), just an action queued against an order that's either
            // cached locally or was created offline this session. The
            // order's own balance/status only reflects it once the real
            // sync (server-authoritative, Serializable-isolated) completes
            // and the order list refetches.
            await enqueueOperation({
                entity: "orders",
                opType: "custom",
                request: { method: "post", url: `/finance/orders/${orderId}/payments`, data: values },
            });
            toast.success(t("common.offline_saved_locally"));
            setRegisteringPayment(false);
            return true;
        }
        try {
            await financeService.registerOrderPayment(orderId, values);
            toast.success(t("finance.payment_registered"));
            await Promise.all([fetchOrderPayments(orderId), refreshOrders()]);
            return true;
        } catch (error) {
            toast.error(financeErrorMessage(error, t));
            console.error("Error registering order payment:", error);
            return false;
        } finally {
            setRegisteringPayment(false);
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
        orderPayments,
        paymentsLoading,
        registeringPayment,
        fetchOrderPayments,
        registerOrderPayment,
    };
};
