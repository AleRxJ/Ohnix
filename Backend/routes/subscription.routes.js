import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import {
    cancelMySubscription,
    createMyUpgradeCheckoutSession,
    createUpgradeRequest,
    getCheckoutPaymentMethods,
    getMyUpgradeCheckoutStatus,
    getMyUpgradeRequests,
    getMySubscription,
    getMyUsage,
    getUpgradeRequestsAdmin,
    getUserUsageAdmin,
    pauseMySubscription,
    reactivateMySubscription,
    updateUpgradeRequestAdmin,
    updateUserPlan,
    verifyAndActivateBySession,
} from "../controllers/subscription.controller.js";

const router = Router();

router.use(verifyJWT);

router.route("/me").get(getMySubscription);
router.route("/me/usage").get(getMyUsage);
router.route("/me/upgrade-requests").get(getMyUpgradeRequests).post(createUpgradeRequest);
router.route("/me/checkout-payment-methods").get(getCheckoutPaymentMethods);
router.route("/me/upgrade-requests/:id/checkout-session").post(createMyUpgradeCheckoutSession);
router.route("/me/upgrade-requests/:id/checkout-status").get(getMyUpgradeCheckoutStatus);
router.route("/me/upgrade-requests/:id/verify-activate").post(verifyAndActivateBySession);
router.route("/me/pause").patch(pauseMySubscription);
router.route("/me/cancel").patch(cancelMySubscription);
router.route("/me/reactivate").patch(reactivateMySubscription);

router.route("/admin/users/:userId/plan").patch(isAdmin, updateUserPlan);
router.route("/admin/users/:userId/usage").get(isAdmin, getUserUsageAdmin);
router.route("/admin/upgrade-requests").get(isAdmin, getUpgradeRequestsAdmin);
router.route("/admin/upgrade-requests/:id").patch(isAdmin, updateUpgradeRequestAdmin);

export default router;
