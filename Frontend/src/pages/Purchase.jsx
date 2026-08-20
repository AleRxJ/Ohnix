import React from "react";
import { ShoppingCartOutlined } from "@ant-design/icons";
import { PurchaseList } from "../components/Purchase";
import { usePurchase } from "../hooks/purchase/usePurchase";

const Purchase = () => {
    const {
        // State
        purchases,
        suppliers,
        products,
        loading,
        purchaseDetails,
        returnPreviewData,
        stats,
        updatingPurchaseId,

        // Actions
        createPurchase,
        updatePurchaseStatus,
        processReturn,
        fetchPurchaseDetails,
        fetchReturnPreview,
    } = usePurchase();

    return (
        <PurchaseList
            purchases={purchases}
            suppliers={suppliers}
            products={products}
            loading={loading}
            stats={stats}
            onCreatePurchase={createPurchase}
            onUpdateStatus={updatePurchaseStatus}
            onProcessReturn={processReturn}
            updatingPurchaseId={updatingPurchaseId}
            onFetchPurchaseDetails={fetchPurchaseDetails}
            onFetchReturnPreview={fetchReturnPreview}
            purchaseDetails={purchaseDetails}
            returnPreviewData={returnPreviewData}
        />
    );
};

export default Purchase;
