import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { prisma } from "../db/prisma.js";
import { streamReportPdf } from "../utils/reportPdf.js";
import { getLowStockDefaultThreshold } from "../utils/systemSettings.js";

const toExternalId = (entity) => entity.legacyMongoId || entity.id;

// Every report below reads Order/Purchase/StockMovement (all Point-of-Sale
// scoped - see pos.permissions.js) alongside Product/Category/etc (still
// global - there's no per-location stock split yet, so those stay
// unfiltered on purpose). This is the one thing to merge into whichever of
// those PDV-scoped models a report queries; full-scope actors (the account
// owner, or a member with posScopeAll) get {} - no filter, same as today.
const posScopeWhere = (req) =>
    req.user.posScopeAll ? {} : { pointOfSaleId: { in: req.user.posScopeIds || [] } };

// Renders whichever report tab the client currently has on screen as a
// branded PDF - the client sends the exact title/sections it already built
// for its CSV/Excel export (see ReportExportButtons.jsx callers), so the
// PDF always matches what's visibly filtered/searched, not a fresh
// unfiltered re-query. This endpoint has no report-specific business logic
// of its own on purpose.
const exportReportPdf = asyncHandler(async (req, res, next) => {
    const { title, subtitle, sections } = req.body || {};

    if (!title || !Array.isArray(sections) || sections.length === 0) {
        return next(new ApiError(400, "title and a non-empty sections array are required"));
    }
    const validSections = sections.every(
        (s) => s && typeof s === "object" && (!s.table || (Array.isArray(s.table.headers) && Array.isArray(s.table.rows)))
    );
    if (!validSections) {
        return next(new ApiError(400, "each section's table must have headers and rows arrays"));
    }

    const account = await prisma.user.findUnique({
        where: { id: req.user.prismaId },
        select: { username: true, company: { select: { name: true } } },
    });

    streamReportPdf(res, {
        companyName: account?.company?.name,
        title,
        subtitle,
        generatedFor: account?.company?.name || account?.username,
        sections,
    });
});

// CSV/Excel generation itself happens entirely client-side, from data the
// browser already fetched through an already-gated report endpoint (see
// Frontend/src/utils/exportReport.js) - unlike the PDF export above, there's
// no file for the server to produce here. But the Stock report has no plan
// gate on the underlying data (it's open to every plan), and exportExcel is
// an Escala-only feature that a Negocio user could otherwise trigger just by
// calling the browser's local download function directly - the "can()"
// check that hides the button in ReportExportButtons.jsx is trivially
// bypassable from devtools. These two routes exist purely so the frontend
// has something real to check against before it's allowed to build the
// file locally: enforcePlanFeature does the actual gating, a 200 here is
// the only thing this endpoint means.
const authorizeCsvExport = asyncHandler(async (req, res) => {
    return res.status(200).json(new ApiResponse(200, {}, "Authorized"));
});

const authorizeExcelExport = asyncHandler(async (req, res) => {
    return res.status(200).json(new ApiResponse(200, {}, "Authorized"));
});

const getDashboardMetrics = asyncHandler(async (req, res, next) => {
    try {
        const userId = req.user.prismaId;
        const isAdmin = req.user.role === "admin";

        const orderWhere = {
            ...(isAdmin ? {} : { createdById: userId, ...posScopeWhere(req) }),
            orderStatus: { not: "cancelled" },
        };

        const purchaseWhere = isAdmin
            ? {}
            : { purchase: { createdById: userId, ...posScopeWhere(req) } };
        const productWhere = isAdmin ? {} : { createdById: userId };

        const defaultThreshold = await getLowStockDefaultThreshold();

        const [
            totalSalesAgg,
            totalPurchaseAgg,
            inventoryAgg,
            recentOrders,
            lowStockCandidates,
            outOfStockCount,
        ] = await Promise.all([
            prisma.order.aggregate({
                where: orderWhere,
                _sum: { total: true },
            }),
            prisma.purchaseDetail.aggregate({
                where: purchaseWhere,
                _sum: { total: true },
            }),
            prisma.product.aggregate({
                where: productWhere,
                _sum: {
                    stock: true,
                },
                _count: {
                    id: true,
                },
            }),
            prisma.order.findMany({
                where: isAdmin ? {} : { createdById: userId, ...posScopeWhere(req) },
                orderBy: { createdAt: "desc" },
                take: 5,
                include: {
                    customer: {
                        select: {
                            id: true,
                            legacyMongoId: true,
                            name: true,
                        },
                    },
                },
            }),
            // Per-product thresholds (Escala+) can't be compared against
            // Product.stock in a single `where` clause, so pull a bounded
            // candidate set (worst case = every product below the highest
            // possible threshold) and finish the real per-row comparison in
            // JS below - same approach as lowStockScheduler.js.
            prisma.product.findMany({
                where: productWhere,
                select: {
                    id: true,
                    legacyMongoId: true,
                    productName: true,
                    stock: true,
                    lowStockThreshold: true,
                },
                orderBy: { stock: "asc" },
            }),
            prisma.product.count({
                where: {
                    ...productWhere,
                    stock: 0,
                },
            }),
        ]);

        const lowStockProducts = lowStockCandidates
            .filter((p) => p.stock < (p.lowStockThreshold ?? defaultThreshold))
            .slice(0, 10);

        const productsForValue = await prisma.product.findMany({
            where: productWhere,
            select: {
                stock: true,
                buyingPrice: true,
            },
        });

        const inventoryValue = productsForValue.reduce(
            (sum, p) => sum + p.stock * Number(p.buyingPrice),
            0
        );

        const metrics = {
            totalSales: Number(totalSalesAgg._sum.total || 0),
            totalPurchase: Number(totalPurchaseAgg._sum.total || 0),
            inventoryValue,
            totalProducts: inventoryAgg._count.id || 0,
            totalStock: inventoryAgg._sum.stock || 0,
            outOfStockCount,
            lowStockProducts: lowStockProducts.map((p) => ({
                _id: toExternalId(p),
                product_name: p.productName,
                stock: p.stock,
            })),
            recentOrders: recentOrders.map((o) => ({
                _id: toExternalId(o),
                invoice_no: o.invoiceNo,
                customer_id: o.customer
                    ? {
                          _id: toExternalId(o.customer),
                          name: o.customer.name,
                      }
                    : null,
                total: Number(o.total),
                order_status: o.orderStatus,
                createdAt: o.createdAt,
                updatedAt: o.updatedAt,
            })),
        };

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    metrics,
                    "Dashboard metrics fetched successfully"
                )
            );
    } catch (error) {
        console.error("Dashboard metrics error:", error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const getStockReport = asyncHandler(async (req, res, next) => {
    try {
        const userId = req.user.prismaId;
        const isAdmin = req.user.role === "admin";
        const defaultThreshold = await getLowStockDefaultThreshold();

        const products = await prisma.product.findMany({
            where: isAdmin ? {} : { createdById: userId },
            include: {
                category: {
                    select: {
                        categoryName: true,
                    },
                },
                unit: {
                    select: {
                        unitName: true,
                    },
                },
            },
            orderBy: { stock: "asc" },
        });

        const stockReport = products.map((p) => {
            const status =
                p.stock === 0
                    ? "Out of Stock"
                    : p.stock < (p.lowStockThreshold ?? defaultThreshold)
                      ? "Low Stock"
                      : "In Stock";

            return {
                _id: toExternalId(p),
                product_name: p.productName,
                product_code: p.productCode,
                category_name: p.category?.categoryName || "N/A",
                unit_name: p.unit?.unitName || "N/A",
                buying_price: Number(p.buyingPrice),
                selling_price: Number(p.sellingPrice),
                stock: p.stock,
                inventory_value: p.stock * Number(p.buyingPrice),
                status,
            };
        });

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    stockReport,
                    "Stock report fetched successfully"
                )
            );
    } catch (error) {
        console.error("Stock report error:", error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const getSalesReport = asyncHandler(async (req, res, next) => {
    const { start_date, end_date } = req.query;
    const userId = req.user.prismaId;
    const isAdmin = req.user.role === "admin";

    const dateFilter = {};
    if (start_date && end_date) {
        dateFilter.gte = new Date(start_date);
        dateFilter.lte = new Date(end_date);
    }

    try {
        const orders = await prisma.order.findMany({
            where: {
                ...(isAdmin ? {} : { createdById: userId, ...posScopeWhere(req) }),
                orderStatus: { not: "cancelled" },
                ...(Object.keys(dateFilter).length
                    ? { orderDate: dateFilter }
                    : {}),
            },
            include: {
                orderDetails: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                legacyMongoId: true,
                                productName: true,
                            },
                        },
                    },
                },
            },
            orderBy: { orderDate: "asc" },
        });

        const byDateMap = new Map();
        const byProductMap = new Map();

        for (const order of orders) {
            const dateKey = order.orderDate.toISOString().slice(0, 10);
            const currentDate = byDateMap.get(dateKey) || { _id: dateKey, total: 0, orders: 0 };
            currentDate.total += Number(order.total);
            currentDate.orders += 1;
            byDateMap.set(dateKey, currentDate);

            for (const detail of order.orderDetails) {
                const productId = detail.productId;
                const currentProduct = byProductMap.get(productId) || {
                    _id: toExternalId(detail.product),
                    product_name: detail.product?.productName || "Unknown",
                    quantity: 0,
                    total: 0,
                };
                currentProduct.quantity += detail.quantity;
                currentProduct.total += Number(detail.total);
                byProductMap.set(productId, currentProduct);
            }
        }

        const salesByDate = [...byDateMap.values()].sort((a, b) =>
            a._id.localeCompare(b._id)
        );

        const salesByProduct = [...byProductMap.values()]
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        const report = {
            salesByDate,
            salesByProduct,
            summary: {
                totalSales: salesByDate.reduce((sum, item) => sum + item.total, 0),
                totalOrders: salesByDate.reduce((sum, item) => sum + item.orders, 0),
            },
        };

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    report,
                    "Sales report fetched successfully"
                )
            );
    } catch (error) {
        console.error("Sales report error:", error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const getTopProducts = asyncHandler(async (req, res, next) => {
    const { limit = 10 } = req.query;
    const userId = req.user.prismaId;
    const isAdmin = req.user.role === "admin";

    try {
        const orders = await prisma.order.findMany({
            where: {
                ...(isAdmin ? {} : { createdById: userId, ...posScopeWhere(req) }),
                orderStatus: { not: "cancelled" },
            },
            include: {
                orderDetails: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                legacyMongoId: true,
                                productName: true,
                                productCode: true,
                                productImage: true,
                            },
                        },
                    },
                },
            },
        });

        const byProductMap = new Map();

        for (const order of orders) {
            for (const detail of order.orderDetails) {
                const productId = detail.productId;
                const current = byProductMap.get(productId) || {
                    _id: toExternalId(detail.product),
                    product_name: detail.product?.productName || "Unknown",
                    product_code: detail.product?.productCode || "N/A",
                    product_image:
                        detail.product?.productImage || "default-product.png",
                    quantity_sold: 0,
                    total_sales: 0,
                };

                current.quantity_sold += detail.quantity;
                current.total_sales += Number(detail.total);
                byProductMap.set(productId, current);
            }
        }

        const topProducts = [...byProductMap.values()]
            .sort((a, b) => b.quantity_sold - a.quantity_sold)
            .slice(0, Number.parseInt(limit, 10));

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    topProducts,
                    "Top products fetched successfully"
                )
            );
    } catch (error) {
        console.error("Top products error:", error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const getPurchaseReport = asyncHandler(async (req, res, next) => {
    const { start_date, end_date } = req.query;
    const userId = req.user.prismaId;
    const isAdmin = req.user.role === "admin";

    const dateFilter = {};
    if (start_date && end_date) {
        dateFilter.gte = new Date(start_date);
        dateFilter.lte = new Date(end_date);
    }

    try {
        const purchases = await prisma.purchase.findMany({
            where: {
                ...(isAdmin ? {} : { createdById: userId, ...posScopeWhere(req) }),
                ...(Object.keys(dateFilter).length
                    ? { purchaseDate: dateFilter }
                    : {}),
            },
            include: {
                supplier: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        name: true,
                        shopname: true,
                    },
                },
                purchaseDetails: {
                    select: {
                        total: true,
                    },
                },
            },
            orderBy: { purchaseDate: "asc" },
        });

        const byDateMap = new Map();
        const bySupplierMap = new Map();

        for (const purchase of purchases) {
            const dateKey = purchase.purchaseDate.toISOString().slice(0, 10);
            const currentDate = byDateMap.get(dateKey) || { _id: dateKey, count: 0 };
            currentDate.count += 1;
            byDateMap.set(dateKey, currentDate);

            const purchaseTotal = purchase.purchaseDetails.reduce(
                (sum, detail) => sum + Number(detail.total),
                0
            );

            const supplierKey = purchase.supplierId;
            const currentSupplier = bySupplierMap.get(supplierKey) || {
                _id: toExternalId(purchase.supplier),
                supplier_name: purchase.supplier?.name || "Unknown",
                shopname: purchase.supplier?.shopname || "N/A",
                total_purchases: 0,
                count: 0,
            };

            currentSupplier.total_purchases += purchaseTotal;
            currentSupplier.count += 1;
            bySupplierMap.set(supplierKey, currentSupplier);
        }

        const report = {
            purchasesByDate: [...byDateMap.values()].sort((a, b) =>
                a._id.localeCompare(b._id)
            ),
            purchasesBySupplier: [...bySupplierMap.values()].sort(
                (a, b) => b.total_purchases - a.total_purchases
            ),
        };

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    report,
                    "Purchase report fetched successfully"
                )
            );
    } catch (error) {
        console.error("Purchase report error:", error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const getLowStockAlerts = asyncHandler(async (req, res, next) => {
    const { threshold = 10 } = req.query;
    const userId = req.user.prismaId;
    const isAdmin = req.user.role === "admin";

    try {
        const parsedThreshold = Number.parseInt(threshold, 10);

        const lowStockProducts = await prisma.product.findMany({
            where: {
                ...(isAdmin ? {} : { createdById: userId }),
                stock: { lt: parsedThreshold },
            },
            select: {
                id: true,
                legacyMongoId: true,
                productName: true,
                productCode: true,
                stock: true,
                buyingPrice: true,
                sellingPrice: true,
                category: {
                    select: {
                        categoryName: true,
                    },
                },
                createdBy: {
                    select: {
                        id: true,
                        legacyMongoId: true,
                        username: true,
                        email: true,
                    },
                },
            },
            orderBy: { stock: "asc" },
        });

        const mappedLowStock = lowStockProducts.map((p) => ({
            _id: toExternalId(p),
            product_name: p.productName,
            product_code: p.productCode,
            stock: p.stock,
            buying_price: Number(p.buyingPrice),
            selling_price: Number(p.sellingPrice),
            category_id: {
                category_name: p.category?.categoryName || "N/A",
            },
            created_by: p.createdBy
                ? {
                      _id: toExternalId(p.createdBy),
                      username: p.createdBy.username,
                      email: p.createdBy.email,
                  }
                : null,
        }));

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    lowStockProducts: mappedLowStock,
                    count: mappedLowStock.length,
                    threshold: parsedThreshold,
                    automaticEmails: {
                        enabled: true,
                        schedule: "Every Monday at 9:00 AM",
                        timezone: process.env.TIMEZONE || "Asia/Kolkata",
                        note: "Automatic low stock email alerts are available on the Negocio plan and above",
                    },
                },
                "Low stock alerts fetched successfully"
            )
        );
    } catch (error) {
        console.error("Low stock alerts error:", error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

// ── Escala+ advanced reports ────────────────────────────────────────────────
// Gated behind PLAN_FEATURES.advancedReports (report.routes.js) - unlike the
// base sales/purchase/top-products reports (Negocio+), these are exclusive
// to Escala and Enterprise.

const buildDateFilter = (start_date, end_date) => {
    const filter = {};
    if (start_date && end_date) {
        filter.gte = new Date(start_date);
        filter.lte = new Date(end_date);
    }
    return filter;
};

// Profit margin per product: revenue (order line total) minus cost
// (product.buyingPrice * quantity sold), for the selected period.
const getProfitMarginReport = asyncHandler(async (req, res, next) => {
    const { start_date, end_date } = req.query;
    const userId = req.user.prismaId;
    const isAdmin = req.user.role === "admin";
    const dateFilter = buildDateFilter(start_date, end_date);

    try {
        const orders = await prisma.order.findMany({
            where: {
                ...(isAdmin ? {} : { createdById: userId, ...posScopeWhere(req) }),
                orderStatus: { not: "cancelled" },
                ...(Object.keys(dateFilter).length ? { orderDate: dateFilter } : {}),
            },
            include: {
                orderDetails: {
                    include: {
                        product: {
                            select: { id: true, legacyMongoId: true, productName: true, buyingPrice: true },
                        },
                    },
                },
            },
        });

        const byProductMap = new Map();

        for (const order of orders) {
            for (const detail of order.orderDetails) {
                if (!detail.product) continue;
                const productId = detail.productId;
                const current = byProductMap.get(productId) || {
                    _id: toExternalId(detail.product),
                    product_name: detail.product.productName,
                    quantity: 0,
                    revenue: 0,
                    cost: 0,
                };
                const revenue = Number(detail.total);
                const cost = Number(detail.product.buyingPrice) * detail.quantity;
                current.quantity += detail.quantity;
                current.revenue += revenue;
                current.cost += cost;
                byProductMap.set(productId, current);
            }
        }

        const byProduct = [...byProductMap.values()]
            .map((item) => ({
                ...item,
                margin: item.revenue - item.cost,
                marginPercent: item.revenue > 0 ? Number((((item.revenue - item.cost) / item.revenue) * 100).toFixed(2)) : 0,
            }))
            .sort((a, b) => b.margin - a.margin);

        const summary = byProduct.reduce(
            (acc, item) => ({
                totalRevenue: acc.totalRevenue + item.revenue,
                totalCost: acc.totalCost + item.cost,
                totalMargin: acc.totalMargin + item.margin,
            }),
            { totalRevenue: 0, totalCost: 0, totalMargin: 0 }
        );
        summary.marginPercent = summary.totalRevenue > 0
            ? Number(((summary.totalMargin / summary.totalRevenue) * 100).toFixed(2))
            : 0;

        return res.status(200).json(new ApiResponse(200, { byProduct, summary }, "Profit margin report fetched successfully"));
    } catch (error) {
        console.error("Profit margin report error:", error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

// Top customers by revenue and order frequency for the selected period.
const getTopCustomersReport = asyncHandler(async (req, res, next) => {
    const { start_date, end_date, limit = 10 } = req.query;
    const userId = req.user.prismaId;
    const isAdmin = req.user.role === "admin";
    const dateFilter = buildDateFilter(start_date, end_date);

    try {
        const orders = await prisma.order.findMany({
            where: {
                ...(isAdmin ? {} : { createdById: userId, ...posScopeWhere(req) }),
                orderStatus: { not: "cancelled" },
                ...(Object.keys(dateFilter).length ? { orderDate: dateFilter } : {}),
            },
            include: {
                customer: { select: { id: true, legacyMongoId: true, name: true } },
            },
        });

        const byCustomerMap = new Map();

        for (const order of orders) {
            if (!order.customer) continue;
            const customerId = order.customerId;
            const current = byCustomerMap.get(customerId) || {
                _id: toExternalId(order.customer),
                customer_name: order.customer.name,
                totalRevenue: 0,
                orderCount: 0,
            };
            current.totalRevenue += Number(order.total);
            current.orderCount += 1;
            byCustomerMap.set(customerId, current);
        }

        const customers = [...byCustomerMap.values()]
            .map((item) => ({
                ...item,
                avgOrderValue: item.orderCount > 0 ? Number((item.totalRevenue / item.orderCount).toFixed(2)) : 0,
            }))
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .slice(0, Number.parseInt(limit, 10) || 10);

        return res.status(200).json(new ApiResponse(200, { customers }, "Top customers report fetched successfully"));
    } catch (error) {
        console.error("Top customers report error:", error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

// Sales broken down by the team member who created each order - meaningful
// for multi-user companies (Escala targets teams of 5-20).
const getSalesByTeamReport = asyncHandler(async (req, res, next) => {
    const { start_date, end_date } = req.query;
    const userId = req.user.prismaId;
    const isAdmin = req.user.role === "admin";
    const dateFilter = buildDateFilter(start_date, end_date);

    try {
        const orders = await prisma.order.findMany({
            where: {
                ...(isAdmin ? {} : { createdById: userId, ...posScopeWhere(req) }),
                orderStatus: { not: "cancelled" },
                ...(Object.keys(dateFilter).length ? { orderDate: dateFilter } : {}),
            },
            include: {
                createdBy: { select: { id: true, legacyMongoId: true, username: true } },
            },
        });

        const byMemberMap = new Map();

        for (const order of orders) {
            if (!order.createdBy) continue;
            const memberId = order.createdById;
            const current = byMemberMap.get(memberId) || {
                _id: toExternalId(order.createdBy),
                username: order.createdBy.username,
                totalRevenue: 0,
                orderCount: 0,
            };
            current.totalRevenue += Number(order.total);
            current.orderCount += 1;
            byMemberMap.set(memberId, current);
        }

        const members = [...byMemberMap.values()].sort((a, b) => b.totalRevenue - a.totalRevenue);

        return res.status(200).json(new ApiResponse(200, { members }, "Sales by team report fetched successfully"));
    } catch (error) {
        console.error("Sales by team report error:", error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

// Current period vs. the immediately preceding period of equal length.
const getPeriodComparisonReport = asyncHandler(async (req, res, next) => {
    const { start_date, end_date } = req.query;
    const userId = req.user.prismaId;
    const isAdmin = req.user.role === "admin";

    if (!start_date || !end_date) {
        return next(new ApiError(400, "start_date and end_date are required"));
    }

    try {
        const currentStart = new Date(start_date);
        const currentEnd = new Date(end_date);
        const periodMs = currentEnd.getTime() - currentStart.getTime();
        const previousEnd = new Date(currentStart.getTime() - 1);
        const previousStart = new Date(previousEnd.getTime() - periodMs);

        const fetchTotals = async (gte, lte) => {
            const result = await prisma.order.aggregate({
                where: {
                    ...(isAdmin ? {} : { createdById: userId, ...posScopeWhere(req) }),
                    orderStatus: { not: "cancelled" },
                    orderDate: { gte, lte },
                },
                _sum: { total: true },
                _count: { id: true },
            });
            return {
                totalSales: Number(result._sum.total || 0),
                totalOrders: result._count.id || 0,
            };
        };

        const [current, previous] = await Promise.all([
            fetchTotals(currentStart, currentEnd),
            fetchTotals(previousStart, previousEnd),
        ]);

        const percentChange = (curr, prev) => (prev > 0 ? Number((((curr - prev) / prev) * 100).toFixed(2)) : curr > 0 ? 100 : 0);

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    current: { ...current, startDate: currentStart, endDate: currentEnd },
                    previous: { ...previous, startDate: previousStart, endDate: previousEnd },
                    change: {
                        sales: percentChange(current.totalSales, previous.totalSales),
                        orders: percentChange(current.totalOrders, previous.totalOrders),
                    },
                },
                "Period comparison report fetched successfully"
            )
        );
    } catch (error) {
        console.error("Period comparison report error:", error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

// VAT (IVA) report - Colombia only, Escala+. Reads exclusively from the tax
// snapshot frozen on each OrderDetail at sale time (taxTreatmentApplied/
// taxRateApplied/taxAmount - see order.service.js#computeOrderTotals), never
// from the live Product/Company, so a report for a closed period never
// changes value just because a product's tax classification was edited
// later. This is a bookkeeping aid for the company's own IVA filing, not a
// DIAN submission and not tax advice (see "El IVA en Ohnix" section 5,
// category D - Ohnix calculates, it doesn't decide or file on the user's
// behalf).
const round2 = (value) => Number((Number(value) || 0).toFixed(2));

const getVatReport = asyncHandler(async (req, res, next) => {
    const { start_date, end_date } = req.query;
    const userId = req.user.prismaId;
    const isAdmin = req.user.role === "admin";
    const dateFilter = buildDateFilter(start_date, end_date);

    try {
        const orderDetails = await prisma.orderDetail.findMany({
            where: {
                order: {
                    ...(isAdmin ? {} : { createdById: userId, ...posScopeWhere(req) }),
                    orderStatus: { not: "cancelled" },
                    ...(Object.keys(dateFilter).length ? { orderDate: dateFilter } : {}),
                },
            },
            select: {
                total: true,
                taxTreatmentApplied: true,
                taxRateApplied: true,
                taxAmount: true,
                order: { select: { orderDate: true } },
            },
        });

        const byTreatmentMap = new Map();
        const byRateMap = new Map();
        const byPeriodMap = new Map();
        const summary = { taxedBase: 0, excludedBase: 0, exemptBase: 0, taxCollected: 0, lineCount: orderDetails.length };

        for (const detail of orderDetails) {
            const base = Number(detail.total);
            const taxAmount = Number(detail.taxAmount);
            const rate = Number(detail.taxRateApplied);
            const treatment = detail.taxTreatmentApplied;

            summary.taxCollected += taxAmount;
            if (treatment === "taxed") summary.taxedBase += base;
            else if (treatment === "excluded") summary.excludedBase += base;
            else if (treatment === "exempt") summary.exemptBase += base;

            const treatmentEntry = byTreatmentMap.get(treatment) || { treatment, base: 0, taxAmount: 0, lineCount: 0 };
            treatmentEntry.base += base;
            treatmentEntry.taxAmount += taxAmount;
            treatmentEntry.lineCount += 1;
            byTreatmentMap.set(treatment, treatmentEntry);

            if (treatment === "taxed") {
                const rateEntry = byRateMap.get(rate) || { rate, base: 0, taxAmount: 0, lineCount: 0 };
                rateEntry.base += base;
                rateEntry.taxAmount += taxAmount;
                rateEntry.lineCount += 1;
                byRateMap.set(rate, rateEntry);
            }

            const periodKey = detail.order.orderDate.toISOString().slice(0, 7); // YYYY-MM
            const periodEntry = byPeriodMap.get(periodKey) || { period: periodKey, base: 0, taxAmount: 0 };
            periodEntry.base += base;
            periodEntry.taxAmount += taxAmount;
            byPeriodMap.set(periodKey, periodEntry);
        }

        const report = {
            summary: {
                ...summary,
                taxedBase: round2(summary.taxedBase),
                excludedBase: round2(summary.excludedBase),
                exemptBase: round2(summary.exemptBase),
                taxCollected: round2(summary.taxCollected),
            },
            byTreatment: [...byTreatmentMap.values()].map((e) => ({ ...e, base: round2(e.base), taxAmount: round2(e.taxAmount) })),
            byRate: [...byRateMap.values()]
                .sort((a, b) => a.rate - b.rate)
                .map((e) => ({ ...e, base: round2(e.base), taxAmount: round2(e.taxAmount) })),
            byPeriod: [...byPeriodMap.values()]
                .sort((a, b) => a.period.localeCompare(b.period))
                .map((e) => ({ ...e, base: round2(e.base), taxAmount: round2(e.taxAmount) })),
        };

        return res.status(200).json(new ApiResponse(200, report, "VAT report fetched successfully"));
    } catch (error) {
        console.error("VAT report error:", error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

export {
    getDashboardMetrics,
    getStockReport,
    getSalesReport,
    getTopProducts,
    getPurchaseReport,
    getLowStockAlerts,
    getProfitMarginReport,
    getTopCustomersReport,
    getSalesByTeamReport,
    getPeriodComparisonReport,
    getVatReport,
    exportReportPdf,
    authorizeCsvExport,
    authorizeExcelExport,
};
