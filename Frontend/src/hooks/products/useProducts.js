import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../../api/api";
import useI18n from "../useI18n";
import { resolveApiErrorMessage } from "../../utils/apiError";
import { idempotencyHeaders } from "../../utils/idempotency";
import { getConnectivityState } from "../../offline/connectivity";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { queueCreate, queueUpdate, queueDelete, readMirrorAll, mirrorReplaceAll, mirrorGet } from "../../offline/entityQueue";

const DELETE_PRODUCT_ERROR_CODES = {
    product_has_history: "products.delete_conflict_history",
};

const STALE_EDIT_ERROR_CODES = {
    stale_edit_conflict: "common.stale_edit_conflict",
};

// Mirrors the server-side filtering in getAllProducts (search/category/stock
// range) against the local mirror, so search and the stock-status filters
// keep working offline instead of silently showing the unfiltered catalog.
function filterProductsLocally(products, filters) {
    let result = products;
    if (filters.search) {
        const q = filters.search.toLowerCase();
        result = result.filter(
            (p) => p.product_name?.toLowerCase().includes(q) || p.product_code?.toLowerCase().includes(q)
        );
    }
    if (filters.category) {
        result = result.filter((p) => p.category_id?._id === filters.category);
    }
    if (filters.stockFilter === "out") {
        result = result.filter((p) => (p.stock ?? 0) <= 0);
    } else if (filters.stockFilter === "low") {
        result = result.filter((p) => (p.stock ?? 0) >= 1 && (p.stock ?? 0) <= 10);
    }
    return result;
}

export const useProducts = () => {
    const { t } = useI18n();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchProducts = async (filters = {}) => {
        if (!getConnectivityState()) {
            const all = await readMirrorAll("products");
            setProducts(filterProductsLocally(all, filters));
            setError(null);
            // `loading` defaults to true (initial mount, before any fetch has
            // resolved) - unlike the online path below, this branch never
            // went through try/finally, so without this the table stayed
            // stuck showing its loading/disabled overlay forever despite
            // already having real (mirrored) data to show.
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            setError(null);

            const params = new URLSearchParams();
            if (filters.search) params.append("search", filters.search);
            if (filters.category) params.append("category", filters.category);
            if (filters.stockFilter === "out") params.append("max_stock", 0);
            if (filters.stockFilter === "low") {
                params.append("min_stock", 1);
                params.append("max_stock", 10);
            }

            const response = await api.get(`/products?${params.toString()}`);

            if (response.data.success) {
                setProducts(response.data.data);
                // Only an unfiltered fetch is the full catalog - a filtered
                // search result would otherwise clobber the mirror down to
                // just the matching subset.
                if (Object.keys(filters).length === 0) mirrorReplaceAll("products", response.data.data);
            } else {
                setError(t("products.failed_load_products"));
                toast.error(t("products.failed_load_products"));
            }
        } catch (err) {
            if (!err.response) {
                // Real network failure, not a server rejection - most likely
                // we were actually offline and just didn't know it yet (see
                // connectivity.js's reportNetworkFailure). Fall back to the
                // mirror instead of a scary "failed to load" toast.
                const all = await readMirrorAll("products");
                setProducts(filterProductsLocally(all, filters));
                setError(null);
                return;
            }
            console.error("Products fetch error:", err);
            const errorMessage =
                err.response?.data?.message ||
                t("products.fetch_error");
            setError(errorMessage);
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const createProduct = async (formData) => {
        if (!getConnectivityState()) {
            const optimistic = await queueCreate({ entity: "products", url: "/products", fields: formData });
            toast.success(t("common.offline_saved_locally"));
            setProducts((prev) => [...prev, optimistic]);
            return { success: true, data: optimistic };
        }
        try {
            const response = await api.post("/products", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });

            if (response.data.success) {
                toast.success(t("products.product_added"));
                setProducts((prev) => [...prev, response.data.data]);
                return { success: true, data: response.data.data };
            }
        } catch (err) {
            console.error("Create product error:", err);
            const errorMessage =
                err.response?.data?.message || t("products.failed_create_product");
            toast.error(errorMessage);
            return { success: false, error: errorMessage };
        }
    };

    const updateProduct = async (productId, formData) => {
        if (!getConnectivityState()) {
            const optimistic = await queueUpdate({
                entity: "products",
                url: `/products/${productId}`,
                id: productId,
                fields: formData,
            });
            toast.success(t("common.offline_saved_locally"));
            setProducts((prev) => prev.map((p) => (p._id === productId ? optimistic : p)));
            return { success: true, data: optimistic };
        }
        try {
            const response = await api.patch(
                `/products/${productId}`,
                formData,
                {
                    headers: { "Content-Type": "multipart/form-data" },
                }
            );

            if (response.data.success) {
                toast.success(t("products.product_updated"));
                setProducts((prev) =>
                    prev.map((p) =>
                        p._id === productId ? response.data.data : p
                    )
                );
                return { success: true, data: response.data.data };
            }
        } catch (err) {
            console.error("Update product error:", err);
            const errorMessage = resolveApiErrorMessage(
                err,
                t,
                STALE_EDIT_ERROR_CODES,
                "products.failed_update_product"
            );
            toast.error(errorMessage);
            return { success: false, error: errorMessage };
        }
    };

    const deleteProduct = async (productId) => {
        if (!getConnectivityState()) {
            await queueDelete({ entity: "products", url: `/products/${productId}`, id: productId });
            toast.success(t("common.offline_deleted_locally"));
            setProducts((prev) => prev.filter((p) => p._id !== productId));
            return { success: true };
        }
        try {
            const response = await api.delete(`/products/${productId}`);

            if (response.data.success) {
                toast.success(t("products.product_deleted"));
                setProducts((prev) => prev.filter((p) => p._id !== productId));
                return { success: true };
            } else {
                toast.error(t("products.failed_delete_product"));
                return { success: false };
            }
        } catch (err) {
            console.error("Delete product error:", err);
            const errorMessage = resolveApiErrorMessage(
                err,
                t,
                DELETE_PRODUCT_ERROR_CODES,
                "products.failed_delete_product"
            );
            toast.error(errorMessage);
            return { success: false, error: errorMessage };
        }
    };

    const adjustStock = async (productId, { delta, reason, pointOfSaleId }) => {
        if (!getConnectivityState()) {
            // Delta, never an absolute value - the server does its own
            // atomic claim against the real (possibly different) stock at
            // sync time; this optimistic number is only ever a preview.
            const existing = await mirrorGet("products", productId);
            const optimistic = await queueUpdate({
                entity: "products",
                url: `/products/${productId}/adjust-stock`,
                id: productId,
                fields: { delta, reason, ...(pointOfSaleId ? { pointOfSaleId } : {}) },
                optimisticPatch: { stock: (existing?.stock ?? 0) + delta },
                method: "post",
            });
            toast.success(t("common.offline_saved_locally"));
            setProducts((prev) => prev.map((p) => (p._id === productId ? optimistic : p)));
            return { success: true, data: optimistic };
        }
        try {
            const response = await api.post(
                `/products/${productId}/adjust-stock`,
                { delta, reason, ...(pointOfSaleId ? { pointOfSaleId } : {}) },
                idempotencyHeaders()
            );

            if (response.data.success) {
                toast.success(t("products.stock_adjusted"));
                setProducts((prev) =>
                    prev.map((p) => (p._id === productId ? response.data.data : p))
                );
                return { success: true, data: response.data.data };
            }
        } catch (err) {
            console.error("Adjust stock error:", err);
            const errorMessage =
                err.response?.data?.message || t("products.failed_adjust_stock");
            toast.error(errorMessage);
            return { success: false, error: errorMessage };
        }
    };

    // Rethrows on failure rather than swallowing to [] - the only caller
    // (ProductDetailsDrawer) needs to tell "the fetch failed" apart from
    // "this product genuinely has no movement history yet", since both
    // used to render as the exact same empty state. A transient failure
    // (network blip, or a connection-pool hiccup under concurrent load -
    // this endpoint is now fetched alongside 3 more when the drawer opens,
    // see LocationStockPanel) was silently indistinguishable from "no
    // history" instead of showing a retry.
    const fetchStockMovements = async (productId) => {
        const response = await api.get(`/products/${productId}/stock-movements`);
        return response.data.data || [];
    };

    // threshold: a non-negative integer, or null to clear it on all selected
    // products and fall back to the account/platform default instead. See
    // Backend/controllers/product.controller.js#bulkUpdateLowStockThreshold.
    const bulkUpdateLowStockThreshold = async (productIds, threshold) => {
        try {
            const response = await api.patch("/products/bulk-low-stock-threshold", {
                productIds,
                threshold,
            });

            if (response.data.success) {
                toast.success(
                    t("products.bulk_threshold_updated", { count: response.data.data.updatedCount })
                );
                setProducts((prev) =>
                    prev.map((p) =>
                        productIds.includes(p._id) ? { ...p, low_stock_threshold: threshold } : p
                    )
                );
                return { success: true, data: response.data.data };
            }
        } catch (err) {
            console.error("Bulk update threshold error:", err);
            const errorMessage =
                err.response?.data?.message || t("products.failed_bulk_threshold_update");
            toast.error(errorMessage);
            return { success: false, error: errorMessage };
        }
    };

    // productId + array of File objects → uploads them all in one request
    // and returns the updated product (with its full `images` gallery).
    // `onUploadProgress` is passed straight through to axios so callers can
    // show a per-request progress bar/percentage.
    const addProductImages = async (productId, files, onUploadProgress) => {
        const formData = new FormData();
        files.forEach((file) => formData.append("images", file));

        try {
            const response = await api.post(`/products/${productId}/images`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
                onUploadProgress,
            });

            if (response.data.success) {
                toast.success(t("products.images_added"));
                setProducts((prev) =>
                    prev.map((p) => (p._id === productId ? response.data.data : p))
                );
                return { success: true, data: response.data.data };
            }
        } catch (err) {
            console.error("Add product images error:", err);
            const errorMessage =
                err.response?.data?.message || t("products.image_upload_failed");
            toast.error(errorMessage);
            return { success: false, error: errorMessage };
        }
    };

    const deleteProductImage = async (productId, imageId) => {
        try {
            const response = await api.delete(`/products/${productId}/images/${imageId}`);

            if (response.data.success) {
                toast.success(t("products.image_deleted"));
                setProducts((prev) =>
                    prev.map((p) => (p._id === productId ? response.data.data : p))
                );
                return { success: true, data: response.data.data };
            }
        } catch (err) {
            console.error("Delete product image error:", err);
            const errorMessage =
                err.response?.data?.message || t("products.image_delete_failed");
            toast.error(errorMessage);
            return { success: false, error: errorMessage };
        }
    };

    const setPrimaryProductImage = async (productId, imageId) => {
        try {
            const response = await api.patch(`/products/${productId}/images/${imageId}/primary`);

            if (response.data.success) {
                toast.success(t("products.image_set_as_primary_success"));
                setProducts((prev) =>
                    prev.map((p) => (p._id === productId ? response.data.data : p))
                );
                return { success: true, data: response.data.data };
            }
        } catch (err) {
            console.error("Set primary product image error:", err);
            const errorMessage =
                err.response?.data?.message || t("products.image_set_primary_failed");
            toast.error(errorMessage);
            return { success: false, error: errorMessage };
        }
    };

    const reorderProductImages = async (productId, imageIds) => {
        try {
            const response = await api.patch(`/products/${productId}/images/reorder`, {
                image_ids: imageIds,
            });

            if (response.data.success) {
                toast.success(t("products.images_reordered"));
                setProducts((prev) =>
                    prev.map((p) => (p._id === productId ? response.data.data : p))
                );
                return { success: true, data: response.data.data };
            }
        } catch (err) {
            console.error("Reorder product images error:", err);
            const errorMessage =
                err.response?.data?.message || t("products.image_reorder_failed");
            toast.error(errorMessage);
            return { success: false, error: errorMessage };
        }
    };

    const bulkCreateProducts = async (file) => {
        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await api.post("/products/bulk-upload", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            return { success: true, data: response.data.data };
        } catch (err) {
            const errorMessage =
                err.response?.data?.message || "Bulk upload failed";
            return {
                success: false,
                error: errorMessage,
                data: err.response?.data?.data,
            };
        }
    };

    useEffect(() => {
        fetchProducts();
    }, []);

    // Refetch once a full sync cycle completes (not merely "connectivity
    // came back") - otherwise this can race the outbox drain, refetch the
    // still-stale server list, and never look again even though the sync
    // that would have added this session's own offline-created rows
    // finishes moments later.
    useEffect(() => subscribeSyncCompleted(fetchProducts), []);

    return {
        products,
        loading,
        error,
        fetchProducts,
        createProduct,
        updateProduct,
        deleteProduct,
        adjustStock,
        fetchStockMovements,
        bulkCreateProducts,
        bulkUpdateLowStockThreshold,
        addProductImages,
        deleteProductImage,
        setPrimaryProductImage,
        reorderProductImages,
    };
};
