import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const PLAN_LIMITS = {
    starter: {
        maxProducts: 300,
        maxCustomers: 200,
        maxSuppliers: 120,
        maxCategories: 40,
        maxUnits: 30,
        maxOrders: 1500,
        maxPurchases: 1000,
        maxMonthlyOrders: 200,
        maxMonthlyPurchases: 120,
    },
    growth: {
        maxProducts: 5000,
        maxCustomers: 2000,
        maxSuppliers: 1200,
        maxCategories: 200,
        maxUnits: 120,
        maxOrders: 25000,
        maxPurchases: 12000,
        maxMonthlyOrders: 2500,
        maxMonthlyPurchases: 1500,
    },
    enterprise: {
        maxProducts: null,
        maxCustomers: null,
        maxSuppliers: null,
        maxCategories: null,
        maxUnits: null,
        maxOrders: null,
        maxPurchases: null,
        maxMonthlyOrders: null,
        maxMonthlyPurchases: null,
    },
};

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
