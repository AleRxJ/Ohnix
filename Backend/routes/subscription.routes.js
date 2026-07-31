import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import {
    cancelMySubscription,
    createMyUpgradeCheckoutSession,
    createRenewalCheckout,
    createUpgradeRequest,
    getCheckoutPaymentMethods,
    getEpaycoCheckoutParams,
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
    verifyAndActivateByEpayco,
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
// ePayco: fetch widget params for the checkout page (auth-protected)
router.route("/me/upgrade-requests/:id/epayco-params").get(getEpaycoCheckoutParams);
// ePayco: fallback verification when confirmation webhook is delayed
router.route("/me/upgrade-requests/:id/epayco-verify").post(verifyAndActivateByEpayco);
// Renewal: creates checkout for the same current plan
router.route("/me/renew").post(createRenewalCheckout);
router.route("/me/pause").patch(pauseMySubscription);
router.route("/me/cancel").patch(cancelMySubscription);
router.route("/me/reactivate").patch(reactivateMySubscription);

router.route("/admin/users/:userId/plan").patch(isAdmin, updateUserPlan);
router.route("/admin/users/:userId/usage").get(isAdmin, getUserUsageAdmin);
router.route("/admin/upgrade-requests").get(isAdmin, getUpgradeRequestsAdmin);
router.route("/admin/upgrade-requests/:id").patch(isAdmin, updateUpgradeRequestAdmin);

export default router;
