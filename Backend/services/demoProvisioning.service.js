// Creates a demo prospect's OWN Ohnix account with their product list already
// imported, so the team demos Ohnix on the prospect's real catalog and then
// hands that same account over as their trial (sendDemoAccess).
//
// Deliberate choices:
// - Same subscription as a public signup (registerUser): Starter with a
//   14-day trial. No free paid plan - getEffectivePlan's rule that trials
//   never unlock electronic invoicing/accounting still holds, and the import
//   respects Starter's product/category/unit caps.
// - Catalog only, never opening stock. Product.stock is a cache in front of
//   StockMovement; a manual adjustment would book the value as "4295 ingresos
//   diversos" in the prospect's real books, and the one-per-company opening
//   balance must stay free for the customer's own. Stock gets entered live
//   during the demo (a purchase or an adjustment) - which is a demo moment.
// - Same unusable-random-password + 48h resetOtp pattern as
//   guestCertificateCheckout.service.js; the team enters the account through
//   the existing admin impersonation, the prospect through "set password".
// - isVerified: true, like createUserAdmin. Unverified, the team's
//   impersonated session lands on "Verifica tu correo" mid-demo and fires a
//   verification OTP at the prospect; the email still gets proven when they
//   use the emailed access code.
import { randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { sendMailSafe } from "../utils/nodemailer.js";
import { logAdminAction } from "../utils/adminAudit.js";
import { accountAccessEmail } from "../utils/accountEmails.js";
import { getPlanLimits } from "../middleware/pricing.middleware.js";
import { findAvailableUsername } from "./guestCertificateCheckout.service.js";
import { buildCatalogProducts, detectCatalogMapping, sanitizeMapping } from "./demoCatalog.service.js";

const DEMO_PLAN = "starter";
const TRIAL_DAYS = 14; // registerUser's TRIAL_DAYS
const ACCESS_OTP_VALIDITY_MS = 48 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const readStoredCatalog = (demoRequest) =>
    Array.isArray(demoRequest?.catalogHeaders) && Array.isArray(demoRequest?.catalogRows)
        ? { headers: demoRequest.catalogHeaders, rows: demoRequest.catalogRows }
        : null;

// Keeps the most-used names up to the plan cap and folds the long tail into
// `fallback`, instead of failing the whole import on a 16th category.
const capNames = (names, limit, fallback) => {
    const counts = new Map();
    for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
    if (limit === null || counts.size <= limit) return { kept: new Set(counts.keys()), folded: 0 };
    const ranked = [...counts.entries()].filter(([name]) => name !== fallback).sort((a, b) => b[1] - a[1]);
    const kept = new Set(ranked.slice(0, limit - 1).map(([name]) => name));
    kept.add(fallback);
    return { kept, folded: counts.size - kept.size };
};

const findAvailableCompanyName = async (name) => {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
        const candidate = attempt === 1 ? name : `${name} (${attempt})`;
        // eslint-disable-next-line no-await-in-loop
        const taken = await prisma.company.findFirst({ where: { name: { equals: candidate, mode: "insensitive" } }, select: { id: true } });
        if (!taken) return candidate;
    }
    return `${name} (${randomBytes(2).toString("hex")})`;
};

// Import plan shared by the admin preview and the real provisioning, so what
// the admin reviews is exactly what gets created.
export const planCatalogImport = (demoRequest, requestedMapping) => {
    const catalog = readStoredCatalog(demoRequest);
    if (!catalog) return { catalog: null, mapping: null, products: [], errors: [], warnings: [], total: 0 };

    const mapping = sanitizeMapping(requestedMapping ?? detectCatalogMapping(catalog.headers), catalog.headers);
    const built = buildCatalogProducts(catalog, mapping);
    const limits = getPlanLimits(DEMO_PLAN);
    const warnings = [...built.warnings];
    let products = built.products;

    if (limits.maxProducts !== null && products.length > limits.maxProducts) {
        warnings.push({ row: null, message: "plan_product_limit", detail: `${limits.maxProducts}` });
        products = products.slice(0, limits.maxProducts);
    }

    const categories = capNames(products.map((p) => p.category), limits.maxCategories, "General");
    const units = capNames(products.map((p) => p.unit), limits.maxUnits, "Unidad");
    if (categories.folded) warnings.push({ row: null, message: "plan_category_limit", detail: `${categories.folded}` });
    if (units.folded) warnings.push({ row: null, message: "plan_unit_limit", detail: `${units.folded}` });

    const seenBarcodes = new Set();
    products = products.map((product) => {
        const barcode = product.barcode && !seenBarcodes.has(product.barcode) ? product.barcode : null;
        if (barcode) seenBarcodes.add(barcode);
        return {
            ...product,
            barcode,
            category: categories.kept.has(product.category) ? product.category : "General",
            unit: units.kept.has(product.unit) ? product.unit : "Unidad",
        };
    });

    return { catalog, mapping, products, errors: built.errors, warnings, total: built.total };
};

export const provisionDemoAccount = async ({ demoRequestId, mapping, adminId }) => {
    const demoRequest = await prisma.demoRequest.findUnique({ where: { id: demoRequestId } });
    if (!demoRequest) throw new ApiError(404, "Demo request not found.", [], "", "demo_request_not_found");
    if (demoRequest.provisionedUserId) {
        throw new ApiError(409, "This demo request already has an account.", [], "", "demo_request_already_provisioned");
    }

    const email = demoRequest.email.toLowerCase().trim();
    const existingUser = await prisma.user.findFirst({ where: { email }, select: { id: true } });
    if (existingUser) {
        throw new ApiError(409, "There is already an Ohnix account with this email.", [], "", "demo_account_email_taken");
    }

    const plan = planCatalogImport(demoRequest, mapping);
    const companyName = await findAvailableCompanyName(demoRequest.companyName.trim());
    const username = await findAvailableUsername(email);
    // Never shown or sent anywhere - see this file's header comment.
    const hashedPassword = await bcrypt.hash(randomBytes(24).toString("hex"), 10);
    const avatar = `https://ui-avatars.com/api/?background=29D8D5&color=021314&name=${encodeURIComponent(username)}`;

    const result = await prisma.$transaction(
        async (tx) => {
            const user = await tx.user.create({
                data: {
                    email,
                    username,
                    password: hashedPassword,
                    avatar,
                    preferredLanguage: "es",
                    isVerified: true,
                    subscription: {
                        create: { plan: DEMO_PLAN, status: "active", trialEndsAt: new Date(Date.now() + TRIAL_DAYS * DAY_MS) },
                    },
                },
            });
            const company = await tx.company.create({
                data: { name: companyName, legalName: companyName, countryCode: "CO", contactEmail: email, phone: demoRequest.phone || null },
            });
            await tx.user.update({ where: { id: user.id }, data: { companyId: company.id } });

            let importedProducts = 0;
            if (plan.products.length) {
                const categoryNames = [...new Set(plan.products.map((p) => p.category))];
                const unitNames = [...new Set(plan.products.map((p) => p.unit))];
                await tx.category.createMany({ data: categoryNames.map((categoryName) => ({ categoryName, createdById: user.id })) });
                await tx.unit.createMany({ data: unitNames.map((unitName) => ({ unitName, createdById: user.id })) });
                const [categories, units] = await Promise.all([
                    tx.category.findMany({ where: { createdById: user.id }, select: { id: true, categoryName: true } }),
                    tx.unit.findMany({ where: { createdById: user.id }, select: { id: true, unitName: true } }),
                ]);
                const categoryIds = new Map(categories.map((c) => [c.categoryName, c.id]));
                const unitIds = new Map(units.map((u) => [u.unitName, u.id]));

                const created = await tx.product.createMany({
                    data: plan.products.map((p) => ({
                        productName: p.name,
                        productCode: p.code,
                        categoryId: categoryIds.get(p.category),
                        unitId: unitIds.get(p.unit),
                        buyingPrice: p.cost,
                        sellingPrice: p.price,
                        stock: 0,
                        createdById: user.id,
                        ...(p.taxRate !== null && { taxRate: p.taxRate }),
                        ...(p.barcode && { barcode: p.barcode }),
                        ...(p.brand && { brand: p.brand }),
                    })),
                    skipDuplicates: true,
                });
                importedProducts = created.count;
            }

            const importSummary = {
                total_rows: plan.total,
                imported_products: importedProducts,
                categories: [...new Set(plan.products.map((p) => p.category))].length,
                errors: plan.errors.slice(0, 50),
                warnings: plan.warnings.slice(0, 50),
                mapping: plan.mapping,
            };
            const updated = await tx.demoRequest.update({
                where: { id: demoRequest.id },
                data: { provisionedUserId: user.id, provisionedAt: new Date(), importSummary },
                include: { provisionedUser: { select: { id: true, username: true } } },
            });
            return { user, updated, importedProducts };
        },
        { timeout: 60000 }
    );

    await logAdminAction({
        adminId,
        action: "demo_account_provisioned",
        targetType: "demo_request",
        targetId: demoRequest.id,
        targetUserId: result.user.id,
        metadata: { importedProducts: result.importedProducts, companyName },
    });

    return result.updated;
};

// Hands the account over: a fresh 48h "set your password" code by email, and
// the 14-day trial restarted from today so the demo-prep days don't eat into it.
export const sendDemoAccess = async ({ demoRequestId, adminId }) => {
    const demoRequest = await prisma.demoRequest.findUnique({
        where: { id: demoRequestId },
        include: { provisionedUser: { include: { subscription: true } } },
    });
    if (!demoRequest) throw new ApiError(404, "Demo request not found.", [], "", "demo_request_not_found");
    const user = demoRequest.provisionedUser;
    if (!user) throw new ApiError(409, "Create the demo account first.", [], "", "demo_request_not_provisioned");

    const resetOtp = String(randomInt(100000, 1000000));
    await prisma.user.update({
        where: { id: user.id },
        data: { resetOtp, resetOtpExpiry: BigInt(Date.now() + ACCESS_OTP_VALIDITY_MS) },
    });
    // Only restart a still-untouched Starter trial - never override a plan
    // the customer (or an admin) has changed since provisioning.
    if (user.subscription?.plan === DEMO_PLAN && user.subscription?.trialEndsAt) {
        await prisma.subscription.update({
            where: { userId: user.id },
            data: { trialEndsAt: new Date(Date.now() + TRIAL_DAYS * DAY_MS) },
        });
    }

    const mailResult = await sendMailSafe(
        {
            from: `Ohnix <${process.env.SENDER_EMAIL}>`,
            to: user.email,
            subject: "Tu cuenta de Ohnix está lista, con tus productos cargados",
            ...accountAccessEmail({ variant: "demo", username: user.username, email: user.email, otp: resetOtp, companyName: demoRequest.companyName }),
        },
        "demo-access"
    );
    if (!mailResult?.sent && !mailResult?.skipped) {
        throw new ApiError(502, "The access email could not be sent. Try again.", [], "", "demo_access_email_failed");
    }

    const updated = await prisma.demoRequest.update({
        where: { id: demoRequest.id },
        data: { accessSentAt: new Date() },
        include: { provisionedUser: { select: { id: true, username: true } } },
    });
    await logAdminAction({ adminId, action: "demo_access_sent", targetType: "demo_request", targetId: demoRequest.id, targetUserId: user.id });
    return updated;
};
