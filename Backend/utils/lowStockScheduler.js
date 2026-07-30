import cron from "node-cron";
import { prisma } from "../db/prisma.js";
import transporter, { isMailConfigured } from "./nodemailer.js";

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
        this.threshold = 10;
        this.isRunning = false;
    }

    async sendUserLowStockAlert(userId, userEmail, username) {
        if (!isMailConfigured()) {
            console.warn(`[low-stock-alert] Skipped for ${username}: mail not configured (check info@itcycle.co / SENDER_PASSWORD env vars).`);
            return { sent: false, reason: "mail_not_configured" };
        }
        try {
            const lowStockProducts = await prisma.product.findMany({
                where: {
                    createdById: userId,
                    stock: { lt: this.threshold },
                },
                select: {
                    productName: true,
                    productCode: true,
                    stock: true,
                    category: {
                        select: {
                            categoryName: true,
                        },
                    },
                },
                orderBy: { stock: "asc" },
            });

            if (lowStockProducts.length === 0) {
                console.log(`No low stock products found for user: ${username}`);
                return { sent: false, reason: "no_low_stock", count: 0 };
            }

            const productsTable = lowStockProducts
                .map((product, index) => {
                    const backgroundColor =
                        index % 2 === 0 ? "#ffffff" : "#f8fafc";
                    return `
                        <tr style="background-color: ${backgroundColor};">
                            <td style="padding: 14px 16px; color: #1e293b; font-weight: 600; font-size: 15px;">${product.productName}</td>
                            <td style="padding: 14px 16px; color: #475569; font-family: monospace;">${product.productCode}</td>
                            <td style="padding: 14px 16px;">
                                <span style="background-color: #fee2e2; color: #b91c1c; font-weight: 700; padding: 4px 10px; border-radius: 9999px; font-size: 14px;">
                                    ${product.stock}
                                </span>
                            </td>
                            <td style="padding: 14px 16px; color: #475569;">${product.category?.categoryName || "N/A"}</td>
                        </tr>
                    `;
                })
                .join("");

            const mailOptions = {
                from: `Ohnix by iTCycle <${process.env.info@itcycle.co}>`,
                to: userEmail,
                subject: "Weekly Low Stock Alert - Action Required",
                html: `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Weekly Low Stock Alert</title>
                </head>
                <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f8fa;">
                    <span style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
                        Your weekly inventory report: ${lowStockProducts.length} products need restocking.
                    </span>

                    <div style="max-width: 640px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
                        <div style="padding: 32px;">
                            <h1 style="font-size: 28px; font-weight: 800; color: #111827; margin: 0 0 4px 0;">
                                Weekly Low Stock Report
                            </h1>
                            <p style="font-size: 16px; color: #4b5563; margin: 0 0 24px 0;">
                                Your automated weekly inventory alert
                            </p>

                            <p style="font-size: 16px; color: #374151; line-height: 1.6; margin-bottom: 24px;">
                                Hello <strong>${username}</strong>, here's your weekly low stock report. The following <strong>${lowStockProducts.length}</strong> products have fallen below the stock threshold of ${this.threshold} units:
                            </p>

                            <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                                    <thead>
                                        <tr style="background-color: #f9fafb;">
                                            <th style="padding: 12px 16px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Product</th>
                                            <th style="padding: 12px 16px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Code</th>
                                            <th style="padding: 12px 16px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Stock Left</th>
                                            <th style="padding: 12px 16px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Category</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${productsTable}
                                    </tbody>
                                </table>
                            </div>

                            <div style="background-color: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 16px; margin: 24px 0;">
                                <p style="color: #92400e; font-size: 14px; margin: 0; font-weight: 500;">
                                    <strong>Tip:</strong> Take action now to prevent potential sales disruptions and ensure customer satisfaction.
                                </p>
                            </div>

                            <p style="text-align: center; margin: 32px 0;">
                                <a href="${process.env.FRONTEND_URL}/products" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; background-color: #3b82f6; border-radius: 8px; text-decoration: none; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                    Restock Items Now
                                </a>
                            </p>
                        </div>

                        <div style="padding: 24px; background-color: #f8fafc; border-top: 1px solid #e5e7eb; text-align: center;">
                            <p style="font-size: 14px; color: #6b7280; margin: 0 0 8px 0;">
                                This is an automated weekly report sent every Monday at 9:00 AM.
                            </p>
                            <p style="font-size: 12px; color: #9ca3af; margin: 0;">
                                &copy; ${new Date().getFullYear()} Ohnix by iTCycle. All Rights Reserved.
                            </p>
                        </div>
                    </div>
                </body>
                </html>
            `,
            };

            await transporter.sendMail(mailOptions);
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

    async sendAllUsersLowStockAlerts() {
        try {
            console.log("Starting weekly low stock alert process...");

            // Only send email alerts to users on Negocio ($49) plan and above.
            // Starter ($19) plan does not include automatic email alerts.
            const users = await prisma.user.findMany({
                where: {
                    email: { not: "" },
                    subscription: {
                        status: "active",
                        plan: { not: "starter" },
                    },
                },
                select: {
                    id: true,
                    username: true,
                    email: true,
                },
            });

            if (users.length === 0) {
                console.log("No users with email addresses found");
                return { success: false, message: "No users with email found" };
            }

            const results = {
                total: users.length,
                sent: 0,
                failed: 0,
                noLowStock: 0,
                details: [],
            };

            for (const user of users) {
                const result = await this.sendUserLowStockAlert(
                    user.id,
                    user.email,
                    user.username
                );

                results.details.push({
                    userId: user.id,
                    username: user.username,
                    email: user.email,
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

    async triggerManually() {
        console.log("Manually triggering low stock alerts for testing...");
        return this.sendAllUsersLowStockAlerts();
    }

    setThreshold(newThreshold) {
        this.threshold = newThreshold;
        console.log(`Low stock threshold updated to: ${this.threshold}`);
    }

    getStatus() {
        const nextRun =
            this.cronJob && typeof this.cronJob.getNextRun === "function"
                ? this.cronJob.getNextRun()
                : this.cronJob && typeof this.cronJob.nextDate === "function"
                  ? this.cronJob.nextDate()
                  : null;

        return {
            isRunning: this.isRunning,
            threshold: this.threshold,
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
                from: `Ohnix <${process.env.info@itcycle.co}>`,
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
