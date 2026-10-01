import cron from "node-cron";
import { prisma } from "../db/prisma.js";
import transporter, { isMailConfigured } from "./nodemailer.js";
import { buildEmail, emailLinks } from "./emailTemplate.js";
import { getLowStockDefaultThreshold, setLowStockDefaultThreshold } from "./systemSettings.js";

const resolveTimezone = () => {
    const configuredTimezone = process.env.TIMEZONE || "Asia/Kolkata";
    try {
        Intl.DateTimeFormat("en-US", { timeZone: configuredTimezone });
        return configuredTimezone;
    } catch {
        console.warn(
            `Invalid TIMEZONE '${configuredTimezone}'. Falling back to UTC.`
        );
        return "UTC";
    }
};

class LowStockScheduler {
    constructor() {
        this.isRunning = false;
    }

    // Weekly report and self-test share one builder (shared Ohnix layout,
    // utils/emailTemplate.js). `isSample` adds a banner + test subject so a
    // test is never mistaken for a real report. Returns { html, text }.
    buildLowStockEmail(username, lowStockProducts, { isSample = false, locale = "es" } = {}) {
        const en = `${locale || ""}`.toLowerCase().startsWith("en");
        const count = lowStockProducts.length;
        const outOfStock = lowStockProducts.filter((p) => Number(p.stock) <= 0).length;
        return buildEmail({
            lang: en ? "en" : "es",
            category: en ? "Inventory" : "Inventario",
            tone: "warning",
            badge: isSample ? (en ? "Test" : "Prueba") : en ? "Low stock" : "Stock bajo",
            preheader: en
                ? `${count} product${count === 1 ? "" : "s"} below the alert threshold${outOfStock ? ` (${outOfStock} out of stock)` : ""}.`
                : `${count} producto${count === 1 ? "" : "s"} por debajo del umbral de alerta${outOfStock ? ` (${outOfStock} agotado${outOfStock === 1 ? "" : "s"})` : ""}.`,
            title: en ? (isSample ? "Test low stock alert" : "Your weekly low stock report") : isSample ? "Alerta de stock bajo de prueba" : "Tu reporte semanal de stock bajo",
            greeting: en ? `Hi ${username},` : `Hola ${username},`,
            intro: en
                ? `${count} product${count === 1 ? " is" : "s are"} below the alert threshold. Restock before they run out to avoid missing sales.`
                : `${count === 1 ? "Hay 1 producto" : `Hay ${count} productos`} por debajo del umbral de alerta. Reabastece antes de que se agoten para no perder ventas.`,
            blocks: [
                ...(isSample
                    ? [{
                          type: "alert",
                          tone: "info",
                          title: en ? "This is a test email" : "Este es un correo de prueba",
                          text: en
                              ? "Your account has no products below their threshold right now. The rows below are sample data, only to confirm delivery and formatting."
                              : "Tu cuenta no tiene productos por debajo de su umbral en este momento. Las filas son datos de ejemplo, solo para confirmar la entrega y el formato.",
                      }]
                    : []),
                {
                    type: "table",
                    columns: [
                        { label: en ? "Product" : "Producto" },
                        { label: en ? "Code" : "Código" },
                        { label: en ? "Category" : "Categoría" },
                        { label: en ? "Stock" : "Stock", align: "right" },
                    ],
                    rows: lowStockProducts.map((p) => [
                        { text: p.productName, bold: true },
                        { text: p.productCode || "—", color: "#8b98a0" },
                        { text: p.category?.categoryName || "—", color: "#8b98a0" },
                        Number(p.stock) <= 0
                            ? { text: en ? "Out" : "Agotado", color: "#fb7185", bold: true }
                            : { text: String(p.stock), color: "#f5a524", bold: true },
                    ]),
                },
            ],
            cta: { label: en ? "Review inventory" : "Revisar inventario", url: emailLinks.app("/products") },
            footnote: isSample
                ? en
                    ? "This test doesn't affect the automatic report sent every Monday at 9:00 a.m."
                    : "Esta prueba no afecta el reporte automático que se envía cada lunes a las 9:00 a. m."
                : en
                  ? "Sent automatically every Monday at 9:00 a.m."
                  : "Se envía automáticamente cada lunes a las 9:00 a. m.",
            reason: en
                ? "You get this because stock alerts are on for your Ohnix account."
                : "Recibes este correo porque las alertas de inventario están activas en tu cuenta de Ohnix.",
        });
    }
    async getLowStockProductsForUser(userId) {
        const platformDefaultThreshold = await getLowStockDefaultThreshold();

        // Three-level fallback: a product's own threshold wins if set,
        // otherwise the owning account's general threshold (Escala+ feature,
        // see subscription.controller.js#updateMyLowStockThreshold), and
        // only then the platform-wide admin default. `userId` here is always
        // the product OWNER's id (see getEligibleUsers' productOwnerId), so
        // one subscription lookup covers every product in this call.
        const subscription = await prisma.subscription.findUnique({
            where: { userId },
            select: { lowStockThreshold: true },
        });
        const accountThreshold = subscription?.lowStockThreshold ?? null;
        const effectiveDefaultThreshold = accountThreshold ?? platformDefaultThreshold;

        // Per-product thresholds (Escala+ feature) can't be expressed as a
        // single Prisma `where` comparison against a column, so fetch the
        // user's catalog and filter in JS - fine even at the largest plan's
        // 2,000-product cap, and this only runs once a week per user.
        const allProducts = await prisma.product.findMany({
            where: { createdById: userId },
            select: {
                productName: true,
                productCode: true,
                stock: true,
                lowStockThreshold: true,
                category: {
                    select: {
                        categoryName: true,
                    },
                },
            },
            orderBy: { stock: "asc" },
        });

        return allProducts.filter(
            (product) => product.stock < (product.lowStockThreshold ?? effectiveDefaultThreshold)
        );
    }

    async sendUserLowStockAlert(userId, userEmail, username, locale = "es") {
        if (!isMailConfigured()) {
            console.warn(`[low-stock-alert] Skipped for ${username}: mail not configured (check SENDER_EMAIL / SENDER_PASSWORD env vars).`);
            return { sent: false, reason: "mail_not_configured" };
        }
        try {
            const lowStockProducts = await this.getLowStockProductsForUser(userId);

            if (lowStockProducts.length === 0) {
                console.log(`No low stock products found for user: ${username}`);
                return { sent: false, reason: "no_low_stock", count: 0 };
            }

            const isEN = `${locale || ""}`.toLowerCase().startsWith("en");
            await transporter.sendMail({
                from: `Ohnix by iTCycle <${process.env.SENDER_EMAIL}>`,
                to: userEmail,
                subject: isEN ? "Your weekly low stock report" : "Tu reporte semanal de stock bajo",
                ...this.buildLowStockEmail(username, lowStockProducts, { locale }),
            });
            console.log(
                `Low stock alert sent to ${username} (${userEmail}) - ${lowStockProducts.length} products`
            );

            return {
                sent: true,
                count: lowStockProducts.length,
                email: userEmail,
                username,
            };
        } catch (error) {
            console.error(`Error sending low stock alert to ${username}:`, error);
            return {
                sent: false,
                reason: "email_error",
                error: error.message,
                email: userEmail,
                username,
            };
        }
    }

    // Always sends, unlike sendUserLowStockAlert - this exists purely so an
    // admin can confirm mail delivery/formatting works for THEIR OWN inbox
    // without depending on their own account having real low-stock products
    // (most admin accounts don't own any product catalog at all). Falls back
    // to 2 clearly-labeled sample rows when the account has nothing real to
    // report; uses the real data when it does.
    async sendSelfTestAlert(userId, userEmail, username, locale = "es") {
        if (!isMailConfigured()) {
            return { sent: false, reason: "mail_not_configured" };
        }
        try {
            const isEN = `${locale || ""}`.toLowerCase().startsWith("en");
            const realLowStock = await this.getLowStockProductsForUser(userId);
            const isSample = realLowStock.length === 0;
            const products = isSample
                ? [
                      { productName: isEN ? "Sample Product A" : "Producto de ejemplo A", productCode: "TEST-001", stock: 2, category: { categoryName: isEN ? "Test" : "Prueba" } },
                      { productName: isEN ? "Sample Product B" : "Producto de ejemplo B", productCode: "TEST-002", stock: 0, category: { categoryName: isEN ? "Test" : "Prueba" } },
                  ]
                : realLowStock;

            await transporter.sendMail({
                from: `Ohnix by iTCycle <${process.env.SENDER_EMAIL}>`,
                to: userEmail,
                subject: isSample
                    ? (isEN ? "[Test] Low stock alert" : "[Prueba] Alerta de stock bajo")
                    : (isEN ? "Your weekly low stock report" : "Tu reporte semanal de stock bajo"),
                ...this.buildLowStockEmail(username, products, { isSample, locale }),
            });
            console.log(`Self-test low stock alert sent to ${username} (${userEmail})${isSample ? " [sample data]" : ""}`);

            return { sent: true, isSample, count: products.length, email: userEmail, username };
        } catch (error) {
            console.error(`Error sending self-test low stock alert to ${username}:`, error);
            return { sent: false, reason: "email_error", error: error.message, email: userEmail, username };
        }
    }

    // Only send email alerts to accounts on Negocio ($49) plan and above.
    // Starter ($19) plan does not include automatic email alerts. An
    // account's Subscription always lives under the OWNER's user id (see
    // teamContext.js/ensureUserSubscription), so this starts from owners -
    // but a team member with products view/edit access cares about the same
    // shared inventory just as much, and used to get skipped entirely
    // because they have no Subscription row of their own to match on. Each
    // recipient keeps `productOwnerId` (whose catalog to check) separate
    // from their own `id`/`email` (who actually receives the email).
    async getEligibleUsers() {
        const owners = await prisma.user.findMany({
            where: {
                email: { not: "" },
                subscription: {
                    status: "active",
                    plan: { not: "starter" },
                },
            },
            select: { id: true, username: true, email: true, preferredLanguage: true },
        });

        const recipients = owners.map((o) => ({
            productOwnerId: o.id,
            username: o.username,
            email: o.email,
            locale: o.preferredLanguage,
        }));

        const ownerIds = owners.map((o) => o.id);
        if (ownerIds.length > 0) {
            const teamMembers = await prisma.teamMember.findMany({
                where: {
                    status: "active",
                    team: { ownerId: { in: ownerIds } },
                    role: {
                        permissions: {
                            some: { moduleKey: "products", level: { not: "none" } },
                        },
                    },
                },
                select: {
                    user: { select: { id: true, username: true, email: true, preferredLanguage: true } },
                    team: { select: { ownerId: true } },
                },
            });

            for (const tm of teamMembers) {
                if (tm.user.email) {
                    recipients.push({
                        productOwnerId: tm.team.ownerId,
                        username: tm.user.username,
                        email: tm.user.email,
                        locale: tm.user.preferredLanguage,
                    });
                }
            }
        }

        return recipients;
    }

    async sendAllUsersLowStockAlerts() {
        try {
            console.log("Starting weekly low stock alert process...");

            const recipients = await this.getEligibleUsers();

            if (recipients.length === 0) {
                console.log("No users with email addresses found");
                return { success: false, message: "No users with email found" };
            }

            const results = {
                total: recipients.length,
                sent: 0,
                failed: 0,
                noLowStock: 0,
                details: [],
            };

            for (const recipient of recipients) {
                const result = await this.sendUserLowStockAlert(
                    recipient.productOwnerId,
                    recipient.email,
                    recipient.username,
                    recipient.locale
                );

                results.details.push({
                    username: recipient.username,
                    email: recipient.email,
                    ...result,
                });

                if (result.sent) {
                    results.sent += 1;
                } else if (result.reason === "no_low_stock") {
                    results.noLowStock += 1;
                } else {
                    results.failed += 1;
                }

                await new Promise((resolve) => setTimeout(resolve, 1000));
            }

            console.log(`Low stock alert process completed: sent=${results.sent}, noLowStock=${results.noLowStock}, failed=${results.failed}, total=${results.total}`);

            return { success: true, results };
        } catch (error) {
            console.error("Error in low stock alert process:", error);
            return { success: false, error: error.message };
        }
    }

    start() {
        if (this.isRunning) {
            console.log("Low stock scheduler is already running");
            return;
        }

        this.cronJob = cron.schedule(
            "0 0 9 * * 1",
            async () => {
                console.log("Weekly low stock alert cron job triggered");
                await this.sendAllUsersLowStockAlerts();
            },
            {
                scheduled: false,
                timezone: resolveTimezone(),
            }
        );

        this.cronJob.start();
        this.isRunning = true;

        console.log(
            "Low stock alert scheduler started - will run every Monday at 9:00 AM"
        );
    }

    stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.isRunning = false;
            console.log("Low stock alert scheduler stopped");
        }
    }

    // Used to be "the test button" and the production cron job calling the
    // exact same function with no way to scope or preview it - an admin
    // clicking "trigger" always emailed every real eligible customer. Now:
    // - targetUserId: sends to that ONE account only, regardless of plan -
    //   a true test that never reaches another customer's inbox.
    // - no targetUserId, no confirm: dry run, just returns who WOULD get
    //   emailed so the admin can see the blast radius before committing.
    // - no targetUserId, confirm: true: the real mass send (unchanged
    //   behavior, now opt-in instead of one click away).
    async triggerManually({ targetUserId, confirm } = {}) {
        if (targetUserId) {
            const user = await prisma.user.findUnique({
                where: { id: targetUserId },
                select: { id: true, username: true, email: true, preferredLanguage: true },
            });

            if (!user || !user.email) {
                return { success: false, error: "User not found or has no email" };
            }

            console.log(`Manually triggering low stock alert test for a single account: ${user.username}`);
            const result = await this.sendUserLowStockAlert(user.id, user.email, user.username, user.preferredLanguage);

            return {
                success: true,
                results: {
                    total: 1,
                    sent: result.sent ? 1 : 0,
                    failed: result.sent || result.reason === "no_low_stock" ? 0 : 1,
                    noLowStock: result.reason === "no_low_stock" ? 1 : 0,
                    details: [{ userId: user.id, username: user.username, email: user.email, ...result }],
                },
            };
        }

        if (!confirm) {
            const users = await this.getEligibleUsers();
            return {
                success: true,
                dryRun: true,
                eligibleCount: users.length,
                message: "Dry run - pass confirm: true to actually send, or targetUserId to test a single account.",
            };
        }

        console.log("Manually triggering low stock alerts for ALL eligible accounts (confirmed)...");
        return this.sendAllUsersLowStockAlerts();
    }

    async setThreshold(newThreshold) {
        await setLowStockDefaultThreshold(newThreshold);
        console.log(`Low stock threshold updated to: ${newThreshold}`);
    }

    async getStatus() {
        const nextRun =
            this.cronJob && typeof this.cronJob.getNextRun === "function"
                ? this.cronJob.getNextRun()
                : this.cronJob && typeof this.cronJob.nextDate === "function"
                  ? this.cronJob.nextDate()
                  : null;

        return {
            isRunning: this.isRunning,
            threshold: await getLowStockDefaultThreshold(),
            nextRun,
        };
    }
}

const lowStockScheduler = new LowStockScheduler();

/**
 * Send a real-time low stock alert for products that fell below threshold after an order.
 * @param {Array<{productName, productCode, stock, userEmail, username, locale?}>} items
 */
export const sendRealtimeLowStockAlert = async (items) => {
    if (!isMailConfigured() || !items?.length) return;

    const byUser = items.reduce((acc, item) => {
        const key = item.userEmail;
        if (!acc[key]) acc[key] = { userEmail: item.userEmail, username: item.username, locale: item.locale, products: [] };
        acc[key].products.push(item);
        return acc;
    }, {});

    for (const { userEmail, username, locale, products } of Object.values(byUser)) {
        try {
            const en = `${locale || ""}`.toLowerCase().startsWith("en");
            const count = products.length;
            const outOfStock = products.filter((p) => Number(p.stock) <= 0).length;
            const subject = en
                ? `Low stock: ${count === 1 ? products[0].productName : `${count} products`} after your last sale`
                : `Stock bajo: ${count === 1 ? products[0].productName : `${count} productos`} tras tu última venta`;
            await transporter.sendMail({
                from: `Ohnix <${process.env.SENDER_EMAIL}>`,
                to: userEmail,
                subject,
                ...buildEmail({
                    lang: en ? "en" : "es",
                    category: en ? "Inventory" : "Inventario",
                    tone: outOfStock ? "danger" : "warning",
                    badge: outOfStock ? (en ? "Out of stock" : "Agotado") : en ? "Low stock" : "Stock bajo",
                    preheader: en ? `${count} product${count === 1 ? "" : "s"} fell below the alert threshold.` : `${count} producto${count === 1 ? "" : "s"} quedó por debajo del umbral de alerta.`,
                    title: en ? "Some products are running low" : "Tienes productos por agotarse",
                    greeting: en ? `Hi ${username},` : `Hola ${username},`,
                    intro: en
                        ? "After your last sale, these products fell below their alert threshold:"
                        : "Tras tu última venta, estos productos quedaron por debajo de su umbral de alerta:",
                    blocks: [
                        {
                            type: "table",
                            columns: [
                                { label: en ? "Product" : "Producto" },
                                { label: en ? "Code" : "Código" },
                                { label: en ? "Alert at" : "Alerta en", align: "right" },
                                { label: en ? "Stock" : "Stock", align: "right" },
                            ],
                            rows: products.map((p) => [
                                { text: p.productName, bold: true },
                                { text: p.productCode || "—", color: "#8b98a0" },
                                { text: p.threshold !== undefined && p.threshold !== null ? String(p.threshold) : "—", color: "#8b98a0" },
                                Number(p.stock) <= 0
                                    ? { text: en ? "Out" : "Agotado", color: "#fb7185", bold: true }
                                    : { text: String(p.stock), color: "#f5a524", bold: true },
                            ]),
                        },
                    ],
                    cta: { label: en ? "Review inventory" : "Revisar inventario", url: emailLinks.app("/products") },
                    secondaryCta: { label: en ? "Create a purchase" : "Registrar una compra", url: emailLinks.app("/purchases") },
                    reason: en
                        ? "You get this because stock alerts are on for your Ohnix account."
                        : "Recibes este correo porque las alertas de inventario están activas en tu cuenta de Ohnix.",
                }),
            });
        } catch (err) {
            console.error(`[realtime-low-stock] Failed for ${userEmail}:`, err?.message);
        }
    }
};

export default lowStockScheduler;
