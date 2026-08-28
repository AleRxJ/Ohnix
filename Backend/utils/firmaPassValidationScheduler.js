import cron from "node-cron";
import { prisma } from "../db/prisma.js";
import { isItcycleAdminConfigured } from "../services/itcycleDian.service.js";
import { listPendingFirmaPassValidations } from "../services/firmaPassProvisioning.service.js";
import { notifyAdminsNewFirmaPassValidations } from "./firmaPassNotifications.js";

// A client's certificate purchase (made on FirmaPass's own site with
// iTCycle's coupon) auto-attaches to iTCycle's FirmaPass "alianza" account,
// but nothing pushes that fact to Ohnix - see
// Backend/services/firmaPassProvisioning.service.js. This periodically pulls
// the alliance's validation list and emails admins about any validation
// still awaiting action (estado p/pvi) it hasn't already alerted on -
// tracked via FirmaPassValidationAlert so the same one is never re-notified.
const ACTIONABLE_STATES = new Set(["p", "pvi"]);

export const checkForNewFirmaPassValidations = async () => {
    if (!isItcycleAdminConfigured()) return { checked: 0, newCount: 0 };

    const response = await listPendingFirmaPassValidations({ perPage: 100 });
    const validations = (response?.data || []).filter((v) => ACTIONABLE_STATES.has(v?.estado));
    if (validations.length === 0) return { checked: 0, newCount: 0 };

    const alreadyAlerted = await prisma.firmaPassValidationAlert.findMany({
        where: { validationUuid: { in: validations.map((v) => v.uuid) } },
        select: { validationUuid: true },
    });
    const alreadyAlertedIds = new Set(alreadyAlerted.map((a) => a.validationUuid));
    const newValidations = validations.filter((v) => !alreadyAlertedIds.has(v.uuid));

    if (newValidations.length === 0) return { checked: validations.length, newCount: 0 };

    await prisma.firmaPassValidationAlert.createMany({
        data: newValidations.map((v) => ({ validationUuid: v.uuid, nombre: v.nombre || null, estado: v.estado || null })),
        skipDuplicates: true,
    });
    await notifyAdminsNewFirmaPassValidations({ validations: newValidations });

    return { checked: validations.length, newCount: newValidations.length };
};

class FirmaPassValidationScheduler {
    constructor() {
        this.task = null;
    }

    start() {
        if (this.task) return;
        const cronExpression = process.env.FIRMAPASS_VALIDATION_CHECK_CRON || "*/15 * * * *";
        this.task = cron.schedule(cronExpression, async () => {
            try {
                const result = await checkForNewFirmaPassValidations();
                if (result.newCount > 0) {
                    console.log(`[firmapass-validation-check] ${result.newCount} new pending validation(s) found, admins notified`);
                }
            } catch (error) {
                console.error("[firmapass-validation-check] sweep failed", error);
            }
        });
    }

    stop() {
        this.task?.stop();
        this.task = null;
    }
}

export default new FirmaPassValidationScheduler();
