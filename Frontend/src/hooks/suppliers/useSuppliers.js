import { useState, useEffect, useRef } from "react";
import { toast } from "react-hot-toast";
import { api } from "../../api/api";
import useI18n from "../useI18n";

export const useSuppliers = (isAdmin = false) => {
    const { t } = useI18n();
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
        setLoading(true);
        try {
            // Use admin route if user is admin, otherwise use regular route
            const endpoint = isAdmin ? "/suppliers/admin/all" : "/suppliers";
            const response = await api.get(endpoint);
            if (requestId !== latestRequestId.current) return;
            setSuppliers(response.data.data);
            calculateStats(response.data.data);
        } catch (error) {
            if (requestId !== latestRequestId.current) return;
            toast.error(t("suppliers.failed_fetch_suppliers"));
            console.error("Error fetching suppliers:", error);
        } finally {
            if (requestId === latestRequestId.current) setLoading(false);
        }
    };

    const createSupplier = async (formData) => {
        try {
            await api.post("/suppliers", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            toast.success(t("suppliers.supplier_added"));
            fetchSuppliers();
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || t("suppliers.creation_failed"));
            return false;
        }
    };

    const updateSupplier = async (id, formData) => {
        try {
            await api.patch(`/suppliers/${id}`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            toast.success(t("suppliers.supplier_updated"));
            fetchSuppliers();
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || t("suppliers.update_failed"));
            return false;
        }
    };

    const deleteSupplier = async (id) => {
        try {
            await api.delete(`/suppliers/${id}`);
            toast.success(t("suppliers.supplier_deleted"));
            fetchSuppliers();
        } catch (error) {
            toast.error(t("suppliers.failed_delete_supplier"));
        }
    };

    useEffect(() => {
        fetchSuppliers();
    }, [isAdmin]);

    return {
        suppliers,
        loading,
        stats,
        fetchSuppliers,
        createSupplier,
        updateSupplier,
        deleteSupplier,
    };
};
