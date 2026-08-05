import { Router } from "express";
import {
    loginUser,
    logoutUser,
    registerUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    sendVerifyOtp,
    verifyEmail,
    isAuthenticated,
    sendResetOtp,
    resetPassword,
    updateAccountDetails,
    updateUserAvatar,
    listUsersAdmin,
    createUserAdmin,
    updateUserAdmin,
    sendChangePasswordOtp,
    verifyChangePasswordOtp,
} from "../controllers/user.controller.js";
import { upload } from "../middleware/multer.middleware.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import {
    loginRateLimiter,
    registerRateLimiter,
    otpRequestRateLimiter,
    otpVerifyRateLimiter,
} from "../middleware/rateLimit.middleware.js";

const router = Router();

router.route("/register").post(
    registerRateLimiter,
    upload.fields([
        {
            name: "avatar",
            maxCount: 1,
        },
    ]),
    registerUser
);

router.route("/login").post(loginRateLimiter, loginUser);

//secured routes
router.route("/logout").post(verifyJWT, logoutUser);
router.route("/refresh-token").post(refreshAccessToken);

router.route("/change-password").post(verifyJWT, changeCurrentPassword);
router.route("/update-account").patch(verifyJWT, updateAccountDetails);
router
    .route("/avatar")
    .patch(verifyJWT, upload.single("avatar"), updateUserAvatar);

router.route("/current-user").get(verifyJWT, getCurrentUser);

router
    .route("/admin/users")
    .get(verifyJWT, isAdmin, listUsersAdmin)
    .post(verifyJWT, isAdmin, createUserAdmin);
router.route("/admin/users/:userId").patch(verifyJWT, isAdmin, updateUserAdmin);

router.route("/send-verify-otp").post(verifyJWT, otpRequestRateLimiter, sendVerifyOtp);
router.route("/verify-email").post(verifyJWT, otpVerifyRateLimiter, verifyEmail);

router.route("/is-auth").post(verifyJWT, isAuthenticated);

router.route("/send-reset-otp").post(otpRequestRateLimiter, sendResetOtp);
router.route("/reset-password").post(otpVerifyRateLimiter, resetPassword);

router
    .route("/send-change-password-otp")
    .post(verifyJWT, otpRequestRateLimiter, sendChangePasswordOtp);
router
    .route("/verify-change-password-otp")
    .post(verifyJWT, otpVerifyRateLimiter, verifyChangePasswordOtp);

export default router;
