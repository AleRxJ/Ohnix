// Backend/services/guestCertificateCheckout.service.js
//
// "Guest checkout" for a digital certificate bought from the public
// certificado-digital-dian landing page (CertificadosDigitales.jsx): a
// visitor who "just wants a certificate" submits one form (company + contact
// info) and this creates the Ohnix account AND the certificate order behind
// the scenes, so the browser can be auto-logged in and dropped straight into
// the EXISTING CertificateOrderCheckout.jsx paywall - no visible
// "create your password" screen first.
//
// Buying a certificate never means acquiring Ohnix's inventory SaaS - the
// account created here gets NO Subscription row (unlike a real signup would
// eventually accumulate through ensureUserSubscription), and DashboardLayout
// exempts "fiscal-setup" from its lapsed-subscription paywall, so this
// account's certificate is never gated behind a plan it was never sold.
//
// Deliberately mirrors registerUser (user.controller.js) and
// createOrReuseMyCertificateOrder (certificateOrder.service.js) rather than
// reimplementing either - this is just the glue that runs both, plus a
// Company row, in one shot for an unauthenticated caller.

import { randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { sendMailSafe } from "../utils/nodemailer.js";
import { buildOtpEmail } from "../controllers/user.controller.js";
import { createOrReuseMyCertificateOrder } from "./certificateOrder.service.js";
import { provisionCompanyWithItcycleForCertificate } from "./electronicInvoicing.service.js";

// Guest accounts aren't set up same-day the way a "forgot password" reset
// is - the resetOtp emailed here is really "the code you'll use whenever you
// first come back to set your own password", so it gets a much longer
// window than sendResetOtp's normal 10 minutes.
const GUEST_RESET_OTP_VALIDITY_MS = 48 * 60 * 60 * 1000;

const generateUsernameCandidate = (email) => {
    const localPart = `${email || ""}`.split("@")[0]?.toLowerCase() || "";
    const cleaned = localPart.replace(/[^a-z0-9_]/g, "");
    if (cleaned) return cleaned;
    // Fallback if the local-part strips to nothing (e.g. an email made
    // entirely of characters outside [a-z0-9_], like accented letters).
    return `guest${randomBytes(3).toString("hex")}`;
};

export const findAvailableUsername = async (email) => {
    const base = generateUsernameCandidate(email);

    const baseTaken = await prisma.user.findFirst({
        where: { username: base },
        select: { id: true },
    });
    if (!baseTaken) return base;

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const suffix = String(randomInt(1000, 10000));
        const candidate = `${base}${suffix}`;
        // eslint-disable-next-line no-await-in-loop
        const taken = await prisma.user.findFirst({
            where: { username: candidate },
            select: { id: true },
        });
        if (!taken) return candidate;
    }

    // Extremely unlikely after 5 attempts with a 4-digit random suffix, but
    // fall back to a fully random tail rather than looping forever.
    return `${base}${randomBytes(4).toString("hex")}`;
};

// registerUser (user.controller.js) never creates a Company row - a brand
// new owner starts with companyId: null and creates their Company later, from
// the fiscal-setup page itself. Confirmed by reading registerUser end to end.
export const registerGuestCompanyForCertificate = async ({
    companyName,
    taxIdentification,
    taxIdentificationDv,
    personType,
    contactName,
    contactEmail,
    contactPhone,
    durationYears,
}) => {
    const normalizedEmail = `${contactEmail || ""}`.toLowerCase().trim();
    const normalizedCompanyName = `${companyName || ""}`.trim();

    const existingUser = await prisma.user.findFirst({
        where: { email: normalizedEmail },
        select: { id: true },
    });
    if (existingUser) {
        throw new ApiError(
            409,
            "Ya existe una cuenta con este correo. Inicia sesión para continuar tu compra.",
            [],
            "",
            "account_already_exists"
        );
    }

    // Same collision guard companySelf.controller.js#updateMyCompany already
    // uses before its own prisma.company.create - Company.name is unique at
    // the DB level, and a raw P2002 here would surface as an opaque 500.
    const existingCompany = await prisma.company.findFirst({
        where: { name: normalizedCompanyName },
        select: { id: true },
    });
    if (existingCompany) {
        throw new ApiError(409, "Ya existe otra empresa con ese nombre.");
    }

    const username = await findAvailableUsername(normalizedEmail);

    // Never logged, returned, or emailed anywhere - this account is only
    // ever meant to be entered via the resetOtp-driven "set your password"
    // step below (or admin support), not typed in directly.
    const randomPassword = randomBytes(24).toString("hex");
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    const resetOtp = String(randomInt(100000, 1000000));
    const resetOtpExpiry = BigInt(Date.now() + GUEST_RESET_OTP_VALIDITY_MS);

    const avatarSeed = encodeURIComponent(username || normalizedEmail);
    const avatarUrl = `https://ui-avatars.com/api/?background=29D8D5&color=021314&name=${avatarSeed}`;

    // No subscription is created here, deliberately: buying a standalone
    // certificate never requires acquiring Ohnix's inventory SaaS at all
    // (Subscription is optional on User - see schema.prisma - exactly like
    // every other signup path, none of which pre-create a starter/trial
    // subscription either; ensureUserSubscription only exists to lazily
    // backfill one for accounts that actually go on to use the SaaS).
    const user = await prisma.user.create({
        data: {
            email: normalizedEmail,
            username,
            password: hashedPassword,
            avatar: avatarUrl,
            preferredLanguage: "es",
            resetOtp,
            resetOtpExpiry,
        },
    });

    let company;
    let order;
    try {
        company = await prisma.company.create({
            data: {
                name: normalizedCompanyName,
                legalName: normalizedCompanyName,
                countryCode: "CO",
                taxIdentification,
                taxIdentificationDv,
                contactEmail: normalizedEmail,
                phone: contactPhone || null,
            },
        });
        await prisma.user.update({
            where: { id: user.id },
            data: { companyId: company.id },
        });

        order = await createOrReuseMyCertificateOrder({
            companyId: company.id,
            requestedByUserId: user.id,
            durationYears,
        });

        // Best-effort: this is exactly what ElectronicInvoicingSettings.jsx's
        // "Solo activar mi certificado" button (provisionCertificateOnly)
        // does by hand - doing it here too means a certificate-only guest
        // lands on /fiscal-setup already provisioned, seeing the
        // FirmaPass/Viafirma cards straight away instead of a wizard step.
        // Must never block the checkout itself if itcycle-api-dian is
        // briefly unreachable - the CertificateOrder above is what actually
        // matters, and that same manual button remains a working fallback.
        try {
            await provisionCompanyWithItcycleForCertificate({ companyId: company.id });
        } catch (provisionError) {
            console.error("[guest-certificate-checkout] itcycle-api-dian provisioning failed, falling back to manual activation", {
                companyId: company.id,
                message: provisionError?.message,
            });
        }
    } catch (error) {
        // No interactive-transaction rollback here on purpose (see this
        // service's own doc comment in the task write-up): a stray
        // User+Company row with no CertificateOrder is harmless clutter, not
        // a security or billing issue, unlike stray payment state. Logging
        // clearly which step failed is what actually matters for support to
        // follow up manually.
        console.error("[guest-certificate-checkout] Failed after user creation", {
            userId: user.id,
            companyId: company?.id || null,
            message: error?.message,
        });
        throw error;
    }

    // Best-effort: the browser is about to be auto-logged in via cookies
    // regardless, so a failed email here must not block the request the way
    // sendResetOtp's production branch does (there, the OTP is the user's
    // ONLY path forward - here it's just a convenience for setting a
    // password later).
    try {
        const mailOptions = {
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: normalizedEmail,
            subject: "Ohnix — Tu cuenta y tu certificado digital",
            html: buildOtpEmail({
                username: user.username,
                otp: resetOtp,
                locale: "es",
                context: "reset_password",
            }),
        };
        const mailResult = await sendMailSafe(mailOptions, "guest-certificate-checkout-welcome");
        if (!mailResult?.sent) {
            console.warn("[guest-certificate-checkout] Welcome/set-password email not sent", {
                userId: user.id,
                skipped: !!mailResult?.skipped,
            });
        }
    } catch (error) {
        console.error("[guest-certificate-checkout] Welcome/set-password email failed", {
            userId: user.id,
            message: error?.message,
        });
    }

    return { user, company, order };
};
