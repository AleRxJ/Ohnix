import cron from "node-cron";
import { prisma } from "../db/prisma.js";
import transporter, { isMailConfigured } from "./nodemailer.js";
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

    // Shared HTML builder for both the real weekly report and the
    // self-test send below - `isSample` swaps in a banner + different
    // subject so a test email is never mistaken for a real report.
    // `locale` picks ES/EN copy and follows the same dark Ohnix-branded look
    // as sendRealtimeLowStockAlert below, instead of the old generic
    // light-theme template that never matched the app or the user's language.
    buildLowStockEmailHtml(username, lowStockProducts, { isSample = false, locale = "es" } = {}) {
        const isEN = `${locale || ""}`.toLowerCase().startsWith("en");
        const tr = {
            title: isEN ? (isSample ? "Test low stock alert" : "Weekly low stock report") : isSample ? "Alerta de stock bajo (prueba)" : "Reporte semanal de stock bajo",
            subtitle: isEN
                ? isSample
                    ? "Sent on demand to verify alert delivery"
                    : "Your automated weekly inventory alert"
                : isSample
                    ? "Enviado manualmente para verificar la entrega de alertas"
                    : "Tu alerta automática semanal de inventario",
            sampleBanner: isEN
                ? "This is a TEST email. Your account currently has no products below their stock alert threshold - the rows below are sample data used only to confirm delivery and formatting."
                : "Este es un correo de PRUEBA. Tu cuenta actualmente no tiene productos por debajo de su umbral de stock - las filas siguientes son datos de ejemplo, solo para confirmar la entrega y el formato.",
            intro: (count) =>
                isEN
                    ? `Hello <strong>${username}</strong>, here's your ${isSample ? "" : "weekly "}low stock report. The following <strong>${count}</strong> product${count === 1 ? "" : "s"} fell below the stock alert threshold:`
                    : `Hola <strong>${username}</strong>, este es tu reporte${isSample ? "" : " semanal"} de stock bajo. Los siguientes <strong>${count}</strong> producto${count === 1 ? "" : "s"} cayeron por debajo del umbral de alerta:`,
            colProduct: isEN ? "Product" : "Producto",
            colCode: isEN ? "Code" : "Código",
            colStock: isEN ? "Stock left" : "Stock restante",
            colCategory: isEN ? "Category" : "Categoría",
            tip: isEN
                ? "Take action now to prevent potential sales disruptions and ensure customer satisfaction."
                : "Actúa ahora para evitar interrupciones en tus ventas y mantener satisfechos a tus clientes.",
            cta: isEN ? "Restock now" : "Reabastecer ahora",
            footer: isEN
                ? isSample
                    ? "This test email does not affect the automated report sent every Monday at 9:00 AM."
                    : "This is an automated weekly report sent every Monday at 9:00 AM."
                : isSample
                    ? "Este correo de prueba no afecta el reporte automático que se envía cada lunes a las 9:00 AM."
                    : "Este es un reporte automático enviado cada lunes a las 9:00 AM.",
            na: isEN ? "N/A" : "N/D",
        };

        const rows = lowStockProducts
            .map(
                (product) => `
                <tr>
                    <td style="padding:12px 16px;color:#e5e7eb;font-weight:600;border-bottom:1px solid #1d2733;">${product.productName}</td>
                    <td style="padding:12px 16px;color:#9ca3af;font-family:monospace;border-bottom:1px solid #1d2733;">${product.productCode}</td>
                    <td style="padding:12px 16px;text-align:center;border-bottom:1px solid #1d2733;">
                        <span style="background:#450a0a;color:#fca5a5;font-weight:700;padding:3px 10px;border-radius:99px;font-size:13px;">${product.stock}</span>
                    </td>
                    <td style="padding:12px 16px;color:#9ca3af;border-bottom:1px solid #1d2733;">${product.category?.categoryName || tr.na}</td>
                </tr>`
            )
            .join("");

        const sampleBanner = isSample
            ? `<div style="background:linear-gradient(120deg,rgba(41,216,213,0.14),rgba(41,216,213,0.04));border:1px solid rgba(41,216,213,0.3);border-radius:8px;padding:14px 16px;margin:0 0 20px;">
                    <p style="color:#7ce7e4;font-size:13px;margin:0;font-weight:600;">${tr.sampleBanner}</p>
                </div>`
            : "";

        return `
            <!DOCTYPE html>
            <html lang="${isEN ? "en" : "es"}">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${tr.title}</title>
            </head>
            <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#050505;">
                <div style="max-width:640px;margin:20px auto;padding:24px;background:#0b0b0b;border:1px solid #1d2733;border-radius:12px;">
                    <div style="background:linear-gradient(120deg,rgba(41,216,213,0.16),rgba(41,216,213,0.04));border-bottom:1px solid #1d2733;padding:16px 0 14px;margin-bottom:20px;border-radius:8px 8px 0 0;">
                        <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#29D8D5;font-weight:700;margin-bottom:6px;padding-left:2px;">OHNIX</div>
                        <h1 style="color:#e5eef1;margin:0;padding-left:2px;font-size:22px;">${tr.title}</h1>
                        <p style="color:#8b98a0;margin:6px 0 0;padding-left:2px;font-size:13px;">${tr.subtitle}</p>
                    </div>

                    ${sampleBanner}

                    <p style="color:#e5e7eb;font-size:15px;line-height:1.6;margin:0 0 18px;">${tr.intro(lowStockProducts.length)}</p>

                    <table style="width:100%;border-collapse:collapse;border:1px solid #1d2733;border-radius:8px;overflow:hidden;">
                        <thead>
                            <tr style="background:#111827;">
                                <th style="padding:10px 16px;text-align:left;color:#29D8D5;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">${tr.colProduct}</th>
                                <th style="padding:10px 16px;text-align:left;color:#29D8D5;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">${tr.colCode}</th>
                                <th style="padding:10px 16px;text-align:center;color:#29D8D5;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">${tr.colStock}</th>
                                <th style="padding:10px 16px;text-align:left;color:#29D8D5;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">${tr.colCategory}</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>

                    <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:14px 16px;margin:20px 0;">
                        <p style="color:#fbbf24;font-size:13px;margin:0;font-weight:500;"><strong>${isEN ? "Tip" : "Consejo"}:</strong> ${tr.tip}</p>
                    </div>

                    <p style="text-align:center;margin:24px 0 8px;">
                        <a href="${process.env.FRONTEND_URL || ""}/products" target="_blank" style="background:#29D8D5;color:#021314;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;display:inline-block;">${tr.cta}</a>
                    </p>

                    <hr style="border:none;border-top:1px solid #1d2733;margin:20px 0;">
                    <p style="text-align:center;font-size:12px;color:#6b7280;margin:0 0 4px;">${tr.footer}</p>
                    <p style="text-align:center;font-size:12px;color:#6b7280;margin:0;">&copy; ${new Date().getFullYear()} Ohnix by iTCycle.</p>
                </div>
            </body>
            </html>
        `;
    }

    async getLowStockProductsForUser(userId) {
        const defaultThreshold = await getLowStockDefaultThreshold();

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
            (product) => product.stock < (product.lowStockThreshold ?? defaultThreshold)
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
                subject: isEN ? "Weekly Low Stock Alert - Action Required" : "Reporte semanal de stock bajo - Acción requerida",
                html: this.buildLowStockEmailHtml(username, lowStockProducts, { locale }),
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
                    ? (isEN ? "[TEST] Ohnix Low Stock Alert" : "[PRUEBA] Alerta de stock bajo Ohnix")
                    : (isEN ? "Weekly Low Stock Alert - Action Required" : "Reporte semanal de stock bajo - Acción requerida"),
                html: this.buildLowStockEmailHtml(username, products, { isSample, locale }),
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
            const isEN = `${locale || ""}`.toLowerCase().startsWith("en");
            const count = products.length;
            const subject = isEN
                ? `⚠️ Ohnix — Low stock detected (${count} product${count > 1 ? "s" : ""})`
                : `⚠️ Ohnix — Stock bajo detectado (${count} producto${count > 1 ? "s" : ""})`;
            const title = isEN ? "⚠️ Low stock alert" : "⚠️ Alerta de stock bajo";
            const intro = isEN
                ? `Hello <strong>${username}</strong>, the following products fell below the threshold after the last order:`
                : `Hola <strong>${username}</strong>, los siguientes productos quedaron por debajo del umbral tras el último pedido:`;
            const colProduct = isEN ? "Product" : "Producto";
            const colCode = isEN ? "Code" : "Código";
            const colStock = isEN ? "Current stock" : "Stock actual";
            const ctaLabel = isEN ? "Restock now" : "Reabastecer ahora";

            const rows = products.map((p) => `
                <tr>
                    <td style="padding:10px 14px;color:#e5e7eb;font-weight:600;border-bottom:1px solid #1d2733;">${p.productName}</td>
                    <td style="padding:10px 14px;color:#9ca3af;font-family:monospace;border-bottom:1px solid #1d2733;">${p.productCode}</td>
                    <td style="padding:10px 14px;text-align:center;border-bottom:1px solid #1d2733;">
                        <span style="background:#450a0a;color:#fca5a5;font-weight:700;padding:3px 10px;border-radius:99px;font-size:13px;">${p.stock}</span>
                    </td>
                </tr>`).join("");

            await transporter.sendMail({
                from: `Ohnix <${process.env.SENDER_EMAIL}>`,
                to: userEmail,
                subject,
                html: `
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#0b0b0b;border:1px solid #b91c1c;border-radius:12px;">
                        <div style="background:linear-gradient(120deg,rgba(185,28,28,0.2),rgba(41,216,213,0.06));border-bottom:1px solid #1d2733;padding:16px 0 14px;margin-bottom:18px;border-radius:8px 8px 0 0;">
                            <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#29D8D5;font-weight:700;margin-bottom:6px;">OHNIX</div>
                            <h2 style="color:#fca5a5;margin:0;font-size:20px;">${title}</h2>
                        </div>
                        <p style="color:#e5e7eb;font-size:15px;line-height:1.6;margin:0 0 18px;">${intro}</p>
                        <table style="width:100%;border-collapse:collapse;border:1px solid #1d2733;border-radius:8px;overflow:hidden;">
                            <thead><tr style="background:#111827;">
                                <th style="padding:10px 14px;text-align:left;color:#29D8D5;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">${colProduct}</th>
                                <th style="padding:10px 14px;text-align:left;color:#29D8D5;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">${colCode}</th>
                                <th style="padding:10px 14px;text-align:center;color:#29D8D5;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">${colStock}</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                        <p style="text-align:center;margin:24px 0 8px;">
                            <a href="${process.env.FRONTEND_URL || ""}/products" style="background:#29D8D5;color:#021314;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">${ctaLabel}</a>
                        </p>
                        <hr style="border:none;border-top:1px solid #1d2733;margin:20px 0;">
                        <p style="text-align:center;font-size:12px;color:#6b7280;">&copy; ${new Date().getFullYear()} Ohnix by iTCycle.</p>
                    </div>
                `,
            });
        } catch (err) {
            console.error(`[realtime-low-stock] Failed for ${userEmail}:`, err?.message);
        }
    }
};

export default lowStockScheduler;
