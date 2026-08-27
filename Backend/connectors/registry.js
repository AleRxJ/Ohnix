import { shopifyConnector } from "./shopify.connector.js";
import { ApiError } from "../utils/ApiError.js";

// provider (IntegrationProvider enum value) -> Connector implementation
// (see base.connector.js). "custom_api" has no entry here on purpose - a
// custom-API integration is the caller pushing/pulling through Ohnix's own
// public API directly (see docs/api/), there is nothing for Ohnix to call
// OUT to, so it never goes through this registry.
const CONNECTORS = {
    shopify: shopifyConnector,
};

export const getConnector = (provider) => {
    const connector = CONNECTORS[provider];
    if (!connector) {
        throw new ApiError(400, `No connector implementation exists for provider "${provider}" yet`);
    }
    return connector;
};

export const CONNECTOR_PROVIDERS = Object.keys(CONNECTORS);
