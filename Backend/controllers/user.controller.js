import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import { sendMailSafe } from "../utils/nodemailer.js";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { notifyAdminsUpgradeRequestCreated, notifyUserEmailVerified, notifyAdminsNewUserRegistered } from "../utils/upgradeRequestNotifications.js";

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

const DEFAULT_ACCESS_TOKEN_EXPIRY = "1d";
const DEFAULT_REFRESH_TOKEN_EXPIRY = "10d";

const shouldLogAuthDebug =
    process.env.NODE_ENV !== "production" || process.env.AUTH_DEBUG === "true";

const normalizeJwtExpiry = (value, fallback) => {
    const normalized = value?.trim().replace(/^['"]|['"]$/g, "");

    if (!normalized) {
        return fallback;
    }

    if (/^\d+$/.test(normalized) || /^\d+[smhdwy]$/.test(normalized)) {
        return normalized;
    }

    console.warn(
        `Invalid JWT expiry value "${value}". Falling back to "${fallback}".`
    );
    return fallback;
};

const userPublicSelect = {
    id: true,
    legacyMongoId: true,
    username: true,
    email: true,
    role: true,
    avatar: true,
    isVerified: true,
    preferredLanguage: true,
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
        },
    },
    createdAt: true,
    updatedAt: true,
};

const userForTokenSelect = {
    id: true,
    legacyMongoId: true,
    username: true,
    email: true,
    refreshToken: true,
};

const userLookupByTokenId = (tokenUserId) => ({
    OR: [{ id: tokenUserId }, { legacyMongoId: tokenUserId }],
});

const toAuthUser = (user) => ({
    ...user,
    _id: user.legacyMongoId || user.id,
    prismaId: user.id,
});

const normalizePreferredLanguage = (value) => {
    const normalized = `${value || ""}`.toLowerCase().trim();
    return normalized.startsWith("en") ? "en" : "es";
};

const normalizeRole = (role) => (role === "admin" ? "admin" : "user");
const normalizePlan = (plan) =>
    ["starter", "growth", "scale", "enterprise"].includes(plan) ? plan : "starter";

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        if (!process.env.ACCESS_TOKEN_SECRET || !process.env.REFRESH_TOKEN_SECRET) {
            throw new Error("JWT secrets are not configured");
        }

        const user = await prisma.user.findFirst({
            where: userLookupByTokenId(userId),
            select: userForTokenSelect,
        });

        if (!user) {
            throw new Error("User not found while generating auth tokens");
        }

        const tokenUserId = user.legacyMongoId || user.id;

        const accessToken = jwt.sign(
            {
                _id: tokenUserId,
                email: user.email,
                username: user.username,
            },
            process.env.ACCESS_TOKEN_SECRET,
            {
                expiresIn: normalizeJwtExpiry(
                    process.env.ACCESS_TOKEN_EXPIRY,
                    DEFAULT_ACCESS_TOKEN_EXPIRY
                ),
            }
        );

        const refreshToken = jwt.sign(
            {
                _id: tokenUserId,
            },
            process.env.REFRESH_TOKEN_SECRET,
            {
                expiresIn: normalizeJwtExpiry(
                    process.env.REFRESH_TOKEN_EXPIRY,
                    DEFAULT_REFRESH_TOKEN_EXPIRY
                ),
            }
        );

        await prisma.user.update({
            where: { id: user.id },
            data: { refreshToken },
        });

        return { accessToken, refreshToken };
    } catch (error) {
        console.error("Token generation failed:", error);
        throw new ApiError(
            500,
            error?.message ||
                "Something went wrong while generating referesh and access token"
        );
    }
};

const registerUser = asyncHandler(async (req, res, next) => {
    const { email, username, password, desiredPlan, preferredLanguage } = req.body;

    if ([email, username, password].some((field) => field?.trim() === "")) {
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

    // Avatar is optional — use Cloudinary upload if file provided, otherwise
    // fall back to a generated ui-avatars.com URL based on the username.
    let avatarUrl;
    if (avatarFile) {
        const uploaded = await uploadToCloudinary(avatarFile);
        if (!uploaded) {
            return next(new ApiError(400, "Avatar file upload failed"));
        }
        avatarUrl = uploaded.url;
    } else {
        const avatarSeed = encodeURIComponent(normalizedUsername || normalizedEmail);
        avatarUrl = `https://ui-avatars.com/api/?background=29D8D5&color=021314&name=${avatarSeed}`;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const normalizedDesiredPlan = ["growth", "enterprise"].includes(
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
    const signupRequestStatus = shouldCreateUpgradeRequest ? "approved" : null;

    const TRIAL_DAYS = 14;
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const user = await prisma.user.create({
        data: {
            avatar: avatarUrl,
            email: normalizedEmail,
            password: hashedPassword,
            username: normalizedUsername,
            preferredLanguage: normalizedPreferredLanguage,
            subscription: {
                create: {
                    plan: "starter",
                    status: "active",
                    trialEndsAt,
                },
            },
            ...(shouldCreateUpgradeRequest
                ? {
                      planUpgradeRequests: {
                          create: {
                              currentPlan: "starter",
                              targetPlan: normalizedDesiredPlan,
                              status: signupRequestStatus,
                              notes: "Requested during signup",
                              adminResponse:
                                  "Auto-approved for standard checkout. Complete payment to activate your plan.",
                              paymentStatus: "awaiting_checkout",
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
    const mailOptions = {
        from: process.env.info@itcycle.co,
        to: createdUser.email,
        subject: "Welcome to our platform",
        text: `Hello ${createdUser.username}, Welcome to our platform`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background-color: #f9f9f9;">
            <h1 style="color: #333; text-align: center;">Welcome, ${createdUser.username}!</h1>
            <p style="font-size: 16px; color: #555; text-align: center;">
                Thank you for joining our platform. We are excited to have you here!
            </p>
            <p style="font-size: 16px; color: #555; text-align: center;">
                Explore our features and make the most of our platform.
            </p>
            <p style="font-size: 16px; color: #555; text-align: center;">
                If you have any questions, feel free to reach out to our support team at 
                <a href="mailto:sekharsurya111@gmail.com" style="color: #4CAF50; text-decoration: none;">sekharsurya111@gmail.com</a>.
            </p>
            <p style="font-size: 16px; color: #555; text-align: center; margin-top: 20px;">
                Regards, <strong> Surya</strong>
            </p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            <p style="text-align: center; font-size: 14px; color: #888;">
                &copy; ${new Date().getFullYear()} Surya. All rights reserved.
            </p>
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
    const { email, username, password } = req.body;

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

    if (!user) {
        return next(new ApiError(404, "User does not exist"));
    }

    // Temporary bypass for email verification during deployment/testing
    if (!user.isVerified) {
        await prisma.user.update({
            where: { id: user.id },
            data: { isVerified: true },
        });
        user.isVerified = true;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
        return next(new ApiError(401, "Invalid user credentials"));
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
        user.legacyMongoId || user.id
    );

    const loggedInUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: userPublicSelect,
    });

    // Updated cookie options for deployment
    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // Changed for cross-origin
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: "/",
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
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
        await prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: null },
        });
    }

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
    };

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged Out"));
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
                refreshToken: true,
            },
        });

        if (!user) {
            return next(
                new ApiError(401, "Invalid refresh token - User not found")
            );
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            return next(new ApiError(401, "Refresh token is expired or used"));
        }

        const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days for refresh token
            path: "/",
        };

        const { accessToken, refreshToken: newRefreshToken } =
            await generateAccessAndRefreshTokens(user.legacyMongoId || user.id);

        return res
            .status(200)
            .cookie("accessToken", accessToken, {
                ...options,
                maxAge: 24 * 60 * 60 * 1000, // 24 hours for access token
            })
            .cookie("refreshToken", newRefreshToken, options)
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
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        return next(new ApiError(400, "Old password and new password are required"));
    }

    const user = await prisma.user.findFirst({
        where: userLookupByTokenId(req.user?._id),
        select: { id: true, password: true },
    });

    if (!user) {
        return next(new ApiError(404, "User not found"));
    }

    const isPasswordCorrect = await bcrypt.compare(oldPassword, user.password);

    if (!isPasswordCorrect) {
        return next(new ApiError(400, "Invalid old password"));
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
    });

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res, next) => {
    const { username, preferredLanguage } = req.body;

    if (!username && !preferredLanguage) {
        return next(
            new ApiError(400, "At least one field is required: username or preferredLanguage")
        );
    }

    const normalizedUsername = username?.toLowerCase().trim();
    const normalizedPreferredLanguage = preferredLanguage
        ? normalizePreferredLanguage(preferredLanguage)
        : undefined;

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

    const avatar = await uploadToCloudinary(req.file);

    if (!avatar?.url) {
        return next(new ApiError(400, "Error while uploading avatar"));
    }

    const currentUser = await prisma.user.findFirst({
        where: userLookupByTokenId(req.user?._id),
        select: { id: true },
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

    return res
        .status(200)
        .json(new ApiResponse(200, toAuthUser(currentUser), "User fetched successfully"));
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

        const otp = String(Math.floor(100000 + Math.random() * 900000));
        await prisma.user.update({
            where: { id: user.id },
            data: {
                verifyOtp: otp,
                verifyOtpExpiry: BigInt(Date.now() + 10 * 60 * 1000),
            },
        });

        const mailOptions = {
            from: `Ohnix <${process.env.info@itcycle.co}>`,
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
        return next(new ApiError(500, error.message));
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

        const otp = String(Math.floor(100000 + Math.random() * 900000));
        await prisma.user.update({
            where: { id: user.id },
            data: {
                verifyOtp: otp,
                verifyOtpExpiry: BigInt(Date.now() + 10 * 60 * 1000),
            },
        });

        const mailOptions = {
            from: `Ohnix <${process.env.info@itcycle.co}>`,
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
        return next(new ApiError(500, error.message));
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

        if (!user) {
            return next(new ApiError(404, "User not found"));
        }

        const otp = String(Math.floor(100000 + Math.random() * 900000));
        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetOtp: otp,
                resetOtpExpiry: BigInt(Date.now() + 10 * 60 * 1000),
            },
        });

        const mailOptions = {
            from: `Ohnix <${process.env.info@itcycle.co}>`,
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
                    "Password reset OTP sent to your email successfully"
                )
            );
    } catch (error) {
        return next(new ApiError(500, error.message));
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

        if (!user) {
            return next(new ApiError(404, "User not found"));
        }

        if (user.resetOtp !== otp || user.resetOtp === "") {
            return next(new ApiError(400, "Invalid OTP"));
        }

        if (Number(user.resetOtpExpiry) < Date.now()) {
            return next(new ApiError(400, "OTP expired"));
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetOtp: "",
                resetOtpExpiry: BigInt(0),
            },
        });

        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Password reset successfully"));
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
});

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    updateAccountDetails,
    updateUserAvatar,
    getCurrentUser,
    listUsersAdmin,
    createUserAdmin,
    updateUserAdmin,
    sendVerifyOtp,
    verifyEmail,
    isAuthenticated,
    sendResetOtp,
    resetPassword,
    sendChangePasswordOtp,
    verifyChangePasswordOtp,
};
