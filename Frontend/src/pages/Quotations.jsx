import { useState } from "react";
import { Tabs } from "antd";
import QuotationList from "../components/PurchaseQuotation/QuotationList";
import SalesQuotations from "./SalesQuotations";
import { useQuotations } from "../hooks/purchaseQuotation/useQuotations";
import { usePurchase } from "../hooks/purchase/usePurchase";
import useI18n from "../hooks/useI18n";

// Composes useQuotations (list/create/received/reject) with usePurchase's
// createPurchase - converting an approved quotation creates a real Purchase
// (see PurchaseForm.jsx's initialQuotation), so this page needs both hooks
// rather than duplicating purchase-creation logic here.
const Quotations = () => {
    const [activeTab, setActiveTab] = useState("purchase");
    const { t } = useI18n();
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
        <div className="quotations-module">
            <div className="quotations-module-tabs px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={[
                        { key: "purchase", label: t("quotations.purchase_tab") },
                        { key: "sales", label: t("quotations.sales_tab") },
                    ]}
                />
            </div>
            {activeTab === "purchase" ? (
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
            ) : <SalesQuotations embedded />}
        </div>
    );
};

export default Quotations;
