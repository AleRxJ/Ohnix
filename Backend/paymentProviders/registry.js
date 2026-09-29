import { boldProvider } from "./bold.provider.js";
import { ApiError } from "../utils/ApiError.js";

// Payment providers for the Caja (in-store charging), kept apart from
// connectors/registry.js on purpose: those are e-commerce channels
// (pushProduct/pushInventory/mapInboundOrder), these charge money. Both store
// their per-account credentials in IntegrationConnection, keyed by provider.
// Adding Wompi/PayU means one more file implementing boldProvider's shape.
const PROVIDERS = {
    bold: boldProvider,
};

export const getPaymentProvider = (key) => {
    const provider = PROVIDERS[key];
    if (!provider) throw new ApiError(400, `Unknown payment provider "${key}".`, [], "", "payment_provider_unknown");
    return provider;
};

export const PAYMENT_PROVIDER_KEYS = Object.keys(PROVIDERS);
