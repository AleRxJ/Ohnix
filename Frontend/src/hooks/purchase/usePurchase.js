import { useState, useEffect, useContext, useRef } from "react";
import { message } from "antd";
import toast from "react-hot-toast";
import { api } from "../../api/api.js";
import { calculateStats } from "../../utils/purchaseUtils.js";
import AuthContext from "../../context/AuthContext.jsx";
import { formatCurrency } from "../../utils/currency.js";
import useI18n from "../useI18n";
import { useInventoryTour } from "../../context/InventoryTourContext";

export const usePurchase = () => {
    const { t } = useI18n();
    const { isOpen: isTutorialActive } = useInventoryTour();
    const [purchases, setPurchases] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [purchaseDetails, setPurchaseDetails] = useState([]);
    const [returnPreviewData, setReturnPreviewData] = useState(null);
    const [stats, setStats] = useState({
        pending: 0,
        completed: 0,
        returned: 0,
        total: 0,
    });

    const { user } = useContext(AuthContext);

    // Guards against the initial mount fetch and a post-create refetch
    // racing and resolving out of order - see useOrders.js for the
    // confirmed real-world case this prevents.
    const latestRequestId = useRef(0);

    // Fetch all purchases
    const fetchPurchases = async () => {
        const requestId = ++latestRequestId.current;
        setLoading(true);
        try {
            const response = await api.get("/purchases");
            if (requestId !== latestRequestId.current) return;
            if (response.data.success) {
                setPurchases(response.data.data);
                setStats(calculateStats(response.data.data));
            } else {
                toast.error(t("purchases.failed_fetch_purchases"));
            }
        } catch (error) {
            if (requestId !== latestRequestId.current) return;
            toast.error(t("purchases.error_fetching_purchases"));
            console.error("Error:", error);
        } finally {
            if (requestId === latestRequestId.current) setLoading(false);
        }
    };

    // Fetch suppliers
    const fetchSuppliers = async () => {
        let response;
        try {
            if (user.role === "admin") {
                response = await api.get("/suppliers/admin/all");
            } else {
                response = await api.get("/suppliers");
            }
            if (response.data.success) {
                setSuppliers(response.data.data);
            }
        } catch (error) {
            toast.error(t("purchases.error_fetching_suppliers"));
            console.error("Error:", error);
        }
    };

    // Fetch products
    const fetchProducts = async () => {
        try {
            const response = await api.get("/products");
            if (response.data.success) {
                setProducts(response.data.data);
            }
        } catch (error) {
            toast.error(t("purchases.error_fetching_products"));
            console.error("Error:", error);
        }
    };

    // Fetch purchase details
    const fetchPurchaseDetails = async (purchaseId) => {
        try {
            const response = await api.get(`/purchases/${purchaseId}`);
            if (response.data.success) {
                setPurchaseDetails(response.data.data);
                return response.data.data;
            }
        } catch (error) {
            toast.error(t("purchases.error_fetching_purchase_details"));
            console.error("Error:", error);
        }
    };

    // Fetch return preview
    const fetchReturnPreview = async (purchaseId) => {
        try {
            const response = await api.get(
                `/purchases/${purchaseId}/return-preview`
            );
            if (response.data.success) {
                setReturnPreviewData(response.data.data);
                return response.data.data;
            } else {
                toast.error(
                    response.data.message || t("purchases.failed_fetch_return_preview")
                );
            }
        } catch (error) {
            toast.error(t("purchases.error_fetching_return_preview"));
            console.error("Error:", error);
        }
    };

    // Create purchase
    const createPurchase = async (values) => {
        try {
            const response = await api.post("/purchases", {
                ...values,
                ...(isTutorialActive && { is_tutorial_data: true }),
            });
            if (response.data.success) {
                toast.success(t("purchases.purchase_created"));
                fetchPurchases();
                return { success: true };
            } else {
                toast.error(
                    response.data.message || t("purchases.failed_create_purchase")
                );
                return { success: false };
            }
        } catch (error) {
            toast.error(t("purchases.error_creating_purchase"));
            console.error("Error:", error);
            return { success: false };
        }
    };

    // Update purchase status
    const updatePurchaseStatus = async (purchaseId, status) => {
        try {
            const response = await api.patch(`/purchases/${purchaseId}`, {
                purchase_status: status,
            });
            if (response.data.success) {
                toast.success(t("purchases.purchase_updated"));
                fetchPurchases();

                // Show return information if status is returned
                if (status === "returned" && response.data.data.returnInfo) {
                    const returnInfo = response.data.data.returnInfo;
                    message.success(
                        t("purchases.return_success_toast", {
                            amount: formatCurrency(returnInfo.total_refund_amount),
                        })
                    );
                }
                return { success: true };
            } else {
                toast.error(
                    response.data.message || t("purchases.failed_update_status")
                );
                return { success: false };
            }
        } catch (error) {
            toast.error(t("purchases.error_updating_status"));
            console.error("Error:", error);
            return { success: false };
        }
    };

    // Initialize data
    useEffect(() => {
        fetchPurchases();
        fetchSuppliers();
        fetchProducts();
    }, []);

    return {
        // State
        purchases,
        suppliers,
        products,
        loading,
        purchaseDetails,
        returnPreviewData,
        stats,

        // Actions
        fetchPurchases,
        fetchSuppliers,
        fetchProducts,
        fetchPurchaseDetails,
        fetchReturnPreview,
        createPurchase,
        updatePurchaseStatus,

        // Setters
        setPurchaseDetails,
        setReturnPreviewData,
    };
};
