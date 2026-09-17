import { ApiError } from "../utils/ApiError.js";

// Gates one route behind a scope the calling ApiKey must have (see
// utils/apiScopes.js). Must run after verifyApiKey (apiKeyAuth.middleware.js),
// which is what sets req.apiKey. A JWT-authenticated dashboard request never
// carries req.apiKey, so this middleware only ever applies to the public API
// router - mounting it anywhere else is a bug, not a valid "everyone allowed"
// state, hence the 500 rather than silently passing through.
export const requireScope = (scope) => (req, _res, next) => {
    if (!req.apiKey) {
        return next(new ApiError(500, "requireScope used outside the public API key auth chain"));
    }
    if (!req.apiKey.scopes?.includes(scope)) {
        return next(
            new ApiError(
                403,
                `This API key doesn't have the "${scope}" scope. Add it from Configuración → Integraciones/API.`
            )
        );
    }
    next();
};
