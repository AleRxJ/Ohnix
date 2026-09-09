import { useState, useEffect, useRef } from "react";
import { toast } from "react-hot-toast";
import { api } from "../../api/api";
import useI18n from "../useI18n";
import { useInventoryTour } from "../../context/InventoryTourContext";
import { resolveApiErrorMessage } from "../../utils/apiError";
import { useDataInvalidation } from "../useDataInvalidation";
import { getConnectivityState } from "../../offline/connectivity";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { queueCreate, queueUpdate, queueDelete, readMirrorAll, mirrorReplaceAll } from "../../offline/entityQueue";

const DELETE_SUPPLIER_ERROR_CODES = {
    supplier_has_purchases: "suppliers.delete_conflict_purchases",
};

const SAVE_SUPPLIER_ERROR_CODES = {
    stale_edit_conflict: "common.stale_edit_conflict",
};

export const useSuppliers = (isAdmin = false) => {
    const { t } = useI18n();
    const { isOpen: isTutorialActive, notifyAction } = useInventoryTour();
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({
        individual: 0,
        wholesale: 0,
        retail: 0,
        company: 0,
    });
    // Guards against the initial mount fetch and a post-create refetch
    // racing and resolving out of order - see useOrders.js for the
    // confirmed real-world case this prevents (a slower stale response
    // landing after a faster fresh one and clobbering it).
    const latestRequestId = useRef(0);

    const calculateStats = (suppliersData) => {
        const individual = suppliersData.filter(
            (s) => s.type === "individual"
        ).length;
        const wholesale = suppliersData.filter(
            (s) => s.type === "wholesale"
        ).length;
        const retail = suppliersData.filter((s) => s.type === "retail").length;
        const company = suppliersData.filter(
            (s) => s.type === "company"
        ).length;

        setStats({ individual, wholesale, retail, company });
    };

    const fetchSuppliers = async () => {
        const requestId = ++latestRequestId.current;
        if (!getConnectivityState()) {
            // Admin's "every account's suppliers" view has no offline
            // equivalent - the mirror only ever holds the signed-in
            // account's own suppliers (same rows the offline user endpoint
            // would return).
            const local = isAdmin ? [] : await readMirrorAll("suppliers");
            if (requestId !== latestRequestId.current) return;
            setSuppliers(local);
            calculateStats(local);
            return;
        }
        setLoading(true);
        try {
            // Use admin route if user is admin, otherwise use regular route
            const endpoint = isAdmin ? "/suppliers/admin/all" : "/suppliers";
            const response = await api.get(endpoint);
            if (requestId !== latestRequestId.current) return;
            setSuppliers(response.data.data);
            calculateStats(response.data.data);
            if (!isAdmin) mirrorReplaceAll("suppliers", response.data.data);
        } catch (error) {
            if (requestId !== latestRequestId.current) return;
            toast.error(t("suppliers.failed_fetch_suppliers"));
            console.error("Error fetching suppliers:", error);
        } finally {
            if (requestId === latestRequestId.current) setLoading(false);
        }
    };

    const createSupplier = async (formData) => {
        if (isTutorialActive) {
            formData.append("is_tutorial_data", "true");
        }
        if (!getConnectivityState()) {
            await queueCreate({ entity: "suppliers", url: "/suppliers", fields: formData });
            toast.success(t("common.offline_saved_locally"));
            await fetchSuppliers();
            return true;
        }
        try {
            const response = await api.post("/suppliers", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            toast.success(t("suppliers.supplier_added"));
            fetchSuppliers();
            if (isTutorialActive) {
                const created = response.data?.data;
                notifyAction("supplier", created ? { id: created._id, name: created.name } : undefined);
            }
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || t("suppliers.creation_failed"));
            return false;
        }
    };

    const updateSupplier = async (id, formData) => {
        if (!getConnectivityState()) {
            await queueUpdate({ entity: "suppliers", url: `/suppliers/${id}`, id, fields: formData });
            toast.success(t("common.offline_saved_locally"));
            await fetchSuppliers();
            return true;
        }
        try {
            await api.patch(`/suppliers/${id}`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            toast.success(t("suppliers.supplier_updated"));
            fetchSuppliers();
            return true;
        } catch (error) {
            toast.error(
                resolveApiErrorMessage(
                    error,
                    t,
                    SAVE_SUPPLIER_ERROR_CODES,
                    "suppliers.update_failed"
                )
            );
            return false;
        }
    };

    const moveSupplier = async (id, pointOfSaleId) => {
        try {
            await api.patch(`/suppliers/${id}/point-of-sale`, { point_of_sale_id: pointOfSaleId });
            toast.success(t("pointOfSale.moved_success"));
            fetchSuppliers();
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || t("pointOfSale.move_failed"));
            return false;
        }
    };

    const deleteSupplier = async (id) => {
        if (!getConnectivityState()) {
            await queueDelete({ entity: "suppliers", url: `/suppliers/${id}`, id });
            toast.success(t("common.offline_deleted_locally"));
            await fetchSuppliers();
            return;
        }
        try {
            await api.delete(`/suppliers/${id}`);
            toast.success(t("suppliers.supplier_deleted"));
            fetchSuppliers();
        } catch (error) {
            toast.error(
                resolveApiErrorMessage(
                    error,
                    t,
                    DELETE_SUPPLIER_ERROR_CODES,
                    "suppliers.failed_delete_supplier"
                )
            );
        }
    };

    useEffect(() => {
        fetchSuppliers();
    }, [isAdmin]);

    // Another connected user (or this same one, another tab) creating,
    // editing, or deleting a supplier.
    useDataInvalidation("supplier", fetchSuppliers);

    // Coming back online: refetch for real (replaces any offline-queued
    // optimistic rows with the server's canonical view once the outbox has
    // had a chance to drain).
    useEffect(() => subscribeSyncCompleted(fetchSuppliers), []);

    return {
        suppliers,
        loading,
        stats,
        fetchSuppliers,
        createSupplier,
        updateSupplier,
        deleteSupplier,
        moveSupplier,
    };
};
