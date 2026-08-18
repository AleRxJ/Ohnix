import { api } from "../api/api";

export const pricingService = {
    // Public, unauthenticated - backs the /precios marketing page and the
    // Billing.jsx checkout price preview. Currency/amounts are resolved
    // server-side from the same config actually used to charge Stripe/ePayco
    // (see getPublicPricing in subscription.controller.js), so this is the
    // single source of truth for "what will the user pay" - never hardcode
    // a second copy of these numbers in a component.
    async getPublicPricing(country) {
        const response = await api.get("/pricing/public", { params: { country } });
        return response.data;
    },
};
