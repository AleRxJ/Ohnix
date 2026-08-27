import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { ensureDefaultPointOfSale } from "../services/pointOfSale.service.js";
import { createCashAccount } from "../services/cashAccount.service.js";
import orderService from "../services/order.service.js";
import purchaseService from "../services/purchase.service.js";
import { registerOrderPayment } from "../services/orderPayment.service.js";
import { registerPurchasePayment } from "../services/purchasePayment.service.js";

// One-off seed for a full, real audit pass of the Contabilidad module -
// everything below goes through the actual service layer (not raw prisma
// inserts) so accountingPosting.service.js's automatic journal entries fire
// exactly as they would for a real user.

const EMAIL = "alejandrovallejo10@outlook.com";
const PASSWORD = "OhnixAudit2026!";

const run = async () => {
    await prisma.$connect();

    let user = await prisma.user.findUnique({ where: { email: EMAIL } });
    if (!user) {
        const hashed = await bcrypt.hash(PASSWORD, 10);
        user = await prisma.user.create({
            data: {
                email: EMAIL,
                username: "alejandro_audit",
                password: hashed,
                avatar: "https://via.placeholder.com/150",
                isVerified: true,
                preferredLanguage: "es",
                subscription: { create: { plan: "scale", status: "active" } },
            },
        });
        console.log("Created user", user.id);
    } else {
        await prisma.subscription.upsert({
            where: { userId: user.id },
            update: { plan: "scale", status: "active" },
            create: { userId: user.id, plan: "scale", status: "active" },
        });
        console.log("Reusing existing user", user.id);
    }

    let company = user.companyId ? await prisma.company.findUnique({ where: { id: user.companyId } }) : null;
    if (!company) {
        company = await prisma.company.create({
            data: {
                name: "Auditoria Contabilidad SAS",
                legalName: "Auditoria Contabilidad SAS",
                countryCode: "CO",
                vatResponsible: "responsible",
                vatResponsibleEffectiveFrom: new Date(),
                isWithholdingAgent: true,
                withholdingAgentEffectiveFrom: new Date(),
                icaMunicipalityCode: "11001",
                icaActivityCode: "4711",
                icaRatePerThousand: 6.9,
                isActive: true,
            },
        });
        await prisma.user.update({ where: { id: user.id }, data: { companyId: company.id } });
        console.log("Created company", company.id);
    } else {
        console.log("Reusing existing company", company.id);
    }

    const pos = await ensureDefaultPointOfSale(user.id);

    let category = await prisma.category.findFirst({ where: { createdById: user.id, categoryName: "Auditoria" } });
    if (!category) category = await prisma.category.create({ data: { categoryName: "Auditoria", createdById: user.id } });

    let unit = await prisma.unit.findFirst({ where: { createdById: user.id, unitName: "Unidad" } });
    if (!unit) unit = await prisma.unit.create({ data: { unitName: "Unidad", createdById: user.id } });

    let product = await prisma.product.findFirst({ where: { createdById: user.id, productCode: "AUD-001" } });
    if (!product) {
        product = await prisma.product.create({
            data: {
                productName: "Producto de auditoria",
                productCode: "AUD-001",
                categoryId: category.id,
                unitId: unit.id,
                buyingPrice: 50000,
                sellingPrice: 90000,
                productImage: "default-product.png",
                stock: 0,
                isTutorialData: false,
                createdById: user.id,
                taxTreatment: "taxed",
                taxRate: 19,
                isPhysical: false,
            },
        });
        console.log("Created product", product.id);
    }

    let customer = await prisma.customer.findFirst({ where: { createdById: user.id, email: "cliente.auditoria@example.com" } });
    if (!customer) {
        customer = await prisma.customer.create({
            data: {
                name: "Cliente Auditoria",
                email: "cliente.auditoria@example.com",
                phone: "3000000000",
                type: "regular",
                photo: "default-customer.png",
                isTutorialData: false,
                createdById: user.id,
                pointOfSaleId: pos.id,
            },
        });
        console.log("Created customer", customer.id);
    }

    let supplier = await prisma.supplier.findFirst({ where: { createdById: user.id, email: "proveedor.auditoria@example.com" } });
    if (!supplier) {
        supplier = await prisma.supplier.create({
            data: {
                name: "Proveedor Auditoria",
                email: "proveedor.auditoria@example.com",
                phone: "3000000001",
                address: "Calle Falsa 123",
                type: "company",
                photo: "default-supplier.png",
                notObligatedToInvoice: true,
                isTutorialData: false,
                createdById: user.id,
                pointOfSaleId: pos.id,
            },
        });
        console.log("Created supplier", supplier.id);
    }

    let cashAccount = await prisma.cashAccount.findFirst({ where: { createdById: user.id, name: "Caja Auditoria" } });
    if (!cashAccount) {
        cashAccount = await createCashAccount({
            accountId: user.id,
            actorId: user.id,
            name: "Caja Auditoria",
            accountType: "cash",
            pointOfSaleId: pos.id,
        });
        console.log("Created cash account", cashAccount.id);
    }

    const purchaseNo = `PO-AUDIT-${Date.now()}`;
    const purchase = await purchaseService.createPurchase(
        {
            supplier_id: supplier.id,
            purchase_no: purchaseNo,
            purchase_status: "completed",
            details: [{ product_id: product.id, quantity: 20, unitcost: 50000 }],
        },
        user.id,
        "user",
        pos.id
    );
    // Purchase.createPurchase's response has no total/taxAmount field (unlike
    // Order, which stores subTotal/gst/total directly) - Purchase totals are
    // always derived live from PurchaseDetail rows, never cached. Worth
    // flagging as an API-shape inconsistency in the audit.
    const purchaseDetails0 = await prisma.purchaseDetail.findMany({ where: { purchaseId: purchase._id } });
    const purchaseTotal = purchaseDetails0.reduce((sum, d) => sum + Number(d.total) + Number(d.taxAmount), 0);
    console.log("Created purchase", purchase._id, "total (derived from details)", purchaseTotal);

    const order = await orderService.createOrder(
        {
            customer_id: customer.id,
            order_status: "completed",
            orderItems: [{ product_id: product.id, quantity: 5, unitcost: 90000 }],
        },
        user.id,
        "user",
        pos.id
    );
    console.log("Created order", order._id, "total", order.total);

    await registerOrderPayment({
        accountId: user.id,
        actorId: user.id,
        orderId: order._id,
        amount: Math.round(order.total * 0.6 * 100) / 100,
        cashAccountId: cashAccount.id,
        method: "cash",
        reference: "Abono auditoria",
    });
    console.log("Registered order payment");

    await registerPurchasePayment({
        accountId: user.id,
        actorId: user.id,
        purchaseId: purchase._id,
        amount: Math.round(purchaseTotal * 0.5 * 100) / 100,
        cashAccountId: cashAccount.id,
        method: "cash",
        reference: "Abono a proveedor auditoria",
    });
    console.log("Registered purchase payment");

    const orderDetails = await prisma.orderDetail.findMany({ where: { orderId: order._id } });
    if (orderDetails[0]) {
        await orderService.processReturn(
            order._id,
            [{ order_detail_id: orderDetails[0].id, quantity: 1 }],
            user.id,
            "user",
            undefined
        );
        console.log("Processed order return");
    }

    const summary = {
        userId: user.id,
        email: EMAIL,
        password: PASSWORD,
        companyId: company.id,
        pointOfSaleId: pos.id,
        productId: product.id,
        customerId: customer.id,
        supplierId: supplier.id,
        cashAccountId: cashAccount.id,
        purchaseId: purchase._id,
        orderId: order._id,
    };
    console.log("SEED_SUMMARY_JSON=" + JSON.stringify(summary));
};

run()
    .catch((err) => {
        console.error("Seed failed:", err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
