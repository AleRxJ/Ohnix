import { useState, useContext, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { api } from "../../api/api.js";
import { calculateQuotationStats } from "../../utils/quotationUtils.js";
import AuthContext from "../../context/AuthContext.jsx";
import useI18n from "../useI18n";
import { resolveApiErrorMessage } from "../../utils/apiError";
import { idempotencyHeaders } from "../../utils/idempotency";
import { useDataInvalidation } from "../useDataInvalidation";

const CREATE_QUOTATION_ERROR_CODES = {
    duplicate_quotation_products: "quotations.duplicate_product_message",
};

const TRANSITION_ERROR_CODES = {
    invalid_quotation_status_transition: "quotations.invalid_status_transition",
};

export const useQuotations = () => {
    const { t } = useI18n();
    const [quotations, setQuotations] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [quotationDetails, setQuotationDetails] = useState(null);
    const [updatingQuotationId, setUpdatingQuotationId] = useState(null);
    const [stats, setStats] = useState({ total: 0, draft: 0, received: 0, approved: 0, rejected: 0 });

    const { user } = useContext(AuthContext);

    // Same out-of-order-response guard as usePurchase.js#fetchPurchases.
    const latestRequestId = useRef(0);

    const fetchQuotations = async () => {
        const requestId = ++latestRequestId.current;
        setLoading(true);
        try {
            const response = await api.get("/purchase-quotations");
            if (requestId !== latestRequestId.current) return;
            if (response.data.success) {
                setQuotations(response.data.data);
                setStats(calculateQuotationStats(response.data.data));
            } else {
                toast.error(t("quotations.failed_fetch"));
            }
        } catch (error) {
            if (requestId !== latestRequestId.current) return;
            toast.error(t("quotations.error_fetching"));
            console.error("Error:", error);
        } finally {
            if (requestId === latestRequestId.current) setLoading(false);
        }
    };

    const fetchSuppliers = async () => {
        try {
            const response = await api.get(user.role === "admin" ? "/suppliers/admin/all" : "/suppliers");
            if (response.data.success) setSuppliers(response.data.data);
        } catch (error) {
            toast.error(t("purchases.error_fetching_suppliers"));
            console.error("Error:", error);
        }
    };

    const fetchProducts = async () => {
        try {
            const response = await api.get("/products");
            if (response.data.success) setProducts(response.data.data);
        } catch (error) {
            toast.error(t("purchases.error_fetching_products"));
            console.error("Error:", error);
        }
    };

    const fetchQuotationDetails = async (quotationId) => {
        try {
            const response = await api.get(`/purchase-quotations/${quotationId}`);
            if (response.data.success) {
                setQuotationDetails(response.data.data);
                return response.data.data;
            }
        } catch (error) {
            toast.error(t("quotations.error_fetching_details"));
            console.error("Error:", error);
        }
    };

    const createQuotation = async (values) => {
        try {
            const response = await api.post("/purchase-quotations", values);
            if (response.data.success) {
                toast.success(t("quotations.quotation_created"));
                await fetchQuotations();
                return { success: true };
            }
            toast.error(response.data.message || t("quotations.failed_create"));
            return { success: false };
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t, CREATE_QUOTATION_ERROR_CODES, "quotations.error_creating"));
            console.error("Error:", error);
            return { success: false };
        }
    };

    const updateQuotation = async (quotationId, values) => {
        try {
            const response = await api.patch(`/purchase-quotations/${quotationId}`, values);
            if (response.data.success) {
                toast.success(t("quotations.quotation_updated"));
                await fetchQuotations();
                return { success: true };
            }
            toast.error(response.data.message || t("quotations.failed_update"));
            return { success: false };
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t, CREATE_QUOTATION_ERROR_CODES, "quotations.error_updating"));
            console.error("Error:", error);
            return { success: false };
        }
    };

    const markReceived = async (quotationId) => {
        setUpdatingQuotationId(quotationId);
        try {
            const response = await api.post(`/purchase-quotations/${quotationId}/received`, undefined, idempotencyHeaders());
            if (response.data.success) {
                toast.success(t("quotations.marked_received"));
                await fetchQuotations();
                return { success: true };
            }
            toast.error(response.data.message || t("quotations.failed_update"));
            return { success: false };
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t, TRANSITION_ERROR_CODES, "quotations.error_updating"));
            console.error("Error:", error);
            return { success: false };
        } finally {
            setUpdatingQuotationId(null);
        }
    };

    const rejectQuotation = async (quotationId) => {
        setUpdatingQuotationId(quotationId);
        try {
            const response = await api.post(`/purchase-quotations/${quotationId}/reject`, undefined, idempotencyHeaders());
            if (response.data.success) {
                toast.success(t("quotations.rejected"));
                await fetchQuotations();
                return { success: true };
            }
            toast.error(response.data.message || t("quotations.failed_update"));
            return { success: false };
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t, TRANSITION_ERROR_CODES, "quotations.error_updating"));
            console.error("Error:", error);
            return { success: false };
        } finally {
            setUpdatingQuotationId(null);
        }
    };

    useEffect(() => {
        fetchQuotations();
        fetchSuppliers();
        fetchProducts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Quotations move alongside purchases/products (a conversion creates a
    // real Purchase and, indirectly, stock/accounting side effects) - same
    // invalidation group usePurchase.js already listens on.
    useDataInvalidation(["purchase", "product"], () => {
        fetchQuotations();
    });

    return {
        quotations,
        suppliers,
        products,
        loading,
        quotationDetails,
        stats,
        updatingQuotationId,

        fetchQuotations,
        fetchSuppliers,
        fetchProducts,
        fetchQuotationDetails,
        createQuotation,
        updateQuotation,
        markReceived,
        rejectQuotation,

        setQuotationDetails,
    };
};
