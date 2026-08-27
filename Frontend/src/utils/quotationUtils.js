// Same shape as purchaseUtils.js's generatePurchaseNo - "Q" prefix instead of
// "P" so a quotation number never collides with a purchase number by
// coincidence, even though they're validated against separate uniqueness
// constraints on the backend.
export const generateQuotationNo = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const random = Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, "0");
    return `Q${year}${month}${day}${random}`;
};

export const getQuotationStatusColor = (status) => {
    switch (status) {
        case "draft":
            return "default";
        case "received":
            return "blue";
        case "approved":
            return "green";
        case "rejected":
            return "red";
        default:
            return "default";
    }
};

export const calculateQuotationStats = (quotations = []) => ({
    total: quotations.length,
    draft: quotations.filter((q) => q.status === "draft").length,
    received: quotations.filter((q) => q.status === "received").length,
    approved: quotations.filter((q) => q.status === "approved").length,
    rejected: quotations.filter((q) => q.status === "rejected").length,
});
