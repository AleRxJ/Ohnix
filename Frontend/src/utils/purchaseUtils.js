export const generatePurchaseNo = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const random = Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, "0");
    return `P${year}${month}${day}${random}`;
};

export const getStatusColor = (status) => {
    switch (status) {
        case "pending":
            return "orange";
        case "completed":
            return "green";
        case "returned":
            return "red";
        default:
            return "default";
    }
};

export const calculateStats = (purchaseData) => {
    const pending = purchaseData.filter(
        (p) => p.purchase_status === "pending"
    ).length;
    const completed = purchaseData.filter(
        (p) => p.purchase_status === "completed"
    ).length;
    const returned = purchaseData.filter(
        (p) => p.purchase_status === "returned"
    ).length;

    return {
        pending,
        completed,
        returned,
        total: purchaseData.length,
    };
};

export const calculatePurchaseFinancials = (details = [], retentions = [], payments = []) => {
    const grossTotal = details.reduce((sum, detail) => sum + Number(detail.total || 0) + Number(detail.tax_amount || 0), 0);
    const returnedTotal = details.reduce((sum, detail) => sum + Number(detail.refund_amount || 0) + Number(detail.returned_tax_amount || 0), 0);
    const withheldTotal = retentions.reduce((sum, retention) => sum + Number(retention.withheld_amount || 0), 0);
    const returnedWithheldTotal = retentions.reduce((sum, retention) => sum + Number(retention.returned_withheld_amount || 0), 0);
    const outstandingWithholding = withheldTotal - returnedWithheldTotal;
    const netPayable = Number((grossTotal - returnedTotal - outstandingWithholding).toFixed(2));
    const paidAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return {
        grossTotal,
        returnedTotal,
        withheldTotal,
        returnedWithheldTotal,
        outstandingWithholding,
        netPayable,
        paidAmount,
        pendingBalance: Math.max(0, Number((netPayable - paidAmount).toFixed(2))),
    };
};
