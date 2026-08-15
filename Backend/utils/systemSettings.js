import { prisma } from "../db/prisma.js";

// Single shared source for the platform-wide low-stock default threshold
// (used whenever a product has no per-product lowStockThreshold override).
// Replaces three independent hardcoded `10`s that used to live separately in
// lowStockScheduler.js, order.service.js and report.controller.js and could
// drift out of sync with each other and with the admin's "update threshold"
// action, which only ever changed the scheduler's own in-memory copy.
const SETTINGS_ID = "singleton";

let cachedThreshold = null;

export const getLowStockDefaultThreshold = async () => {
    if (cachedThreshold !== null) return cachedThreshold;

    const settings = await prisma.systemSetting.upsert({
        where: { id: SETTINGS_ID },
        update: {},
        create: { id: SETTINGS_ID },
    });

    cachedThreshold = settings.lowStockDefaultThreshold;
    return cachedThreshold;
};

export const setLowStockDefaultThreshold = async (value) => {
    const settings = await prisma.systemSetting.upsert({
        where: { id: SETTINGS_ID },
        update: { lowStockDefaultThreshold: value },
        create: { id: SETTINGS_ID, lowStockDefaultThreshold: value },
    });

    cachedThreshold = settings.lowStockDefaultThreshold;
    return cachedThreshold;
};

// Colombia VAT config (ET art. 468 general rate, art. 437 par. 3 UVT
// threshold, DIAN's yearly UVT peso value) - see schema.prisma's
// SystemSetting comment for why these live here instead of as code
// constants. Cached the same way as the low-stock threshold above -
// setColombiaTaxSettings refreshes the in-process cache itself.
let cachedColombiaTax = null;

export const getColombiaTaxSettings = async () => {
    if (cachedColombiaTax !== null) return cachedColombiaTax;

    const settings = await prisma.systemSetting.upsert({
        where: { id: SETTINGS_ID },
        update: {},
        create: { id: SETTINGS_ID },
    });

    cachedColombiaTax = {
        vatRate: Number(settings.colombiaVatRate),
        vatResponsibleThresholdUvt: settings.colombiaVatResponsibleThresholdUvt,
        uvtValue: Number(settings.colombiaUvtValue),
    };
    return cachedColombiaTax;
};

export const setColombiaTaxSettings = async ({ vatRate, vatResponsibleThresholdUvt, uvtValue }) => {
    const settings = await prisma.systemSetting.upsert({
        where: { id: SETTINGS_ID },
        update: {
            ...(vatRate !== undefined && { colombiaVatRate: vatRate }),
            ...(vatResponsibleThresholdUvt !== undefined && { colombiaVatResponsibleThresholdUvt: vatResponsibleThresholdUvt }),
            ...(uvtValue !== undefined && { colombiaUvtValue: uvtValue }),
        },
        create: {
            id: SETTINGS_ID,
            ...(vatRate !== undefined && { colombiaVatRate: vatRate }),
            ...(vatResponsibleThresholdUvt !== undefined && { colombiaVatResponsibleThresholdUvt: vatResponsibleThresholdUvt }),
            ...(uvtValue !== undefined && { colombiaUvtValue: uvtValue }),
        },
    });

    cachedColombiaTax = {
        vatRate: Number(settings.colombiaVatRate),
        vatResponsibleThresholdUvt: settings.colombiaVatResponsibleThresholdUvt,
        uvtValue: Number(settings.colombiaUvtValue),
    };
    return cachedColombiaTax;
};
