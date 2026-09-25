import dotenv from "dotenv";
import http from "http";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import { initSocketServer } from "./live/socketServer.js";
import lowStockScheduler from "./utils/lowStockScheduler.js";
import renewalScheduler from "./utils/subscriptionRenewalScheduler.js";
import webhookRetryScheduler from "./utils/webhookRetryScheduler.js";
import warrantyNotificationRetryScheduler from "./utils/warrantyNotificationRetryScheduler.js";
import firmaPassValidationScheduler from "./utils/firmaPassValidationScheduler.js";
import recurringExpenseScheduler from "./utils/recurringExpenseScheduler.js";
import fixedAssetDepreciationScheduler from "./utils/fixedAssetDepreciationScheduler.js";
import prepaidExpenseScheduler from "./utils/prepaidExpenseScheduler.js";
import recurringJournalScheduler from "./utils/recurringJournalScheduler.js";
import receiptTacitaScheduler from "./utils/receiptTacitaScheduler.js";
import itcycleKeepAliveScheduler from "./utils/itcycleKeepAliveScheduler.js";
import discoveryScheduler from "./utils/discoveryScheduler.js";
import apiClientBillingScheduler from "./utils/apiClientBillingScheduler.js";
import { reconcileLegacyApprovedRequests, reconcileStuckPendingPayments } from "./utils/subscriptionReconcile.js";
import { reconcileStuckCertificateOrderPayments } from "./utils/certificateOrderReconcile.js";
import { reconcileOrphanedDianTestMatrixRuns } from "./services/dianTestMatrix.service.js";

dotenv.config({
    path: "./.env",
});

connectDB()
    .then(() => {
        const port = process.env.PORT || 3000;

        const runSubscriptionReconciliation = async () => {
            try {
                const result = await reconcileLegacyApprovedRequests();
                if (result.fixed > 0) {
                    console.log(
                        `🧹 Reconciled legacy upgrades: ${result.fixed} fixed out of ${result.checked} approved requests`
                    );
                }
            } catch (error) {
                console.error("❎ Subscription reconciliation failed", error);
            }

            try {
                const pendingResult = await reconcileStuckPendingPayments();
                if (pendingResult.resolved > 0) {
                    console.log(
                        `💳 Reconciled stuck payments: ${pendingResult.resolved} resolved out of ${pendingResult.checked} pending checkouts`
                    );
                }
            } catch (error) {
                console.error("❎ Pending payment reconciliation failed", error);
            }

            try {
                const certOrderResult = await reconcileStuckCertificateOrderPayments();
                if (certOrderResult.resolved > 0) {
                    console.log(
                        `📜 Reconciled stuck certificate orders: ${certOrderResult.resolved} resolved out of ${certOrderResult.checked} pending orders`
                    );
                }
            } catch (error) {
                console.error("❎ Certificate order reconciliation failed", error);
            }
        };

        runSubscriptionReconciliation();

        reconcileOrphanedDianTestMatrixRuns()
            .then(({ recovered }) => {
                if (recovered > 0) {
                    console.log(`🧾 Recovered ${recovered} DIAN test-matrix run(s) orphaned by the previous process`);
                }
            })
            .catch((error) => console.error("❎ DIAN test-matrix run reconciliation failed", error));

        const reconcileMinutes = Number(
            process.env.SUBSCRIPTION_RECONCILE_INTERVAL_MINUTES || 15
        );

        if (Number.isFinite(reconcileMinutes) && reconcileMinutes > 0) {
            setInterval(
                runSubscriptionReconciliation,
                reconcileMinutes * 60 * 1000
            );
        }

        const httpServer = http.createServer(app);
        initSocketServer(httpServer);

        httpServer.listen(port, () => {
            console.log(`✅ Server listening on http://localhost:${port}/`);
            console.log(`🔌 Socket.IO live collaboration ready at /api/v1/socket.io`);

            if (process.env.START_SCHEDULER !== "false") {
                console.log("🚀 Starting low stock alert scheduler...");
                lowStockScheduler.start();
                console.log("🔄 Starting subscription renewal scheduler...");
                renewalScheduler.start();
                console.log("🪝 Starting webhook retry scheduler...");
                webhookRetryScheduler.start();
                console.log("🔏 Starting FirmaPass validation check scheduler...");
                firmaPassValidationScheduler.start();
                console.log("🧾 Starting recurring expense scheduler...");
                recurringExpenseScheduler.start();
                console.log("🏢 Starting fixed asset depreciation scheduler...");
                fixedAssetDepreciationScheduler.start();
                console.log("🗓️ Starting prepaid expense amortization scheduler...");
                prepaidExpenseScheduler.start();
                console.log("🔁 Starting recurring journal scheduler...");
                recurringJournalScheduler.start();
                console.log("📜 Starting receipt tácita scheduler...");
                receiptTacitaScheduler.start();
                console.log("💤 Starting itcycle-api-dian keep-alive scheduler...");
                itcycleKeepAliveScheduler.start();
                console.log("🔎 Starting discovery engine scheduler...");
                discoveryScheduler.start();
                console.log("💳 Starting API client billing scheduler...");
                apiClientBillingScheduler.start();
                console.log("🛠️ Starting warranty notification retry scheduler...");
                warrantyNotificationRetryScheduler.start();
            }
        });
    })
    .catch((err) => {
        console.log("Database connection failed !!! ", err);
    });

// Graceful shutdown for local/node runtime.
process.on("SIGTERM", () => {
    console.log("🛑 SIGTERM received, stopping schedulers...");
    lowStockScheduler.stop();
    renewalScheduler.stop();
    webhookRetryScheduler.stop();
    firmaPassValidationScheduler.stop();
    recurringExpenseScheduler.stop();
    fixedAssetDepreciationScheduler.stop();
    prepaidExpenseScheduler.stop();
    recurringJournalScheduler.stop();
    receiptTacitaScheduler.stop();
    itcycleKeepAliveScheduler.stop();
    discoveryScheduler.stop();
    apiClientBillingScheduler.stop();
    warrantyNotificationRetryScheduler.stop();
    process.exit(0);
});

process.on("SIGINT", () => {
    console.log("🛑 SIGINT received, stopping schedulers...");
    lowStockScheduler.stop();
    renewalScheduler.stop();
    webhookRetryScheduler.stop();
    firmaPassValidationScheduler.stop();
    recurringExpenseScheduler.stop();
    fixedAssetDepreciationScheduler.stop();
    prepaidExpenseScheduler.stop();
    recurringJournalScheduler.stop();
    receiptTacitaScheduler.stop();
    itcycleKeepAliveScheduler.stop();
    discoveryScheduler.stop();
    apiClientBillingScheduler.stop();
    warrantyNotificationRetryScheduler.stop();
    process.exit(0);
});