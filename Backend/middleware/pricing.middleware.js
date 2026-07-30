import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Plan display names and prices — used by frontend and email templates.
// Technical names (starter, growth, scale, enterprise) map to DB enum values.
export const PLAN_DISPLAY_NAMES = {
    starter:    { es: "Emprendedor", en: "Starter"    },
    growth:     { es: "Negocio",     en: "Business"   },
    scale:      { es: "Escala",      en: "Scale"      },
    enterprise: { es: "Enterprise",  en: "Enterprise" },
};

export const PLAN_PRICES_USD = {
    starter:    19,
    growth:     49,
    scale:      99,
    enterprise: null, // custom — set per negotiation
};

export const PLAN_LIMITS = {
    // $19/mes — Emprendedor / Starter
    // Solo emprendedor, catálogo pequeño, operación inicial.
    starter: {
        maxProducts:          75,
        maxCustomers:         50,
        maxSuppliers:         20,
        maxCategories:        15,
        maxUnits:             10,
        maxOrders:           600,   // lifetime cumulative (~10 months at full monthly rate)
        maxPurchases:        300,   // lifetime cumulative
        maxMonthlyOrders:     60,   // ~2 per day
        maxMonthlyPurchases:  30,   // ~1 per day
    },
    // $49/mes — Negocio / Business
    // Negocio establecido, todos los reportes, exportación CSV, alertas email.
    growth: {
        maxProducts:         500,
        maxCustomers:        300,
        maxSuppliers:        100,
        maxCategories:        40,
        maxUnits:             25,
        maxOrders:         10000,   // lifetime cumulative
        maxPurchases:       5000,   // lifetime cumulative
        maxMonthlyOrders:    300,   // ~10 per day
        maxMonthlyPurchases: 150,
    },
    // $99/mes — Escala / Scale  (requires DB migration: ALTER TYPE "PlanType" ADD VALUE 'scale')
    // Empresa en crecimiento, API, reportes avanzados, multi-usuario próximamente.
    scale: {
        maxProducts:        2000,
        maxCustomers:       1000,
        maxSuppliers:        400,
        maxCategories:        80,
        maxUnits:             50,
        maxOrders:          null,   // unlimited
        maxPurchases:       null,   // unlimited
        maxMonthlyOrders:   1000,   // ~33 per day
        maxMonthlyPurchases: 500,
    },
    // Custom desde $249/mes — Enterprise
    // Todo ilimitado, API sin restricciones, account manager.
    enterprise: {
        maxProducts:         null,
        maxCustomers:        null,
        maxSuppliers:        null,
        maxCategories:       null,
        maxUnits:            null,
        maxOrders:           null,
        maxPurchases:        null,
        maxMonthlyOrders:    null,
        maxMonthlyPurchases: null,
    },
};

// ── Feature flags per plan ──────────────────────────────────────────────
// These control which product features are accessible on each tier.
// When adding a new feature, add its key here and set true from the first plan
// that should have access to it.
export const PLAN_FEATURES = {
    // $19/mes — Emprendedor: core inventory only
    starter: {
        reportSales:        false,
        reportPurchases:    false,
        reportTopProducts:  false,
        exportCsv:          false,
        bulkUpload:         false,
        autoEmailAlerts:    false,
        configurableAlerts: false,
        apiAccess:          false,
    },
    // $49/mes — Negocio: full analytics + exports
    growth: {
        reportSales:        true,
        reportPurchases:    true,
        reportTopProducts:  true,
        exportCsv:          true,
        bulkUpload:         true,
        autoEmailAlerts:    true,
        configurableAlerts: false,
        apiAccess:          false,
    },
    // $99/mes — Escala: API + advanced reports
    scale: {
        reportSales:        true,
        reportPurchases:    true,
        reportTopProducts:  true,
        exportCsv:          true,
        bulkUpload:         true,
        autoEmailAlerts:    true,
        configurableAlerts: true,
        apiAccess:          true,
    },
    // Custom — Enterprise: everything
    enterprise: {
        reportSales:        true,
        reportPurchases:    true,
        reportTopProducts:  true,
        exportCsv:          true,
        bulkUpload:         true,
        autoEmailAlerts:    true,
        configurableAlerts: true,
        apiAccess:          true,
    },
};

export const getPlanFeatures = (plan) => PLAN_FEATURES[plan] ?? PLAN_FEATURES.starter;

const RESOURCE_CONFIG = {
    products: { model: "product", limitKey: "maxProducts", label: "products" },
    customers: { model: "customer", limitKey: "maxCustomers", label: "customers" },
    suppliers: { model: "supplier", limitKey: "maxSuppliers", label: "suppliers" },
    categories: { model: "category", limitKey: "maxCategories", label: "categories" },
    units: { model: "unit", limitKey: "maxUnits", label: "units" },
    orders: { model: "order", limitKey: "maxOrders", label: "orders" },
    purchases: { model: "purchase", limitKey: "maxPurchases", label: "purchases" },
};

export const ensureUserSubscription = async (userId) =>
    prisma.subscription.upsert({
        where: { userId },
        update: {},
        create: {
            userId,
            plan: "starter",
            status: "active",
        },
        select: {
            plan: true,
            status: true,
        },
    });

export const getPlanLimits = (plan) => PLAN_LIMITS[plan] || PLAN_LIMITS.starter;

const ensureActiveSubscription = (subscription) => {
    if (!subscription || subscription.status !== "active") {
        throw new ApiError(
            403,
            "Your subscription is not active. Please contact support to reactivate your plan."
        );
    }
};

export const getMonthBounds = () => {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const end = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)
    );

    return { start, end };
};

export const enforceEntityLimit = (resourceKey, incrementResolver = () => 1) =>
    asyncHandler(async (req, _, next) => {
        if (req.user?.role === "admin") {
            return next();
        }

        const config = RESOURCE_CONFIG[resourceKey];
        if (!config) {
            return next(new ApiError(500, `Unknown pricing resource: ${resourceKey}`));
        }

        const subscription = await ensureUserSubscription(req.user.prismaId);
        ensureActiveSubscription(subscription);

        const planLimits = getPlanLimits(subscription.plan);
        const limit = planLimits[config.limitKey];

        if (limit === null) {
            return next();
        }

        const increment = Math.max(1, Number(incrementResolver(req)) || 1);
        const existing = await prisma[config.model].count({
            where: {
                createdById: req.user.prismaId,
            },
        });

        if (existing + increment > limit) {
            return next(
                new ApiError(
                    403,
                    `Plan limit reached for ${config.label}. ${subscription.plan} allows up to ${limit}.`
                )
            );
        }

        return next();
    });

export const enforceMonthlyLimit = (resourceKey, incrementResolver = () => 1) =>
    asyncHandler(async (req, _, next) => {
        if (req.user?.role === "admin") {
            return next();
        }

        const subscription = await ensureUserSubscription(req.user.prismaId);
        ensureActiveSubscription(subscription);

        const planLimits = getPlanLimits(subscription.plan);
        const limitKey =
            resourceKey === "orders" ? "maxMonthlyOrders" : "maxMonthlyPurchases";
        const limit = planLimits[limitKey];

        if (limit === null) {
            return next();
        }

        const increment = Math.max(1, Number(incrementResolver(req)) || 1);
        const { start, end } = getMonthBounds();

        const model = resourceKey === "orders" ? "order" : "purchase";
        const usedThisMonth = await prisma[model].count({
            where: {
                createdById: req.user.prismaId,
                createdAt: {
                    gte: start,
                    lte: end,
                },
            },
        });

        if (usedThisMonth + increment > limit) {
            return next(
                new ApiError(
                    403,
                    `Monthly plan limit reached for ${resourceKey}. ${subscription.plan} allows ${limit} per month.`
                )
            );
        }

        return next();
    });

// ── Feature-based access gate ─────────────────────────────────────────────
// Usage: router.get('/reports/sales', enforcePlanFeature('reportSales'), handler)
export const enforcePlanFeature = (featureKey) =>
    asyncHandler(async (req, _, next) => {
        if (req.user?.role === "admin") return next();

        const subscription = await ensureUserSubscription(req.user.prismaId);
        ensureActiveSubscription(subscription);

        const features = getPlanFeatures(subscription.plan);
        if (!features[featureKey]) {
            return next(
                new ApiError(
                    403,
                    `Feature not available on the ${subscription.plan} plan. Please upgrade to access it.`
                )
            );
        }
        return next();
    });
