import { toast } from "react-hot-toast";
import { api } from "../api/api";

export const subscriptionService = {
    async getMySubscription() {
        const response = await api.get("/subscriptions/me");
        return response.data;
    },

    async getMyUsage() {
        const response = await api.get("/subscriptions/me/usage");
        return response.data;
    },

    async pauseMySubscription() {
        const response = await api.patch("/subscriptions/me/pause");
        if (response.data?.success) {
            toast.success("Subscription paused");
        }
        return response.data;
    },

    async cancelMySubscription() {
        const response = await api.patch("/subscriptions/me/cancel");
        if (response.data?.success) {
            toast.success("Subscription canceled");
        }
        return response.data;
    },

    async reactivateMySubscription() {
        const response = await api.patch("/subscriptions/me/reactivate");
        if (response.data?.success) {
            toast.success("Subscription reactivated");
        }
        return response.data;
    },

    async getMyUpgradeRequests() {
        const response = await api.get("/subscriptions/me/upgrade-requests");
        return response.data;
    },

    async createUpgradeRequest(payload) {
        const response = await api.post("/subscriptions/me/upgrade-requests", payload);
        if (response.data?.success) {
            toast.success("Upgrade request submitted");
        }
        return response.data;
    },

    async getUpgradeRequestsAdmin(status = "") {
        const query = status ? `?status=${status}` : "";
        const response = await api.get(`/subscriptions/admin/upgrade-requests${query}`);
        return response.data;
    },

    async updateUpgradeRequestAdmin(id, payload) {
        const response = await api.patch(
            `/subscriptions/admin/upgrade-requests/${id}`,
            payload
        );
        if (response.data?.success) {
            toast.success("Upgrade request updated");
        }
        return response.data;
    },

    async createUpgradeCheckoutSession(requestId) {
        const response = await api.post(
            `/subscriptions/me/upgrade-requests/${requestId}/checkout-session`,
            {}
        );
        return response.data;
    },

    async getCheckoutPaymentMethods() {
        const response = await api.get("/subscriptions/me/checkout-payment-methods");
        return response.data;
    },

    async createUpgradeCheckoutSessionWithMethod(requestId, payload) {
        const response = await api.post(
            `/subscriptions/me/upgrade-requests/${requestId}/checkout-session`,
            payload
        );
        return response.data;
    },

    async getUpgradeCheckoutStatus(requestId) {
        const response = await api.get(
            `/subscriptions/me/upgrade-requests/${requestId}/checkout-status`
        );
        return response.data;
    },
};
