import { api } from "../api/api";

// Public, unauthenticated "guest checkout" for a digital certificate bought
// from CertificadosDigitales.jsx - creates the Ohnix account + certificate
// order behind the scenes and auto-logs the browser in (see
// Backend/controllers/guestCertificateCheckout.controller.js). Kept out of
// companyService.js on purpose: that file is entirely for AUTHENTICATED
// self-service calls, and this endpoint runs before any session exists.
export const guestCertificateCheckoutService = {
    async registerForCertificateCheckout(payload) {
        const response = await api.post("/certificate-checkout/register", payload);
        return response.data;
    },
};
