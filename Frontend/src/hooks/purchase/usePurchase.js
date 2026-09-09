import { useState, useEffect, useContext, useRef } from "react";
import { message } from "antd";
import toast from "react-hot-toast";
import { api } from "../../api/api.js";
import { calculateStats } from "../../utils/purchaseUtils.js";
import AuthContext from "../../context/AuthContext.jsx";
import { formatCurrency } from "../../utils/currency.js";
import { financeService } from "../../services/financeService.js";
import useI18n from "../useI18n";
import { useInventoryTour } from "../../context/InventoryTourContext";
import { resolveApiErrorMessage } from "../../utils/apiError";
import { idempotencyHeaders } from "../../utils/idempotency";
import { useDataInvalidation } from "../useDataInvalidation";
import { financeErrorMessage } from "../../utils/financeError";

const UPDATE_STATUS_ERROR_CODES = {
    invalid_purchase_status_transition: "purchases.invalid_status_transition",
};

const CREATE_PURCHASE_ERROR_CODES = {
    duplicate_purchase_products: "purchases.duplicate_product_message",
};

export const usePurchase = () => {
    const { t } = useI18n();
    const { isOpen: isTutorialActive, notifyAction, createdRefs } = useInventoryTour();
    const [purchases, setPurchases] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [purchaseDetails, setPurchaseDetails] = useState([]);
    const [returnPreviewData, setReturnPreviewData] = useState(null);
    const [purchasePayments, setPurchasePayments] = useState([]);
    const [paymentsLoading, setPaymentsLoading] = useState(false);
    const [registeringPayment, setRegisteringPayment] = useState(false);
    // Which purchase's status action is mid-request - same gap as orders had
    // (see useOrderOperations.js): no feedback at all while the PATCH is in
    // flight made a slow request look like the click did nothing.
    const [updatingPurchaseId, setUpdatingPurchaseId] = useState(null);
    // Same gap on the "process return" button: it fetches the preview before
    // opening the modal, and with nothing showing meanwhile a slow request
    // looked like the click just opened an empty modal (or did nothing).
    const [returnPreviewLoadingId, setReturnPreviewLoadingId] = useState(null);
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

    const fetchPurchasePayments = async (purchaseId) => {
        setPaymentsLoading(true);
        try {
            const res = await financeService.listPurchasePayments(purchaseId);
            setPurchasePayments(res?.data || []);
        } catch (error) {
            toast.error(t("finance.failed"));
            console.error("Error:", error);
        } finally {
            setPaymentsLoading(false);
        }
    };

    const registerPurchasePayment = async (purchaseId, values) => {
        setRegisteringPayment(true);
        try {
            await financeService.registerPurchasePayment(purchaseId, values);
            toast.success(t("finance.payment_registered"));
            await Promise.all([fetchPurchasePayments(purchaseId), fetchPurchases()]);
            return true;
        } catch (error) {
            toast.error(financeErrorMessage(error, t));
            console.error("Error:", error);
            return false;
        } finally {
            setRegisteringPayment(false);
        }
    };

    // Fetch return preview
    const fetchReturnPreview = async (purchaseId) => {
        setReturnPreviewLoadingId(purchaseId);
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
        } finally {
            setReturnPreviewLoadingId(null);
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
                // Awaited (not fire-and-forget) specifically so that when the
                // tour is active, the new row already exists in the DOM by
                // the time notifyAction() below starts the complete-purchase
                // step's target search - otherwise that search starts before
                // this GET resolves and falls back to whichever pending
                // purchase happens to already be rendered (a real,
                // pre-existing one), not the practice purchase just created.
                await fetchPurchases();
                if (isTutorialActive) {
                    const created = response.data.data;
                    // Tracking the exact row id lets complete-purchase target
                    // THIS purchase specifically instead of whichever row
                    // happens to render first for the shared data-tour
                    // attribute (real, pre-existing purchases share it too).
                    notifyAction(
                        "purchase",
                        created ? { id: created._id, name: created.purchase_no } : undefined
                    );
                    // Created already "completed" (the status field on this
                    // same form allows that) - stock already went up, so the
                    // separate "mark it completed" step has nothing left to
                    // do. Without this, that step would wait forever for a
                    // pending purchase that will never exist.
                    if (values.purchase_status === "completed") {
                        notifyAction("purchase-completed");
                    }
                }
                return { success: true };
            } else {
                toast.error(
                    response.data.message || t("purchases.failed_create_purchase")
                );
                return { success: false };
            }
        } catch (error) {
            toast.error(
                resolveApiErrorMessage(error, t, CREATE_PURCHASE_ERROR_CODES, "purchases.error_creating_purchase")
            );
            console.error("Error:", error);
            return { success: false };
        }
    };

    // Update purchase status
    const updatePurchaseStatus = async (purchaseId, status) => {
        setUpdatingPurchaseId(purchaseId);
        try {
            const response = await api.patch(
                `/purchases/${purchaseId}`,
                { purchase_status: status },
                idempotencyHeaders()
            );
            if (response.data.success) {
                toast.success(t("purchases.purchase_updated"));
                await fetchPurchases();
                // Only the tutorial's OWN practice purchase counts - completing
                // any other (real, pre-existing) purchase shares the same
                // status control and must not be mistaken for finishing this step.
                if (status === "completed" && isTutorialActive && purchaseId === createdRefs?.purchase?.id) {
                    notifyAction("purchase-completed");
                }
                return { success: true };
            } else {
                toast.error(
                    response.data.message || t("purchases.failed_update_status")
                );
                return { success: false };
            }
        } catch (error) {
            toast.error(
                resolveApiErrorMessage(error, t, UPDATE_STATUS_ERROR_CODES, "purchases.error_updating_status")
            );
            console.error("Error:", error);
            return { success: false };
        } finally {
            setUpdatingPurchaseId(null);
        }
    };

    // Process a granular return: `lines` is [{ purchase_detail_id, quantity }],
    // chosen by the user in the return form - not auto-computed by the server.
    const processReturn = async (purchaseId, lines) => {
        setUpdatingPurchaseId(purchaseId);
        try {
            const response = await api.post(
                `/purchases/${purchaseId}/returns`,
                { lines },
                idempotencyHeaders()
            );
            if (response.data.success) {
                const result = response.data.data;
                message.success(
                    t(
                        result.purchase_fully_returned
                            ? "purchases.return_success_toast"
                            : "purchases.return_partial_success_toast",
                        { amount: formatCurrency(result.total_refund_amount) }
                    )
                );
                await fetchPurchases();
                return { success: true, result };
            } else {
                toast.error(
                    response.data.message || t("purchases.failed_process_return")
                );
                return { success: false };
            }
        } catch (error) {
            toast.error(
                resolveApiErrorMessage(error, t, {}, "purchases.error_processing_return")
            );
            console.error("Error:", error);
            return { success: false };
        } finally {
            setUpdatingPurchaseId(null);
        }
    };

    // Initialize data
    useEffect(() => {
        fetchPurchases();
        fetchSuppliers();
        fetchProducts();
    }, []);

    // Another connected user (or this same one, another tab) creating a
    // purchase, changing its status, or returning items - all of those also
    // move product stock, so both lists are re-fetched either way.
    useDataInvalidation(["purchase", "product"], () => {
        fetchPurchases();
        fetchProducts();
    });

    return {
        // State
        purchases,
        suppliers,
        products,
        loading,
        purchaseDetails,
        returnPreviewData,
        stats,
        updatingPurchaseId,
        returnPreviewLoadingId,

        // Actions
        fetchPurchases,
        fetchSuppliers,
        fetchProducts,
        fetchPurchaseDetails,
        fetchReturnPreview,
        createPurchase,
        updatePurchaseStatus,
        processReturn,
        purchasePayments,
        paymentsLoading,
        registeringPayment,
        fetchPurchasePayments,
        registerPurchasePayment,

        // Setters
        setPurchaseDetails,
        setReturnPreviewData,
    };
};
