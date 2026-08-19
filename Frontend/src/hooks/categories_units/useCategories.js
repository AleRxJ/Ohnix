import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { api } from "../../api/api";
import { useAuth } from "../useAuth";
import toast from "react-hot-toast";
import useI18n from "../useI18n";
import { useInventoryTour } from "../../context/InventoryTourContext";
import { resolveApiErrorMessage } from "../../utils/apiError";

const DELETE_CATEGORY_ERROR_CODES = {
    category_has_products: "categories.delete_conflict_products",
};

const SAVE_CATEGORY_ERROR_CODES = {
    category_already_exists: "categories.duplicate_category_message",
};

export const useCategories = () => {
    const { user, isAdmin } = useAuth();
    const { t } = useI18n();
    const { isOpen: isTutorialActive, notifyAction } = useInventoryTour();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [filter, setFilter] = useState("all");
    // Guards against the initial mount fetch and a post-create refetch
    // racing and resolving out of order - see useOrders.js for the
    // confirmed real-world case this prevents.
    const latestRequestId = useRef(0);

    // Función interna que no depende de otras dependencias
    const loadCategoriesInternal = useCallback(async (admin) => {
        const requestId = ++latestRequestId.current;
        setLoading(true);
        try {
            const endpoint = admin ? "/categories/admin/all" : "/categories/user";
            const response = await api.get(endpoint);
            if (requestId !== latestRequestId.current) return [];

            if (response.data.success) {
                setCategories(response.data.data);
                return response.data.data;
            } else {
                return [];
            }
        } catch (error) {
            if (requestId !== latestRequestId.current) return [];
            console.error("[useCategories] Error:", error);
            toast.error(t("categories.failed_load_categories"));
            return [];
        } finally {
            if (requestId === latestRequestId.current) setLoading(false);
        }
    }, []);

    // Wrapper que siempre usa el último valor de isAdmin
    const loadCategories = useCallback(async () => {
        return loadCategoriesInternal(isAdmin);
    }, [isAdmin, loadCategoriesInternal]);

    // Load categories on mount only
    useEffect(() => {
        loadCategoriesInternal(isAdmin);
    }, []); // Empty dependency array - only run once

    const createCategory = useCallback(
        async (values) => {
            const loadingToast = toast.loading(t("categories.creating_category"));
            try {
                const response = await api.post("/categories", {
                    ...values,
                    ...(isTutorialActive && { is_tutorial_data: true }),
                });

                if (response.data.success) {
                    toast.success(t("categories.category_added"), {
                        id: loadingToast,
                    });
                    await loadCategories();
                    if (isTutorialActive) {
                        const created = response.data.data;
                        notifyAction("category", created ? { id: created._id, name: created.category_name } : undefined);
                    }
                    return { success: true, data: response.data.data };
                } else {
                    toast.error(response.data.message || t("categories.failed_create_category"), { id: loadingToast });
                    return { success: false, error: response.data.message };
                }
            } catch (error) {
                const errorMsg = resolveApiErrorMessage(
                    error,
                    t,
                    SAVE_CATEGORY_ERROR_CODES,
                    "categories.failed_create_category"
                );
                console.error("[useCategories] Create error:", error);
                toast.error(errorMsg, { id: loadingToast });
                return { success: false, error: errorMsg };
            }
        },
        [loadCategories, isTutorialActive, notifyAction]
    );

    const updateCategory = useCallback(
        async (id, values) => {
            const loadingToast = toast.loading(t("categories.updating_category"));
            try {
                const endpoint = isAdmin
                    ? `/categories/admin/${id}`
                    : `/categories/user/${id}`;

                const response = await api.patch(endpoint, values);
                if (response.data.success) {
                    toast.success(t("categories.category_updated"), {
                        id: loadingToast,
                    });
                    await loadCategories();
                    return { success: true, data: response.data.data };
                }
            } catch (error) {
                const errorMsg = resolveApiErrorMessage(
                    error,
                    t,
                    SAVE_CATEGORY_ERROR_CODES,
                    "categories.failed_update_category"
                );
                toast.error(errorMsg, { id: loadingToast });
                return { success: false, error: errorMsg };
            }
        },
        [isAdmin, loadCategories]
    );

    const deleteCategory = useCallback(
        async (id) => {
            const loadingToast = toast.loading(t("categories.deleting_category"));
            try {
                const endpoint = isAdmin
                    ? `/categories/admin/${id}`
                    : `/categories/user/${id}`;

                const response = await api.delete(endpoint);
                if (response.data.success) {
                    toast.success(t("categories.category_deleted"), {
                        id: loadingToast,
                    });
                    await loadCategories();
                    return { success: true };
                }
            } catch (error) {
                const errorMsg = resolveApiErrorMessage(
                    error,
                    t,
                    DELETE_CATEGORY_ERROR_CODES,
                    "categories.failed_delete_category"
                );
                toast.error(errorMsg, { id: loadingToast });
                return { success: false, error: errorMsg };
            }
        },
        [isAdmin, loadCategories]
    );

    const filteredCategories = categories.filter((category) => {
        const matchesSearch = category.category_name
            .toLowerCase()
            .includes(searchText.toLowerCase());
        const matchesFilter =
            filter === "all" ||
            (filter === "mine" && category.created_by._id === user?._id) ||
            (filter === "others" && category.created_by._id !== user?._id);
        return matchesSearch && matchesFilter;
    });

    const canEdit = useCallback(
        (category) => {
            return isAdmin || category.created_by._id === user?._id;
        },
        [isAdmin, user]
    );

    const clearFilters = useCallback(() => {
        setSearchText("");
        setFilter("all");
    }, []);

    const stats = useMemo(() => {
        const inUse = categories.filter((cat) => (cat.products_count ?? 0) > 0)
            .length;
        return {
            total: categories.length,
            inUse,
            unused: categories.length - inUse,
        };
    }, [categories]);

    return {
        categories: filteredCategories,
        loading,
        searchText,
        setSearchText,
        filter,
        setFilter,
        stats,
        loadCategories,
        createCategory,
        updateCategory,
        deleteCategory,
        canEdit,
        clearFilters,
    };
};
