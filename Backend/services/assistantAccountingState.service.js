// What the assistant knows about THIS company's books, so it can guide from
// where the person actually is instead of asking ("¿ya cargaste los saldos
// iniciales?") what Ohnix already knows. Same shape of idea as the
// Discovery Engine's detectors (services/detectors/*), but about setup and
// housekeeping state rather than business anomalies: each detector is a
// small read-only query that returns one finding or null.
//
// Findings go two places: into the agent's prompt (summary, Spanish - the
// prompt's language) and, for the top one, into a proactive nudge the widget
// shows when opened on Accounting (nudge/cta, per locale).
//
// Tenant scoping note: ManualJournalVoucher is scoped by accountId (its
// createdById is the actor); every other model here uses createdById as the
// tenant id, same as the rest of the accounting services.
import { prisma } from "../db/prisma.js";
import { canAccessModule } from "../middleware/team.permissions.js";
import { ensureUserSubscription, getEffectivePlan, getPlanFeatures } from "../middleware/pricing.middleware.js";

const formatDate = (date) => {
    const d = new Date(date);
    return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};
const formatPeriod = ({ year, month }) => `${String(month).padStart(2, "0")}/${year}`;
const truncate = (text, max = 120) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text || "");

// Ordered roughly by how much each blocks the person: nothing works until
// there's activity; a failing automation silently leaves books wrong; drafts
// are invisible in the statements; a missing opening balance skews every
// balance; closing old months is optional housekeeping.
export const ACCOUNTING_STATE_DETECTORS = [
    {
        key: "no_activity",
        priority: 90,
        run: async ({ db, accountId }) => {
            const entry = await db.journalEntry.findFirst({ where: { period: { createdById: accountId } }, select: { id: true } });
            if (entry) return null;
            return {
                target: "accounting.overview",
                summary: "La empresa aún no tiene ningún asiento contable: ni ventas, compras ni comprobantes contabilizados. Está empezando desde cero.",
                nudge: {
                    es: "Tu contabilidad todavía no tiene movimientos. Si quieres, te guío para arrancar paso a paso.",
                    en: "Your books don't have any entries yet. If you'd like, I'll walk you through getting started.",
                },
                cta: { es: "Guíame para empezar", en: "Walk me through getting started" },
            };
        },
    },
    {
        key: "failed_automations",
        priority: 80,
        run: async ({ db, accountId }) => {
            const failed = { lastRunStatus: "failed" };
            const [expenses, journals, assets, prepaids] = await Promise.all([
                db.recurringExpenseTemplate.findMany({ where: { createdById: accountId, isActive: true, ...failed }, select: { description: true, lastRunError: true }, take: 3 }),
                db.recurringJournalTemplate.findMany({ where: { createdById: accountId, isActive: true, ...failed }, select: { description: true, lastRunError: true }, take: 3 }),
                db.fixedAsset.findMany({ where: { createdById: accountId, status: "active", ...failed }, select: { name: true, lastRunError: true }, take: 3 }),
                db.prepaidExpense.findMany({ where: { createdById: accountId, status: "active", ...failed }, select: { name: true, lastRunError: true }, take: 3 }),
            ]);
            const groups = [
                { rows: expenses, target: "accounting.recurring_expenses", label: "gasto recurrente" },
                { rows: journals, target: "accounting.recurring_journals", label: "asiento recurrente" },
                { rows: assets, target: "accounting.fixed_assets", label: "depreciación de activo fijo" },
                { rows: prepaids, target: "accounting.prepaid_expenses", label: "amortización de diferido" },
            ].filter((group) => group.rows.length);
            if (!groups.length) return null;

            const count = groups.reduce((sum, group) => sum + group.rows.length, 0);
            const details = groups
                .flatMap((group) =>
                    group.rows.map((row) => `${group.label} "${truncate(row.description || row.name, 60)}"${row.lastRunError ? ` (error: ${truncate(row.lastRunError)})` : ""}`)
                )
                .join("; ");
            return {
                target: groups[0].target,
                summary: `El último intento automático falló en ${count} proceso(s) contable(s), así que ese mes no quedó registrado: ${details}.`,
                nudge: {
                    es: `Hay ${count} proceso(s) automático(s) de contabilidad que fallaron en su última ejecución. Te ayudo a ver qué pasó.`,
                    en: `${count} automatic accounting process(es) failed on their last run. I can help you see what happened.`,
                },
                cta: { es: "¿Qué falló y cómo lo arreglo?", en: "What failed and how do I fix it?" },
            };
        },
    },
    {
        key: "draft_vouchers",
        priority: 70,
        run: async ({ db, accountId }) => {
            const where = { accountId, status: "draft" };
            const [count, oldest] = await Promise.all([
                db.manualJournalVoucher.count({ where }),
                db.manualJournalVoucher.findFirst({ where, orderBy: { entryDate: "asc" }, select: { entryDate: true } }),
            ]);
            if (!count) return null;
            return {
                target: "accounting.vouchers",
                summary: `Hay ${count} comprobante(s) manual(es) en borrador (el más antiguo con fecha ${formatDate(oldest.entryDate)}). Los borradores no afectan los estados financieros hasta contabilizarlos.`,
                nudge: {
                    es: `Tienes ${count} comprobante(s) en borrador que todavía no afectan tus estados financieros. ¿Te ayudo a revisarlos?`,
                    en: `You have ${count} draft voucher(s) that don't affect your financial statements yet. Want help reviewing them?`,
                },
                cta: { es: "Ayúdame con los borradores", en: "Help me with the drafts" },
            };
        },
    },
    {
        key: "no_opening_balance",
        priority: 60,
        run: async ({ db, accountId }) => {
            const [hasEntries, opening] = await Promise.all([
                db.journalEntry.findFirst({ where: { period: { createdById: accountId } }, select: { id: true } }),
                db.journalEntry.findFirst({ where: { period: { createdById: accountId }, sourceType: "opening_balance" }, select: { id: true } }),
            ]);
            // With no entries at all, no_activity already covers it.
            if (!hasEntries || opening) return null;
            return {
                target: "accounting.opening_balance",
                summary: "La empresa ya tiene movimientos pero NO tiene una apertura contable registrada. Si ya operaba antes de usar Ohnix, sus saldos iniciales (caja, bancos, cartera, deudas, patrimonio) no están cargados y los saldos de las cuentas estarán incompletos.",
                nudge: {
                    es: "No veo una apertura contable registrada. Si tu empresa ya operaba antes de Ohnix, tus saldos iniciales aún no están cargados.",
                    en: "I don't see an opening balance. If your company was operating before Ohnix, your starting balances aren't loaded yet.",
                },
                cta: { es: "¿Necesito cargar saldos iniciales?", en: "Do I need to load opening balances?" },
            };
        },
    },
    {
        key: "open_past_periods",
        priority: 30,
        run: async ({ db, accountId, now }) => {
            const year = now.getUTCFullYear();
            const month = now.getUTCMonth() + 1;
            const where = {
                createdById: accountId,
                status: "open",
                OR: [{ year: { lt: year } }, { year, month: { lt: month } }],
                // A period row can exist with no entries left in it
                // (created on first post, entry later removed) - nothing to
                // protect there, and "empty books" + "months to close" read
                // as a contradiction side by side.
                journalEntries: { some: {} },
            };
            const [count, oldest] = await Promise.all([
                db.accountingPeriod.count({ where }),
                db.accountingPeriod.findFirst({ where, orderBy: [{ year: "asc" }, { month: "asc" }], select: { year: true, month: true } }),
            ]);
            if (!count) return null;
            return {
                target: "accounting.periods",
                summary: `${count} mes(es) anterior(es) siguen abiertos (el más antiguo ${formatPeriod(oldest)}). Cerrar un periodo es opcional: evita que se agreguen o modifiquen asientos en un mes ya revisado.`,
                nudge: {
                    es: `Tienes ${count} mes(es) anterior(es) sin cerrar. Cerrarlos es opcional, pero protege lo que ya revisaste. ¿Te explico cómo?`,
                    en: `You have ${count} past month(s) still open. Closing them is optional but protects what you've already reviewed. Want me to explain?`,
                },
                cta: { es: "Explícame el cierre de mes", en: "Explain month-end close" },
            };
        },
    },
];

// Runs every detector; one failing (bad data, a schema drift) never takes
// the others - or the assistant's reply - down with it.
export const detectAccountingState = async ({ accountId, db = prisma, now = new Date(), detectors = ACCOUNTING_STATE_DETECTORS }) => {
    const results = await Promise.all(
        detectors.map(async (detector) => {
            try {
                const finding = await detector.run({ db, accountId, now });
                return finding ? { key: detector.key, priority: detector.priority, ...finding } : null;
            } catch (error) {
                console.error(`[assistant] accounting state detector ${detector.key} failed:`, error);
                return null;
            }
        })
    );
    return results.filter(Boolean).sort((a, b) => b.priority - a.priority);
};

// The same two gates the accounting routes apply (routes/accounting.routes.js:
// enforcePlanFeature("accounting") + requireModulePermission("accounting")) -
// the assistant must never become a side door to books the person can't
// open themselves.
export const canSeeAccounting = async (user) => {
    if (user?.role === "admin") return true;
    const subscription = await ensureUserSubscription(user.prismaId);
    if (!subscription || subscription.status !== "active") return false;
    if (!getPlanFeatures(getEffectivePlan(subscription)).accounting) return false;
    return canAccessModule(user, "accounting", "view");
};

export const getAccountingState = async (user, { now = new Date() } = {}) => {
    if (!(await canSeeAccounting(user))) return null;
    return detectAccountingState({ accountId: user.prismaId, now });
};

// Prompt block for the agent. Only called with findings the person is
// allowed to see (see getAccountingState).
export const describeAccountingState = (findings) => {
    if (!findings) return null;
    if (!findings.length) {
        return "ESTADO DE LA CONTABILIDAD DE ESTA EMPRESA (datos reales de Ohnix): no se detectó nada pendiente (hay movimientos, apertura registrada, sin borradores, sin procesos fallidos ni meses anteriores abiertos).";
    }
    return `ESTADO DE LA CONTABILIDAD DE ESTA EMPRESA (datos reales de Ohnix, de lo más a lo menos importante):\n${findings
        .map((finding) => `- ${finding.summary} [pantalla: ${finding.target}]`)
        .join("\n")}`;
};
