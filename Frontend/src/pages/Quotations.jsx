import { useState } from "react";
import { Tabs } from "antd";
import { useSearchParams } from "react-router-dom";
import QuotationList from "../components/PurchaseQuotation/QuotationList";
import SalesQuotations from "./SalesQuotations";
import { useQuotations } from "../hooks/purchaseQuotation/useQuotations";
import { usePurchase } from "../hooks/purchase/usePurchase";
import { useTeam } from "../context/TeamContext";
import useI18n from "../hooks/useI18n";

// Composes useQuotations (list/create/received/reject) with usePurchase's
// createPurchase - converting an approved quotation creates a real Purchase
// (see PurchaseForm.jsx's initialQuotation), so this panel needs both hooks
// rather than duplicating purchase-creation logic here. Its own component so
// those hooks (which fetch on mount) only run for someone with "purchases"
// access - a sales-only member would otherwise get a 403 toast per request.
const PurchaseQuotationsPanel = () => {
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

// Each tab follows its own backend module: purchase quotations -> "purchases"
// (purchaseQuotation.routes.js), sales quotations -> "orders"
// (salesQuotation.routes.js). The route itself lets in anyone with either.
const Quotations = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    const canPurchases = hasPermission("purchases", "view");
    const canSales = hasPermission("orders", "view");

    const [requestedTab, setRequestedTab] = useState(searchParams.get("type") === "sales" ? "sales" : "purchase");
    const activeTab = !canPurchases ? "sales" : !canSales ? "purchase" : requestedTab;

    const handleTabChange = (key) => {
        setRequestedTab(key);
        setSearchParams(key === "sales" ? { type: "sales" } : {});
    };

    const tabItems = [
        ...(canPurchases ? [{ key: "purchase", label: t("quotations.purchase_tab") }] : []),
        ...(canSales ? [{ key: "sales", label: t("quotations.sales_tab") }] : []),
    ];

    return (
        <div className="quotations-module">
            <div className="quotations-module-tabs px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
                <Tabs activeKey={activeTab} onChange={handleTabChange} items={tabItems} />
            </div>
            {activeTab === "purchase" ? <PurchaseQuotationsPanel /> : <SalesQuotations embedded />}
        </div>
    );
};

export default Quotations;
