// Backend/utils/apiClientBillingScheduler.js
//
// Monthly, 1st of the month: for every ExternalApiClient enrolled in
// automatic billing (epaycoCustomerId set, see externalApiClient.service.js
// #completeBillingEnrollment), charges the $310.000/year base package once
// per annual period, then charges last month's document overage beyond the
// included allowance at the published tiered per-document rate (see
// FacturacionSinInventario.jsx - $95/$85/$75 COP depending on cumulative
// annual volume). Every charge attempt (success or failure) is logged to
// ExternalApiClientCharge; a failed charge sets billingAtRisk so this
// scheduler skips that client on future runs until an admin investigates -
// no automatic retry, this is real money and a silent retry loop is worse
// than a stalled, visibly-flagged account.
//
// Same one-file-per-job cron pattern as discoveryScheduler.js in this same
// directory - read that file for the class shape this mirrors.

import cron from "node-cron";
import { prisma } from "../db/prisma.js";
import { getItcycleCompanyUsage } from "../services/itcycleDian.service.js";
import { chargeExternalApiClient } from "../services/epaycoRecurringBilling.service.js";

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

// The exact published rates from FacturacionSinInventario.jsx - do not
// change these here without updating that page too, they must always agree.
const rateForCumulativeVolume = (docsUsedAfter) => {
    if (docsUsedAfter <= 10000) return 95;
    if (docsUsedAfter <= 50000) return 85;
    return 75;
};

// Exported standalone so a manual /scheduler run-now route (mirroring
// discoveryScheduler's own runNow()) and the cron tick share one
// implementation, same convention as runDiscoveryEngineOnce.
export const runApiClientBillingOnce = async () => {
    const now = new Date();
    // "Last month" relative to a run that always happens on the 1st -
    // unambiguous either way, but computed from `now` rather than hardcoding
    // an offset so a manual/late run-now still bills the right period.
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const usageYear = lastMonthDate.getFullYear();
    const usageMonth = lastMonthDate.getMonth() + 1;

    const clients = await prisma.externalApiClient.findMany({
        where: { epaycoCustomerId: { not: null }, billingAtRisk: false },
    });

    let annualCharged = 0;
    let overageCharged = 0;
    let failed = 0;
    let skipped = 0;

    for (const client of clients) {
        try {
            const needsAnnualCharge = !client.annualPeriodStartsAt || client.annualPeriodEndsAt < now;

            if (needsAnnualCharge) {
                const result = await chargeExternalApiClient({
                    client,
                    amountCop: client.annualBaseAmountCop,
                    description: `Ohnix API DIAN - paquete anual (${client.annualDocsIncluded} documentos)`,
                    billReference: `OHNIX-API-${client.id}-ANNUAL-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`,
                });

                await prisma.externalApiClientCharge.create({
                    data: {
                        externalApiClientId: client.id,
                        chargeType: "annual_base",
                        periodYear: now.getFullYear(),
                        periodMonth: null,
                        documentsCharged: null,
                        amountCop: client.annualBaseAmountCop,
                        epaycoRef: result.ref,
                        status: result.success ? "success" : "failed",
                        errorMessage: result.success ? null : JSON.stringify(result.raw).slice(0, 2000),
                    },
                });

                if (!result.success) {
                    failed += 1;
                    await prisma.externalApiClient.update({
                        where: { id: client.id },
                        data: { billingAtRisk: true },
                    });
                    // The annual charge failing is the more urgent signal -
                    // skip this month's overage charge for this client
                    // entirely rather than compounding a failed-payment
                    // account with a second charge attempt in the same run.
                    continue;
                }

                annualCharged += 1;
                await prisma.externalApiClient.update({
                    where: { id: client.id },
                    data: {
                        annualPeriodStartsAt: now,
                        annualPeriodEndsAt: new Date(now.getTime() + MS_PER_YEAR),
                        cumulativeDocsThisPeriod: 0,
                    },
                });
                // Re-read below with a fresh cumulativeDocsThisPeriod of 0,
                // rather than relying on the pre-update `client` object.
                client.cumulativeDocsThisPeriod = 0;
            }

            const usage = await getItcycleCompanyUsage({ companyId: client.itcycleCompanyId, year: usageYear, month: usageMonth });
            const monthlyDocs = usage?.total || 0;

            const docsUsedBefore = client.cumulativeDocsThisPeriod;
            const docsUsedAfter = docsUsedBefore + monthlyDocs;
            const billableDocs = Math.max(0, docsUsedAfter - Math.max(client.annualDocsIncluded, docsUsedBefore));

            if (billableDocs > 0) {
                const rate = rateForCumulativeVolume(docsUsedAfter);
                const amountCop = billableDocs * rate;

                const result = await chargeExternalApiClient({
                    client,
                    amountCop,
                    description: `Ohnix API DIAN - ${billableDocs} documento(s) adicionales (${usageMonth}/${usageYear})`,
                    billReference: `OHNIX-API-${client.id}-${usageYear}${String(usageMonth).padStart(2, "0")}`,
                });

                await prisma.externalApiClientCharge.create({
                    data: {
                        externalApiClientId: client.id,
                        chargeType: "monthly_overage",
                        periodYear: usageYear,
                        periodMonth: usageMonth,
                        documentsCharged: billableDocs,
                        amountCop,
                        epaycoRef: result.ref,
                        status: result.success ? "success" : "failed",
                        errorMessage: result.success ? null : JSON.stringify(result.raw).slice(0, 2000),
                    },
                });

                if (result.success) {
                    overageCharged += 1;
                } else {
                    failed += 1;
                    await prisma.externalApiClient.update({
                        where: { id: client.id },
                        data: { billingAtRisk: true },
                    });
                }
            } else {
                skipped += 1;
            }

            // Advance the cumulative counter regardless of whether a charge
            // was needed this month, so future months' tier/overage math
            // (which reads client.cumulativeDocsThisPeriod on the NEXT run)
            // stays correct even in a $0 month.
            await prisma.externalApiClient.update({
                where: { id: client.id },
                data: { cumulativeDocsThisPeriod: docsUsedAfter },
            });
        } catch (err) {
            // One client's unexpected failure must never stop the batch -
            // every other client still gets processed this run.
            failed += 1;
            console.error(`[api-client-billing] Unexpected error for client ${client.id}:`, err?.message);
            try {
                await prisma.externalApiClient.update({ where: { id: client.id }, data: { billingAtRisk: true } });
            } catch {
                // Best-effort - if even this write fails, the next run's
                // findMany still picks the client up (billingAtRisk stayed
                // false), which is the safer default over silently losing it.
            }
        }
    }

    return { clients: clients.length, annualCharged, overageCharged, failed, skipped };
};

class ApiClientBillingScheduler {
    constructor() {
        this.task = null;
        this.lastRunAt = null;
        this.lastResult = null;
    }

    async _runAndRecord() {
        try {
            const result = await runApiClientBillingOnce();
            this.lastRunAt = new Date();
            this.lastResult = result;
            return result;
        } catch (err) {
            this.lastRunAt = new Date();
            this.lastResult = { error: err?.message || String(err) };
            throw err;
        }
    }

    start() {
        if (this.task) return;

        const timezone = (() => {
            const tz = process.env.TIMEZONE || "America/Bogota";
            try {
                Intl.DateTimeFormat("en-US", { timeZone: tz });
                return tz;
            } catch {
                return "UTC";
            }
        })();

        // 06:00 on the 1st of each month.
        this.task = cron.schedule("0 6 1 * *", async () => {
            console.log("[api-client-billing] Running monthly billing...");
            try {
                const result = await this._runAndRecord();
                console.log(
                    `[api-client-billing] clients=${result.clients} annualCharged=${result.annualCharged} overageCharged=${result.overageCharged} skipped=${result.skipped} failed=${result.failed}`
                );
                if (result.failed > 0) {
                    console.error(`[api-client-billing] ${result.failed} charge(s) failed - see ExternalApiClientCharge rows / billingAtRisk clients.`);
                }
            } catch (err) {
                console.error("[api-client-billing] Error during monthly run:", err?.message);
            }
        }, { timezone });

        console.log(`[api-client-billing] Started. Runs monthly at 06:00 on the 1st (${timezone}).`);
    }

    stop() {
        if (this.task) {
            this.task.stop();
            this.task = null;
        }
    }

    async runNow() {
        return this._runAndRecord();
    }

    getStatus() {
        return {
            isRunning: Boolean(this.task),
            nextRun: this.task && typeof this.task.getNextRun === "function" ? this.task.getNextRun() : null,
            lastRunAt: this.lastRunAt,
            lastResult: this.lastResult,
        };
    }
}

export default new ApiClientBillingScheduler();
