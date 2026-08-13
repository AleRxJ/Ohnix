import { toast } from "react-hot-toast";
import { api } from "../api/api";
// Plain service module, not a React component/hook - uses the i18next
// instance directly instead of the useI18n() hook (see userService.js for
// the same pattern/rationale).
import i18n from "../i18n/config";

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
            toast.success(i18n.t("profile.subscription.paused_toast"));
        }
        return response.data;
    },

    async cancelMySubscription() {
        const response = await api.patch("/subscriptions/me/cancel");
        if (response.data?.success && response.data?.message) {
            toast.success(response.data.message);
        }
        return response.data;
    },

    async reactivateMySubscription() {
        const response = await api.patch("/subscriptions/me/reactivate");
        if (response.data?.success && response.data?.message) {
            toast.success(response.data.message);
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
            toast.success(i18n.t("profile.subscription.request_submitted_toast"));
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
            toast.success(i18n.t("profile.subscription.request_updated_toast"));
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

    async verifyAndActivateBySession(requestId, sessionId) {
        const response = await api.post(
            `/subscriptions/me/upgrade-requests/${requestId}/verify-activate`,
            { sessionId }
        );
        return response.data;
    },

    async getEpaycoCheckoutParams(requestId) {
        const response = await api.get(
            `/subscriptions/me/upgrade-requests/${requestId}/epayco-params`
        );
        return response.data;
    },

    async verifyEpaycoAndActivate(requestId) {
        const response = await api.post(
            `/subscriptions/me/upgrade-requests/${requestId}/epayco-verify`
        );
        return response.data;
    },

    async createRenewalCheckout(payload = {}) {
        const response = await api.post("/subscriptions/me/renew", payload);
        return response.data;
    },
};
