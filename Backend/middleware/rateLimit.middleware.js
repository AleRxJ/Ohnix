import rateLimit from "express-rate-limit";
import { ApiError } from "../utils/ApiError.js";

// Auth/OTP endpoints had zero rate limiting anywhere - login and password
// reset were open to brute force, and send-reset-otp/send-verify-otp let
// anyone (unauthenticated, for reset) trigger emails to any address
// repeatedly, i.e. email-bomb third parties using Ohnix's own SMTP.

const jsonRateLimitHandler = (req, res) => {
    const error = new ApiError(429, "Too many requests. Please try again later.");
    return res.status(error.statusCode).json({
        success: false,
        statusCode: error.statusCode,
        message: error.message,
    });
};

const makeLimiter = (windowMinutes, max) =>
    rateLimit({
        windowMs: windowMinutes * 60 * 1000,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        handler: jsonRateLimitHandler,
    });

// Credential-guessing surfaces: generous enough for a real user mistyping
// their password a few times, tight enough to make brute force impractical.
export const loginRateLimiter = makeLimiter(15, 10);
export const registerRateLimiter = makeLimiter(60, 10);

// OTP request surfaces: the actual abuse vector is spamming *someone else's*
// inbox, so this stays tight regardless of whether the caller is authed.
// 5/hour proved too tight in practice - EmailVerify.jsx auto-sends one OTP
// on every page load/mount (not just on explicit "resend" clicks), so a
// couple of reloads plus one or two manual resends was enough to lock a
// legitimate user out for an hour.
export const otpRequestRateLimiter = makeLimiter(60, 8);

// OTP consumption (guessing the 6-digit code itself).
export const otpVerifyRateLimiter = makeLimiter(15, 10);

// Team invitations: the abuse vector is the same as OTP requests (spamming
// someone else's inbox), plus the seat-limit check already bounds total
// invites per team - this just stops one owner account from hammering the
// endpoint. Resend shares the limiter since it also sends an email.
export const teamInvitationRateLimiter = makeLimiter(60, 20);

// Invitation acceptance is unauthenticated (the token is the credential) -
// same brute-force surface as login, so it gets the same shape of limit.
export const invitationAcceptRateLimiter = makeLimiter(15, 10);
