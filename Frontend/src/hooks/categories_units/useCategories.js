import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { api } from "../../api/api";
import { useAuth } from "../useAuth";
import toast from "react-hot-toast";

export const useCategories = () => {
    const { user, isAdmin } = useAuth();
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
            toast.error("Failed to load categories");
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
            const loadingToast = toast.loading("Creating category...");
            try {
                const response = await api.post("/categories", values);

                if (response.data.success) {
                    toast.success("Category created successfully", {
                        id: loadingToast,
                    });
                    await loadCategories();
                    return { success: true, data: response.data.data };
                } else {
                    toast.error(response.data.message || "Failed to create category", { id: loadingToast });
                    return { success: false, error: response.data.message };
                }
            } catch (error) {
                const errorMsg =
                    error.response?.data?.message ||
                    "Failed to create category";
                console.error("[useCategories] Create error:", error);
                toast.error(errorMsg, { id: loadingToast });
                return { success: false, error: errorMsg };
            }
        },
        [loadCategories]
    );

    const updateCategory = useCallback(
        async (id, values) => {
            const loadingToast = toast.loading("Updating category...");
            try {
                const endpoint = isAdmin
                    ? `/categories/admin/${id}`
                    : `/categories/user/${id}`;

                const response = await api.patch(endpoint, values);
                if (response.data.success) {
                    toast.success("Category updated successfully", {
                        id: loadingToast,
                    });
                    await loadCategories();
                    return { success: true, data: response.data.data };
                }
            } catch (error) {
                const errorMsg =
                    error.response?.data?.message ||
                    "Failed to update category";
                toast.error(errorMsg, { id: loadingToast });
                return { success: false, error: errorMsg };
            }
        },
        [isAdmin, loadCategories]
    );

    const deleteCategory = useCallback(
        async (id) => {
            const loadingToast = toast.loading("Deleting category...");
            try {
                const endpoint = isAdmin
                    ? `/categories/admin/${id}`
                    : `/categories/user/${id}`;

                const response = await api.delete(endpoint);
                if (response.data.success) {
                    toast.success("Category deleted successfully", {
                        id: loadingToast,
                    });
                    await loadCategories();
                    return { success: true };
                }
            } catch (error) {
                const errorMsg =
                    error.response?.data?.message ||
                    "Failed to delete category";
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
        const calculated = {
            total: categories.length,
            mine: categories.filter((cat) => cat.created_by._id === user?._id)
                .length,
            others: categories.filter((cat) => cat.created_by._id !== user?._id)
                .length,
        };
        return calculated;
    }, [categories, user?._id]);

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
