import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../../api/api.js";
import useI18n from "../useI18n";
import { getConnectivityState } from "../../offline/connectivity";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { readMirrorAll, mirrorUpsertMany, queueCreate } from "../../offline/entityQueue";
import { resolveApiErrorMessage } from "../../utils/apiError";

// Best-effort local equivalent of the server-side filtering in
// warranty.service.js#getWarrantyList, applied to whatever page(s) happen to
// already be cached - same "what's already been seen, not the full ledger"
// posture as Orders (see db.js's comment on why "warranties" isn't a full
// mirror: GET /warranties paginates server-side).
function filterWarrantiesLocally(warranties, filters = {}) {
    return warranties.filter((w) => {
        if (filters.status && w.status !== filters.status) return false;
        if (filters.customer_id && w.customer?._id !== filters.customer_id) return false;
        if (filters.product_id && w.product?._id !== filters.product_id) return false;
        if (filters.invoice_no && !w.invoice_no?.toLowerCase().includes(filters.invoice_no.toLowerCase())) return false;
        if (filters.search) {
            const q = filters.search.toLowerCase();
            const haystack = [w.warranty_number, w.product?.product_name, w.customer?.name, w.invoice_no].join(" ").toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        if (filters.view === "overdue" && !(new Date(w.due_date) < new Date() && !["delivered", "closed"].includes(w.status))) return false;
        if (filters.view === "open" && ["delivered", "closed"].includes(w.status)) return false;
        if (filters.view === "closed" && !["delivered", "closed"].includes(w.status)) return false;
        return true;
    });
}

export const useWarranties = () => {
    const { t } = useI18n();
    const [warranties, setWarranties] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
    const [filters, setFilters] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [dashboard, setDashboard] = useState(null);
    const [dashboardLoading, setDashboardLoading] = useState(false);

    const latestRequestId = useRef(0);

    const fetchWarranties = useCallback(async (page = 1, pageSize = 20, currentFilters = filters) => {
        const requestId = ++latestRequestId.current;
        if (!getConnectivityState()) {
            const cached = await readMirrorAll("warranties");
            const filtered = filterWarrantiesLocally(cached, currentFilters);
            if (requestId !== latestRequestId.current) return;
            setWarranties(filtered.slice((page - 1) * pageSize, page * pageSize));
            setPagination({ current: page, pageSize, total: filtered.length });
            return;
        }

        setLoading(true);
        try {
            const params = { ...currentFilters, page, page_size: pageSize };
            const response = await api.get("/warranties", { params });
            if (requestId !== latestRequestId.current) return;
            const data = response.data.data;
            setWarranties(data.items);
            setPagination({ current: data.page, pageSize: data.page_size, total: data.total });
            mirrorUpsertMany("warranties", data.items);
        } catch (error) {
            if (requestId !== latestRequestId.current) return;
            if (!error.response) {
                const cached = await readMirrorAll("warranties");
                const filtered = filterWarrantiesLocally(cached, currentFilters);
                setWarranties(filtered.slice((page - 1) * pageSize, page * pageSize));
                setPagination({ current: page, pageSize, total: filtered.length });
                return;
            }
            toast.error(resolveApiErrorMessage(error, t) || t("warranties.error_fetching"));
        } finally {
            if (requestId === latestRequestId.current) setLoading(false);
        }
    }, [filters, t]);

    const fetchDashboard = useCallback(async () => {
        if (!getConnectivityState()) return;
        setDashboardLoading(true);
        try {
            const response = await api.get("/warranties/dashboard");
            setDashboard(response.data.data);
        } catch (error) {
            console.error("Error fetching warranty dashboard:", error);
        } finally {
            setDashboardLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchWarranties(1, pagination.pageSize, filters);
        fetchDashboard();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    useEffect(
        () =>
            subscribeSyncCompleted(() => {
                fetchWarranties(pagination.current, pagination.pageSize, filters);
                fetchDashboard();
            }),
        [pagination.current, pagination.pageSize, filters, fetchWarranties, fetchDashboard]
    );

    const lookupSale = useCallback(async (query) => {
        if (!getConnectivityState() || !query?.trim()) return [];
        try {
            const response = await api.get("/warranties/lookup/sale", { params: { query } });
            return response.data.data || [];
        } catch (error) {
            console.error("Error looking up sale:", error);
            return [];
        }
    }, []);

    const createWarranty = async (values) => {
        setSubmitting(true);
        try {
            if (!getConnectivityState()) {
                await queueCreate({
                    entity: "warranties",
                    url: "/warranties",
                    fields: values,
                    optimisticExtra: { status: "registered", warranty_number: t("warranties.pending_sync_number") },
                });
                toast.success(t("common.offline_saved_locally"));
                await fetchWarranties(pagination.current, pagination.pageSize, filters);
                return true;
            }
            await api.post("/warranties", values);
            toast.success(t("warranties.created_successfully"));
            await fetchWarranties(1, pagination.pageSize, filters);
            await fetchDashboard();
            return true;
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t) || t("warranties.error_creating"));
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const deleteWarranty = async (id) => {
        try {
            await api.delete(`/warranties/${id}`);
            toast.success(t("warranties.deleted_successfully"));
            await fetchWarranties(pagination.current, pagination.pageSize, filters);
            return true;
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t) || t("warranties.error_deleting"));
            return false;
        }
    };

    return {
        warranties,
        loading,
        pagination,
        filters,
        setFilters,
        submitting,
        dashboard,
        dashboardLoading,
        fetchWarranties,
        fetchDashboard,
        lookupSale,
        createWarranty,
        deleteWarranty,
    };
};
