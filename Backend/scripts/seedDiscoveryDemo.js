// Backend/scripts/seedDiscoveryDemo.js
//
// Demonstrates the Discovery Engine (Fase 1 + three Fase 2 detectors) two
// ways per detector:
//
//   1. Seeds a dedicated demo account per detector with synthetic data
//      deliberately shaped to trip it (mission section 15, cases 1, 2 and
//      3) - then runs the detector against it so the finding is guaranteed.
//   2. Runs every detector against every REAL account that already has
//      Order history, to see what (if anything) actually shows up there -
//      per mission rule 5, "no news" is a perfectly valid outcome and is
//      reported as such, not forced.
//
// Each demo scenario lives on its OWN demo account on purpose - mixing,
// say, the churn-risk customers' scattered order history into the same
// account as the cash-gap demo's monthly revenue series would perturb the
// exact numbers each demo is built to produce.
//
// Safe to re-run: every demo account/customer/product/cash account is
// looked up by a fixed identifying field before creating, prior seeded
// Orders/customers for a demo account are wiped before reseeding, and
// upsertDiscovery's dedupe means re-running a detector never creates
// duplicate Discovery rows.

import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { ensureDefaultChartOfAccounts, resolveCashAccountChartAccount } from "../services/chartOfAccounts.service.js";
import { runSalesVsCashGapDetector, DETECTOR_KEY as CASH_GAP_DETECTOR_KEY } from "../services/detectors/salesVsCashGap.detector.js";
import { runCustomerChurnRiskDetector, DETECTOR_KEY as CHURN_DETECTOR_KEY } from "../services/detectors/customerChurnRisk.detector.js";
import { runCustomerProductLookalikeDetector, DETECTOR_KEY as LOOKALIKE_DETECTOR_KEY } from "../services/detectors/customerProductLookalike.detector.js";
import { runSupplierDelayConnectionDetector, DETECTOR_KEY as SUPPLIER_DELAY_DETECTOR_KEY } from "../services/detectors/supplierDelayConnection.detector.js";
import { runTrajectoryShiftDetector, DETECTOR_KEY as TRAJECTORY_SHIFT_DETECTOR_KEY } from "../services/detectors/trajectoryShift.detector.js";
import { runNewPatternReturnRateDetector, DETECTOR_KEY as NEW_PATTERN_DETECTOR_KEY } from "../services/detectors/newPatternReturnRate.detector.js";
import { runCrossFactorCorrelationDetector, DETECTOR_KEY as CROSS_FACTOR_DETECTOR_KEY } from "../services/detectors/crossFactorCorrelation.detector.js";

dotenv.config({ path: "./.env" });

const DEMO_EMAIL = "discovery-demo@ohnix.local";
const DEMO_USERNAME = "discovery-demo";
const CHURN_DEMO_EMAIL = "discovery-demo-churn@ohnix.local";
const CHURN_DEMO_USERNAME = "discovery-demo-churn";
const LOOKALIKE_DEMO_EMAIL = "discovery-demo-lookalike@ohnix.local";
const LOOKALIKE_DEMO_USERNAME = "discovery-demo-lookalike";
const SUPPLIER_DEMO_EMAIL = "discovery-demo-supplier@ohnix.local";
const SUPPLIER_DEMO_USERNAME = "discovery-demo-supplier";
const TRAJECTORY_DEMO_EMAIL = "discovery-demo-trajectory@ohnix.local";
const TRAJECTORY_DEMO_USERNAME = "discovery-demo-trajectory";
const PATTERN_DEMO_EMAIL = "discovery-demo-pattern@ohnix.local";
const PATTERN_DEMO_USERNAME = "discovery-demo-pattern";
const CROSS_FACTOR_DEMO_EMAIL = "discovery-demo-crossfactor@ohnix.local";
const CROSS_FACTOR_DEMO_USERNAME = "discovery-demo-crossfactor";

// Oldest -> newest of the 6-month window, in COP. Revenue nearly doubles
// while cash collected barely moves - the shape that should trip the
// detector's MIN_REVENUE_GROWTH_PCT / MIN_GAP_PCT thresholds.
const MONTHLY_REVENUE = [4_000_000, 4_400_000, 4_900_000, 7_200_000, 8_800_000, 9_600_000];
const MONTHLY_CASH = [3_800_000, 3_900_000, 4_000_000, 4_100_000, 4_300_000, 4_500_000];

const ensureDemoAccount = async (email, username) => {
    const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
    if (existing) return existing;

    const hashedPassword = await bcrypt.hash("Discovery-Demo-1234!", 10);
    return prisma.user.create({
        data: {
            email,
            username,
            password: hashedPassword,
            avatar: "https://via.placeholder.com/150",
            isVerified: true,
        },
    });
};

const ensurePointOfSale = async (accountId) => {
    const existing = await prisma.pointOfSale.findFirst({ where: { accountId } });
    if (existing) return existing;
    return prisma.pointOfSale.create({ data: { accountId, name: "Sede Demo", isDefault: true } });
};

const ensureCategoryAndUnit = async (accountId) => {
    const [category, unit] = await Promise.all([
        prisma.category.findFirst({ where: { createdById: accountId } }).then(
            (found) => found || prisma.category.create({ data: { categoryName: "Demo", createdById: accountId } })
        ),
        prisma.unit.findFirst({ where: { createdById: accountId } }).then(
            (found) => found || prisma.unit.create({ data: { unitName: "Unidad", createdById: accountId } })
        ),
    ]);
    return { category, unit };
};

const ensureProduct = async (accountId, categoryId, unitId) => {
    const existing = await prisma.product.findFirst({ where: { createdById: accountId, productCode: "DEMO-SKU" } });
    if (existing) return existing;
    return prisma.product.create({
        data: {
            productName: "Producto Demo",
            productCode: "DEMO-SKU",
            categoryId,
            unitId,
            buyingPrice: 10000,
            sellingPrice: 20000,
            createdById: accountId,
        },
    });
};

const ensureNamedProduct = async (accountId, categoryId, unitId, productName, productCode) => {
    const existing = await prisma.product.findFirst({ where: { createdById: accountId, productCode } });
    if (existing) return existing;
    return prisma.product.create({
        data: { productName, productCode, categoryId, unitId, buyingPrice: 10000, sellingPrice: 20000, createdById: accountId },
    });
};

const ensureNamedSupplier = async (accountId, pointOfSaleId, name, email) => {
    const existing = await prisma.supplier.findFirst({ where: { createdById: accountId, email } });
    if (existing) return existing;
    return prisma.supplier.create({
        data: { name, email, phone: "3000000000", address: "Calle Demo 123", photo: "https://via.placeholder.com/150", createdById: accountId, pointOfSaleId },
    });
};

// Purchase.updatedAt is a Prisma-managed @updatedAt column - the client
// always stamps it to "now" on create/update regardless of what's passed,
// so backdating it (this detector reads updatedAt as "when the purchase
// was actually received") needs a raw SQL UPDATE that bypasses that
// client-side auto-management entirely.
const backdatePurchaseUpdatedAt = (purchaseId, updatedAt) =>
    prisma.$executeRaw`UPDATE purchases SET updated_at = ${updatedAt} WHERE id = ${purchaseId}`;

const ensureCustomer = async (accountId, pointOfSaleId) => {
    const existing = await prisma.customer.findFirst({ where: { createdById: accountId } });
    if (existing) return existing;
    return prisma.customer.create({
        data: {
            name: "Cliente Demo",
            email: "cliente-demo@ohnix.local",
            phone: "3000000000",
            photo: "https://via.placeholder.com/150",
            createdById: accountId,
            pointOfSaleId,
        },
    });
};

const ensureCashAccount = async (accountId) => {
    const existing = await prisma.cashAccount.findFirst({ where: { createdById: accountId } });
    if (existing) return existing;
    const created = await prisma.cashAccount.create({ data: { name: "Caja Demo", createdById: accountId } });
    const chartAccountId = await resolveCashAccountChartAccount(prisma, accountId, created);
    return { ...created, chartAccountId };
};

const monthStart = (monthsAgo, anchor) => new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - monthsAgo, 1));

const seedMonth = async ({ accountId, customerId, pointOfSaleId, productId, cashAccount, periodStart, revenue, cash }) => {
    const orderDate = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), 15));

    await prisma.order.create({
        data: {
            customerId,
            pointOfSaleId,
            orderDate,
            orderStatus: "completed",
            totalProducts: 1,
            subTotal: revenue,
            total: revenue,
            invoiceNo: `DEMO-DISC-${periodStart.getTime()}-${Math.floor(Math.random() * 1e6)}`,
            createdById: accountId,
            orderDetails: { create: [{ productId, quantity: 1, unitcost: revenue, total: revenue }] },
        },
    });

    await prisma.$transaction(async (tx) => {
        const fresh = await tx.cashAccount.findUnique({ where: { id: cashAccount.id }, select: { balance: true } });
        const balanceAfter = Number(fresh.balance) + cash;
        // Bypasses recordCashMovement's real-time-only signature on purpose:
        // this seed needs a backdated createdAt to land in the right
        // historical month, which production code never does (a cash
        // movement always happens "now") - see recordCashMovement in
        // cashMovement.service.js for the real single write path.
        await tx.cashMovement.create({
            data: {
                cashAccountId: cashAccount.id,
                delta: cash,
                balanceAfter,
                sourceType: "order_payment",
                sourceId: null,
                reason: "Discovery engine demo seed",
                createdById: accountId,
                createdAt: orderDate,
            },
        });
        await tx.cashAccount.update({ where: { id: cashAccount.id }, data: { balance: balanceAfter } });
    });
};

const seedDemoAccount = async () => {
    const account = await ensureDemoAccount(DEMO_EMAIL, DEMO_USERNAME);
    await ensureDefaultChartOfAccounts(prisma, account.id);
    const pointOfSale = await ensurePointOfSale(account.id);
    const { category, unit } = await ensureCategoryAndUnit(account.id);
    const product = await ensureProduct(account.id, category.id, unit.id);
    const customer = await ensureCustomer(account.id, pointOfSale.id);
    const cashAccount = await ensureCashAccount(account.id);

    // Re-runnable: wipe this demo account's own prior seeded Orders/cash
    // movements first, so a second run replaces the 6-month series instead
    // of doubling it. Order details must go before their Order (no cascade
    // configured on that relation).
    const priorOrders = await prisma.order.findMany({ where: { createdById: account.id }, select: { id: true } });
    const priorOrderIds = priorOrders.map((o) => o.id);
    if (priorOrderIds.length) {
        await prisma.orderDetail.deleteMany({ where: { orderId: { in: priorOrderIds } } });
        await prisma.order.deleteMany({ where: { id: { in: priorOrderIds } } });
    }
    await prisma.cashMovement.deleteMany({ where: { cashAccountId: cashAccount.id } });
    await prisma.cashAccount.update({ where: { id: cashAccount.id }, data: { balance: 0 } });

    // Anchor on the last day of the previous month, so the 6-month window
    // the detector reads (lastNMonthKeys) is exactly 6 complete months
    // ending last month - never a partial current month.
    const today = new Date();
    const anchor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));

    for (let i = 0; i < MONTHLY_REVENUE.length; i++) {
        const monthsAgo = MONTHLY_REVENUE.length - 1 - i;
        const periodStart = monthStart(monthsAgo, anchor);
        await seedMonth({
            accountId: account.id,
            customerId: customer.id,
            pointOfSaleId: pointOfSale.id,
            productId: product.id,
            cashAccount,
            periodStart,
            revenue: MONTHLY_REVENUE[i],
            cash: MONTHLY_CASH[i],
        });
    }

    console.log(`\n=== Synthetic demo account (${DEMO_EMAIL}) ===`);
    const result = await runSalesVsCashGapDetector({ accountId: account.id, now: anchor });
    if (result.discovery) {
        console.log(`Discovery ${result.created ? "created" : "updated"}: "${result.discovery.title}"`);
        console.log(`  priority_score=${result.discovery.priorityScore} confidence=${result.discovery.confidence}`);
        console.log(`  revenue growth: ${result.revenueTrend.growthPct.toFixed(1)}% | cash growth: ${result.cashTrend.growthPct.toFixed(1)}% | gap: ${result.gapPct.toFixed(1)}pp`);
    } else {
        console.log(`No discovery produced (reason: ${result.reason}).`);
    }
};

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// Oldest -> newest dates for one customer, so the newest sits exactly
// `lastOrderDaysAgo` days back and each earlier one is another
// `baselineDays` further back - i.e. a customer who orders like clockwork
// every `baselineDays`, except their last order was `lastOrderDaysAgo` ago
// instead of the ~1x-baseline-ago a healthy customer would show.
const buildOrderDatesBack = ({ baselineDays, orderCount, lastOrderDaysAgo }) =>
    Array.from({ length: orderCount }, (_, k) => daysAgo(lastOrderDaysAgo + (orderCount - 1 - k) * baselineDays));

const randomBetween = (min, max) => Math.round(min + Math.random() * (max - min));

// Three cohorts, matching customerChurnRisk.detector.js's own thresholds
// (RISK_RATIO_MIN 1.8, CHURNED_RATIO_MIN 4.0): healthy customers whose last
// order is close to their own normal rhythm, at-risk customers overdue by
// 2-3.5x their rhythm (the mission's "17 clientes" case), and a churned
// precedent cohort overdue by 5-8x - the historical evidence the detector
// needs before it will say anything at all.
const CHURN_COHORTS = [
    { label: "healthy", count: 8, ratioRange: [0.8, 1.3] },
    { label: "at_risk", count: 18, ratioRange: [2.0, 3.5] },
    { label: "churned_precedent", count: 6, ratioRange: [5, 8] },
];

const seedChurnDemoAccount = async () => {
    const account = await ensureDemoAccount(CHURN_DEMO_EMAIL, CHURN_DEMO_USERNAME);
    await ensureDefaultChartOfAccounts(prisma, account.id);
    const pointOfSale = await ensurePointOfSale(account.id);
    const { category, unit } = await ensureCategoryAndUnit(account.id);
    const product = await ensureProduct(account.id, category.id, unit.id);

    // Re-runnable: wipe this account's prior seeded customers (cascades to
    // their Orders via the FK, so OrderDetails need clearing first).
    const priorCustomers = await prisma.customer.findMany({ where: { createdById: account.id }, select: { id: true } });
    const priorCustomerIds = priorCustomers.map((c) => c.id);
    if (priorCustomerIds.length) {
        const priorOrders = await prisma.order.findMany({ where: { customerId: { in: priorCustomerIds } }, select: { id: true } });
        const priorOrderIds = priorOrders.map((o) => o.id);
        if (priorOrderIds.length) {
            await prisma.orderDetail.deleteMany({ where: { orderId: { in: priorOrderIds } } });
            await prisma.order.deleteMany({ where: { id: { in: priorOrderIds } } });
        }
        await prisma.customer.deleteMany({ where: { id: { in: priorCustomerIds } } });
    }

    let customerIndex = 0;
    for (const cohort of CHURN_COHORTS) {
        for (let i = 0; i < cohort.count; i++) {
            customerIndex += 1;
            const baselineDays = randomBetween(20, 32);
            const ratio = cohort.ratioRange[0] + Math.random() * (cohort.ratioRange[1] - cohort.ratioRange[0]);
            const lastOrderDaysAgo = Math.round(baselineDays * ratio);
            const orderCount = randomBetween(4, 6);

            const customer = await prisma.customer.create({
                data: {
                    name: `Cliente Demo ${cohort.label} ${customerIndex}`,
                    email: `cliente-demo-${cohort.label}-${customerIndex}@ohnix.local`,
                    phone: "3000000000",
                    photo: "https://via.placeholder.com/150",
                    createdById: account.id,
                    pointOfSaleId: pointOfSale.id,
                },
            });

            const dates = buildOrderDatesBack({ baselineDays, orderCount, lastOrderDaysAgo });
            for (const orderDate of dates) {
                const total = randomBetween(150_000, 400_000);
                await prisma.order.create({
                    data: {
                        customerId: customer.id,
                        pointOfSaleId: pointOfSale.id,
                        orderDate,
                        orderStatus: "completed",
                        totalProducts: 1,
                        subTotal: total,
                        total,
                        invoiceNo: `DEMO-CHURN-${customerIndex}-${orderDate.getTime()}-${Math.floor(Math.random() * 1e6)}`,
                        createdById: account.id,
                        orderDetails: { create: [{ productId: product.id, quantity: 1, unitcost: total, total }] },
                    },
                });
            }
        }
    }

    console.log(`\n=== Synthetic churn-risk demo account (${CHURN_DEMO_EMAIL}) ===`);
    const result = await runCustomerChurnRiskDetector({ accountId: account.id });
    if (result.discovery) {
        console.log(`Discovery ${result.created ? "created" : "updated"}: "${result.discovery.title}"`);
        console.log(`  priority_score=${result.discovery.priorityScore} confidence=${result.discovery.confidence}`);
        console.log(`  at_risk=${result.atRisk.length} churned_precedent=${result.churnedPrecedent.length} revenue_share=${result.revenueSharePct.toFixed(1)}%`);
    } else {
        console.log(`No discovery produced (reason: ${result.reason}).`);
    }
};

// Cohort revenue is set up so ranking-by-revenue can never confuse groups:
// "top" customers earn far more in total than anyone else, "lookalike"
// customers share the top cohort's per-order ticket size (not their total
// revenue) but never buy the signature product, and "filler" customers sit
// at a distinctly different ticket size so they're correctly excluded from
// the lookalike band regardless of what they bought.
const createCustomerWithOrders = async ({ accountId, pointOfSaleId, name, email, orderCount, orderValue, productIds }) => {
    const customer = await prisma.customer.create({
        data: { name, email, phone: "3000000000", photo: "https://via.placeholder.com/150", createdById: accountId, pointOfSaleId },
    });
    for (let i = 0; i < orderCount; i++) {
        const productId = productIds[i % productIds.length];
        const orderDate = daysAgo(randomBetween(10, 300));
        await prisma.order.create({
            data: {
                customerId: customer.id,
                pointOfSaleId,
                orderDate,
                orderStatus: "completed",
                totalProducts: 1,
                subTotal: orderValue,
                total: orderValue,
                invoiceNo: `DEMO-LOOKALIKE-${customer.id}-${i}-${Math.floor(Math.random() * 1e6)}`,
                createdById: accountId,
                orderDetails: { create: [{ productId, quantity: 1, unitcost: orderValue, total: orderValue }] },
            },
        });
    }
    return customer;
};

const seedLookalikeDemoAccount = async () => {
    const account = await ensureDemoAccount(LOOKALIKE_DEMO_EMAIL, LOOKALIKE_DEMO_USERNAME);
    await ensureDefaultChartOfAccounts(prisma, account.id);
    const pointOfSale = await ensurePointOfSale(account.id);
    const { category, unit } = await ensureCategoryAndUnit(account.id);
    const productEstrella = await ensureNamedProduct(account.id, category.id, unit.id, "Producto Estrella", "DEMO-ESTRELLA");
    const productBasico = await ensureNamedProduct(account.id, category.id, unit.id, "Producto Básico", "DEMO-BASICO");

    // Re-runnable: wipe this account's prior seeded customers/orders (same
    // pattern as the churn demo).
    const priorCustomers = await prisma.customer.findMany({ where: { createdById: account.id }, select: { id: true } });
    const priorCustomerIds = priorCustomers.map((c) => c.id);
    if (priorCustomerIds.length) {
        const priorOrders = await prisma.order.findMany({ where: { customerId: { in: priorCustomerIds } }, select: { id: true } });
        const priorOrderIds = priorOrders.map((o) => o.id);
        if (priorOrderIds.length) {
            await prisma.orderDetail.deleteMany({ where: { orderId: { in: priorOrderIds } } });
            await prisma.order.deleteMany({ where: { id: { in: priorOrderIds } } });
        }
        await prisma.customer.deleteMany({ where: { id: { in: priorCustomerIds } } });
    }

    const specs = [];
    // 8 top-revenue customers (6 orders x 800k = 4.8M each) - 7 buy the
    // signature product, 1 doesn't, so top coverage lands at 87.5% rather
    // than a suspiciously-clean 100%.
    for (let i = 1; i <= 7; i++) {
        specs.push({ name: `Cliente Top ${i}`, email: `cliente-top-${i}@ohnix.local`, orderCount: 6, orderValue: 800_000, productIds: [productEstrella.id] });
    }
    specs.push({ name: "Cliente Top 8", email: "cliente-top-8@ohnix.local", orderCount: 6, orderValue: 800_000, productIds: [productBasico.id] });
    // 15 lookalikes: same ~800k ticket size as the top cohort, never buy
    // the signature product.
    for (let i = 1; i <= 15; i++) {
        specs.push({
            name: `Cliente Lookalike ${i}`,
            email: `cliente-lookalike-${i}@ohnix.local`,
            orderCount: 3,
            orderValue: randomBetween(500_000, 700_000),
            productIds: [productBasico.id],
        });
    }
    // 3 low-ticket customers who DO buy the signature product - gives it
    // some non-top coverage so the lift calculation reflects a real ratio
    // instead of an artificial 0%.
    for (let i = 1; i <= 3; i++) {
        specs.push({ name: `Cliente Ocasional Estrella ${i}`, email: `cliente-ocasional-${i}@ohnix.local`, orderCount: 2, orderValue: 150_000, productIds: [productEstrella.id] });
    }
    // 14 low-ticket filler customers - a clearly different spending profile
    // from the top cohort, so they're correctly excluded from the
    // lookalike band regardless of what they bought.
    for (let i = 1; i <= 14; i++) {
        specs.push({ name: `Cliente Filler ${i}`, email: `cliente-filler-${i}@ohnix.local`, orderCount: 2, orderValue: 100_000, productIds: [productBasico.id] });
    }

    for (const spec of specs) {
        await createCustomerWithOrders({ accountId: account.id, pointOfSaleId: pointOfSale.id, ...spec });
    }

    console.log(`\n=== Synthetic lookalike-opportunity demo account (${LOOKALIKE_DEMO_EMAIL}) ===`);
    const result = await runCustomerProductLookalikeDetector({ accountId: account.id });
    if (result.discovery) {
        console.log(`Discovery ${result.created ? "created" : "updated"}: "${result.discovery.title}"`);
        console.log(`  priority_score=${result.discovery.priorityScore} confidence=${result.discovery.confidence}`);
        console.log(`  top_customers=${result.topCustomers.length} lookalikes=${result.lookalikes.length} lift=${result.bestCandidate.lift.toFixed(2)}`);
    } else {
        console.log(`No discovery produced (reason: ${result.reason}).`);
    }
};

// Days-ago -> Date, matching the detector's own WINDOW_DAYS=120 boundary
// (recent = last 120 days, prior = the 120 days before that).
const daysAgoPurchase = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const createCompletedPurchase = async ({ accountId, pointOfSaleId, supplierId, productId, dueDaysAgo, delayDays }) => {
    const dueDate = daysAgoPurchase(dueDaysAgo);
    const receivedAt = new Date(dueDate.getTime() + delayDays * 24 * 60 * 60 * 1000);
    const total = randomBetween(200_000, 400_000);

    const purchase = await prisma.purchase.create({
        data: {
            purchaseDate: dueDate,
            dueDate,
            purchaseNo: `DEMO-PO-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
            supplierId,
            pointOfSaleId,
            purchaseStatus: "completed",
            createdById: accountId,
            purchaseDetails: { create: [{ productId, quantity: 10, unitcost: total / 10, total }] },
        },
    });
    await backdatePurchaseUpdatedAt(purchase.id, receivedAt);
    return purchase;
};

const seedSupplierDelayDemoAccount = async () => {
    const account = await ensureDemoAccount(SUPPLIER_DEMO_EMAIL, SUPPLIER_DEMO_USERNAME);
    const pointOfSale = await ensurePointOfSale(account.id);
    const { category, unit } = await ensureCategoryAndUnit(account.id);
    const supplier = await ensureNamedSupplier(account.id, pointOfSale.id, "Proveedor Lento", "proveedor-lento@ohnix.local");
    const productA = await ensureNamedProduct(account.id, category.id, unit.id, "Producto Proveedor Lento A", "DEMO-SUPPLIER-A");
    const productB = await ensureNamedProduct(account.id, category.id, unit.id, "Producto Proveedor Lento B", "DEMO-SUPPLIER-B");
    const controlProduct = await ensureNamedProduct(account.id, category.id, unit.id, "Producto Control", "DEMO-SUPPLIER-CONTROL");

    // Re-runnable: wipe this account's prior seeded customers/orders and
    // this supplier's purchases (order matters - child rows before parents).
    const priorCustomers = await prisma.customer.findMany({ where: { createdById: account.id }, select: { id: true } });
    const priorCustomerIds = priorCustomers.map((c) => c.id);
    if (priorCustomerIds.length) {
        const priorOrders = await prisma.order.findMany({ where: { customerId: { in: priorCustomerIds } }, select: { id: true } });
        const priorOrderIds = priorOrders.map((o) => o.id);
        if (priorOrderIds.length) {
            await prisma.orderDetail.deleteMany({ where: { orderId: { in: priorOrderIds } } });
            await prisma.order.deleteMany({ where: { id: { in: priorOrderIds } } });
        }
        await prisma.customer.deleteMany({ where: { id: { in: priorCustomerIds } } });
    }
    const priorPurchases = await prisma.purchase.findMany({ where: { supplierId: supplier.id }, select: { id: true } });
    if (priorPurchases.length) {
        const priorPurchaseIds = priorPurchases.map((p) => p.id);
        await prisma.purchaseDetail.deleteMany({ where: { purchaseId: { in: priorPurchaseIds } } });
        await prisma.purchase.deleteMany({ where: { id: { in: priorPurchaseIds } } });
    }

    // Supplier: on-time-ish in the prior window (~1-2 days late), then
    // consistently ~12-15 days late in the recent window.
    for (const dueDaysAgo of [230, 200, 170]) {
        await createCompletedPurchase({ accountId: account.id, pointOfSaleId: pointOfSale.id, supplierId: supplier.id, productId: productA.id, dueDaysAgo, delayDays: randomBetween(1, 2) });
    }
    for (const dueDaysAgo of [100, 70, 40]) {
        await createCompletedPurchase({ accountId: account.id, pointOfSaleId: pointOfSale.id, supplierId: supplier.id, productId: productB.id, dueDaysAgo, delayDays: randomBetween(12, 15) });
    }

    const createCustomerWithOrder = async (name, email, productId, orderDaysAgo) => {
        const customer = await prisma.customer.create({
            data: { name, email, phone: "3000000000", photo: "https://via.placeholder.com/150", createdById: account.id, pointOfSaleId: pointOfSale.id },
        });
        const total = randomBetween(80_000, 200_000);
        await prisma.order.create({
            data: {
                customerId: customer.id,
                pointOfSaleId: pointOfSale.id,
                orderDate: daysAgoPurchase(orderDaysAgo),
                orderStatus: "completed",
                totalProducts: 1,
                subTotal: total,
                total,
                invoiceNo: `DEMO-SUPPLIER-ORD-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
                createdById: account.id,
                orderDetails: { create: [{ productId, quantity: 1, unitcost: total, total }] },
            },
        });
        return customer;
    };

    // 10 customers of this supplier's products bought in the prior window
    // (150 days ago); only half reorder in the recent window (30 days ago) -
    // the other half "go quiet". Products A and B are used interchangeably
    // since the detector groups by supplier, not by individual product.
    for (let i = 1; i <= 10; i++) {
        const productId = i % 2 === 0 ? productA.id : productB.id;
        const customer = await createCustomerWithOrder(`Cliente Afectado ${i}`, `cliente-afectado-${i}@ohnix.local`, productId, 150);
        if (i <= 5) {
            await prisma.order.create({
                data: {
                    customerId: customer.id,
                    pointOfSaleId: pointOfSale.id,
                    orderDate: daysAgoPurchase(30),
                    orderStatus: "completed",
                    totalProducts: 1,
                    subTotal: 120_000,
                    total: 120_000,
                    invoiceNo: `DEMO-SUPPLIER-ORD-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
                    createdById: account.id,
                    orderDetails: { create: [{ productId, quantity: 1, unitcost: 120_000, total: 120_000 }] },
                },
            });
        }
    }

    // 20 control customers, same prior/recent window shape, buying a
    // product from no particular flagged supplier - only a small,
    // "ordinary" fraction (3/20) fail to reorder, the baseline the
    // treatment group above is measured against.
    for (let i = 1; i <= 20; i++) {
        const customer = await createCustomerWithOrder(`Cliente Control ${i}`, `cliente-control-${i}@ohnix.local`, controlProduct.id, 150);
        if (i <= 17) {
            await prisma.order.create({
                data: {
                    customerId: customer.id,
                    pointOfSaleId: pointOfSale.id,
                    orderDate: daysAgoPurchase(30),
                    orderStatus: "completed",
                    totalProducts: 1,
                    subTotal: 90_000,
                    total: 90_000,
                    invoiceNo: `DEMO-SUPPLIER-ORD-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
                    createdById: account.id,
                    orderDetails: { create: [{ productId: controlProduct.id, quantity: 1, unitcost: 90_000, total: 90_000 }] },
                },
            });
        }
    }

    console.log(`\n=== Synthetic supplier-delay demo account (${SUPPLIER_DEMO_EMAIL}) ===`);
    const result = await runSupplierDelayConnectionDetector({ accountId: account.id });
    if (result.discovery) {
        console.log(`Discovery ${result.created ? "created" : "updated"}: "${result.discovery.title}"`);
        console.log(`  priority_score=${result.discovery.priorityScore} confidence=${result.discovery.confidence}`);
    } else {
        console.log(`No discovery produced (reason: ${result.reason}).`);
    }
};

// Oldest -> newest month index (0 = 14 months ago, 14 = last month) - the
// last 3 count as "recent" by trajectoryShift.detector.js's own
// RECENT_MONTHS, the other 12 are its baseline history.
const shuffleSample = (pool, count) => [...pool].sort(() => Math.random() - 0.5).slice(0, count);

const seedTrajectoryShiftDemoAccount = async () => {
    const account = await ensureDemoAccount(TRAJECTORY_DEMO_EMAIL, TRAJECTORY_DEMO_USERNAME);
    const pointOfSale = await ensurePointOfSale(account.id);
    const { category, unit } = await ensureCategoryAndUnit(account.id);
    const product = await ensureProduct(account.id, category.id, unit.id);

    const priorCustomers = await prisma.customer.findMany({ where: { createdById: account.id }, select: { id: true } });
    const priorCustomerIds = priorCustomers.map((c) => c.id);
    if (priorCustomerIds.length) {
        const priorOrders = await prisma.order.findMany({ where: { customerId: { in: priorCustomerIds } }, select: { id: true } });
        const priorOrderIds = priorOrders.map((o) => o.id);
        if (priorOrderIds.length) {
            await prisma.orderDetail.deleteMany({ where: { orderId: { in: priorOrderIds } } });
            await prisma.order.deleteMany({ where: { id: { in: priorOrderIds } } });
        }
        await prisma.customer.deleteMany({ where: { id: { in: priorCustomerIds } } });
    }

    const pool = [];
    for (let i = 1; i <= 50; i++) {
        pool.push(
            await prisma.customer.create({
                data: {
                    name: `Cliente Trayectoria ${i}`,
                    email: `cliente-trayectoria-${i}@ohnix.local`,
                    phone: "3000000000",
                    photo: "https://via.placeholder.com/150",
                    createdById: account.id,
                    pointOfSaleId: pointOfSale.id,
                },
            })
        );
    }

    // 12 months of ~15 active customers/month, then the last 3 months
    // almost triple to ~40 - a real, sustained shift in how many distinct
    // customers buy each month, not a single lucky day. Dates are placed
    // within the actual calendar month (via monthStart, not a fixed 30-day
    // offset) so they land in the same buckets trajectoryShift.detector.js
    // itself groups by (monthKey buckets by real calendar month, and 30-day
    // blocks drift out of alignment with that within a handful of months).
    const anchor = new Date();
    for (let monthsAgo = 14; monthsAgo >= 0; monthsAgo--) {
        const isRecent = monthsAgo < 3;
        const activeCount = isRecent ? randomBetween(35, 45) : randomBetween(12, 18);
        const customers = shuffleSample(pool, activeCount);
        const monthFirstDay = monthStart(monthsAgo, anchor);
        // Month 0 is the current, still-in-progress calendar month - cap the
        // day so no order lands in the future relative to the real today.
        const maxDay = monthsAgo === 0 ? Math.max(1, anchor.getUTCDate() - 1) : 25;
        for (const customer of customers) {
            const day = randomBetween(1, maxDay);
            const orderDate = new Date(Date.UTC(monthFirstDay.getUTCFullYear(), monthFirstDay.getUTCMonth(), day));
            const total = randomBetween(100_000, 300_000);
            await prisma.order.create({
                data: {
                    customerId: customer.id,
                    pointOfSaleId: pointOfSale.id,
                    orderDate,
                    orderStatus: "completed",
                    totalProducts: 1,
                    subTotal: total,
                    total,
                    invoiceNo: `DEMO-TRAJECTORY-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
                    createdById: account.id,
                    orderDetails: { create: [{ productId: product.id, quantity: 1, unitcost: total, total }] },
                },
            });
        }
    }

    console.log(`\n=== Synthetic trajectory-shift demo account (${TRAJECTORY_DEMO_EMAIL}) ===`);
    const result = await runTrajectoryShiftDetector({ accountId: account.id });
    if (result.discoveries?.length) {
        for (const outcome of result.discoveries) {
            console.log(`Discovery ${outcome.created ? "created" : "updated"}: "${outcome.discovery.title}"`);
            console.log(`  priority_score=${outcome.discovery.priorityScore} confidence=${outcome.discovery.confidence}`);
        }
    } else {
        console.log(`No discovery produced (reason: ${result.reason}).`);
    }
};

// createdById/pointOfSaleId etc. are the same helpers used by the other
// demos - only the channel/return-status shape here is specific to this
// detector. Returns are spaced deterministically (not per-order coin
// flips) so the day-of-week distribution stays close to uniform within
// each channel and the only dimension that clears the bar is the one this
// demo is built to demonstrate.
const seedNewPatternDemoAccount = async () => {
    const account = await ensureDemoAccount(PATTERN_DEMO_EMAIL, PATTERN_DEMO_USERNAME);
    const pointOfSale = await ensurePointOfSale(account.id);
    const { category, unit } = await ensureCategoryAndUnit(account.id);
    const product = await ensureProduct(account.id, category.id, unit.id);
    const customer = await ensureCustomer(account.id, pointOfSale.id);

    const priorOrders = await prisma.order.findMany({ where: { createdById: account.id }, select: { id: true } });
    const priorOrderIds = priorOrders.map((o) => o.id);
    if (priorOrderIds.length) {
        await prisma.orderDetail.deleteMany({ where: { orderId: { in: priorOrderIds } } });
        await prisma.order.deleteMany({ where: { id: { in: priorOrderIds } } });
    }

    const createOrdersForChannel = async (channel, count, returnEveryNth) => {
        for (let i = 0; i < count; i++) {
            const orderStatus = (i + 1) % returnEveryNth === 0 ? "returned" : "completed";
            const dayOffset = i % 60; // spreads orders evenly across ~2 months, day-of-week cycles evenly too
            const orderDate = new Date(Date.now() - dayOffset * 24 * 60 * 60 * 1000);
            const total = randomBetween(50_000, 150_000);
            await prisma.order.create({
                data: {
                    customerId: customer.id,
                    pointOfSaleId: pointOfSale.id,
                    orderDate,
                    orderStatus,
                    channel,
                    totalProducts: 1,
                    subTotal: total,
                    total,
                    invoiceNo: `DEMO-PATTERN-${channel}-${i}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
                    createdById: account.id,
                    orderDetails: { create: [{ productId: product.id, quantity: 1, unitcost: total, total }] },
                },
            });
        }
    };

    // ohnix: ~5% return rate (1 in 20). shopify: ~35% return rate (a bit
    // over 1 in 3) - the slice this demo is built to flag.
    await createOrdersForChannel("ohnix", 150, 20);
    await createOrdersForChannel("shopify", 60, 3);

    console.log(`\n=== Synthetic new-pattern demo account (${PATTERN_DEMO_EMAIL}) ===`);
    const result = await runNewPatternReturnRateDetector({ accountId: account.id });
    if (result.discoveries?.length) {
        for (const outcome of result.discoveries) {
            console.log(`Discovery ${outcome.created ? "created" : "updated"}: "${outcome.discovery.title}"`);
            console.log(`  priority_score=${outcome.discovery.priorityScore} confidence=${outcome.discovery.confidence}`);
        }
    } else {
        console.log(`No discovery produced (reason: ${result.reason}).`);
    }
};

// Two conditions whose INDIVIDUAL return rates are unremarkable (10%) but
// whose combination is not (80%) - the shape new_pattern_return_rate.detector.js
// (one dimension at a time) structurally cannot see, and the exact reason
// crossFactorCorrelation.detector.js exists. See its own header comment and
// test/crossFactorCorrelationDetector.test.js for the same fixture reasoning.
const seedCrossFactorDemoAccount = async () => {
    const account = await ensureDemoAccount(CROSS_FACTOR_DEMO_EMAIL, CROSS_FACTOR_DEMO_USERNAME);
    const pointOfSale = await ensurePointOfSale(account.id);
    const { category, unit } = await ensureCategoryAndUnit(account.id);
    const product = await ensureProduct(account.id, category.id, unit.id);

    const priorCustomers = await prisma.customer.findMany({ where: { createdById: account.id }, select: { id: true } });
    const priorCustomerIds = priorCustomers.map((c) => c.id);
    if (priorCustomerIds.length) {
        const priorOrders = await prisma.order.findMany({ where: { customerId: { in: priorCustomerIds } }, select: { id: true } });
        const priorOrderIds = priorOrders.map((o) => o.id);
        if (priorOrderIds.length) {
            await prisma.orderDetail.deleteMany({ where: { orderId: { in: priorOrderIds } } });
            await prisma.order.deleteMany({ where: { id: { in: priorOrderIds } } });
        }
        await prisma.customer.deleteMany({ where: { id: { in: priorCustomerIds } } });
    }

    const createOrdersForCombo = async (label, channel, customerType, count, returnedCount) => {
        const customer = await prisma.customer.create({
            data: {
                name: `Cliente Demo ${label}`,
                email: `cliente-demo-crossfactor-${label}@ohnix.local`,
                phone: "3000000000",
                photo: "https://via.placeholder.com/150",
                createdById: account.id,
                pointOfSaleId: pointOfSale.id,
                type: customerType,
            },
        });
        for (let i = 0; i < count; i++) {
            const orderStatus = i < returnedCount ? "returned" : "completed";
            const dayOffset = i % 80; // spreads orders across ~80 days so day_of_week never dominates
            const orderDate = new Date(Date.now() - dayOffset * 24 * 60 * 60 * 1000);
            const total = randomBetween(50_000, 150_000);
            await prisma.order.create({
                data: {
                    customerId: customer.id,
                    pointOfSaleId: pointOfSale.id,
                    orderDate,
                    orderStatus,
                    channel,
                    totalProducts: 1,
                    subTotal: total,
                    total,
                    invoiceNo: `DEMO-CROSSFACTOR-${label}-${i}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
                    createdById: account.id,
                    orderDetails: { create: [{ productId: product.id, quantity: 1, unitcost: total, total }] },
                },
            });
        }
    };

    // shopify + vip together: 80% returns - the real interaction.
    await createOrdersForCombo("shopify-vip", "shopify", "vip", 20, 16);
    // shopify alone (with regular customers): only 10% - channel isn't the story.
    await createOrdersForCombo("shopify-regular", "shopify", "regular", 20, 2);
    // vip alone (via ohnix channel): only 10% - customer_type isn't the story either.
    await createOrdersForCombo("ohnix-vip", "ohnix", "vip", 20, 2);
    // filler at the account's baseline rate.
    await createOrdersForCombo("ohnix-regular", "ohnix", "regular", 140, 8);

    console.log(`\n=== Synthetic cross-factor-correlation demo account (${CROSS_FACTOR_DEMO_EMAIL}) ===`);
    const result = await runCrossFactorCorrelationDetector({ accountId: account.id });
    if (result.discoveries?.length) {
        for (const outcome of result.discoveries) {
            console.log(`Discovery ${outcome.created ? "created" : "updated"}: "${outcome.discovery.title}"`);
            console.log(`  priority_score=${outcome.discovery.priorityScore} confidence=${outcome.discovery.confidence}`);
        }
    } else {
        console.log(`No discovery produced (reason: ${result.reason}).`);
    }
};

const DETECTORS = [
    { key: CASH_GAP_DETECTOR_KEY, run: runSalesVsCashGapDetector },
    { key: CHURN_DETECTOR_KEY, run: runCustomerChurnRiskDetector },
    { key: LOOKALIKE_DETECTOR_KEY, run: runCustomerProductLookalikeDetector },
    { key: SUPPLIER_DELAY_DETECTOR_KEY, run: runSupplierDelayConnectionDetector },
    { key: TRAJECTORY_SHIFT_DETECTOR_KEY, run: runTrajectoryShiftDetector },
    { key: NEW_PATTERN_DETECTOR_KEY, run: runNewPatternReturnRateDetector },
    { key: CROSS_FACTOR_DETECTOR_KEY, run: runCrossFactorCorrelationDetector },
];

const runAgainstRealAccounts = async () => {
    const demoAccounts = await prisma.user.findMany({
        where: { email: { in: [DEMO_EMAIL, CHURN_DEMO_EMAIL, LOOKALIKE_DEMO_EMAIL, SUPPLIER_DEMO_EMAIL, TRAJECTORY_DEMO_EMAIL, PATTERN_DEMO_EMAIL, CROSS_FACTOR_DEMO_EMAIL] } },
        select: { id: true },
    });
    const demoIds = new Set(demoAccounts.map((a) => a.id));
    const activeAccounts = await prisma.order.findMany({ distinct: ["createdById"], select: { createdById: true } });
    const realAccountIds = activeAccounts.map((r) => r.createdById).filter((id) => !demoIds.has(id));

    console.log(`\n=== Real accounts with Order history: ${realAccountIds.length} ===`);
    for (const accountId of realAccountIds) {
        for (const detector of DETECTORS) {
            const result = await detector.run({ accountId });
            if (result.discovery) {
                console.log(`[${accountId}] (${detector.key}) Discovery ${result.created ? "created" : "updated"}: "${result.discovery.title}" (priority ${result.discovery.priorityScore})`);
            } else {
                console.log(`[${accountId}] (${detector.key}) No discovery (${result.reason}).`);
            }
        }
    }
};

const run = async () => {
    try {
        await prisma.$connect();
        await seedDemoAccount();
        await seedChurnDemoAccount();
        await seedLookalikeDemoAccount();
        await seedSupplierDelayDemoAccount();
        await seedTrajectoryShiftDemoAccount();
        await seedNewPatternDemoAccount();
        await seedCrossFactorDemoAccount();
        await runAgainstRealAccounts();
    } catch (err) {
        console.error("Error running discovery demo seed:", err);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
};

run();
