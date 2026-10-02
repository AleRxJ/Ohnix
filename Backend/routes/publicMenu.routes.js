import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { publicMenuReadRateLimiter, publicMenuSendRateLimiter } from "../middleware/rateLimit.middleware.js";
import { createPublicRequest, getPublicMenu, getPublicRequest } from "../services/publicMenu.service.js";

// Restaurant QR menu - PUBLIC, no auth (the table token is the credential).
// See publicMenu.service.js. Mounted at /api/v1/public/menu in app.js, ahead
// of every router that applies verifyJWT to a bare prefix.
const router = Router();

router.get(
    "/:token",
    publicMenuReadRateLimiter,
    asyncHandler(async (req, res) => res.status(200).json(new ApiResponse(200, await getPublicMenu(req.params.token), "Menu fetched")))
);

router.post(
    "/:token/requests",
    publicMenuSendRateLimiter,
    asyncHandler(async (req, res) => {
        // Honeypot: a hidden field real customers never fill. Bots get a
        // plausible success and nothing is stored (same as /agenda-demo).
        if (req.body?.website) {
            return res.status(201).json(new ApiResponse(201, { _id: "ok", type: "order", status: "pending" }, "Request received"));
        }
        return res.status(201).json(new ApiResponse(201, await createPublicRequest(req.params.token, req.body || {}), "Request received"));
    })
);

router.get(
    "/:token/requests/:id",
    publicMenuReadRateLimiter,
    asyncHandler(async (req, res) => res.status(200).json(new ApiResponse(200, await getPublicRequest(req.params.token, req.params.id), "Request status")))
);

export default router;
