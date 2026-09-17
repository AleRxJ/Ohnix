import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../../api/api";
import useI18n from "../useI18n";
import { resolveApiErrorMessage } from "../../utils/apiError";
import { idempotencyHeaders } from "../../utils/idempotency";
import { useDataInvalidation } from "../useDataInvalidation";
import { getConnectivityState } from "../../offline/connectivity";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { queueCreate, queueUpdate, readMirrorAll, mirrorReplaceAll } from "../../offline/entityQueue";

const PRODUCTION_ERROR_CODES = {
    product_not_manufactured: "products.error_product_not_manufactured",
    product_recipe_components_required: "products.error_recipe_components_required",
    product_batch_number_required: "products.batch_number_required",
    insufficient_stock: "products.error_insufficient_stock",
    invalid_production_status_transition: "products.error_invalid_status_transition",
    production_output_not_available: "products.error_production_output_not_available",
};

// GET /production-orders returns everything in one call (no pagination) -
// same full-mirror shape as usePurchase.js/useStockTransfer-style hooks,
// including the offline queue for create/complete/cancel (complete/cancel
// go through queueUpdate with an explicit method+url the same way
// LocationStockPanel's transfer actions do, since they're sub-resource
// actions, not a plain resource PATCH).
export const useProductionOrders = () => {
    const { t } = useI18n();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchOrders = useCallback(async () => {
        if (!getConnectivityState()) {
            setOrders(await readMirrorAll("productionOrders"));
            setLoading(false);
            return;
        }
        try {
            const response = await api.get("/production-orders");
            const data = response.data.data || [];
            setOrders(data);
            mirrorReplaceAll("productionOrders", data);
        } catch (err) {
            if (!err.response) {
                setOrders(await readMirrorAll("productionOrders"));
            } else {
                toast.error(resolveApiErrorMessage(err, t, PRODUCTION_ERROR_CODES, "products.failed_load_production_orders"));
            }
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        fetchOrders();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useDataInvalidation("productionOrder", fetchOrders);
    useEffect(() => subscribeSyncCompleted(fetchOrders), [fetchOrders]);

    const createOrder = async (payload) => {
        if (!getConnectivityState()) {
            const optimistic = await queueCreate({
                entity: "productionOrders",
                url: "/production-orders",
                fields: payload,
                optimisticExtra: { status: "draft", materials_cost: 0, unit_cost_applied: null },
            });
            toast.success(t("common.offline_saved_locally"));
            setOrders((prev) => [optimistic, ...prev]);
            return { success: true, data: optimistic };
        }
        try {
            const response = await api.post("/production-orders", payload, idempotencyHeaders());
            toast.success(t("products.production_order_created"));
            await fetchOrders();
            return { success: true, data: response.data.data };
        } catch (err) {
            toast.error(resolveApiErrorMessage(err, t, PRODUCTION_ERROR_CODES, "products.failed_create_production_order"));
            return { success: false, error: err };
        }
    };

    const completeOrder = async (id) => {
        if (!getConnectivityState()) {
            await queueUpdate({
                entity: "productionOrders",
                url: `/production-orders/${id}/complete`,
                id,
                fields: {},
                optimisticPatch: { status: "completed" },
                method: "patch",
            });
            toast.success(t("common.offline_saved_locally"));
            await fetchOrders();
            return { success: true };
        }
        try {
            await api.patch(`/production-orders/${id}/complete`, {}, idempotencyHeaders());
            toast.success(t("products.production_order_completed"));
            await fetchOrders();
            return { success: true };
        } catch (err) {
            toast.error(resolveApiErrorMessage(err, t, PRODUCTION_ERROR_CODES, "products.failed_complete_production_order"));
            return { success: false, error: err };
        }
    };

    const cancelOrder = async (id, reason) => {
        if (!getConnectivityState()) {
            await queueUpdate({
                entity: "productionOrders",
                url: `/production-orders/${id}/cancel`,
                id,
                fields: { reason },
                optimisticPatch: { status: "cancelled" },
                method: "patch",
            });
            toast.success(t("common.offline_saved_locally"));
            await fetchOrders();
            return { success: true };
        }
        try {
            await api.patch(`/production-orders/${id}/cancel`, { reason }, idempotencyHeaders());
            toast.success(t("products.production_order_cancelled"));
            await fetchOrders();
            return { success: true };
        } catch (err) {
            toast.error(resolveApiErrorMessage(err, t, PRODUCTION_ERROR_CODES, "products.failed_cancel_production_order"));
            return { success: false, error: err };
        }
    };

    return { orders, loading, fetchOrders, createOrder, completeOrder, cancelOrder };
};
