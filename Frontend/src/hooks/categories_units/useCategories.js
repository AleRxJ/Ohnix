import { useState, useCallback, useEffect, useMemo } from "react";
import { api } from "../../api/api";
import { useAuth } from "../useAuth";
import toast from "react-hot-toast";

export const useCategories = () => {
    const { user, isAdmin } = useAuth();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [filter, setFilter] = useState("all");

    // Función interna que no depende de otras dependencias
    const loadCategoriesInternal = useCallback(async (admin) => {
        setLoading(true);
        try {
            const endpoint = admin ? "/categories/admin/all" : "/categories/user";
            console.log(`[useCategories] Loading from ${endpoint}, isAdmin=${admin}`);
            
            const response = await api.get(endpoint);
            console.log(`[useCategories] Response:`, response.data);

            if (response.data.success) {
                console.log(`[useCategories] Setting ${response.data.data.length} categories`);
                setCategories(response.data.data);
                return response.data.data;
            } else {
                console.warn(`[useCategories] API returned success=false:`, response.data);
                return [];
            }
        } catch (error) {
            console.error("[useCategories] Error:", error);
            toast.error("Failed to load categories");
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    // Wrapper que siempre usa el último valor de isAdmin
    const loadCategories = useCallback(async () => {
        return loadCategoriesInternal(isAdmin);
    }, [isAdmin, loadCategoriesInternal]);

    // Load categories on mount only
    useEffect(() => {
        console.log("[useCategories] Component mounted, loading initial categories");
        console.log("[useCategories] Current user:", user);
        console.log("[useCategories] isAdmin:", isAdmin);
        loadCategoriesInternal(isAdmin);
    }, []); // Empty dependency array - only run once

    const createCategory = useCallback(
        async (values) => {
            const loadingToast = toast.loading("Creating category...");
            try {
                console.log("[useCategories] Creating category with values:", values);
                const response = await api.post("/categories", values);
                console.log("[useCategories] Create response:", response.data);
                
                if (response.data.success) {
                    toast.success("Category created successfully", {
                        id: loadingToast,
                    });
                    console.log("[useCategories] Calling loadCategories after create");
                    const result = await loadCategories();
                    console.log("[useCategories] loadCategories returned:", result);
                    return { success: true, data: response.data.data };
                } else {
                    console.warn("[useCategories] Create returned success=false:", response.data);
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
            mine: categories.filter((cat) => {
                const match = cat.created_by._id === user?._id;
                console.log(`[useCategories] Comparing: "${cat.created_by._id}" === "${user?._id}" = ${match}`);
                return match;
            }).length,
            others: categories.filter((cat) => cat.created_by._id !== user?._id)
                .length,
        };
        console.log("[useCategories] Stats calculated:", calculated);
        console.log("[useCategories] Total categories in state:", categories.length);
        console.log("[useCategories] Categories:", categories);
        return calculated;
    }, [categories, user?._id]);

    console.log("[useCategories] About to return - stats:", stats, "categories.length:", categories.length);

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
