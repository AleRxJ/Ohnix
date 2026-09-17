// Canonical scope list for the public API (see docs/api/authentication.md).
// A scope is "<resource>:<read|write>" - write implies nothing about read,
// callers that need both list both explicitly.
export const API_SCOPES = [
    "products:read",
    "products:write",
    "variants:read",
    "variants:write",
    "inventory:read",
    "inventory:write",
    "orders:read",
    "orders:write",
    "customers:read",
    "customers:write",
    "webhooks:write",
];

// Every key created before scopes existed (and any new key that doesn't
// explicitly restrict itself) gets this set - see the migration backfill
// and apiKey.controller.js#createApiKey. Keeps the existing "one API key,
// full account access" behavior as the default, with narrower scopes as an
// opt-in rather than a breaking change for whoever already integrated.
export const FULL_ACCESS_SCOPES = [...API_SCOPES];

export const isValidScope = (scope) => API_SCOPES.includes(scope);
