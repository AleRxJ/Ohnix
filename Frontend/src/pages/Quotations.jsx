import QuotationList from "../components/PurchaseQuotation/QuotationList";
import { useQuotations } from "../hooks/purchaseQuotation/useQuotations";
import { usePurchase } from "../hooks/purchase/usePurchase";

// Composes useQuotations (list/create/received/reject) with usePurchase's
// createPurchase - converting an approved quotation creates a real Purchase
// (see PurchaseForm.jsx's initialQuotation), so this page needs both hooks
// rather than duplicating purchase-creation logic here.
const Quotations = () => {
    const {
        quotations,
        suppliers,
        products,
        loading,
        stats,
        updatingQuotationId,
        quotationDetails,
        createQuotation,
        markReceived,
        rejectQuotation,
        fetchQuotationDetails,
    } = useQuotations();

    const { createPurchase } = usePurchase();

    return (
        <QuotationList
            quotations={quotations}
            suppliers={suppliers}
            products={products}
            loading={loading}
            stats={stats}
            onCreateQuotation={createQuotation}
            onMarkReceived={markReceived}
            onReject={rejectQuotation}
            updatingQuotationId={updatingQuotationId}
            onFetchQuotationDetails={fetchQuotationDetails}
            quotationDetails={quotationDetails}
            onCreatePurchase={createPurchase}
        />
    );
};

export default Quotations;
