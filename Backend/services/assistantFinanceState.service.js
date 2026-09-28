// The Finance counterpart of assistantAccountingState.service.js: what the
// assistant knows about THIS company's cash, banks and pending payments, so
// it can guide from where the person actually is.
//
// Deliberately built on the same services that feed the Finance screen
// (getCashIntegrity, the payables/receivables planners) rather than
// re-deriving their numbers - the assistant must never tell someone "you
// have 3 overdue invoices" while the planner on the same screen shows 4.
//
// Scope note: payables/receivables respect the person's point-of-sale scope
// (ctx.scope, from req.user), exactly like the planners' own routes. The
// nightly learning check has no person attached, so it runs company-wide.
import { canAccessModule } from "../middleware/team.permissions.js";
import { getCashIntegrity } from "./cashIntegrity.service.js";
import { getAccountsPayablePlan } from "./accountsPayable.service.js";
import { getAccountsReceivablePlan } from "./accountsReceivable.service.js";

const COMPANY_WIDE_SCOPE = { posScopeAll: true, posScopeIds: [] };

const formatMoney = (value) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
const formatDate = (date) => {
    const d = new Date(date);
    return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

// Services injected so tests can run the detectors without a database.
export const createFinanceDetectors = ({
    cashIntegrity = getCashIntegrity,
    payablesPlan = getAccountsPayablePlan,
    receivablesPlan = getAccountsReceivablePlan,
} = {}) => [
    {
        key: "finance_no_cash_accounts",
        priority: 95,
        run: async ({ db, accountId }) => {
            const count = await db.cashAccount.count({ where: { createdById: accountId, isActive: true } });
            if (count) return null;
            return {
                target: "finance",
                summary: "La empresa no tiene ninguna caja ni cuenta bancaria activa en Finanzas, así que no puede registrar cobros, pagos ni gastos contra una caja o banco.",
                nudge: {
                    es: "Aún no tienes cajas ni cuentas bancarias creadas. Sin ellas no puedes registrar cobros ni pagos. ¿Te ayudo a crear la primera?",
                    en: "You don't have any cash or bank accounts yet. Without one you can't record collections or payments. Want help creating the first?",
                },
                cta: { es: "Ayúdame a crear una caja o banco", en: "Help me create a cash or bank account" },
            };
        },
    },
    {
        key: "finance_cash_integrity",
        priority: 85,
        run: async ({ db, accountId }) => {
            const integrity = await cashIntegrity({ accountId, db });
            const { operational_differences: operational, accounting_differences: accounting } = integrity.summary;
            if (!operational && !accounting) return null;
            const examples = integrity.operational
                .filter((row) => row.status !== "ok")
                .slice(0, 3)
                .map((row) => `"${row.name}" (diferencia ${formatMoney(row.difference)})`)
                .join(", ");
            const parts = [];
            if (operational) parts.push(`${operational} caja(s)/banco(s) cuyo saldo guardado no coincide con la suma de sus movimientos${examples ? `: ${examples}` : ""}`);
            if (accounting) parts.push(`${accounting} grupo(s) donde el saldo de caja no cuadra con el libro mayor contable`);
            return {
                target: "finance",
                summary: `La revisión de integridad de caja encontró diferencias: ${parts.join("; ")}. Se revisa en Finanzas, panel Integridad de caja.`,
                nudge: {
                    es: "La integridad de caja muestra diferencias entre tus saldos, movimientos o libro mayor. ¿Te ayudo a entender de dónde vienen?",
                    en: "Cash integrity shows differences between your balances, movements or ledger. Want help understanding where they come from?",
                },
                cta: { es: "¿De dónde salen esas diferencias?", en: "Where do those differences come from?" },
            };
        },
    },
    {
        key: "finance_overdue_payables",
        priority: 70,
        run: async ({ accountId, scope = COMPANY_WIDE_SCOPE }) => {
            const plan = await payablesPlan({ accountId, ...scope });
            const overdue = plan.documents.filter((row) => row.status === "overdue");
            if (!overdue.length) return null;
            const amount = overdue.reduce((sum, row) => sum + row.pending, 0);
            const gap = plan.summary.funding_gap;
            return {
                target: "finance",
                summary: `Hay ${overdue.length} obligación(es) por pagar vencida(s) por ${formatMoney(amount)} en total (la más atrasada con ${Math.max(...overdue.map((row) => row.days_overdue || 0))} días).${gap > 0 ? ` Además, lo pendiente supera el efectivo disponible por ${formatMoney(gap)}.` : ""} Se planifica en Finanzas, Planificador de cuentas por pagar.`,
                nudge: {
                    es: `Tienes ${overdue.length} pago(s) vencido(s) por ${formatMoney(amount)}. ¿Te ayudo a priorizarlos?`,
                    en: `You have ${overdue.length} overdue payment(s) totaling ${formatMoney(amount)}. Want help prioritizing them?`,
                },
                cta: { es: "Ayúdame a priorizar los pagos", en: "Help me prioritize payments" },
            };
        },
    },
    {
        key: "finance_overdue_receivables",
        priority: 65,
        run: async ({ accountId, scope = COMPANY_WIDE_SCOPE }) => {
            const plan = await receivablesPlan({ accountId, ...scope });
            const overdue = plan.documents.filter((row) => row.status === "overdue");
            if (!overdue.length) return null;
            return {
                target: "finance",
                summary: `Hay ${overdue.length} factura(s) de clientes vencida(s) sin cobrar por ${formatMoney(plan.summary.overdue)} en total. Se gestiona en Finanzas, Gestión de cuentas por cobrar.`,
                nudge: {
                    es: `Tienes ${overdue.length} factura(s) vencida(s) por cobrar por ${formatMoney(plan.summary.overdue)}. ¿Te ayudo a organizar el cobro?`,
                    en: `You have ${overdue.length} overdue invoice(s) to collect, ${formatMoney(plan.summary.overdue)} in total. Want help organizing collection?`,
                },
                cta: { es: "Ayúdame con la cartera vencida", en: "Help me with overdue invoices" },
            };
        },
    },
    {
        key: "finance_unmatched_bank_entries",
        priority: 50,
        run: async ({ db, accountId }) => {
            const where = { matchedMovementId: null, cashAccount: { createdById: accountId } };
            const [count, oldest] = await Promise.all([
                db.bankStatementEntry.count({ where }),
                db.bankStatementEntry.findFirst({ where, orderBy: { entryDate: "asc" }, select: { entryDate: true } }),
            ]);
            if (!count) return null;
            return {
                target: "finance.reconciliation",
                summary: `Hay ${count} línea(s) de extractos bancarios importadas sin conciliar (la más antigua del ${formatDate(oldest.entryDate)}).`,
                nudge: {
                    es: `Tienes ${count} línea(s) de extracto bancario sin conciliar. ¿Te ayudo a conciliarlas?`,
                    en: `You have ${count} bank statement line(s) not reconciled yet. Want help reconciling them?`,
                },
                cta: { es: "Ayúdame a conciliar", en: "Help me reconcile" },
            };
        },
    },
];

export const FINANCE_STATE_DETECTORS = createFinanceDetectors();

// Same gate as routes/finance.routes.js: requireModulePermission("finance",
// "view") - Finance isn't a plan feature, so there's no plan check.
export const canSeeFinance = async (user) => {
    if (user?.role === "admin") return true;
    return canAccessModule(user, "finance", "view");
};
