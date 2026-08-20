import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import { requireModulePermission } from "../middleware/team.permissions.js";
import {
    cancelMySubscription,
    cancelMyUpgradeRequest,
    createMyUpgradeCheckoutSession,
    createRenewalCheckout,
    createUpgradeRequest,
    getCheckoutPaymentMethods,
    getEpaycoCheckoutParams,
    getMyUpgradeCheckoutStatus,
    getMyUpgradeRequests,
    getMySubscription,
    getMyUsage,
    getPlanCatalog,
    getUpgradeRequestsAdmin,
    getUserUsageAdmin,
    pauseMySubscription,
    reactivateMySubscription,
    reportEpaycoCheckoutClosed,
    reportEpaycoTransactionReference,
    updateUpgradeRequestAdmin,
    updateUserPlan,
    verifyAndActivateBySession,
    verifyAndActivateByEpayco,
} from "../controllers/subscription.controller.js";

const router = Router();

router.use(verifyJWT);

// "billing" is a grantable module like any other (see team.permissions.js) -
// the owner always has it (isTeamMember: false bypasses the check entirely),
// and can choose to grant a trusted member view and/or edit access. Default
// role starts at billing:none, so a fresh member sees nothing here until
// granted, same as every other module.
//
// EXCEPTION: /me and /me/usage stay ungated for any team member. DashboardLayout
// polls /me for every logged-in user (owner and members alike) to decide
// whether to show the hard "your subscription lapsed" block screen - that's
// account-wide access control, not a billing detail, and every member needs
// it to work even if they can't see/manage billing themselves. Gating it
// behind billing:view would silently disable that block for anyone without
// the permission. The frontend still hides the billing UI/nav for members
// without billing:view (Dashboard.jsx, data.jsx) - this is just the status
// check the whole app's access gate depends on.
router.route("/plans").get(getPlanCatalog);
router.route("/me").get(getMySubscription);
router.route("/me/usage").get(getMyUsage);
router.route("/me/checkout-payment-methods").get(requireModulePermission("billing", "view"), getCheckoutPaymentMethods);
router.route("/me/upgrade-requests")
    .get(requireModulePermission("billing", "view"), getMyUpgradeRequests)
    .post(requireModulePermission("billing", "edit"), createUpgradeRequest);

// Billing mutations: require edit-level billing access.
router.route("/me/upgrade-requests/:id/cancel").patch(requireModulePermission("billing", "edit"), cancelMyUpgradeRequest);
router.route("/me/upgrade-requests/:id/checkout-session").post(requireModulePermission("billing", "edit"), createMyUpgradeCheckoutSession);
router.route("/me/upgrade-requests/:id/checkout-status").get(requireModulePermission("billing", "view"), getMyUpgradeCheckoutStatus);
router.route("/me/upgrade-requests/:id/verify-activate").post(requireModulePermission("billing", "edit"), verifyAndActivateBySession);
// ePayco: fetch widget params for the checkout page (auth-protected)
router.route("/me/upgrade-requests/:id/epayco-params").get(requireModulePermission("billing", "edit"), getEpaycoCheckoutParams);
// ePayco: fallback verification when confirmation webhook is delayed
router.route("/me/upgrade-requests/:id/epayco-verify").post(requireModulePermission("billing", "edit"), verifyAndActivateByEpayco);
// ePayco: self-reported "closed the checkout without finishing" signal from
// the onClosed hook (onpage/embedded checkout only) - see EpaycoCheckout.jsx
router.route("/me/upgrade-requests/:id/epayco-checkout-closed").post(requireModulePermission("billing", "edit"), reportEpaycoCheckoutClosed);
// ePayco: self-reported ref_payco from the browser (response redirect /
// onResponse hook) - backstop for when the signed confirmation webhook is
// lost (e.g. Render cold start). Only ever fills in a lookup key for the
// existing trusted verification pipeline - see reportEpaycoTransactionReference.
router.route("/me/upgrade-requests/:id/epayco-reference").post(requireModulePermission("billing", "edit"), reportEpaycoTransactionReference);
// Renewal: creates checkout for the same current plan
router.route("/me/renew").post(requireModulePermission("billing", "edit"), createRenewalCheckout);
router.route("/me/pause").patch(requireModulePermission("billing", "edit"), pauseMySubscription);
router.route("/me/cancel").patch(requireModulePermission("billing", "edit"), cancelMySubscription);
router.route("/me/reactivate").patch(requireModulePermission("billing", "edit"), reactivateMySubscription);

router.route("/admin/users/:userId/plan").patch(isAdmin, updateUserPlan);
router.route("/admin/users/:userId/usage").get(isAdmin, getUserUsageAdmin);
router.route("/admin/upgrade-requests").get(isAdmin, getUpgradeRequestsAdmin);
router.route("/admin/upgrade-requests/:id").patch(isAdmin, updateUpgradeRequestAdmin);

export default router;
