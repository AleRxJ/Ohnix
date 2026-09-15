// Backend/routes/scheduler.routes.js
import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import lowStockScheduler from "../utils/lowStockScheduler.js";
import { checkForNewFirmaPassValidations } from "../utils/firmaPassValidationScheduler.js";
import discoveryScheduler from "../utils/discoveryScheduler.js";

const router = express.Router();

router.use(verifyJWT); // Apply verifyJWT middleware to all routes

// Get scheduler status (admin only). Kept as one endpoint rather than one
// per scheduler - the low-stock fields stay top-level so the existing
// frontend consumer (LowStockAlertsPanel.jsx) keeps working unchanged; the
// discovery engine's status is added as a nested `discovery` key.
router.get(
    "/status",
    isAdmin,
    asyncHandler(async (req, res) => {
        const status = await lowStockScheduler.getStatus();
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { ...status, discovery: discoveryScheduler.getStatus() },
                    "Scheduler status retrieved successfully"
                )
            );
    })
);

// Manually trigger low stock alerts (admin only). Defaults to a dry run -
// pass { confirm: true } to actually email every eligible account, or
// { targetUserId } to send a real test to just one account. See
// lowStockScheduler.js#triggerManually for why this isn't a single-click send anymore.
router.post(
    "/trigger-alerts",
    isAdmin,
    asyncHandler(async (req, res) => {
        const { targetUserId, confirm } = req.body || {};
        const result = await lowStockScheduler.triggerManually({ targetUserId, confirm });

        if (result.success) {
            return res
                .status(200)
                .json(
                    new ApiResponse(
                        200,
                        result.dryRun
                            ? { dryRun: true, eligibleCount: result.eligibleCount }
                            : result.results,
                        result.dryRun
                            ? "Dry run - no emails sent"
                            : "Low stock alerts triggered successfully"
                    )
                );
        } else {
            throw new ApiError(500, result.error || "Failed to trigger alerts");
        }
    })
);

// Send a low-stock alert email to the requesting admin's OWN inbox (admin
// only). Unlike /trigger-alerts, this never touches any other account and
// always sends - using the admin's real low-stock products if they have
// any, otherwise clearly-labeled sample data - so it works as a genuine
// "confirm delivery works" test regardless of what that admin's own
// product catalog looks like.
router.post(
    "/send-test-alert",
    isAdmin,
    asyncHandler(async (req, res) => {
        if (!req.user.email) {
            throw new ApiError(400, "Your account has no email address on file");
        }

        const result = await lowStockScheduler.sendSelfTestAlert(
            req.user.prismaId,
            req.user.email,
            req.user.username,
            req.user.preferredLanguage
        );

        if (!result.sent) {
            throw new ApiError(500, result.error || "Failed to send test alert");
        }

        return res
            .status(200)
            .json(new ApiResponse(200, result, "Test alert sent successfully"));
    })
);

// Update threshold (admin only)
router.put(
    "/threshold",
    isAdmin,
    asyncHandler(async (req, res) => {
        const { threshold } = req.body;

        if (!threshold || threshold < 1) {
            throw new ApiError(400, "Threshold must be a positive number");
        }

        await lowStockScheduler.setThreshold(parseInt(threshold));

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { threshold: parseInt(threshold) },
                    "Threshold updated successfully"
                )
            );
    })
);

// Start scheduler (admin only)
router.post(
    "/start",
    isAdmin,
    asyncHandler(async (req, res) => {
        lowStockScheduler.start();
        return res
            .status(200)
            .json(new ApiResponse(200, null, "Scheduler started successfully"));
    })
);

// Stop scheduler (admin only)
router.post(
    "/stop",
    isAdmin,
    asyncHandler(async (req, res) => {
        lowStockScheduler.stop();
        return res
            .status(200)
            .json(new ApiResponse(200, null, "Scheduler stopped successfully"));
    })
);

// Force a FirmaPass pending-validation check right now (admin only), instead
// of waiting for the FIRMAPASS_VALIDATION_CHECK_CRON tick - see
// Backend/utils/firmaPassValidationScheduler.js. Same email-batching/
// already-alerted dedup as the cron; only sends if it actually finds
// something new.
router.post(
    "/firmapass-validation-check",
    isAdmin,
    asyncHandler(async (req, res) => {
        const result = await checkForNewFirmaPassValidations();
        return res
            .status(200)
            .json(new ApiResponse(200, result, "FirmaPass validation check completed"));
    })
);

// Force a discovery engine run right now, across every active account
// (admin only) - same idea as /firmapass-validation-check, useful for
// testing/demoing detectors without waiting for the 04:30 cron tick.
router.post(
    "/discovery-engine-run",
    isAdmin,
    asyncHandler(async (req, res) => {
        const result = await discoveryScheduler.runNow();
        return res
            .status(200)
            .json(new ApiResponse(200, result, "Discovery engine run completed"));
    })
);

export default router;
