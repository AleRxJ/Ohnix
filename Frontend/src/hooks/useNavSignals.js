import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../offline/db";
import { DEFAULT_LOW_STOCK_THRESHOLD } from "../utils/productUtils";

const EMPTY = {};

// Per-module "needs your attention" counts for the sidebar and the command
// palette. Read exclusively from the local offline mirror (offline/db.js),
// never from the network: no extra requests per page load, the numbers keep
// working offline, and they update live as the sync engine or the page the
// user is on writes to the mirror. Only full-mirror entities are counted
// (entitySync.js pulls them whole) - page-cached ones like orders/warranties
// would show "whatever was last viewed", which is worse than no signal.
//
// Returns { [navItemKey]: [{ count, tone, labelKey }] } - tone is one of
// "alert" | "warn" | "info", labelKey an i18n key taking {{count}}.
//
// Only signals for modules the user can actually open are returned: items
// hidden by team permissions, or shown with a plan-lock crown, never raise
// a count (a "3 hallazgos nuevos" on a module you can't use is just noise).
const useNavSignals = ({ items = [], can = () => true, needsFiscalSetup = false, openDiscoveriesCount = 0 } = {}) => {
    const mirrored = useLiveQuery(async () => {
        const [products, productionOrders, purchases, salesQuotations, payrollPeriods] = await Promise.all([
            db.products.toArray(),
            db.productionOrders.toArray(),
            db.purchases.toArray(),
            db.salesQuotations.toArray(),
            db.payrollPeriods.toArray(),
        ]);
        const active = (rows) => rows.filter((row) => !row._pendingDelete);
        const count = (rows, predicate) => active(rows).filter(predicate).length;

        const outOfStock = count(products, (p) => p.status === "active" && p.is_physical !== false && Number(p.stock) <= 0);
        const lowStock = count(
            products,
            (p) => p.status === "active" && p.is_physical !== false && Number(p.stock) > 0 && Number(p.stock) <= (p.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD)
        );

        return {
            products: [
                { count: outOfStock, tone: "alert", labelKey: "nav.signal_out_of_stock" },
                { count: lowStock, tone: "warn", labelKey: "nav.signal_low_stock" },
            ],
            "production-orders": [{ count: count(productionOrders, (o) => o.status === "draft"), tone: "info", labelKey: "nav.signal_production_draft" }],
            purchases: [{ count: count(purchases, (p) => p.purchase_status === "pending"), tone: "warn", labelKey: "nav.signal_purchases_pending" }],
            quotations: [{ count: count(salesQuotations, (q) => q.status === "sent" || q.status === "viewed"), tone: "info", labelKey: "nav.signal_quotations_waiting" }],
            payroll: [
                { count: count(payrollPeriods, (p) => p.status === "calculated"), tone: "warn", labelKey: "nav.signal_payroll_to_approve" },
                { count: count(payrollPeriods, (p) => p.status === "approved"), tone: "warn", labelKey: "nav.signal_payroll_to_pay" },
            ],
        };
    }, [], EMPTY);

    const signals = { ...(mirrored || EMPTY) };
    signals.discoveries = [{ count: openDiscoveriesCount, tone: "info", labelKey: "nav.signal_discoveries" }];
    signals["fiscal-setup"] = [{ count: needsFiscalSetup ? 1 : 0, tone: "warn", labelKey: "nav.signal_fiscal_setup" }];

    const usable = new Set(items.filter((item) => !item.planFeature || can(item.planFeature)).map((item) => item.key));

    // Drop zero counts so callers can just check .length.
    return Object.fromEntries(
        Object.entries(signals)
            .filter(([key]) => usable.has(key))
            .map(([key, list]) => [key, list.filter((signal) => signal.count > 0)])
            .filter(([, list]) => list.length > 0)
    );
};

export const TONE_RANK = { alert: 0, warn: 1, info: 2 };

export default useNavSignals;
