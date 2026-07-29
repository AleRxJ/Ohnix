import { useState, useCallback, useEffect, useMemo } from "react";
import { api } from "../../api/api";
import { useAuth } from "../useAuth";
import toast from "react-hot-toast";

export const useUnits = () => {
    const { user, isAdmin } = useAuth();
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [filter, setFilter] = useState("all");

    // Función interna que no depende de otras dependencias
    const loadUnitsInternal = useCallback(async () => {
        setLoading(true);
        try {
            console.log("[useUnits] Loading units");
            const response = await api.get("/units");
            console.log("[useUnits] Response:", response.data);

            if (response.data.success) {
                console.log(`[useUnits] Setting ${response.data.data.length} units`);
                setUnits(response.data.data);
                return response.data.data;
            } else {
                console.warn("[useUnits] API returned success=false:", response.data);
                return [];
            }
        } catch (error) {
            console.error("[useUnits] Error:", error);
            toast.error("Failed to load units");
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    // Wrapper que siempre usa el último valor 
    const loadUnits = useCallback(async () => {
        return loadUnitsInternal();
    }, [loadUnitsInternal]);

    // Load units on mount only
    useEffect(() => {
        console.log("[useUnits] Component mounted, loading initial units");
        console.log("[useUnits] Current user:", user);
        console.log("[useUnits] isAdmin:", isAdmin);
        loadUnitsInternal();
    }, []); // Empty dependency array - only run once

    const createUnit = useCallback(
        async (values) => {
            const loadingToast = toast.loading("Creating unit...");
            try {
                console.log("[useUnits] Creating unit with values:", values);
                const response = await api.post("/units", values);
                console.log("[useUnits] Create response:", response.data);
                
                if (response.data.success) {
                    toast.success("Unit created successfully", {
                        id: loadingToast,
                    });
                    console.log("[useUnits] Calling loadUnits after create");
                    const result = await loadUnits();
                    console.log("[useUnits] loadUnits returned:", result);
                    return { success: true, data: response.data.data };
                } else {
                    console.warn("[useUnits] Create returned success=false:", response.data);
                    toast.error(response.data.message || "Failed to create unit", { id: loadingToast });
                    return { success: false, error: response.data.message };
                }
            } catch (error) {
                const errorMsg =
                    error.response?.data?.message || "Failed to create unit";
                console.error("[useUnits] Create error:", error);
                toast.error(errorMsg, { id: loadingToast });
                return { success: false, error: errorMsg };
            }
        },
        [loadUnits]
    );

    const updateUnit = useCallback(
        async (id, values) => {
            const loadingToast = toast.loading("Updating unit...");
            try {
                const response = await api.patch(`/units/${id}`, values);
                if (response.data.success) {
                    toast.success("Unit updated successfully", {
                        id: loadingToast,
                    });
                    await loadUnits();
                    return { success: true, data: response.data.data };
                }
            } catch (error) {
                const errorMsg =
                    error.response?.data?.message || "Failed to update unit";
                toast.error(errorMsg, { id: loadingToast });
                return { success: false, error: errorMsg };
            }
        },
        [loadUnits]
    );

    const deleteUnit = useCallback(
        async (id) => {
            const loadingToast = toast.loading("Deleting unit...");
            try {
                const response = await api.delete(`/units/${id}`);
                if (response.data.success) {
                    toast.success("Unit deleted successfully", {
                        id: loadingToast,
                    });
                    await loadUnits();
                    return { success: true };
                }
            } catch (error) {
                const errorMsg =
                    error.response?.data?.message || "Failed to delete unit";
                toast.error(errorMsg, { id: loadingToast });
                return { success: false, error: errorMsg };
            }
        },
        [loadUnits]
    );

    const filteredUnits = units.filter((unit) => {
        const matchesSearch = unit.unit_name
            .toLowerCase()
            .includes(searchText.toLowerCase());
        const matchesFilter =
            filter === "all" ||
            (filter === "mine" && unit.created_by._id === user?._id) ||
            (filter === "others" && unit.created_by._id !== user?._id);
        return matchesSearch && matchesFilter;
    });

    const canEdit = useCallback(
        (unit) => {
            return isAdmin || unit.created_by._id === user?._id;
        },
        [isAdmin, user]
    );

    const clearFilters = useCallback(() => {
        setSearchText("");
        setFilter("all");
    }, []);

    const stats = useMemo(() => {
        const calculated = {
            total: units.length,
            mine: units.filter((unit) => {
                const match = unit.created_by._id === user?._id;
                console.log(`[useUnits] Comparing: "${unit.created_by._id}" === "${user?._id}" = ${match}`);
                return match;
            }).length,
            others: units.filter((unit) => unit.created_by._id !== user?._id)
                .length,
        };
        console.log("[useUnits] Stats calculated:", calculated);
        console.log("[useUnits] Total units in state:", units.length);
        console.log("[useUnits] Units:", units);
        return calculated;
    }, [units, user?._id]);

    console.log("[useUnits] About to return - stats:", stats, "units.length:", units.length);

    return {
        units: filteredUnits,
        loading,
        searchText,
        setSearchText,
        filter,
        setFilter,
        stats,
        loadUnits,
        createUnit,
        updateUnit,
        deleteUnit,
        canEdit,
        clearFilters,
    };
};
