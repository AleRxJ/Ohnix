import dotenv from "dotenv";
import mongoose from "mongoose";
import { PrismaClient } from "@prisma/client";
import {
    User,
    Category,
    Unit,
    Supplier,
    Customer,
    Product,
    Purchase,
    PurchaseDetail,
    Order,
    OrderDetail,
} from "../models/index.js";

dotenv.config({ path: "./.env" });

const prisma = new PrismaClient();

const mapId = (value) => (value ? value.toString() : null);
const asDate = (value) => (value ? new Date(value) : undefined);
const asBigInt = (value) => {
    const raw = Number(value || 0);
    if (Number.isNaN(raw)) return BigInt(0);
    return BigInt(Math.trunc(raw));
};

const createOrUpdate = async (model, uniqueWhere, createData, updateData = null) => {
    return model.upsert({
        where: uniqueWhere,
        create: createData,
        update: updateData || createData,
    });
};

const migrate = async () => {
    if (!process.env.MONGODB_URI) {
        throw new Error("MONGODB_URI is required to read source data");
    }

    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is required to write PostgreSQL data");
    }

    await mongoose.connect(process.env.MONGODB_URI, {
        dbName: "IMS",
    });

    const idMap = {
        users: new Map(),
        categories: new Map(),
        units: new Map(),
        suppliers: new Map(),
        customers: new Map(),
        products: new Map(),
        purchases: new Map(),
        orders: new Map(),
    };

    console.log("Migrating users...");
    const users = await User.find({}).lean();
    for (const doc of users) {
        const legacyId = mapId(doc._id);
        const user = await createOrUpdate(
            prisma.user,
            { legacyMongoId: legacyId },
            {
                legacyMongoId: legacyId,
                username: doc.username,
                email: doc.email,
                password: doc.password,
                role: doc.role || "user",
                verifyOtp: doc.verifyOtp || "",
                verifyOtpExpiry: asBigInt(doc.verifyOtpExpiry),
                isVerified: !!doc.isVerified,
                resetOtp: doc.resetOtp || "",
                resetOtpExpiry: asBigInt(doc.resetOtpExpiry),
                avatar: doc.avatar,
                refreshToken: doc.refreshToken || null,
                createdAt: asDate(doc.createdAt) || new Date(),
                updatedAt: asDate(doc.updatedAt) || new Date(),
            }
        );
        idMap.users.set(legacyId, user.id);
    }

    const resolveUser = (mongoId) => idMap.users.get(mapId(mongoId));

    console.log("Migrating categories...");
    const categories = await Category.find({}).lean();
    for (const doc of categories) {
        const legacyId = mapId(doc._id);
        const createdById = resolveUser(doc.created_by);
        if (!createdById) continue;

        const category = await createOrUpdate(
            prisma.category,
            { legacyMongoId: legacyId },
            {
                legacyMongoId: legacyId,
                categoryName: doc.category_name,
                createdById,
                updatedById: resolveUser(doc.updated_by),
                createdAt: asDate(doc.createdAt) || new Date(),
                updatedAt: asDate(doc.updatedAt) || new Date(),
            }
        );

        idMap.categories.set(legacyId, category.id);
    }

    console.log("Migrating units...");
    const units = await Unit.find({}).lean();
    for (const doc of units) {
        const legacyId = mapId(doc._id);
        const createdById = resolveUser(doc.created_by);
        if (!createdById) continue;

        const unit = await createOrUpdate(
            prisma.unit,
            { legacyMongoId: legacyId },
            {
                legacyMongoId: legacyId,
                unitName: doc.unit_name,
                createdById,
                updatedById: resolveUser(doc.updated_by),
                createdAt: asDate(doc.createdAt) || new Date(),
                updatedAt: asDate(doc.updatedAt) || new Date(),
            }
        );

        idMap.units.set(legacyId, unit.id);
    }

    console.log("Migrating suppliers...");
    const suppliers = await Supplier.find({}).lean();
    for (const doc of suppliers) {
        const legacyId = mapId(doc._id);
        const createdById = resolveUser(doc.createdBy);
        if (!createdById) continue;

        const supplier = await createOrUpdate(
            prisma.supplier,
            { legacyMongoId: legacyId },
            {
                legacyMongoId: legacyId,
                name: doc.name,
                email: doc.email,
                phone: doc.phone,
                address: doc.address,
                shopname: doc.shopname || null,
                type: doc.type || null,
                bankName: doc.bank_name || null,
                accountHolder: doc.account_holder || null,
                accountNumber: doc.account_number || null,
                photo: doc.photo || "default-supplier.png",
                createdById,
                createdAt: asDate(doc.createdAt) || new Date(),
                updatedAt: asDate(doc.updatedAt) || new Date(),
            }
        );

        idMap.suppliers.set(legacyId, supplier.id);
    }

    console.log("Migrating customers...");
    const customers = await Customer.find({}).lean();
    for (const doc of customers) {
        const legacyId = mapId(doc._id);
        const createdById = resolveUser(doc.created_by);
        if (!createdById) continue;

        const customer = await createOrUpdate(
            prisma.customer,
            { legacyMongoId: legacyId },
            {
                legacyMongoId: legacyId,
                name: doc.name,
                email: doc.email,
                phone: doc.phone,
                address: doc.address || null,
                type: doc.type || "regular",
                storeName: doc.store_name || null,
                accountHolder: doc.account_holder || null,
                accountNumber: doc.account_number || null,
                photo: doc.photo || "default-customer.png",
                createdById,
                createdAt: asDate(doc.createdAt) || new Date(),
                updatedAt: asDate(doc.updatedAt) || new Date(),
            }
        );

        idMap.customers.set(legacyId, customer.id);
    }

    console.log("Migrating products...");
    const products = await Product.find({}).lean();
    for (const doc of products) {
        const legacyId = mapId(doc._id);
        const categoryId = idMap.categories.get(mapId(doc.category_id));
        const unitId = idMap.units.get(mapId(doc.unit_id));
        const createdById = resolveUser(doc.created_by);

        if (!categoryId || !unitId || !createdById) continue;

        const product = await createOrUpdate(
            prisma.product,
            { legacyMongoId: legacyId },
            {
                legacyMongoId: legacyId,
                productName: doc.product_name,
                productCode: doc.product_code,
                categoryId,
                unitId,
                buyingPrice: doc.buying_price,
                sellingPrice: doc.selling_price,
                stock: doc.stock || 0,
                productImage: doc.product_image || "default-product.png",
                createdById,
                updatedById: resolveUser(doc.updated_by),
                createdAt: asDate(doc.createdAt) || new Date(),
                updatedAt: asDate(doc.updatedAt) || new Date(),
            }
        );

        idMap.products.set(legacyId, product.id);
    }

    console.log("Migrating purchases...");
    const purchases = await Purchase.find({}).lean();
    for (const doc of purchases) {
        const legacyId = mapId(doc._id);
        const supplierId = idMap.suppliers.get(mapId(doc.supplier_id));
        const createdById = resolveUser(doc.created_by);

        if (!supplierId || !createdById) continue;

        const purchase = await createOrUpdate(
            prisma.purchase,
            { legacyMongoId: legacyId },
            {
                legacyMongoId: legacyId,
                purchaseDate: asDate(doc.purchase_date) || new Date(),
                purchaseNo: doc.purchase_no,
                supplierId,
                purchaseStatus: doc.purchase_status || "pending",
                createdById,
                updatedById: resolveUser(doc.updated_by),
                createdAt: asDate(doc.createdAt) || new Date(),
                updatedAt: asDate(doc.updatedAt) || new Date(),
            }
        );

        idMap.purchases.set(legacyId, purchase.id);
    }

    console.log("Migrating orders...");
    const orders = await Order.find({}).lean();
    for (const doc of orders) {
        const legacyId = mapId(doc._id);
        const customerId = idMap.customers.get(mapId(doc.customer_id));
        const createdById = resolveUser(doc.created_by);

        if (!customerId || !createdById) continue;

        const order = await createOrUpdate(
            prisma.order,
            { legacyMongoId: legacyId },
            {
                legacyMongoId: legacyId,
                customerId,
                orderDate: asDate(doc.order_date) || new Date(),
                orderStatus: doc.order_status || "pending",
                totalProducts: doc.total_products || 0,
                subTotal: doc.sub_total || 0,
                gst: doc.gst || 0,
                total: doc.total || 0,
                invoiceNo: doc.invoice_no,
                createdById,
                updatedById: resolveUser(doc.updated_by),
                createdAt: asDate(doc.createdAt) || new Date(),
                updatedAt: asDate(doc.updatedAt) || new Date(),
            }
        );

        idMap.orders.set(legacyId, order.id);
    }

    console.log("Migrating purchase details...");
    const purchaseDetails = await PurchaseDetail.find({}).lean();
    for (const doc of purchaseDetails) {
        const legacyId = mapId(doc._id);
        const purchaseId = idMap.purchases.get(mapId(doc.purchase_id));
        const productId = idMap.products.get(mapId(doc.product_id));

        if (!purchaseId || !productId) continue;

        await createOrUpdate(
            prisma.purchaseDetail,
            { legacyMongoId: legacyId },
            {
                legacyMongoId: legacyId,
                purchaseId,
                productId,
                quantity: doc.quantity,
                unitcost: doc.unitcost,
                total: doc.total,
                returnProcessed: !!doc.return_processed,
                returnDate: asDate(doc.return_date),
                returnedQuantity: doc.returned_quantity || 0,
                refundAmount: doc.refund_amount || 0,
                createdAt: asDate(doc.createdAt) || new Date(),
                updatedAt: asDate(doc.updatedAt) || new Date(),
            }
        );
    }

    console.log("Migrating order details...");
    const orderDetails = await OrderDetail.find({}).lean();
    for (const doc of orderDetails) {
        const legacyId = mapId(doc._id);
        const orderId = idMap.orders.get(mapId(doc.order_id));
        const productId = idMap.products.get(mapId(doc.product_id));

        if (!orderId || !productId) continue;

        await createOrUpdate(
            prisma.orderDetail,
            { legacyMongoId: legacyId },
            {
                legacyMongoId: legacyId,
                orderId,
                productId,
                quantity: doc.quantity,
                unitcost: doc.unitcost,
                total: doc.total,
                createdAt: asDate(doc.createdAt) || new Date(),
                updatedAt: asDate(doc.updatedAt) || new Date(),
            }
        );
    }

    console.log("Migration completed successfully.");
};

migrate()
    .catch((error) => {
        console.error("Migration failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
        await mongoose.disconnect();
    });
