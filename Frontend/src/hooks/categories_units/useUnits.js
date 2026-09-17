import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { api } from "../../api/api";
import { useAuth } from "../useAuth";
import toast from "react-hot-toast";
import useI18n from "../useI18n";
import { useInventoryTour } from "../../context/InventoryTourContext";
import { resolveApiErrorMessage } from "../../utils/apiError";
import { useDataInvalidation } from "../useDataInvalidation";
import { getConnectivityState } from "../../offline/connectivity";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { queueCreate, queueUpdate, queueDelete, readMirrorAll, mirrorReplaceAll } from "../../offline/entityQueue";

const DELETE_UNIT_ERROR_CODES = {
    unit_has_products: "units.delete_conflict_products",
};

const SAVE_UNIT_ERROR_CODES = {
    unit_already_exists: "units.duplicate_unit_message",
    stale_edit_conflict: "common.stale_edit_conflict",
};

export const useUnits = () => {
    const { user, isAdmin } = useAuth();
    const { t } = useI18n();
    const { isOpen: isTutorialActive, notifyAction } = useInventoryTour();
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [filter, setFilter] = useState("all");
    // Guards against the initial mount fetch and a post-create refetch
    // racing and resolving out of order - see useOrders.js for the
    // confirmed real-world case this prevents.
    const latestRequestId = useRef(0);

    // Función interna que no depende de otras dependencias
    const loadUnitsInternal = useCallback(async () => {
        const requestId = ++latestRequestId.current;
        if (!getConnectivityState()) {
            const local = await readMirrorAll("units");
            if (requestId !== latestRequestId.current) return local;
            setUnits(local);
            return local;
        }
        setLoading(true);
        try {
            const response = await api.get("/units");
            if (requestId !== latestRequestId.current) return [];

            if (response.data.success) {
                setUnits(response.data.data);
                mirrorReplaceAll("units", response.data.data);
                return response.data.data;
            } else {
                return [];
            }
        } catch (error) {
            if (requestId !== latestRequestId.current) return [];
            if (!error.response) {
                const local = await readMirrorAll("units");
                if (requestId !== latestRequestId.current) return [];
                setUnits(local);
                return local;
            }
            console.error("[useUnits] Error:", error);
            toast.error(t("units.failed_load_units"));
            return [];
        } finally {
            if (requestId === latestRequestId.current) setLoading(false);
        }
    }, []);

    // Wrapper que siempre usa el último valor
    const loadUnits = useCallback(async () => {
        return loadUnitsInternal();
    }, [loadUnitsInternal]);

    // Load units on mount only
    useEffect(() => {
        loadUnitsInternal();
    }, []); // Empty dependency array - only run once

    // Another connected user (or this same one, another tab) creating,
    // renaming, or deleting a unit.
    useDataInvalidation("unit", loadUnits);

    // Coming back online: refetch for real (replaces any offline-queued
    // optimistic rows with the server's canonical view once the outbox has
    // had a chance to drain).
    useEffect(() => subscribeSyncCompleted(loadUnits), [loadUnits]);

    const createUnit = useCallback(
        async (values) => {
            if (!getConnectivityState()) {
                await queueCreate({
                    entity: "units",
                    url: "/units",
                    fields: values,
                    optimisticExtra: { created_by: { _id: user?._id, username: user?.username }, products_count: 0 },
                });
                toast.success(t("common.offline_saved_locally"));
                await loadUnits();
                return { success: true };
            }
            const loadingToast = toast.loading(t("units.creating_unit"));
            try {
                const response = await api.post("/units", {
                    ...values,
                    ...(isTutorialActive && { is_tutorial_data: true }),
                });

                if (response.data.success) {
                    toast.success(t("units.unit_created"), {
                        id: loadingToast,
                    });
                    await loadUnits();
                    if (isTutorialActive) {
                        const created = response.data.data;
                        notifyAction("unit", created ? { id: created._id, name: created.unit_name } : undefined);
                    }
                    return { success: true, data: response.data.data };
                } else {
                    toast.error(response.data.message || t("units.failed_create_unit"), { id: loadingToast });
                    return { success: false, error: response.data.message };
                }
            } catch (error) {
                const errorMsg = resolveApiErrorMessage(
                    error,
                    t,
                    SAVE_UNIT_ERROR_CODES,
                    "units.failed_create_unit"
                );
                console.error("[useUnits] Create error:", error);
                toast.error(errorMsg, { id: loadingToast });
                return { success: false, error: errorMsg };
            }
        },
        [loadUnits, isTutorialActive, notifyAction, user]
    );

    const updateUnit = useCallback(
        async (id, values) => {
            if (!getConnectivityState()) {
                await queueUpdate({ entity: "units", url: `/units/${id}`, id, fields: values });
                toast.success(t("common.offline_saved_locally"));
                await loadUnits();
                return { success: true };
            }
            const loadingToast = toast.loading(t("units.updating_unit"));
            try {
                const response = await api.patch(`/units/${id}`, values);
                if (response.data.success) {
                    toast.success(t("units.unit_updated"), {
                        id: loadingToast,
                    });
                    await loadUnits();
                    return { success: true, data: response.data.data };
                }
            } catch (error) {
                const errorMsg = resolveApiErrorMessage(
                    error,
                    t,
                    SAVE_UNIT_ERROR_CODES,
                    "units.failed_update_unit"
                );
                toast.error(errorMsg, { id: loadingToast });
                return { success: false, error: errorMsg };
            }
        },
        [loadUnits]
    );

    const deleteUnit = useCallback(
        async (id) => {
            if (!getConnectivityState()) {
                await queueDelete({ entity: "units", url: `/units/${id}`, id });
                toast.success(t("common.offline_deleted_locally"));
                await loadUnits();
                return { success: true };
            }
            const loadingToast = toast.loading(t("units.deleting_unit"));
            try {
                const response = await api.delete(`/units/${id}`);
                if (response.data.success) {
                    toast.success(t("units.unit_deleted"), {
                        id: loadingToast,
                    });
                    await loadUnits();
                    return { success: true };
                }
            } catch (error) {
                const errorMsg = resolveApiErrorMessage(
                    error,
                    t,
                    DELETE_UNIT_ERROR_CODES,
                    "units.failed_delete_unit"
                );
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
            (filter === "mine" && unit.created_by?._id === user?._id) ||
            (filter === "others" && unit.created_by?._id !== user?._id);
        return matchesSearch && matchesFilter;
    });

    const canEdit = useCallback(
        (unit) => {
            return isAdmin || unit.created_by?._id === user?._id;
        },
        [isAdmin, user]
    );

    const clearFilters = useCallback(() => {
        setSearchText("");
        setFilter("all");
    }, []);

    const stats = useMemo(() => {
        const inUse = units.filter((unit) => (unit.products_count ?? 0) > 0)
            .length;
        return {
            total: units.length,
            inUse,
            unused: units.length - inUse,
        };
    }, [units]);

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
