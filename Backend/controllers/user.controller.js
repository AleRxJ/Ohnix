import { randomInt } from "crypto";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { uploadFile, deleteFile } from "../utils/storage.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import { sendMailSafe } from "../utils/nodemailer.js";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { notifyAdminsUpgradeRequestCreated, notifyUserEmailVerified, notifyAdminsNewUserRegistered } from "../utils/upgradeRequestNotifications.js";
import {
    endSession,
    getSessionBySid,
    listSessions,
    listAllSessions,
    revokeAllSessions,
    revokeSession,
    revokeSessionById,
} from "../utils/sessionStore.js";
import { issueAuthTokens, userLookupByTokenId, AUTH_COOKIE_OPTIONS } from "../utils/authTokens.js";
import {
    signImpersonationToken,
    setImpersonationSession,
    clearImpersonationSession,
} from "../utils/impersonationSession.js";
import { shouldRouteToManualReview } from "./subscription.controller.js";
import { logAdminAction } from "../utils/adminAudit.js";

// ─── Bilingual OTP email builder ─────────────────────────────────────────────
const buildOtpEmail = ({ username, otp, locale, context }) => {
    const isEN = `${locale || ""}`.toLowerCase().startsWith("en");
    const titles = {
        verify:          { es: "Verificación de cuenta",    en: "Account verification" },
        change_password: { es: "Cambio de contraseña",      en: "Change password" },
        reset_password:  { es: "Restablecer contraseña",    en: "Reset password" },
    };
    const intros = {
        verify:          { es: "Usa el siguiente código OTP para verificar tu correo:", en: "Use the following OTP code to verify your email:" },
        change_password: { es: "Usa el siguiente código OTP para cambiar tu contraseña:", en: "Use the following OTP code to change your password:" },
        reset_password:  { es: "Usa el siguiente código OTP para restablecer tu contraseña:", en: "Use the following OTP code to reset your password:" },
    };
    const title = isEN ? titles[context]?.en : titles[context]?.es;
    const intro = isEN ? intros[context]?.en : intros[context]?.es;
    const greeting = isEN ? `Hello <strong>${username}</strong>,` : `Hola <strong>${username}</strong>,`;
    const validity = isEN
        ? "This code is valid for <strong>10 minutes</strong>. If you didn't request this, ignore this email."
        : "Este código es válido por <strong>10 minutos</strong>. Si no solicitaste esto, ignora este correo.";
    const footer = `&copy; ${new Date().getFullYear()} Ohnix by iTCycle. ${isEN ? "All rights reserved." : "Todos los derechos reservados."}`;
    return `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#0b0b0b;border:1px solid #29D8D5;border-radius:12px;">
            <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#29D8D5;font-weight:700;margin-bottom:8px;">OHNIX</div>
            <h2 style="color:#29D8D5;margin:0 0 16px;">${title}</h2>
            <p style="font-size:15px;color:#e5e7eb;margin:0 0 6px;">${greeting}</p>
            <p style="font-size:15px;color:#e5e7eb;margin:0 0 20px;">${intro}</p>
            <div style="text-align:center;margin:24px 0;">
                <span style="background:#29D8D5;color:#021314;padding:14px 32px;border-radius:10px;font-size:30px;font-weight:800;display:inline-block;letter-spacing:8px;">${otp}</span>
            </div>
            <p style="font-size:13px;color:#9ca3af;margin:0 0 20px;">${validity}</p>
            <hr style="border:none;border-top:1px solid #1d2733;margin:20px 0;">
            <p style="text-align:center;font-size:12px;color:#6b7280;">${footer}</p>
        </div>
    `;
};

const shouldLogAuthDebug =
    process.env.NODE_ENV !== "production" || process.env.AUTH_DEBUG === "true";

const userPublicSelect = {
    id: true,
    legacyMongoId: true,
    username: true,
    email: true,
    role: true,
    avatar: true,
    isVerified: true,
    preferredLanguage: true,
    theme: true,
    subscription: {
        select: {
            plan: true,
            status: true,
            startedAt: true,
            endsAt: true,
        },
    },
    company: {
        select: {
            id: true,
            name: true,
            legalName: true,
            countryCode: true,
            electronicInvoicingEnabled: true,
        },
    },
    createdAt: true,
    updatedAt: true,
};

const toAuthUser = (user) => ({
    ...user,
    _id: user.legacyMongoId || user.id,
    prismaId: user.id,
});

const normalizePreferredLanguage = (value) => {
    const normalized = `${value || ""}`.toLowerCase().trim();
    return normalized.startsWith("en") ? "en" : "es";
};

const normalizeTheme = (value) => (value === "lite" ? "lite" : "dark");

const normalizeRole = (role) => (role === "admin" ? "admin" : "user");
const normalizePlan = (plan) =>
    ["starter", "growth", "scale", "enterprise"].includes(plan) ? plan : "starter";

const registerUser = asyncHandler(async (req, res, next) => {
    const { email, username, password, desiredPlan, preferredLanguage } = req.body;

    // field?.trim() === "" only catches an empty string - if the field is
    // missing entirely (undefined/null, e.g. a malformed request body),
    // optional chaining short-circuits to undefined and the check silently
    // passes, so email.toLowerCase() below threw an unhandled TypeError
    // instead of a clean 400.
    if ([email, username, password].some((field) => !field?.trim())) {
        return next(new ApiError(400, "All fields are required"));
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUsername = username.toLowerCase().trim();

    const existedUser = await prisma.user.findFirst({
        where: {
            OR: [{ username: normalizedUsername }, { email: normalizedEmail }],
        },
        select: { id: true },
    });

    if (existedUser) {
        return next(
            new ApiError(409, "User with email or username already exists")
        );
    }

    // Handle avatar upload - check both req.files and req.file
    let avatarFile = null;
    if (req.files?.avatar?.[0]) {
        avatarFile = req.files.avatar[0];
    } else if (req.file) {
        avatarFile = req.file;
    }

    // Avatar is optional — upload if a file was provided, otherwise fall
    // back to a generated ui-avatars.com URL based on the username.
    let avatarUrl;
    if (avatarFile) {
        // No req.user yet at signup - the account doesn't exist until the
        // create below, so scope by username instead of an account id.
        const uploaded = await uploadFile(avatarFile, {
            ownerId: normalizedUsername,
            entity: "avatars",
        });
        if (!uploaded) {
            return next(new ApiError(400, "Avatar file upload failed"));
        }
        avatarUrl = uploaded.url;
    } else {
        const avatarSeed = encodeURIComponent(normalizedUsername || normalizedEmail);
        avatarUrl = `https://ui-avatars.com/api/?background=29D8D5&color=021314&name=${avatarSeed}`;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const normalizedDesiredPlan = ["growth", "scale", "enterprise"].includes(
        desiredPlan?.toLowerCase?.()
    )
        ? desiredPlan.toLowerCase()
        : null;
    const normalizedPreferredLanguage = normalizePreferredLanguage(
        preferredLanguage || req.headers["accept-language"]
    );
    // Only create an upgrade request when the user picked a paid plan above starter.
    // Registering with ?plan=starter (or no plan) must NOT create a pending request.
    const shouldCreateUpgradeRequest = normalizedDesiredPlan && normalizedDesiredPlan !== "starter";

    // The 14-day free trial is a Starter-only benefit (see getEffectivePlan's
    // comment in pricing.middleware.js) - picking Negocio/Escala/Enterprise
    // at signup must NOT grant free access to anything. Those accounts get a
    // subscription "placeholder" (status: paused, no trial) that blocks the
    // whole app via ensureActiveSubscription exactly like a lapsed account,
    // until closeApprovedRequestAndActivatePlan flips it to active on a
    // confirmed payment (or the user explicitly falls back to the Starter
    // trial via startMyStarterTrial). Enterprise never has a fixed checkout
    // price, so it's routed to manual review (shouldRouteToManualReview)
    // instead of being auto-approved into a checkout that could never work.
    const TRIAL_DAYS = 14;
    const subscriptionData = shouldCreateUpgradeRequest
        ? { plan: "starter", status: "paused", trialEndsAt: null }
        : {
              plan: "starter",
              status: "active",
              trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
          };

    const requiresManualReview = shouldCreateUpgradeRequest
        ? shouldRouteToManualReview({ targetPlan: normalizedDesiredPlan, requiresManualReview: false })
        : false;
    const signupRequestStatus = shouldCreateUpgradeRequest
        ? requiresManualReview
            ? "open"
            : "approved"
        : null;

    const user = await prisma.user.create({
        data: {
            avatar: avatarUrl,
            email: normalizedEmail,
            password: hashedPassword,
            username: normalizedUsername,
            preferredLanguage: normalizedPreferredLanguage,
            subscription: {
                create: subscriptionData,
            },
            ...(shouldCreateUpgradeRequest
                ? {
                      planUpgradeRequests: {
                          create: {
                              currentPlan: "starter",
                              targetPlan: normalizedDesiredPlan,
                              status: signupRequestStatus,
                              // No notes/adminResponse boilerplate - the
                              // frontend's request_status_help_approved
                              // i18n string already covers this, translated
                              // (see createUpgradeRequest in
                              // subscription.controller.js for the same
                              // fix). "Requested during signup" wasn't
                              // useful customer-facing info anyway.
                              paymentStatus: requiresManualReview ? null : "awaiting_checkout",
                          },
                      },
                  }
                : {}),
        },
    });

    const createdUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: userPublicSelect,
    });

    if (!createdUser) {
        return next(
            new ApiError(500, "Something went wrong while registering the user")
        );
    }

    if (normalizedDesiredPlan) {
        const signupUpgradeRequest = await prisma.planUpgradeRequest.findFirst({
            where: {
                userId: createdUser.id,
                targetPlan: normalizedDesiredPlan,
                status: signupRequestStatus,
            },
            orderBy: {
                createdAt: "desc",
            },
            select: {
                id: true,
                currentPlan: true,
                targetPlan: true,
                notes: true,
                status: true,
                createdAt: true,
            },
        });

        // In the default signup flow, plan requests are auto-approved and should
        // not create admin queue noise. Keep this branch for future exception routing.
        if (signupUpgradeRequest?.status === "open") {
            await notifyAdminsUpgradeRequestCreated({
                request: signupUpgradeRequest,
                user: {
                    email: createdUser.email,
                    username: createdUser.username,
                },
                source: "signup",
                locale: normalizedPreferredLanguage,
            });
        }
    }

    // Sending Welcome Email
    const isWelcomeEN = `${normalizedPreferredLanguage || ""}`.toLowerCase().startsWith("en");
    const welcomeFrontendBase = `${process.env.FRONTEND_URL || "https://ohnix.co"}`.replace(/\/$/, "");
    const welcomeSubject = isWelcomeEN ? "Welcome to Ohnix" : "Bienvenido a Ohnix";
    const welcomeCta = isWelcomeEN ? "Go to Dashboard" : "Ir al Dashboard";
    const welcomeGreeting = isWelcomeEN
        ? `Hello <strong>${createdUser.username}</strong>,`
        : `Hola <strong>${createdUser.username}</strong>,`;
    const welcomeBody = isWelcomeEN
        ? "Your account has been created. Ohnix helps you manage inventory, sales, and billing in one place — let's get you started."
        : "Tu cuenta ha sido creada. Ohnix te ayuda a gestionar inventario, ventas y facturación en un solo lugar — empecemos.";
    const mailOptions = {
        from: `Ohnix <${process.env.SENDER_EMAIL}>`,
        to: createdUser.email,
        subject: welcomeSubject,
        text: `${welcomeGreeting.replace(/<\/?strong>/g, "")} ${welcomeBody}`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#0b0b0b;border:1px solid #29D8D5;border-radius:12px;">
                <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#29D8D5;font-weight:700;margin-bottom:8px;">OHNIX</div>
                <h2 style="color:#29D8D5;margin:0 0 16px;">${welcomeSubject}</h2>
                <p style="font-size:15px;color:#e5e7eb;margin:0 0 6px;">${welcomeGreeting}</p>
                <p style="font-size:15px;color:#e5e7eb;line-height:1.6;margin:0 0 20px;">${welcomeBody}</p>
                <div style="text-align:center;margin:28px 0;">
                    <a href="${welcomeFrontendBase}" style="background:#29D8D5;color:#021314;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:15px;">${welcomeCta}</a>
                </div>
                <hr style="border:none;border-top:1px solid #1d2733;margin:20px 0;">
                <p style="text-align:center;font-size:12px;color:#6b7280;">&copy; ${new Date().getFullYear()} Ohnix by iTCycle. ${isWelcomeEN ? "All rights reserved." : "Todos los derechos reservados."}</p>
            </div>
        `,
    };

    // Sending Welcome Email (fire and forget — do not block registration response)
    sendMailSafe(mailOptions, "welcome-email").catch(() => {});

    // Notify admins of new registration (fire and forget)
    notifyAdminsNewUserRegistered({
        user: {
            username: createdUser.username,
            email: createdUser.email,
            plan: normalizedDesiredPlan || "starter",
        },
    }).catch(() => {});

    return res
        .status(201)
        .json(
            new ApiResponse(200, createdUser, "User registered Successfully")
        );
});

const loginUser = asyncHandler(async (req, res, next) => {
    const { email, username, password, deviceId, deviceClass } = req.body;

    if (!username && !email) {
        return next(new ApiError(400, "username or email is required"));
    }

    const normalizedEmail = email?.toLowerCase().trim();
    const normalizedUsername = username?.toLowerCase().trim();

    const user = await prisma.user.findFirst({
        where: {
            OR: [
                ...(normalizedUsername ? [{ username: normalizedUsername }] : []),
                ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
            ],
        },
        select: {
            id: true,
            legacyMongoId: true,
            username: true,
            email: true,
            role: true,
            avatar: true,
            isVerified: true,
            password: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    // Same status/message whether the account doesn't exist or the password
    // is wrong - a distinct "does not exist" response would let this
    // endpoint be used to enumerate registered emails/usernames.
    if (!user) {
        return next(new ApiError(401, "Invalid user credentials"));
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
        return next(new ApiError(401, "Invalid user credentials"));
    }

    // No sid passed in -> a fresh one is minted and registered as its own
    // device row, alongside any other device already logged in for this
    // user (see sessionStore.js).
    const { accessToken, refreshToken } = await issueAuthTokens(
        user.legacyMongoId || user.id,
        { deviceId, deviceClass, deviceInfo: req.header("User-Agent") }
    );

    const loggedInUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: userPublicSelect,
    });

    return res
        .status(200)
        .cookie("accessToken", accessToken, AUTH_COOKIE_OPTIONS.access)
        .cookie("refreshToken", refreshToken, AUTH_COOKIE_OPTIONS.refresh)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    accessToken,
                    refreshToken,
                },
                "User logged In Successfully"
            )
        );
});

const logoutUser = asyncHandler(async (req, res, next) => {
    const user = await prisma.user.findFirst({
        where: userLookupByTokenId(req.user._id),
        select: { id: true },
    });

    if (user) {
        // Ends only this device's session (its refresh token lives on its
        // own UserSession row now) - other devices logged in on the same
        // account (see sessionStore.js) are left untouched.
        await endSession(user.id, req.user.sid);
    }

    // Must match the attributes the cookie was actually set with (login,
    // above) - a clearCookie call with a different sameSite/secure than the
    // original cookie is not guaranteed to remove it in every browser.
    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    };

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged Out"));
});

// "Sesiones activas" (Account settings) - lets a user see every device
// currently logged in on their account (Web/Desktop/Mobile at once, see
// sessionStore.js) and end any one of them remotely, the same idea as
// Google/Netflix's device list.
const getMySessions = asyncHandler(async (req, res) => {
    // req.user.id (not prismaId) - sessions belong to the actual login
    // identity, never the account/team-owner id a team member's other
    // requests are scoped to (see teamContext.js).
    const sessions = await listSessions(req.user.id);
    return res.status(200).json(
        new ApiResponse(
            200,
            sessions.map((session) => ({
                id: session.id,
                deviceClass: session.deviceClass,
                deviceLabel: session.deviceLabel,
                lastSeenAt: session.lastSeenAt,
                createdAt: session.createdAt,
                isCurrent: session.sid === req.user.sid,
            })),
            "Sessions fetched successfully"
        )
    );
});

const revokeMySession = asyncHandler(async (req, res, next) => {
    const { sessionId } = req.params;
    const revoked = await revokeSession(req.user.id, sessionId);
    if (!revoked) {
        return next(new ApiError(404, "Session not found"));
    }
    return res.status(200).json(new ApiResponse(200, {}, "Session revoked successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res, next) => {
    const incomingRefreshToken =
        req.cookies.refreshToken ||
        req.body.refreshToken ||
        req.header("Authorization")?.replace("Bearer ", "");

    if (shouldLogAuthDebug) {
        console.log("Refresh token sources:", {
            cookies: !!req.cookies?.refreshToken,
            body: !!req.body?.refreshToken,
            header: !!req.header("Authorization"),
        });
    }

    if (!incomingRefreshToken) {
        return next(
            new ApiError(401, "Unauthorized request - No refresh token")
        );
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );

        const user = await prisma.user.findFirst({
            where: userLookupByTokenId(decodedToken?._id),
            select: {
                id: true,
                legacyMongoId: true,
            },
        });

        if (!user) {
            return next(
                new ApiError(401, "Invalid refresh token - User not found")
            );
        }

        // Each device's refresh token is compared against its own
        // UserSession row now, not a single account-wide column - so
        // rotating it here never affects any other logged-in device. A
        // missing row also covers "this device's session was ended" (logout,
        // revoke from the sessions list, or a team member removal).
        const session = await getSessionBySid(decodedToken?.sid);
        if (!session || session.userId !== user.id || incomingRefreshToken !== session.refreshToken) {
            return next(new ApiError(401, "Refresh token is expired or used"));
        }

        const { accessToken, refreshToken: newRefreshToken } =
            await issueAuthTokens(user.legacyMongoId || user.id, {
                sid: decodedToken?.sid,
                deviceInfo: req.header("User-Agent"),
            });

        return res
            .status(200)
            .cookie("accessToken", accessToken, AUTH_COOKIE_OPTIONS.access)
            .cookie("refreshToken", newRefreshToken, AUTH_COOKIE_OPTIONS.refresh)
            .json(
                new ApiResponse(
                    200,
                    { accessToken, refreshToken: newRefreshToken },
                    "Access token refreshed"
                )
            );
    } catch (error) {
        console.error("Refresh token error:", error);
        return next(
            new ApiError(401, error?.message || "Invalid refresh token")
        );
    }
});

const changeCurrentPassword = asyncHandler(async (req, res, next) => {
    const { oldPassword, newPassword, otp } = req.body;

    if (!oldPassword || !newPassword || !otp) {
        return next(new ApiError(400, "Old password, new password and OTP are required"));
    }

    const user = await prisma.user.findFirst({
        where: userLookupByTokenId(req.user?._id),
        select: { id: true, password: true, verifyOtp: true, verifyOtpExpiry: true },
    });

    if (!user) {
        return next(new ApiError(404, "User not found"));
    }

    const isPasswordCorrect = await bcrypt.compare(oldPassword, user.password);

    if (!isPasswordCorrect) {
        return next(new ApiError(400, "Invalid old password"));
    }

    // The frontend shows an OTP step that looked mandatory, but this
    // endpoint never actually checked it - anyone with a valid access token
    // and the old password could change the password without ever
    // requesting or entering an OTP. Validate it for real here instead of
    // relying on the separate verify-change-password-otp call.
    if (!user.verifyOtp || user.verifyOtp !== otp) {
        return next(new ApiError(400, "Invalid OTP"));
    }
    if (Number(user.verifyOtpExpiry) < Date.now()) {
        return next(new ApiError(400, "OTP expired"));
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
        where: { id: user.id },
        data: {
            password: hashedPassword,
            verifyOtp: "",
            verifyOtpExpiry: BigInt(0),
            // Bumping tokenVersion invalidates every access token already
            // issued (verifyJWT rejects any token whose tokenVersion doesn't
            // match) - otherwise a stolen access token kept working for up
            // to its full 24h expiry.
            tokenVersion: { increment: 1 },
        },
    });
    // A refresh token stolen before the password change must not keep
    // working after it - force re-login on every device, not just revoke
    // the one that changed the password.
    await revokeAllSessions(user.id);

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res, next) => {
    const { username, preferredLanguage, theme } = req.body;

    if (!username && !preferredLanguage && !theme) {
        return next(
            new ApiError(400, "At least one field is required: username, preferredLanguage, or theme")
        );
    }

    const normalizedUsername = username?.toLowerCase().trim();
    const normalizedPreferredLanguage = preferredLanguage
        ? normalizePreferredLanguage(preferredLanguage)
        : undefined;
    const normalizedTheme = theme ? normalizeTheme(theme) : undefined;

    const currentUser = await prisma.user.findFirst({
        where: userLookupByTokenId(req.user?._id),
        select: { id: true },
    });

    if (!currentUser) {
        return next(new ApiError(404, "User not found"));
    }

    // username must be unique
    if (normalizedUsername) {
        const existed = await prisma.user.findFirst({
            where: {
                username: normalizedUsername,
                NOT: { id: currentUser.id },
            },
            select: { id: true },
        });

        if (existed) {
            return next(new ApiError(409, "Username already exists"));
        }
    }

    const user = await prisma.user.update({
        where: { id: currentUser.id },
        data: {
            ...(normalizedUsername ? { username: normalizedUsername } : {}),
            ...(normalizedPreferredLanguage
                ? { preferredLanguage: normalizedPreferredLanguage }
                : {}),
            ...(normalizedTheme ? { theme: normalizedTheme } : {}),
        },
        select: userPublicSelect,
    });

    return res
        .status(200)
        .json(
            new ApiResponse(200, user, "Account details updated successfully")
        );
});

const updateUserAvatar = asyncHandler(async (req, res, next) => {
    if (!req.file) {
        return next(new ApiError(400, "Avatar file is missing"));
    }

    const avatar = await uploadFile(req.file, {
        ownerId: req.user.prismaId,
        entity: "avatars",
    });

    if (!avatar?.url) {
        return next(new ApiError(400, "Error while uploading avatar"));
    }

    const currentUser = await prisma.user.findFirst({
        where: userLookupByTokenId(req.user?._id),
        select: { id: true, avatar: true },
    });

    if (!currentUser) {
        return next(new ApiError(404, "User not found"));
    }

    const user = await prisma.user.update({
        where: { id: currentUser.id },
        data: {
            avatar: avatar.url,
        },
        select: userPublicSelect,
    });

    if (currentUser.avatar) {
        deleteFile(currentUser.avatar);
    }

    return res
        .status(200)
        .json(new ApiResponse(200, user, "Avatar image updated successfully"));
});

const getCurrentUser = asyncHandler(async (req, res, next) => {
    const currentUser = await prisma.user.findFirst({
        where: userLookupByTokenId(req.user?._id),
        select: userPublicSelect,
    });

    if (!currentUser) {
        return next(new ApiError(404, "User not found"));
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                ...toAuthUser(currentUser),
                // Only set while req.user came from an impersonation token
                // (see verifyJWT) - this is what tells the frontend to show
                // the "viewing as" banner.
                impersonatedBy: req.user?.impersonatedBy || null,
                impersonatedByUsername: req.user?.impersonatedByUsername || null,
            },
            "User fetched successfully"
        )
    );
});

// Admin-only: mints a short-lived, non-refreshable session that authenticates
// as targetUser instead of the calling admin, so the admin can see exactly
// what that user sees while helping with support. Deliberately does NOT
// reuse issueAuthTokens - see impersonationSession.js for why that would
// silently end the target's real session.
const impersonateUser = asyncHandler(async (req, res, next) => {
    const { userId } = req.params;

    const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, legacyMongoId: true, username: true, email: true, role: true, tokenVersion: true },
    });

    if (!target) {
        return next(new ApiError(404, "Usuario no encontrado."));
    }
    if (target.role === "admin") {
        return next(new ApiError(403, "No se puede simular a otro administrador."));
    }

    const { accessToken, sid } = signImpersonationToken(target, req.user.id, req.user.username);
    await setImpersonationSession(sid, { adminId: req.user.id, targetUserId: target.id });

    await logAdminAction({
        adminId: req.user.id,
        action: "impersonation_started",
        targetType: "user",
        targetId: target.id,
        targetUserId: target.id,
        metadata: { sid },
    });

    const impersonatedUser = await prisma.user.findUnique({
        where: { id: target.id },
        select: userPublicSelect,
    });

    return res
        .status(200)
        .cookie("accessToken", accessToken, AUTH_COOKIE_OPTIONS.access)
        .json(
            new ApiResponse(
                200,
                {
                    user: {
                        ...toAuthUser(impersonatedUser),
                        // Mirrors getCurrentUser's shape - the frontend's banner
                        // (ImpersonationBanner.jsx) keys off these fields, and
                        // applySession swaps this response straight into
                        // AuthContext without a follow-up /current-user fetch.
                        impersonatedBy: req.user.id,
                        impersonatedByUsername: req.user.username,
                    },
                    accessToken,
                },
                "Sesión simulada iniciada"
            )
        );
});

// Reachable only by verifyJWT (not isAdmin): while impersonating, req.user is
// the TARGET user, whose role is very unlikely to be "admin" - gating this on
// isAdmin would lock the admin out of their own way back. req.user.impersonatedBy
// (set by verifyJWT from the impersonation token) is what proves this request
// is genuinely running inside an impersonation session.
const endImpersonation = asyncHandler(async (req, res, next) => {
    if (!req.user?.impersonatedBy) {
        return next(new ApiError(400, "No hay una sesión simulada activa."));
    }

    const adminId = req.user.impersonatedBy;
    const targetUserId = req.user.id;
    const sid = req.user.impersonationSid;

    await clearImpersonationSession(sid);

    await logAdminAction({
        adminId,
        action: "impersonation_ended",
        targetType: "user",
        targetId: targetUserId,
        targetUserId,
        metadata: { sid },
    });

    // Mints a brand-new, normal session for the admin - exactly like a fresh
    // login, including the usual single-active-session bookkeeping. Their
    // real refreshToken/session was never touched by the impersonation, but
    // re-minting here (rather than trying to restore whatever they had
    // before) keeps this endpoint simple and matches how every other
    // "become this session" transition in the app already works.
    const { accessToken, refreshToken } = await issueAuthTokens(adminId, {
        deviceInfo: req.header("User-Agent"),
    });
    const adminUser = await prisma.user.findUnique({
        where: { id: adminId },
        select: userPublicSelect,
    });

    return res
        .status(200)
        .cookie("accessToken", accessToken, AUTH_COOKIE_OPTIONS.access)
        .cookie("refreshToken", refreshToken, AUTH_COOKIE_OPTIONS.refresh)
        .json(new ApiResponse(200, { user: adminUser, accessToken, refreshToken }, "Sesión simulada finalizada"));
});

const listUsersAdmin = asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
        select: {
            ...userPublicSelect,
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    return res
        .status(200)
        .json(new ApiResponse(200, users, "Users fetched successfully"));
});

const createUserAdmin = asyncHandler(async (req, res, next) => {
    const {
        email,
        username,
        password,
        role,
        companyId,
        preferredLanguage,
        plan,
    } = req.body;

    if (!email?.trim() || !username?.trim() || !password?.trim()) {
        return next(
            new ApiError(400, "Email, username, and password are required")
        );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUsername = username.toLowerCase().trim();

    const existedUser = await prisma.user.findFirst({
        where: {
            OR: [{ username: normalizedUsername }, { email: normalizedEmail }],
        },
        select: { id: true },
    });

    if (existedUser) {
        return next(new ApiError(409, "User with email or username already exists"));
    }

    if (companyId) {
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true },
        });

        if (!company) {
            return next(new ApiError(404, "Assigned company not found"));
        }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const avatarSeed = encodeURIComponent(normalizedUsername || normalizedEmail);

    const created = await prisma.user.create({
        data: {
            email: normalizedEmail,
            username: normalizedUsername,
            password: hashedPassword,
            role: normalizeRole(role),
            companyId: companyId || null,
            preferredLanguage: normalizePreferredLanguage(preferredLanguage),
            avatar: `https://ui-avatars.com/api/?background=29D8D5&color=021314&name=${avatarSeed}`,
            isVerified: true,
            subscription: {
                create: {
                    plan: normalizePlan(plan),
                    status: "active",
                },
            },
        },
        select: userPublicSelect,
    });

    return res
        .status(201)
        .json(new ApiResponse(201, created, "Managed user created successfully"));
});

const updateUserAdmin = asyncHandler(async (req, res, next) => {
    const { userId } = req.params;
    const { username, role, companyId, preferredLanguage, isVerified } = req.body;

    const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
    });

    if (!existing) {
        return next(new ApiError(404, "User not found"));
    }

    const normalizedUsername = username?.toLowerCase().trim();

    if (normalizedUsername) {
        const collision = await prisma.user.findFirst({
            where: {
                username: normalizedUsername,
                id: { not: userId },
            },
            select: { id: true },
        });

        if (collision) {
            return next(new ApiError(409, "Username already exists"));
        }
    }

    if (companyId) {
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true },
        });

        if (!company) {
            return next(new ApiError(404, "Assigned company not found"));
        }
    }

    const updated = await prisma.user.update({
        where: { id: userId },
        data: {
            ...(normalizedUsername ? { username: normalizedUsername } : {}),
            ...(role !== undefined ? { role: normalizeRole(role) } : {}),
            ...(companyId !== undefined ? { companyId: companyId || null } : {}),
            ...(preferredLanguage !== undefined
                ? { preferredLanguage: normalizePreferredLanguage(preferredLanguage) }
                : {}),
            ...(typeof isVerified === "boolean" ? { isVerified } : {}),
        },
        select: userPublicSelect,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, updated, "User updated successfully"));
});

// Admin-initiated password set - the admin already passed the isAdmin gate,
// so unlike changeCurrentPassword this skips the old-password/OTP checks.
// Kept as its own route (not folded into updateUserAdmin) so this
// security-sensitive action stays unambiguous in the route list and audit
// log rather than a stray `password` key silently accepted by the general
// profile-edit endpoint.
const setUserPasswordAdmin = asyncHandler(async (req, res, next) => {
    const { userId } = req.params;
    const { password } = req.body || {};

    if (!password || password.length < 8) {
        return next(new ApiError(400, "Password must be at least 8 characters long"));
    }

    const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
    });

    if (!existing) {
        return next(new ApiError(404, "User not found"));
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({
        where: { id: userId },
        data: {
            password: hashedPassword,
            tokenVersion: { increment: 1 },
        },
    });
    // Same session-invalidation as changeCurrentPassword - anyone logged in
    // as this user before the reset must be signed out everywhere.
    await revokeAllSessions(userId);

    await logAdminAction({
        adminId: req.user.prismaId,
        action: "reset_user_password",
        targetType: "user",
        targetId: userId,
        targetUserId: userId,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Password updated successfully"));
});

// Support/security tooling: the Ohnix platform admin can see and end any
// user's sessions, not just their own - e.g. a compromised-account report,
// or a user who can't reach their own sessions tab to sign out a lost device
// themselves. Never scoped to isCurrent (an admin's own sid is irrelevant to
// someone else's device list).
const getUserSessionsAdmin = asyncHandler(async (req, res) => {
    const sessions = await listSessions(req.params.userId);
    return res.status(200).json(
        new ApiResponse(
            200,
            sessions.map((session) => ({
                id: session.id,
                deviceClass: session.deviceClass,
                deviceLabel: session.deviceLabel,
                lastSeenAt: session.lastSeenAt,
                createdAt: session.createdAt,
            })),
            "Sessions fetched successfully"
        )
    );
});

const revokeUserSessionAdmin = asyncHandler(async (req, res, next) => {
    const { userId, sessionId } = req.params;
    const revoked = await revokeSession(userId, sessionId);
    if (!revoked) {
        return next(new ApiError(404, "Session not found"));
    }
    await logAdminAction({
        adminId: req.user.prismaId,
        action: "revoke_user_session",
        targetType: "user",
        targetId: userId,
        targetUserId: userId,
        metadata: { sessionId },
    });
    return res.status(200).json(new ApiResponse(200, {}, "Session revoked successfully"));
});

// ownedTeam/teamMemberships (raw Prisma relations, see
// sessionStore.js's listAllSessions) collapse to a single display-friendly
// fact per user: which team, and whether they're its owner or a member -
// or null for a solo/independent account with no team at all. That null
// case is deliberately still included in the response, never filtered out -
// this admin view has no team boundary, unlike everywhere else sessions are
// shown.
const describeUserTeam = (user) => {
    if (user.ownedTeam) {
        return { name: user.ownedTeam.name, role: "owner" };
    }
    const membership = user.teamMemberships?.[0]?.team;
    return membership ? { name: membership.name, role: "member" } : null;
};

// The system-wide "Sesiones" tab: every device logged in across every user,
// regardless of team or company - lets the platform admin spot and end a
// suspicious session anywhere without first having to know which user (or
// which team, or whether they're even on one at all) it belongs to.
const listAllSessionsAdmin = asyncHandler(async (_req, res) => {
    const sessions = await listAllSessions();
    return res.status(200).json(
        new ApiResponse(
            200,
            sessions.map((session) => ({
                id: session.id,
                deviceClass: session.deviceClass,
                deviceLabel: session.deviceLabel,
                lastSeenAt: session.lastSeenAt,
                createdAt: session.createdAt,
                user: {
                    id: session.user.id,
                    username: session.user.username,
                    email: session.user.email,
                    role: session.user.role,
                    company: session.user.company,
                    team: describeUserTeam(session.user),
                },
            })),
            "Sessions fetched successfully"
        )
    );
});

const revokeAnySessionAdmin = asyncHandler(async (req, res, next) => {
    const { sessionId } = req.params;
    const session = await revokeSessionById(sessionId);
    if (!session) {
        return next(new ApiError(404, "Session not found"));
    }
    await logAdminAction({
        adminId: req.user.prismaId,
        action: "revoke_user_session",
        targetType: "user",
        targetId: session.userId,
        targetUserId: session.userId,
        metadata: { sessionId },
    });
    return res.status(200).json(new ApiResponse(200, {}, "Session revoked successfully"));
});

// Send verification otp to users email
const sendVerifyOtp = asyncHandler(async (req, res, next) => {
    try {
        const user = await prisma.user.findFirst({
            where: userLookupByTokenId(req.user._id),
            select: {
                id: true,
                username: true,
                email: true,
                isVerified: true,
                preferredLanguage: true,
            },
        });

        if (!user) {
            return next(new ApiError(404, "User not found"));
        }

        if (user.isVerified) {
            return next(new ApiError(400, "User is already verified"));
        }

        const otp = String(randomInt(100000, 1000000));
        await prisma.user.update({
            where: { id: user.id },
            data: {
                verifyOtp: otp,
                verifyOtpExpiry: BigInt(Date.now() + 10 * 60 * 1000),
            },
        });

        const mailOptions = {
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: user.email,
            subject: user.preferredLanguage === "en"
                ? "Ohnix — Verify your email"
                : "Ohnix — Verifica tu correo",
            html: buildOtpEmail({ username: user.username, otp, locale: user.preferredLanguage, context: "verify" }),
        };
        const mailResult = await sendMailSafe(mailOptions, "verify-email-otp");

        if (!mailResult?.sent) {
            if (process.env.NODE_ENV === "production") {
                return next(
                    new ApiError(
                        503,
                        "Email service is temporarily unavailable. Please try again later."
                    )
                );
            }

            return res
                .status(200)
                .json(
                    new ApiResponse(
                        200,
                        { devOtp: otp },
                        "OTP generated. Email service unavailable in local environment"
                    )
                );
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    {},
                    "Verification OTP sent to your email successfully"
                )
            );
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

// Send verification otp to users email for changing password
const sendChangePasswordOtp = asyncHandler(async (req, res, next) => {
    try {
        const user = await prisma.user.findFirst({
            where: userLookupByTokenId(req.user._id),
            select: {
                id: true,
                username: true,
                email: true,
                preferredLanguage: true,
            },
        });

        if (!user) {
            return next(new ApiError(404, "User not found"));
        }

        const otp = String(randomInt(100000, 1000000));
        await prisma.user.update({
            where: { id: user.id },
            data: {
                verifyOtp: otp,
                verifyOtpExpiry: BigInt(Date.now() + 10 * 60 * 1000),
            },
        });

        const mailOptions = {
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: user.email,
            subject: user.preferredLanguage === "en"
                ? "Ohnix — Change password OTP"
                : "Ohnix — Código para cambiar contraseña",
            html: buildOtpEmail({ username: user.username, otp, locale: user.preferredLanguage, context: "change_password" }),
        };
        const mailResult = await sendMailSafe(mailOptions, "change-password-otp");

        if (!mailResult?.sent) {
            if (process.env.NODE_ENV === "production") {
                return next(
                    new ApiError(
                        503,
                        "Email service is temporarily unavailable. Please try again later."
                    )
                );
            }

            return res
                .status(200)
                .json(
                    new ApiResponse(
                        200,
                        { devOtp: otp },
                        "OTP generated. Email service unavailable in local environment"
                    )
                );
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    {},
                    "Verification OTP sent to your email successfully"
                )
            );
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

// Verify user email for changing password
const verifyChangePasswordOtp = asyncHandler(async (req, res, next) => {
    const { otp } = req.body;
    const userId = req.user._id; // userId is coming from verifyJWT middleware

    if (!userId || !otp) {
        return next(new ApiError(400, "UserId and OTP are required"));
    }

    try {
        const user = await prisma.user.findFirst({
            where: userLookupByTokenId(userId),
            select: {
                id: true,
                verifyOtp: true,
                verifyOtpExpiry: true,
            },
        });

        if (!user) {
            return next(new ApiError(404, "User not found"));
        }

        if (user.verifyOtp !== otp || user.verifyOtp === "") {
            return next(new ApiError(400, "Invalid OTP"));
        }

        if (Number(user.verifyOtpExpiry) < Date.now()) {
            return next(new ApiError(400, "OTP expired"));
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                verifyOtp: "",
                verifyOtpExpiry: BigInt(0),
            },
        });

        return res.status(200).json(new ApiResponse(200, {}, "OTP verified"));
    } catch (error) {
        return next(new ApiError(400, "Invalid OTP or User"));
    }
});

// Verify user email
const verifyEmail = asyncHandler(async (req, res, next) => {
    const { otp } = req.body;
    const userId = req.user._id; // userId is coming from verifyJWT middleware

    if (!userId || !otp) {
        return next(new ApiError(400, "UserId and OTP are required"));
    }

    try {
        const user = await prisma.user.findFirst({
            where: userLookupByTokenId(userId),
            select: {
                id: true,
                isVerified: true,
                verifyOtp: true,
                verifyOtpExpiry: true,
            },
        });

        if (!user) {
            return next(new ApiError(404, "User not found"));
        }

        if (user.isVerified) {
            return next(new ApiError(400, "User is already verified"));
        }

        if (user.verifyOtp !== otp || user.verifyOtp === "") {
            return next(new ApiError(400, "Invalid OTP"));
        }

        if (Number(user.verifyOtpExpiry) < Date.now()) {
            return next(new ApiError(400, "OTP expired"));
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                isVerified: true,
                verifyOtp: "",
                verifyOtpExpiry: BigInt(0),
            },
        });

        // Send email verified confirmation (fire and forget)
        notifyUserEmailVerified({
            user: { email: req.user.email, username: req.user.username },
            locale: req.user.preferredLanguage,
        }).catch(() => {});

        return res
            .status(200)
            .json(new ApiResponse(200, {}, "User verified successfully"));
    } catch (error) {
        return next(new ApiError(400, "Invalid OTP or User"));
    }
});

// Check if user is authenticated
const isAuthenticated = asyncHandler(async (req, res, next) => {
    try {
        return res
            .status(200)
            .json(new ApiResponse(200, {}, "User is authenticated"));
    } catch (error) {
        return next(new ApiError(400, error.message));
    }
});

// Send reset otp to users email
const sendResetOtp = asyncHandler(async (req, res, next) => {
    const { email } = req.body;

    if (!email) {
        return next(new ApiError(400, "Email is required"));
    }

    try {
        const user = await prisma.user.findFirst({
            where: { email: email.toLowerCase().trim() },
            select: {
                id: true,
                username: true,
                email: true,
                preferredLanguage: true,
            },
        });

        // Don't reveal whether this email is registered - always resolve
        // through the same success response either way. Only a real `user`
        // actually gets an OTP generated and an email sent below.
        if (!user) {
            return res
                .status(200)
                .json(
                    new ApiResponse(
                        200,
                        {},
                        "If this email is registered, a password reset code has been sent"
                    )
                );
        }

        const otp = String(randomInt(100000, 1000000));
        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetOtp: otp,
                resetOtpExpiry: BigInt(Date.now() + 10 * 60 * 1000),
            },
        });

        const mailOptions = {
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: email,
            subject: user.preferredLanguage === "en"
                ? "Ohnix — Reset your password"
                : "Ohnix — Código para restablecer contraseña",
            html: buildOtpEmail({ username: user.username, otp, locale: user.preferredLanguage, context: "reset_password" }),
        };

        const mailResult = await sendMailSafe(mailOptions, "reset-password-otp");

        if (!mailResult?.sent) {
            if (process.env.NODE_ENV === "production") {
                return next(
                    new ApiError(
                        503,
                        "Email service is temporarily unavailable. Please try again later."
                    )
                );
            }

            return res
                .status(200)
                .json(
                    new ApiResponse(
                        200,
                        { devOtp: otp },
                        "OTP generated. Email service unavailable in local environment"
                    )
                );
        }

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    {},
                    "If this email is registered, a password reset code has been sent"
                )
            );
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

// Reset user password
const resetPassword = asyncHandler(async (req, res, next) => {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
        return next(
            new ApiError(400, "Email, OTP and New Password are required")
        );
    }

    try {
        const user = await prisma.user.findFirst({
            where: { email: email.toLowerCase().trim() },
            select: {
                id: true,
                resetOtp: true,
                resetOtpExpiry: true,
            },
        });

        // All three failure branches below (no such user, wrong code,
        // expired code) return the identical message/status - a distinct
        // "user not found" response here would let this endpoint be used to
        // enumerate registered emails the same way sendResetOtp used to.
        if (!user) {
            return next(new ApiError(400, "Invalid or expired code"));
        }

        if (user.resetOtp !== otp || user.resetOtp === "") {
            return next(new ApiError(400, "Invalid or expired code"));
        }

        if (Number(user.resetOtpExpiry) < Date.now()) {
            return next(new ApiError(400, "Invalid or expired code"));
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetOtp: "",
                resetOtpExpiry: BigInt(0),
                // Also revokes every access token already issued (see the
                // matching comment in changeCurrentPassword above).
                tokenVersion: { increment: 1 },
            },
        });
        // A refresh token stolen before the reset must not keep working
        // after it - force re-login on every device.
        await revokeAllSessions(user.id);

        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Password reset successfully"));
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

export {
    buildOtpEmail,
    registerUser,
    loginUser,
    logoutUser,
    getMySessions,
    revokeMySession,
    refreshAccessToken,
    changeCurrentPassword,
    updateAccountDetails,
    updateUserAvatar,
    getCurrentUser,
    listUsersAdmin,
    createUserAdmin,
    updateUserAdmin,
    setUserPasswordAdmin,
    getUserSessionsAdmin,
    revokeUserSessionAdmin,
    listAllSessionsAdmin,
    revokeAnySessionAdmin,
    impersonateUser,
    endImpersonation,
    sendVerifyOtp,
    verifyEmail,
    isAuthenticated,
    sendResetOtp,
    resetPassword,
    sendChangePasswordOtp,
    verifyChangePasswordOtp,
};
