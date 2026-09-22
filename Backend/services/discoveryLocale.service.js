// Every detector generates its own free text (title/summary/hypothesis/
// evidence labels/prediction statements) as hardcoded Spanish template
// literals - unlike a frontend component, there's no i18next `t()` to call
// here. This matches the SAME bilingual idiom the codebase already uses for
// other backend-generated text (utils/lowStockScheduler.js's email HTML,
// services/team.service.js's invite emails, services/assistant.service.js's
// chat replies): compute `isEN` once, then pick between two inline strings.
// Discovery Engine didn't follow that precedent when it was first built -
// this file exists to close that gap.
//
// Never throws: a locale lookup failing (a fake db in a unit test with no
// `.user` model, a transient DB hiccup) must not take down detection itself
// - falls back to Spanish, matching User.preferredLanguage's own DB default.

import { prisma } from "../db/prisma.js";

export const resolveIsEnglish = async ({ accountId, db = prisma }) => {
    try {
        const user = await db.user.findUnique({ where: { id: accountId }, select: { preferredLanguage: true } });
        return `${user?.preferredLanguage || ""}`.toLowerCase().startsWith("en");
    } catch {
        return false;
    }
};
