import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { prisma } from "../db/prisma.js";
import { streamReportPdf } from "../utils/reportPdf.js";
import { getLowStockDefaultThreshold } from "../utils/systemSettings.js";
import { normalizeProductImage } from "../utils/productImage.js";

const toExternalId = (entity) => entity.legacyMongoId || entity.id;

// Sales are grouped by the business's calendar day, not UTC - with
// toISOString() every sale after 7pm in Colombia landed on the next day.
// Same TIMEZONE convention the schedulers use; en-CA formats as YYYY-MM-DD.
const REPORT_TIMEZONE = process.env.TIMEZONE || "America/Bogota";
const reportDayFormat = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});
const reportDayKey = (date) => reportDayFormat.format(date);

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

        const [inventoryValueAgg, inTransitRows] = await Promise.all([
            prisma.productLocationStock.aggregate({
                where: { product: productWhere },
                _sum: { inventoryValue: true },
            }),
            prisma.stockTransfer.findMany({
                where: { status: "in_transit", ...(isAdmin ? {} : { accountId: userId }) },
                select: { quantitySent: true, unitCostApplied: true },
            }),
        ]);
        const inTransitValue = inTransitRows.reduce(
            (sum, transfer) => sum + transfer.quantitySent * Number(transfer.unitCostApplied || 0),
            0
        );
        const inTransitUnits = inTransitRows.reduce((sum, transfer) => sum + transfer.quantitySent, 0);
        const inventoryValue = Number(inventoryValueAgg._sum.inventoryValue || 0) + inTransitValue;

        const metrics = {
            totalSales: Number(totalSalesAgg._sum.total || 0),
            totalPurchase: Number(totalPurchaseAgg._sum.total || 0),
            inventoryValue,
            totalProducts: inventoryAgg._count.id || 0,
            totalStock: (inventoryAgg._sum.stock || 0) + inTransitUnits,
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
                locationStock: { select: { inventoryValue: true } },
                transfers: {
                    where: { status: "in_transit" },
                    select: { quantitySent: true, unitCostApplied: true },
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
                stock: p.stock + p.transfers.reduce((sum, transfer) => sum + transfer.quantitySent, 0),
                inventory_value: p.locationStock.reduce(
                    (sum, location) => sum + Number(location.inventoryValue),
                    0
                ) + p.transfers.reduce(
                    (sum, transfer) => sum + transfer.quantitySent * Number(transfer.unitCostApplied || 0),
                    0
                ),
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
                orderStatus: { in: ["completed", "returned"] },
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
            const dateKey = reportDayKey(order.orderDate);
            const currentDate = byDateMap.get(dateKey) || { _id: dateKey, total: 0, orders: 0 };
            currentDate.total += order.orderDetails.reduce((sum, detail) => {
                const net = netFiscalDetail(detail);
                return sum + net.base + net.taxAmount;
            }, 0);
            currentDate.orders += 1;
            byDateMap.set(dateKey, currentDate);

            for (const detail of order.orderDetails) {
                const netQuantity = Math.max(detail.quantity - Number(detail.returnedQuantity || 0), 0);
                if (netQuantity === 0) continue;
                const productId = detail.productId;
                const currentProduct = byProductMap.get(productId) || {
                    _id: toExternalId(detail.product),
                    product_name: detail.product?.productName || "Unknown",
                    quantity: 0,
                    total: 0,
                };
                currentProduct.quantity += netQuantity;
                currentProduct.total += Number(detail.unitcost) * netQuantity;
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
            timezone: REPORT_TIMEZONE,
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
                orderStatus: { in: ["completed", "returned"] },
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
                const netQuantity = Math.max(detail.quantity - Number(detail.returnedQuantity || 0), 0);
                if (netQuantity === 0) continue;
                const productId = detail.productId;
                const current = byProductMap.get(productId) || {
                    _id: toExternalId(detail.product),
                    product_name: detail.product?.productName || "Unknown",
                    product_code: detail.product?.productCode || "N/A",
                    product_image: normalizeProductImage(detail.product?.productImage),
                    quantity_sold: 0,
                    total_sales: 0,
                };

                current.quantity_sold += netQuantity;
                current.total_sales += Number(detail.unitcost) * netQuantity;
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

// end_date always arrives as a plain "YYYY-MM-DD" string (every date picker
// on the frontend sends dayjs().format("YYYY-MM-DD")), which `new Date(...)`
// parses as UTC midnight - a raw `lte` against that silently excludes every
// row from later that same day. Pushing to the last instant of that date
// makes "hasta hoy" actually include today, not just up to midnight this
// morning (see accounting.controller.js's matching endOfDay - same bug,
// same fix, found while auditing the Contabilidad module).
const buildDateFilter = (start_date, end_date) => {
    const filter = {};
    if (start_date && end_date) {
        filter.gte = new Date(start_date);
        const endOfDay = new Date(end_date);
        endOfDay.setUTCHours(23, 59, 59, 999);
        filter.lte = endOfDay;
    }
    return filter;
};

// Profit margin per product: net revenue after returns minus the cost basis
// frozen when the sale consumed inventory.
const getProfitMarginReport = asyncHandler(async (req, res, next) => {
    const { start_date, end_date } = req.query;
    const userId = req.user.prismaId;
    const isAdmin = req.user.role === "admin";
    const dateFilter = buildDateFilter(start_date, end_date);

    try {
        const orders = await prisma.order.findMany({
            where: {
                ...(isAdmin ? {} : { createdById: userId, ...posScopeWhere(req) }),
                orderStatus: { in: ["completed", "returned"] },
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
                const netQuantity = Math.max(detail.quantity - Number(detail.returnedQuantity || 0), 0);
                if (netQuantity === 0) continue;
                const productId = detail.productId;
                const current = byProductMap.get(productId) || {
                    _id: toExternalId(detail.product),
                    product_name: detail.product.productName,
                    quantity: 0,
                    revenue: 0,
                    cost: 0,
                };
                const revenue = Number(detail.unitcost) * netQuantity;
                const cost = Number(detail.costBasisApplied ?? detail.product.buyingPrice) * netQuantity;
                current.quantity += netQuantity;
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

// Returns the still-effective base/tax portion of a commercial line after
// granular returns. OrderDetail/PurchaseDetail keep the original fiscal
// snapshot plus a cumulative returnedQuantity; reports must combine both
// instead of continuing to report the original document as if no return had
// happened. Multiplying the frozen amounts by the remaining-quantity ratio
// also preserves the exact historical tax rate/treatment.
export const netFiscalDetail = (detail) => {
    const quantity = Number(detail?.quantity || 0);
    const returnedQuantity = Math.min(Math.max(Number(detail?.returnedQuantity || 0), 0), quantity);
    const remainingQuantity = Math.max(quantity - returnedQuantity, 0);
    const ratio = quantity > 0 ? remainingQuantity / quantity : 0;

    return {
        remainingQuantity,
        base: round2(Number(detail?.total || 0) * ratio),
        taxAmount: round2(Number(detail?.taxAmount || 0) * ratio),
    };
};

// A financial-only credit note has no OrderDetail quantities to inspect. Its
// journal entry is the canonical local effect, so reports read the exact
// reductions posted to revenue, output VAT and receivables instead of trying
// to reverse-engineer provider-specific rawRequest payloads.
export const summarizeFinancialCreditNoteEntry = (entry) => {
    const amountForCode = (code, side) =>
        (entry?.lines || [])
            .filter((line) => line.chartAccount?.code === code)
            .reduce((sum, line) => sum + Number(line[side] || 0), 0);

    const base = round2(amountForCode("4135", "debit"));
    const taxAmount = round2(amountForCode("240805", "debit"));
    const receivableReduction = round2(amountForCode("1305", "credit"));

    return {
        sourceId: entry?.sourceId || null,
        entryDate: entry?.entryDate || null,
        base,
        taxAmount,
        receivableReduction,
        rate: base > 0 ? round2((taxAmount / base) * 100) : 0,
    };
};

const loadFinancialCreditNoteAdjustments = async ({ userId, isAdmin, req, entryDateFilter, orderIds }) => {
    const notes = await prisma.electronicCreditNote.findMany({
        where: {
            ...(orderIds?.length ? { invoice: { orderId: { in: orderIds } } } : {
                invoice: {
                    order: {
                        ...(isAdmin ? {} : { createdById: userId, ...posScopeWhere(req) }),
                    },
                },
            }),
        },
        select: { id: true, invoice: { select: { orderId: true } } },
    });
    if (notes.length === 0) return [];

    const orderIdByNoteId = new Map(notes.map((note) => [note.id, note.invoice.orderId]));
    const entries = await prisma.journalEntry.findMany({
        where: {
            sourceType: "credit_note_financial",
            sourceId: { in: notes.map((note) => note.id) },
            ...(isAdmin ? {} : { period: { createdById: userId } }),
            ...(entryDateFilter && Object.keys(entryDateFilter).length ? { entryDate: entryDateFilter } : {}),
        },
        select: {
            sourceId: true,
            entryDate: true,
            lines: {
                select: {
                    debit: true,
                    credit: true,
                    chartAccount: { select: { code: true } },
                },
            },
        },
    });

    return entries.map((entry) => ({
        ...summarizeFinancialCreditNoteEntry(entry),
        orderId: orderIdByNoteId.get(entry.sourceId),
    }));
};

export const summarizeVatReversalEntry = (entry) => {
    const amountForCode = (code, side) =>
        (entry?.lines || [])
            .filter((line) => line.chartAccount?.code === code)
            .reduce((sum, line) => sum + Number(line[side] || 0), 0);
    const purchaseSide = entry?.sourceType === "purchase_return";
    return {
        sourceType: entry?.sourceType,
        sourceId: entry?.sourceId,
        entryDate: entry?.entryDate,
        kind: purchaseSide ? "purchase" : "sale",
        base: round2(purchaseSide ? amountForCode("1435", "credit") : amountForCode("4135", "debit")),
        taxAmount: round2(purchaseSide ? amountForCode("240810", "credit") : amountForCode("240805", "debit")),
    };
};

const loadVatReversalAdjustments = async ({ userId, isAdmin, req, entryDateFilter }) => {
    const entries = await prisma.journalEntry.findMany({
        where: {
            sourceType: { in: ["order_cancellation", "order_return", "purchase_return", "credit_note_restock"] },
            ...(isAdmin ? {} : { period: { createdById: userId } }),
            ...(Object.keys(entryDateFilter).length ? { entryDate: entryDateFilter } : {}),
        },
        select: {
            sourceType: true,
            sourceId: true,
            entryDate: true,
            lines: { select: { debit: true, credit: true, chartAccount: { select: { code: true } } } },
        },
    });
    if (entries.length === 0 || isAdmin || req.user.posScopeAll) {
        return entries.map(summarizeVatReversalEntry);
    }

    // JournalEntry has no POS dimension yet. For a restricted team member,
    // resolve each source back to its operational document before exposing
    // the reversal in the report.
    const orderSourceIds = entries
        .filter((entry) => ["order_cancellation", "order_return"].includes(entry.sourceType))
        .map((entry) => entry.sourceId)
        .filter(Boolean);
    const purchaseSourceIds = entries
        .filter((entry) => entry.sourceType === "purchase_return")
        .map((entry) => entry.sourceId)
        .filter(Boolean);
    const creditNoteIds = entries
        .filter((entry) => entry.sourceType === "credit_note_restock")
        .map((entry) => entry.sourceId)
        .filter(Boolean);
    const allowedPosIds = req.user.posScopeIds || [];

    const [orders, purchases, creditNotes] = await Promise.all([
        prisma.order.findMany({ where: { id: { in: orderSourceIds }, pointOfSaleId: { in: allowedPosIds } }, select: { id: true } }),
        prisma.purchase.findMany({ where: { id: { in: purchaseSourceIds }, pointOfSaleId: { in: allowedPosIds } }, select: { id: true } }),
        prisma.electronicCreditNote.findMany({
            where: { id: { in: creditNoteIds }, invoice: { order: { pointOfSaleId: { in: allowedPosIds } } } },
            select: { id: true },
        }),
    ]);
    const allowed = new Set([...orders.map((row) => row.id), ...purchases.map((row) => row.id), ...creditNotes.map((row) => row.id)]);
    return entries.filter((entry) => allowed.has(entry.sourceId)).map(summarizeVatReversalEntry);
};

// manualExpense/manualIncome/recurringExpense.service.js can now post a
// taxed line (see accountingPosting.service.js#decomposeInclusiveTax) - the
// base is whatever landed on the expense/revenue account in that same
// entry, the rate is derived from base vs. the VAT-account line, same as
// summarizeFinancialCreditNoteEntry above. Untaxed (excluded/exempt) manual
// entries are NOT returned here: unlike OrderDetail/PurchaseDetail, there's
// no persisted "detail" row for these, so once posted without a VAT line
// there's nothing left in the ledger to tell excluded and exempt apart -
// only the taxed subset survives distinguishably, which is also the only
// part a bimestral filing's by-rate breakdown actually needs.
const loadOperationalVatEntries = async ({ userId, isAdmin, entryDateFilter }) => {
    const entries = await prisma.journalEntry.findMany({
        where: {
            sourceType: { in: ["manual_expense", "recurring_expense", "manual_income"] },
            ...(isAdmin ? {} : { period: { createdById: userId } }),
            ...(Object.keys(entryDateFilter).length ? { entryDate: entryDateFilter } : {}),
            lines: { some: { chartAccount: { code: { in: ["240805", "240810"] } } } },
        },
        select: {
            id: true,
            sourceType: true,
            entryDate: true,
            lines: { select: { debit: true, credit: true, chartAccount: { select: { code: true, accountType: true } } } },
        },
    });

    return entries.map((entry) => {
        const isIncome = entry.sourceType === "manual_income";
        const vatLine = entry.lines.find((line) => line.chartAccount?.code === (isIncome ? "240805" : "240810"));
        const baseLine = entry.lines.find((line) => line.chartAccount?.accountType === (isIncome ? "revenue" : "expense"));
        const taxAmount = round2(Number(isIncome ? vatLine?.credit : vatLine?.debit) || 0);
        const base = round2(Number(isIncome ? baseLine?.credit : baseLine?.debit) || 0);
        return {
            kind: isIncome ? "sale" : "purchase",
            entryDate: entry.entryDate,
            base,
            taxAmount,
            rate: base > 0 ? round2((taxAmount / base) * 100) : 0,
        };
    });
};

// manualJournalVoucher.service.js can target ANY active chart account,
// including the VAT liability accounts (240805/240810) - unlike
// order_sale/purchase and their returns/credit-notes above, a manual line
// carries no taxRateApplied/base, only a raw debit/credit against whichever
// account was picked. Without this, a manual correction to those accounts
// moved the balance sheet's IVA neto (Accounting overview) but stayed
// invisible in this by-rate/by-period report, which is exactly the kind of
// silent mismatch a bimestral filing can't afford.
const loadManualVatAdjustments = async ({ userId, isAdmin, entryDateFilter }) => {
    const entries = await prisma.journalEntry.findMany({
        where: {
            sourceType: { in: ["manual_journal", "manual_journal_reversal"] },
            ...(isAdmin ? {} : { period: { createdById: userId } }),
            ...(Object.keys(entryDateFilter).length ? { entryDate: entryDateFilter } : {}),
            lines: { some: { chartAccount: { code: { in: ["240805", "240810"] } } } },
        },
        select: {
            id: true,
            entryDate: true,
            description: true,
            sourceType: true,
            lines: { select: { debit: true, credit: true, chartAccount: { select: { code: true } } } },
        },
    });

    return entries.map((entry) => {
        const amountForCode = (code, side) =>
            (entry.lines || [])
                .filter((line) => line.chartAccount?.code === code)
                .reduce((sum, line) => sum + Number(line[side] || 0), 0);
        // 240805 (IVA generado) is credit-normal, same polarity a sale posts
        // it with - a credit raises it, a debit lowers it. 240810 (IVA
        // descontable) is the opposite, same polarity a purchase posts it
        // with - a debit raises it, a credit lowers it.
        return {
            id: entry.id,
            entryDate: entry.entryDate,
            description: entry.description,
            sourceType: entry.sourceType,
            generatedDelta: round2(amountForCode("240805", "credit") - amountForCode("240805", "debit")),
            deductibleDelta: round2(amountForCode("240810", "debit") - amountForCode("240810", "credit")),
        };
    });
};

const getVatReport = asyncHandler(async (req, res, next) => {
    const { start_date, end_date } = req.query;
    const userId = req.user.prismaId;
    const isAdmin = req.user.role === "admin";
    const dateFilter = buildDateFilter(start_date, end_date);

    try {
        // Source IDs come from the ledger, not the document's current status:
        // a completed sale later marked cancelled still owns its original
        // order_sale entry plus a separately dated reversal.
        const [recognizedSales, recognizedPurchases] = await Promise.all([
            prisma.journalEntry.findMany({
                where: {
                    sourceType: "order_sale",
                    ...(isAdmin ? {} : { period: { createdById: userId } }),
                    ...(Object.keys(dateFilter).length ? { entryDate: dateFilter } : {}),
                },
                select: { sourceId: true },
            }),
            prisma.journalEntry.findMany({
                where: {
                    sourceType: "purchase",
                    ...(isAdmin ? {} : { period: { createdById: userId } }),
                    ...(Object.keys(dateFilter).length ? { entryDate: dateFilter } : {}),
                },
                select: { sourceId: true },
            }),
        ]);
        const recognizedOrderIds = recognizedSales.map((entry) => entry.sourceId).filter(Boolean);
        const recognizedPurchaseIds = recognizedPurchases.map((entry) => entry.sourceId).filter(Boolean);

        // IVA descontable (purchases, ET art. 485-490) alongside IVA generado
        // (sales) below - same frozen-at-creation columns, populated by
        // purchase.service.js#computePurchaseItemTax. Only completed/returned
        // documents are recognized by the accounting engine. Pending/
        // processing documents have fiscal snapshots already, but no journal
        // entry yet. Reversals are recognized separately by their own journal
        // date below, so a later return never rewrites a closed sales period.
        const [orderDetails, purchaseDetails, financialCreditNotes, vatReversals, manualVatAdjustments, operationalVatEntries] = await Promise.all([
            prisma.orderDetail.findMany({
                where: {
                    order: {
                        ...(isAdmin ? {} : { createdById: userId, ...posScopeWhere(req) }),
                        id: { in: recognizedOrderIds },
                    },
                },
                select: {
                    total: true,
                    quantity: true,
                    returnedQuantity: true,
                    taxTreatmentApplied: true,
                    taxRateApplied: true,
                    taxAmount: true,
                    order: { select: { orderDate: true } },
                },
            }),
            prisma.purchaseDetail.findMany({
                where: {
                    purchase: {
                        ...(isAdmin ? {} : { createdById: userId, ...posScopeWhere(req) }),
                        id: { in: recognizedPurchaseIds },
                    },
                },
                select: {
                    total: true,
                    quantity: true,
                    returnedQuantity: true,
                    taxTreatmentApplied: true,
                    taxRateApplied: true,
                    taxAmount: true,
                    purchase: { select: { purchaseDate: true } },
                },
            }),
            loadFinancialCreditNoteAdjustments({ userId, isAdmin, req, entryDateFilter: dateFilter }),
            loadVatReversalAdjustments({ userId, isAdmin, req, entryDateFilter: dateFilter }),
            loadManualVatAdjustments({ userId, isAdmin, entryDateFilter: dateFilter }),
            loadOperationalVatEntries({ userId, isAdmin, entryDateFilter: dateFilter }),
        ]);

        const byTreatmentMap = new Map();
        const byRateMap = new Map();
        const byPeriodMap = new Map();
        const byTreatmentPurchasesMap = new Map();
        const byRatePurchasesMap = new Map();
        const byPeriodPurchasesMap = new Map();
        const summary = {
            taxedBase: 0,
            excludedBase: 0,
            exemptBase: 0,
            // Purchase-side equivalents of the three above - always computed
            // (byTreatmentPurchasesMap already had this per-treatment, just
            // never rolled up), so a declaración needs both sides of the same
            // excluida/exenta/gravada split, not only the sales half.
            taxedBasePurchases: 0,
            excludedBasePurchases: 0,
            exemptBasePurchases: 0,
            taxCollected: 0,
            taxCredited: 0,
            lineCount: orderDetails.length,
            purchaseLineCount: purchaseDetails.length,
            financialCreditNoteCount: financialCreditNotes.length,
            financialCreditNoteBase: 0,
            salesReversalBase: 0,
            purchaseReversalBase: 0,
            manualAdjustmentCount: manualVatAdjustments.length,
            manualAdjustmentGenerated: 0,
            manualAdjustmentDeductible: 0,
        };

        for (const detail of orderDetails) {
            // The original fiscal event belongs to orderDate. Do not use the
            // cumulative returnedQuantity here: a return next month must be
            // recognized next month from its own reversal journal entry, not
            // rewrite the already-reported month of the sale.
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

        for (const detail of purchaseDetails) {
            const base = Number(detail.total);
            const taxAmount = Number(detail.taxAmount);
            const rate = Number(detail.taxRateApplied);
            const treatment = detail.taxTreatmentApplied;

            summary.taxCredited += taxAmount;
            if (treatment === "taxed") summary.taxedBasePurchases += base;
            else if (treatment === "excluded") summary.excludedBasePurchases += base;
            else if (treatment === "exempt") summary.exemptBasePurchases += base;

            const treatmentEntry = byTreatmentPurchasesMap.get(treatment) || { treatment, base: 0, taxAmount: 0, lineCount: 0 };
            treatmentEntry.base += base;
            treatmentEntry.taxAmount += taxAmount;
            treatmentEntry.lineCount += 1;
            byTreatmentPurchasesMap.set(treatment, treatmentEntry);

            if (treatment === "taxed") {
                const rateEntry = byRatePurchasesMap.get(rate) || { rate, base: 0, taxAmount: 0, lineCount: 0 };
                rateEntry.base += base;
                rateEntry.taxAmount += taxAmount;
                rateEntry.lineCount += 1;
                byRatePurchasesMap.set(rate, rateEntry);
            }

            const periodKey = detail.purchase.purchaseDate.toISOString().slice(0, 7); // YYYY-MM
            const periodEntry = byPeriodPurchasesMap.get(periodKey) || { period: periodKey, base: 0, taxAmount: 0 };
            periodEntry.base += base;
            periodEntry.taxAmount += taxAmount;
            byPeriodPurchasesMap.set(periodKey, periodEntry);
        }

        // Manual expenses/income and recurring-expense generations that were
        // posted with a taxed treatment - always "taxed" by construction (see
        // loadOperationalVatEntries), so no treatment branch is needed the
        // way orderDetails/purchaseDetails above have one.
        for (const item of operationalVatEntries) {
            const periodKey = item.entryDate ? new Date(item.entryDate).toISOString().slice(0, 7) : null;
            if (item.kind === "sale") {
                summary.taxCollected += item.taxAmount;
                summary.taxedBase += item.base;

                const treatmentEntry = byTreatmentMap.get("taxed") || { treatment: "taxed", base: 0, taxAmount: 0, lineCount: 0 };
                treatmentEntry.base += item.base;
                treatmentEntry.taxAmount += item.taxAmount;
                treatmentEntry.lineCount += 1;
                byTreatmentMap.set("taxed", treatmentEntry);

                const rateEntry = byRateMap.get(item.rate) || { rate: item.rate, base: 0, taxAmount: 0, lineCount: 0 };
                rateEntry.base += item.base;
                rateEntry.taxAmount += item.taxAmount;
                rateEntry.lineCount += 1;
                byRateMap.set(item.rate, rateEntry);

                if (periodKey) {
                    const periodEntry = byPeriodMap.get(periodKey) || { period: periodKey, base: 0, taxAmount: 0 };
                    periodEntry.base += item.base;
                    periodEntry.taxAmount += item.taxAmount;
                    byPeriodMap.set(periodKey, periodEntry);
                }
            } else {
                summary.taxCredited += item.taxAmount;
                summary.taxedBasePurchases += item.base;

                const treatmentEntry = byTreatmentPurchasesMap.get("taxed") || { treatment: "taxed", base: 0, taxAmount: 0, lineCount: 0 };
                treatmentEntry.base += item.base;
                treatmentEntry.taxAmount += item.taxAmount;
                treatmentEntry.lineCount += 1;
                byTreatmentPurchasesMap.set("taxed", treatmentEntry);

                const rateEntry = byRatePurchasesMap.get(item.rate) || { rate: item.rate, base: 0, taxAmount: 0, lineCount: 0 };
                rateEntry.base += item.base;
                rateEntry.taxAmount += item.taxAmount;
                rateEntry.lineCount += 1;
                byRatePurchasesMap.set(item.rate, rateEntry);

                if (periodKey) {
                    const periodEntry = byPeriodPurchasesMap.get(periodKey) || { period: periodKey, base: 0, taxAmount: 0 };
                    periodEntry.base += item.base;
                    periodEntry.taxAmount += item.taxAmount;
                    byPeriodPurchasesMap.set(periodKey, periodEntry);
                }
            }
        }

        for (const adjustment of financialCreditNotes) {
            summary.taxCollected -= adjustment.taxAmount;
            summary.financialCreditNoteBase += adjustment.base;

            // A positive tax amount identifies a taxed-base adjustment. For
            // a zero-tax credit note the original line may have been exempt
            // or excluded, which the journal deliberately does not encode;
            // keep that base explicit in financialCreditNoteBase rather than
            // silently assigning it to the wrong fiscal treatment.
            if (adjustment.taxAmount > 0) {
                summary.taxedBase -= adjustment.base;
                const treatmentEntry = byTreatmentMap.get("taxed") || { treatment: "taxed", base: 0, taxAmount: 0, lineCount: 0 };
                treatmentEntry.base -= adjustment.base;
                treatmentEntry.taxAmount -= adjustment.taxAmount;
                byTreatmentMap.set("taxed", treatmentEntry);

                const rateEntry = byRateMap.get(adjustment.rate) || { rate: adjustment.rate, base: 0, taxAmount: 0, lineCount: 0 };
                rateEntry.base -= adjustment.base;
                rateEntry.taxAmount -= adjustment.taxAmount;
                byRateMap.set(adjustment.rate, rateEntry);
            }

            if (adjustment.entryDate) {
                const periodKey = new Date(adjustment.entryDate).toISOString().slice(0, 7);
                const periodEntry = byPeriodMap.get(periodKey) || { period: periodKey, base: 0, taxAmount: 0 };
                periodEntry.base -= adjustment.base;
                periodEntry.taxAmount -= adjustment.taxAmount;
                byPeriodMap.set(periodKey, periodEntry);
            }
        }

        for (const reversal of vatReversals) {
            const periodKey = reversal.entryDate ? new Date(reversal.entryDate).toISOString().slice(0, 7) : null;
            if (reversal.kind === "sale") {
                summary.taxCollected -= reversal.taxAmount;
                summary.salesReversalBase += reversal.base;
                if (periodKey) {
                    const periodEntry = byPeriodMap.get(periodKey) || { period: periodKey, base: 0, taxAmount: 0 };
                    periodEntry.base -= reversal.base;
                    periodEntry.taxAmount -= reversal.taxAmount;
                    byPeriodMap.set(periodKey, periodEntry);
                }
            } else {
                summary.taxCredited -= reversal.taxAmount;
                summary.purchaseReversalBase += reversal.base;
                if (periodKey) {
                    const periodEntry = byPeriodPurchasesMap.get(periodKey) || { period: periodKey, base: 0, taxAmount: 0 };
                    periodEntry.base -= reversal.base;
                    periodEntry.taxAmount -= reversal.taxAmount;
                    byPeriodPurchasesMap.set(periodKey, periodEntry);
                }
            }
        }

        // Folded into taxCollected/taxCredited (so netVat reconciles with the
        // balance sheet even when a manual voucher touched these accounts),
        // but also kept as their own summary/byPeriod figures and a raw list
        // below - unlike every other adjustment above, these carry no rate,
        // so they can't be attributed to byRate/byTreatment.
        for (const adjustment of manualVatAdjustments) {
            summary.taxCollected += adjustment.generatedDelta;
            summary.manualAdjustmentGenerated += adjustment.generatedDelta;
            summary.taxCredited += adjustment.deductibleDelta;
            summary.manualAdjustmentDeductible += adjustment.deductibleDelta;

            const periodKey = adjustment.entryDate ? new Date(adjustment.entryDate).toISOString().slice(0, 7) : null;
            if (periodKey && adjustment.generatedDelta !== 0) {
                const periodEntry = byPeriodMap.get(periodKey) || { period: periodKey, base: 0, taxAmount: 0 };
                periodEntry.taxAmount += adjustment.generatedDelta;
                byPeriodMap.set(periodKey, periodEntry);
            }
            if (periodKey && adjustment.deductibleDelta !== 0) {
                const periodEntry = byPeriodPurchasesMap.get(periodKey) || { period: periodKey, base: 0, taxAmount: 0 };
                periodEntry.taxAmount += adjustment.deductibleDelta;
                byPeriodPurchasesMap.set(periodKey, periodEntry);
            }
        }

        const report = {
            summary: {
                ...summary,
                taxedBase: round2(summary.taxedBase),
                excludedBase: round2(summary.excludedBase),
                exemptBase: round2(summary.exemptBase),
                taxedBasePurchases: round2(summary.taxedBasePurchases),
                excludedBasePurchases: round2(summary.excludedBasePurchases),
                exemptBasePurchases: round2(summary.exemptBasePurchases),
                taxCollected: round2(summary.taxCollected),
                taxCredited: round2(summary.taxCredited),
                financialCreditNoteBase: round2(summary.financialCreditNoteBase),
                salesReversalBase: round2(summary.salesReversalBase),
                purchaseReversalBase: round2(summary.purchaseReversalBase),
                manualAdjustmentGenerated: round2(summary.manualAdjustmentGenerated),
                manualAdjustmentDeductible: round2(summary.manualAdjustmentDeductible),
                // Positive = owed to the DIAN this period; negative = credit
                // balance carried forward (ET art. 815 - saldo a favor).
                netVat: round2(summary.taxCollected - summary.taxCredited),
            },
            manualAdjustments: manualVatAdjustments.map((a) => ({
                id: a.id,
                entryDate: a.entryDate,
                description: a.description,
                generatedDelta: round2(a.generatedDelta),
                deductibleDelta: round2(a.deductibleDelta),
            })),
            byTreatment: [...byTreatmentMap.values()].map((e) => ({ ...e, base: round2(e.base), taxAmount: round2(e.taxAmount) })),
            byRate: [...byRateMap.values()]
                .sort((a, b) => a.rate - b.rate)
                .map((e) => ({ ...e, base: round2(e.base), taxAmount: round2(e.taxAmount) })),
            byPeriod: [...byPeriodMap.values()]
                .sort((a, b) => a.period.localeCompare(b.period))
                .map((e) => ({ ...e, base: round2(e.base), taxAmount: round2(e.taxAmount) })),
            byTreatmentPurchases: [...byTreatmentPurchasesMap.values()].map((e) => ({ ...e, base: round2(e.base), taxAmount: round2(e.taxAmount) })),
            byRatePurchases: [...byRatePurchasesMap.values()]
                .sort((a, b) => a.rate - b.rate)
                .map((e) => ({ ...e, base: round2(e.base), taxAmount: round2(e.taxAmount) })),
            byPeriodPurchases: [...byPeriodPurchasesMap.values()]
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

// Cartera (accounts receivable/payable): per-document pending balance
// (remaining non-returned detail base+tax minus payments already
// registered - see orderPayment.service.js/purchasePayment.service.js for
// the same derivation used at write time) plus a per-customer/per-supplier
// rollup and aging. Purchases use their negotiated due date; legacy rows
// without one remain "unscheduled" instead of being falsely marked overdue.
const getCarteraReport = asyncHandler(async (req, res, next) => {
    const { start_date, end_date } = req.query;
    const userId = req.user.prismaId;
    const isAdmin = req.user.role === "admin";
    const dateFilter = buildDateFilter(start_date, end_date);
    const now = new Date();

    try {
        const [orders, purchases] = await Promise.all([
            prisma.order.findMany({
                where: {
                    ...(isAdmin ? {} : { createdById: userId, ...posScopeWhere(req) }),
                    orderStatus: { in: ["completed", "returned"] },
                    ...(Object.keys(dateFilter).length ? { orderDate: dateFilter } : {}),
                },
                select: {
                    id: true,
                    legacyMongoId: true,
                    invoiceNo: true,
                    orderDate: true,
                    dueDate: true,
                    orderDetails: { select: { quantity: true, returnedQuantity: true, total: true, taxAmount: true } },
                    customer: { select: { id: true, legacyMongoId: true, name: true } },
                },
            }),
            prisma.purchase.findMany({
                where: {
                    ...(isAdmin ? {} : { createdById: userId, ...posScopeWhere(req) }),
                    purchaseStatus: { in: ["completed", "returned"] },
                    ...(Object.keys(dateFilter).length ? { purchaseDate: dateFilter } : {}),
                },
                select: {
                    id: true,
                    legacyMongoId: true,
                    purchaseNo: true,
                    purchaseDate: true,
                    dueDate: true,
                    supplier: { select: { id: true, legacyMongoId: true, name: true } },
                    purchaseDetails: { select: { quantity: true, returnedQuantity: true, total: true, taxAmount: true } },
                    retentions: { select: { withheldAmount: true, returnedWithheldAmount: true } },
                },
            }),
        ]);

        const orderIds = orders.map((o) => o.id);
        const purchaseIds = purchases.map((p) => p.id);

        const [orderPaidRows, purchasePaidRows, financialCreditNotes] = await Promise.all([
            orderIds.length
                ? prisma.orderPayment.groupBy({ by: ["orderId"], where: { orderId: { in: orderIds } }, _sum: { amount: true, exchangeRateDifference: true } })
                : [],
            purchaseIds.length
                ? prisma.purchasePayment.groupBy({ by: ["purchaseId"], where: { purchaseId: { in: purchaseIds } }, _sum: { amount: true } })
                : [],
            orderIds.length
                ? loadFinancialCreditNoteAdjustments({ userId, isAdmin, req, orderIds })
                : [],
        ]);

        // Same receivable definition as receivableBalance.service.js: only
        // amount - diferencia en cambio cleared 1305, and a castigo takes the
        // invoice out of cartera.
        const orderPaidMap = new Map(orderPaidRows.map((r) => [r.orderId, Number(r._sum.amount || 0) - Number(r._sum.exchangeRateDifference || 0)]));
        const orderWriteOffRows = orderIds.length
            ? await prisma.receivableWriteOff.groupBy({ by: ["orderId"], where: { orderId: { in: orderIds }, reversedAt: null }, _sum: { amount: true } })
            : [];
        const orderWrittenOffMap = new Map(orderWriteOffRows.map((r) => [r.orderId, Number(r._sum.amount || 0)]));
        const purchasePaidMap = new Map(purchasePaidRows.map((r) => [r.purchaseId, Number(r._sum.amount || 0)]));
        const financialCreditByOrder = new Map();
        for (const adjustment of financialCreditNotes) {
            financialCreditByOrder.set(
                adjustment.orderId,
                round2((financialCreditByOrder.get(adjustment.orderId) || 0) + adjustment.receivableReduction)
            );
        }
        const receivablesDocuments = orders
            .map((order) => {
                const paid = orderPaidMap.get(order.id) || 0;
                const detailTotal = order.orderDetails.reduce((acc, detail) => {
                    const net = netFiscalDetail(detail);
                    return acc + net.base + net.taxAmount;
                }, 0);
                const creditNotes = financialCreditByOrder.get(order.id) || 0;
                const total = Math.max(round2(detailTotal - creditNotes), 0);
                const dueDate = order.dueDate ? new Date(order.dueDate) : null;
                const rawDays = dueDate ? Math.floor((now - dueDate) / 86400000) : null;
                return {
                    _id: toExternalId(order),
                    invoice_no: order.invoiceNo,
                    document_date: order.orderDate,
                    due_date: order.dueDate,
                    customer: order.customer ? { _id: toExternalId(order.customer), name: order.customer.name } : null,
                    total: round2(total),
                    paid: round2(paid),
                    written_off: round2(orderWrittenOffMap.get(order.id) || 0),
                    pending: round2(total - paid - (orderWrittenOffMap.get(order.id) || 0)),
                    days_overdue: rawDays === null ? null : Math.max(0, rawDays),
                };
            })
            .filter((row) => row.pending > 0.001);

        const payablesDocuments = purchases
            .map((purchase) => {
                const grossAfterReturns = purchase.purchaseDetails.reduce((acc, detail) => {
                    const net = netFiscalDetail(detail);
                    return acc + net.base + net.taxAmount;
                }, 0);
                const withholding = purchase.retentions.reduce((sum, retention) => sum + Number(retention.withheldAmount) - Number(retention.returnedWithheldAmount), 0);
                const total = Math.max(round2(grossAfterReturns - withholding), 0);
                const paid = purchasePaidMap.get(purchase.id) || 0;
                const dueDate = purchase.dueDate ? new Date(purchase.dueDate) : null;
                const rawDays = dueDate ? Math.floor((now - dueDate) / 86400000) : null;
                return {
                    _id: toExternalId(purchase),
                    purchase_no: purchase.purchaseNo,
                    document_date: purchase.purchaseDate,
                    due_date: purchase.dueDate,
                    supplier: purchase.supplier ? { _id: toExternalId(purchase.supplier), name: purchase.supplier.name } : null,
                    total: round2(total),
                    paid: round2(paid),
                    pending: round2(total - paid),
                    days_overdue: rawDays === null ? null : Math.max(0, rawDays),
                    days_until_due: rawDays === null ? null : Math.max(0, -rawDays),
                    aging_status: rawDays === null ? "unscheduled" : rawDays > 0 ? "overdue" : rawDays >= -7 ? "due_soon" : "current",
                };
            })
            .filter((row) => row.pending > 0.001);

        const groupByParty = (documents, partyKey) => {
            const map = new Map();
            for (const doc of documents) {
                const party = doc[partyKey];
                const key = party?._id || "unknown";
                const current = map.get(key) || { _id: key, name: party?.name || "—", total: 0, paid: 0, pending: 0, documentCount: 0 };
                current.total += doc.total;
                current.paid += doc.paid;
                current.pending += doc.pending;
                current.documentCount += 1;
                map.set(key, current);
            }
            return [...map.values()]
                .map((e) => ({ ...e, total: round2(e.total), paid: round2(e.paid), pending: round2(e.pending) }))
                .sort((a, b) => b.pending - a.pending);
        };

        const sumPending = (docs) => round2(docs.reduce((acc, d) => acc + d.pending, 0));

        const report = {
            receivables: {
                summary: { totalPending: sumPending(receivablesDocuments), documentCount: receivablesDocuments.length },
                byCustomer: groupByParty(receivablesDocuments, "customer"),
                byDocument: [...receivablesDocuments].sort((a, b) => b.days_overdue - a.days_overdue),
            },
            payables: {
                summary: { totalPending: sumPending(payablesDocuments), documentCount: payablesDocuments.length },
                bySupplier: groupByParty(payablesDocuments, "supplier"),
                byDocument: [...payablesDocuments].sort((a, b) => (b.days_overdue ?? -1) - (a.days_overdue ?? -1)),
                aging: {
                    current: sumPending(payablesDocuments.filter((d) => d.aging_status === "current")),
                    dueSoon: sumPending(payablesDocuments.filter((d) => d.aging_status === "due_soon")),
                    overdue1To30: sumPending(payablesDocuments.filter((d) => d.days_overdue >= 1 && d.days_overdue <= 30)),
                    overdue31To60: sumPending(payablesDocuments.filter((d) => d.days_overdue >= 31 && d.days_overdue <= 60)),
                    overdue61Plus: sumPending(payablesDocuments.filter((d) => d.days_overdue >= 61)),
                    unscheduled: sumPending(payablesDocuments.filter((d) => d.aging_status === "unscheduled")),
                },
            },
        };

        return res.status(200).json(new ApiResponse(200, report, "Cartera report fetched successfully"));
    } catch (error) {
        console.error("Cartera report error:", error);
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
    getCarteraReport,
    exportReportPdf,
    authorizeCsvExport,
    authorizeExcelExport,
};
