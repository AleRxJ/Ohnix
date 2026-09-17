import { useState, useEffect, useContext, useRef } from "react";
import { toast } from "react-hot-toast";
import { api } from "../../api/api";
import { calculateStats } from "../../utils/orderHelpers";
import AuthContext from "../../context/AuthContext";
import useI18n from "../useI18n";
import { useDataInvalidation } from "../useDataInvalidation";
import { getConnectivityState } from "../../offline/connectivity";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { readMirrorAll, mirrorUpsertMany } from "../../offline/entityQueue";

// Best-effort local equivalent of the server-side filtering in
// order.controller.js#getAllOrders, applied to whatever orders happen to be
// cached (see db.js's comment on why "orders" isn't a full mirror). Offline
// order browsing is "what's already been seen", not the full ledger.
function filterOrdersLocally(orders, filters) {
    let result = orders;
    if (filters.search) {
        const q = filters.search.toLowerCase();
        result = result.filter(
            (o) => o.invoice_no?.toLowerCase().includes(q) || o.customer_id?.name?.toLowerCase().includes(q)
        );
    }
    if (filters.customer_id) {
        result = result.filter((o) => o.customer_id?._id === filters.customer_id);
    }
    if (filters.order_status) {
        result = result.filter((o) => o.order_status === filters.order_status);
    }
    if (filters.date_range) {
        const [start, end] = filters.date_range;
        result = result.filter((o) => {
            const d = new Date(o.order_date || o.createdAt);
            return d >= start.startOf("day").toDate() && d <= end.endOf("day").toDate();
        });
    }
    if (filters.total_range?.min) {
        result = result.filter((o) => o.total >= Number(filters.total_range.min));
    }
    if (filters.total_range?.max) {
        result = result.filter((o) => o.total <= Number(filters.total_range.max));
    }
    return result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export const useOrders = () => {
    const { t } = useI18n();
    const [orders, setOrders] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 10,
        total: 0,
    });
    const [filters, setFilters] = useState({
        search: "",
        customer_id: "",
        order_status: "",
        date_range: null,
        total_range: { min: "", max: "" },
    });
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        completed: 0,
        revenue: 0,
    });

    const { user } = useContext(AuthContext);

    // Guards against out-of-order responses: e.g. the initial mount fetch
    // and a fetch triggered right after creating an order can race, and
    // without this the slower response (even if it's the stale pre-create
    // snapshot) would land last and silently overwrite the fresher one.
    const latestRequestId = useRef(0);

    const fetchOrders = async (
        page = 1,
        pageSize = 10,
        currentFilters = filters
    ) => {
        const requestId = ++latestRequestId.current;
        if (!getConnectivityState()) {
            const cached = await readMirrorAll("orders");
            const filtered = filterOrdersLocally(cached, currentFilters);
            const start = (page - 1) * pageSize;
            const pageSlice = filtered.slice(start, start + pageSize);
            if (requestId !== latestRequestId.current) return;
            setOrders(pageSlice);
            setPagination({ current: page, pageSize, total: filtered.length });
            setStats(calculateStats(filtered, { total: filtered.length }));
            return;
        }
        setLoading(true);
        try {
            const params = {
                page,
                limit: pageSize,
                ...(currentFilters.search && { search: currentFilters.search }),
                ...(currentFilters.customer_id && {
                    customer_id: currentFilters.customer_id,
                }),
                ...(currentFilters.order_status && {
                    order_status: currentFilters.order_status,
                }),
                ...(currentFilters.date_range && {
                    start_date:
                        currentFilters.date_range[0].format("YYYY-MM-DD"),
                    end_date: currentFilters.date_range[1].format("YYYY-MM-DD"),
                }),
                ...(currentFilters.total_range.min && {
                    min_total: currentFilters.total_range.min,
                }),
                ...(currentFilters.total_range.max && {
                    max_total: currentFilters.total_range.max,
                }),
            };

            const response = await api.get("/orders", { params });

            // A newer fetchOrders call started after this one - e.g. the
            // refresh right after creating an order overlapping with the
            // initial page-load fetch. Drop this stale response instead of
            // letting it clobber the fresher state.
            if (requestId !== latestRequestId.current) return;

            const {
                orders: ordersData,
                pagination: paginationData,
                stats: statsData,
            } = response.data.data;

            setOrders(ordersData);
            setPagination({
                current: paginationData.page,
                pageSize: paginationData.limit,
                total: paginationData.total,
            });
            // Computed backend-side over every matching order, not just this
            // page - see GET /orders (order.controller.js getAllOrders).
            setStats(
                statsData || calculateStats(ordersData, paginationData)
            );
            // Write-through, not replace - this is one page of a much larger
            // (server-paginated) set, not "everything" (see db.js).
            mirrorUpsertMany("orders", ordersData);
        } catch (error) {
            if (requestId !== latestRequestId.current) return;
            if (!error.response) {
                const cached = await readMirrorAll("orders");
                const filtered = filterOrdersLocally(cached, currentFilters);
                const start = (page - 1) * pageSize;
                const pageSlice = filtered.slice(start, start + pageSize);
                if (requestId !== latestRequestId.current) return;
                setOrders(pageSlice);
                setPagination({ current: page, pageSize, total: filtered.length });
                setStats(calculateStats(filtered, { total: filtered.length }));
                return;
            }
            toast.error(t("orders.failed_fetch_orders"));
            console.error("Error fetching orders:", error);
        } finally {
            if (requestId === latestRequestId.current) setLoading(false);
        }
    };

    // Reuses the same "customers"/"products" mirror tables Etapa 1 already
    // keeps warm (Customers.jsx, useProducts.js) - the order form needs the
    // exact same data those modules already cache, so there's nothing
    // Orders-specific to mirror here.
    const fetchCustomers = async () => {
        if (!getConnectivityState()) {
            setCustomers(await readMirrorAll("customers"));
            return;
        }
        try {
            const isAdmin = user?.role === "admin";
            const endpoint = isAdmin ? "/customers/all" : "/customers";
            const response = await api.get(endpoint);
            setCustomers(response.data.data);
        } catch (error) {
            if (!error.response) {
                setCustomers(await readMirrorAll("customers"));
                return;
            }
            console.error("Error fetching customers:", error);
        }
    };

    const fetchProducts = async () => {
        if (!getConnectivityState()) {
            setProducts(await readMirrorAll("products"));
            return;
        }
        try {
            const response = await api.get("/products");
            setProducts(response.data.data.products || response.data.data);
        } catch (error) {
            if (!error.response) {
                setProducts(await readMirrorAll("products"));
                return;
            }
            console.error("Error fetching products:", error);
        }
    };

    useEffect(() => {
        fetchOrders();
        fetchCustomers();
        fetchProducts();
    }, []);

    // Another connected user (or this same one, another tab) creating an
    // order, changing its status, or returning items - all of those also
    // move product stock. Re-fetches the current page/filters rather than
    // resetting to page 1 with no filters.
    useDataInvalidation(["order", "product"], () => {
        fetchOrders(pagination.current, pagination.pageSize, filters);
        fetchProducts();
    });

    // Refetch once a full sync cycle completes (pull + outbox drain) rather
    // than on the raw "connectivity is back" instant - otherwise this can
    // race the drain, refetch the still-stale server list, and never look
    // again even though the sync that would add this session's own
    // offline-created orders finishes moments later.
    useEffect(
        () =>
            subscribeSyncCompleted(() => {
                fetchOrders(pagination.current, pagination.pageSize, filters);
                fetchCustomers();
                fetchProducts();
            }),
        [pagination.current, pagination.pageSize, filters]
    );

    return {
        orders,
        customers,
        products,
        loading,
        pagination,
        filters,
        stats,
        setFilters,
        fetchOrders,
        setPagination,
    };
};
