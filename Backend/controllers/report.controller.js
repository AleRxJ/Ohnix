import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { prisma } from "../db/prisma.js";

const toExternalId = (entity) => entity.legacyMongoId || entity.id;

const getDashboardMetrics = asyncHandler(async (req, res, next) => {
    try {
        const userId = req.user.prismaId;
        const isAdmin = req.user.role === "admin";

        const orderWhere = {
            ...(isAdmin ? {} : { createdById: userId }),
            orderStatus: { not: "cancelled" },
        };

        const purchaseWhere = isAdmin ? {} : { purchase: { createdById: userId } };
        const productWhere = isAdmin ? {} : { createdById: userId };

        const [
            totalSalesAgg,
            totalPurchaseAgg,
            inventoryAgg,
            recentOrders,
            lowStockProducts,
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
                where: isAdmin ? {} : { createdById: userId },
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
            prisma.product.findMany({
                where: {
                    ...productWhere,
                    stock: { lt: 10 },
                },
                select: {
                    id: true,
                    legacyMongoId: true,
                    productName: true,
                    stock: true,
                },
                orderBy: { stock: "asc" },
                take: 10,
            }),
            prisma.product.count({
                where: {
                    ...productWhere,
                    stock: 0,
                },
            }),
        ]);

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
        return next(new ApiError(500, error.message));
    }
});

const getStockReport = asyncHandler(async (req, res, next) => {
    try {
        const userId = req.user.prismaId;
        const isAdmin = req.user.role === "admin";

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
                    : p.stock < 10
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
        return next(new ApiError(500, error.message));
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
                ...(isAdmin ? {} : { createdById: userId }),
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
        return next(new ApiError(500, error.message));
    }
});

const getTopProducts = asyncHandler(async (req, res, next) => {
    const { limit = 10 } = req.query;
    const userId = req.user.prismaId;
    const isAdmin = req.user.role === "admin";

    try {
        const orders = await prisma.order.findMany({
            where: {
                ...(isAdmin ? {} : { createdById: userId }),
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
        return next(new ApiError(500, error.message));
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
                ...(isAdmin ? {} : { createdById: userId }),
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
        return next(new ApiError(500, error.message));
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
                        note: "Low stock email alerts are sent automatically to all users",
                    },
                },
                "Low stock alerts fetched successfully"
            )
        );
    } catch (error) {
        console.error("Low stock alerts error:", error);
        return next(new ApiError(500, error.message));
    }
});

export {
    getDashboardMetrics,
    getStockReport,
    getSalesReport,
    getTopProducts,
    getPurchaseReport,
    getLowStockAlerts,
};
