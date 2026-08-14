import { useState } from "react";
import { toast } from "react-hot-toast";
import { api } from "../../api/api";
import { calculateOrderTotals } from "../../utils/orderHelpers";
import useI18n from "../useI18n";
import { useInventoryTour } from "../../context/InventoryTourContext";

export const useOrderOperations = (refreshOrders) => {
    const { t } = useI18n();
    const { isOpen: isTutorialActive } = useInventoryTour();
    const [orderDetails, setOrderDetails] = useState([]);
    const [detailsLoading, setDetailsLoading] = useState(false);

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
        try {
            await api.patch(`/orders/${orderId}/status`, {
                order_status: newStatus,
            });
            toast.success(t("orders.order_updated"));
            refreshOrders();
        } catch (error) {
            toast.error(
                describeStockErrors(error) ||
                    error.response?.data?.message ||
                    t("orders.failed_update_status")
            );
            console.error("Error updating order status:", error);
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

            await api.post("/orders", orderData);
            toast.success(t("orders.order_created"));
            refreshOrders();
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
        generateInvoice,
        createOrder,
        fetchOrderDetails,
    };
};
