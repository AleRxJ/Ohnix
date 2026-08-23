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
        returnPreviewLoadingId,
        purchasePayments,
        paymentsLoading,
        registeringPayment,

        // Actions
        createPurchase,
        updatePurchaseStatus,
        processReturn,
        fetchPurchaseDetails,
        fetchReturnPreview,
        fetchPurchasePayments,
        registerPurchasePayment,
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
            returnPreviewLoadingId={returnPreviewLoadingId}
            onFetchPurchaseDetails={fetchPurchaseDetails}
            onFetchReturnPreview={fetchReturnPreview}
            purchaseDetails={purchaseDetails}
            returnPreviewData={returnPreviewData}
            purchasePayments={purchasePayments}
            paymentsLoading={paymentsLoading}
            registeringPayment={registeringPayment}
            onFetchPurchasePayments={fetchPurchasePayments}
            onRegisterPurchasePayment={registerPurchasePayment}
        />
    );
};

export default Purchase;
