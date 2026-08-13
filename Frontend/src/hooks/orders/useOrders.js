import { useState, useEffect, useContext, useRef } from "react";
import { toast } from "react-hot-toast";
import { api } from "../../api/api";
import { calculateStats } from "../../utils/orderHelpers";
import AuthContext from "../../context/AuthContext";
import useI18n from "../useI18n";

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
        } catch (error) {
            if (requestId !== latestRequestId.current) return;
            toast.error(t("orders.failed_fetch_orders"));
            console.error("Error fetching orders:", error);
        } finally {
            if (requestId === latestRequestId.current) setLoading(false);
        }
    };

    const fetchCustomers = async () => {
        try {
            const isAdmin = user?.role === "admin";
            const endpoint = isAdmin ? "/customers/all" : "/customers";
            const response = await api.get(endpoint);
            setCustomers(response.data.data);
        } catch (error) {
            console.error("Error fetching customers:", error);
        }
    };

    const fetchProducts = async () => {
        try {
            const response = await api.get("/products");
            setProducts(response.data.data.products || response.data.data);
        } catch (error) {
            console.error("Error fetching products:", error);
        }
    };

    useEffect(() => {
        fetchOrders();
        fetchCustomers();
        fetchProducts();
    }, []);

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
