import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../../api/api";
import useI18n from "../useI18n";
import { resolveApiErrorMessage } from "../../utils/apiError";
import { idempotencyHeaders } from "../../utils/idempotency";

const DELETE_PRODUCT_ERROR_CODES = {
    product_has_history: "products.delete_conflict_history",
};

export const useProducts = () => {
    const { t } = useI18n();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchProducts = async (filters = {}) => {
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
            } else {
                setError(t("products.failed_load_products"));
                toast.error(t("products.failed_load_products"));
            }
        } catch (err) {
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
            const errorMessage =
                err.response?.data?.message || t("products.failed_update_product");
            toast.error(errorMessage);
            return { success: false, error: errorMessage };
        }
    };

    const deleteProduct = async (productId) => {
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

    const adjustStock = async (productId, { delta, reason }) => {
        try {
            const response = await api.post(
                `/products/${productId}/adjust-stock`,
                { delta, reason },
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

    const fetchStockMovements = async (productId) => {
        try {
            const response = await api.get(`/products/${productId}/stock-movements`);
            if (response.data.success) {
                return response.data.data;
            }
            return [];
        } catch (err) {
            console.error("Fetch stock movements error:", err);
            toast.error(t("products.failed_load_stock_movements"));
            return [];
        }
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
    };
};
