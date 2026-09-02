import { ApiError } from "../utils/ApiError.js";

// Applied to a short, explicit list of high-risk self-service actions
// (password change, team-ownership transfer, billing/payment mutations) -
// isAdmin-gated admin routes are already blocked during impersonation for
// free, since req.user.role reflects the impersonated target, not the real
// admin (see auth.middleware.js's verifyJWT). Extend this list as new
// sensitive actions ship.
export const blockDuringImpersonation = (req, res, next) => {
    if (req.user?.impersonatedBy) {
        return next(new ApiError(403, "Esta acción no está disponible durante una sesión simulada."));
    }
    next();
};
