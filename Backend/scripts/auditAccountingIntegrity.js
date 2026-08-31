import dotenv from "dotenv";
import { prisma } from "../db/prisma.js";

dotenv.config();

// Read-only deployment preflight. It intentionally never repairs or deletes
// accounting evidence; every finding must be reconciled by a human before
// migrations that add uniqueness constraints are deployed.
const checks = [
    {
        key: "duplicate_single_source_entries",
        severity: "blocking",
        query: `
            SELECT source_type::text, source_id, COUNT(*)::int AS entry_count,
                   ARRAY_AGG(id ORDER BY created_at) AS entry_ids
            FROM journal_entries
            WHERE source_id IS NOT NULL
              AND source_type::text IN (
                'order_sale', 'purchase', 'order_payment', 'purchase_payment',
                'order_cancellation', 'credit_note_restock',
                'credit_note_financial', 'period_close',
                'inventory_adjustment', 'transfer_discrepancy',
                'manual_journal', 'manual_journal_reversal',
                'period_reopen', 'period_reclose'
              )
            GROUP BY source_type, source_id
            HAVING COUNT(*) > 1
            ORDER BY source_type, source_id
        `,
    },
    {
        key: "unbalanced_journal_entries",
        severity: "blocking",
        query: `
            SELECT je.id, je.source_type, je.source_id, je.entry_date,
                   SUM(jel.debit)::text AS total_debit,
                   SUM(jel.credit)::text AS total_credit
            FROM journal_entries je
            LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
            GROUP BY je.id
            HAVING COALESCE(SUM(jel.debit), 0) <> COALESCE(SUM(jel.credit), 0)
                OR COUNT(jel.id) = 0
            ORDER BY je.entry_date, je.id
        `,
    },
    {
        key: "entries_outside_assigned_period",
        severity: "blocking",
        query: `
            SELECT je.id, je.source_type, je.source_id, je.entry_date,
                   ap.id AS period_id, ap.year AS period_year,
                   ap.month AS period_month
            FROM journal_entries je
            JOIN accounting_periods ap ON ap.id = je.period_id
            -- Prisma stores DateTime here as timestamp(3) without timezone;
            -- accountingPeriod.service constructs its boundaries in UTC.
            WHERE EXTRACT(YEAR FROM je.entry_date)::int <> ap.year
               OR EXTRACT(MONTH FROM je.entry_date)::int <> ap.month
            ORDER BY je.entry_date, je.id
        `,
    },
    {
        key: "period_reopening_lifecycle_inconsistencies",
        severity: "blocking",
        requiresColumn: { table: "accounting_periods", column: "reopened_until" },
        query: `
            SELECT ap.id AS period_id, ap.status, ap.reopened_until,
                   COUNT(apr.id) FILTER (WHERE apr.reclosed_at IS NULL)::int AS active_reopenings
            FROM accounting_periods ap
            LEFT JOIN accounting_period_reopenings apr ON apr.period_id = ap.id
            GROUP BY ap.id
            HAVING COUNT(apr.id) FILTER (WHERE apr.reclosed_at IS NULL) > 1
                OR (ap.status = 'closed' AND ap.reopened_until IS NOT NULL)
                OR (ap.status = 'open' AND ap.reopened_until IS NOT NULL
                    AND COUNT(apr.id) FILTER (WHERE apr.reclosed_at IS NULL) <> 1)
            ORDER BY ap.id
        `,
    },
    {
        key: "posted_sales_missing_frozen_cost_basis",
        severity: "blocking",
        requiresColumn: { table: "order_details", column: "cost_basis_applied" },
        query: `
            SELECT o.id AS order_id, o.invoice_no,
                   COUNT(*) FILTER (WHERE od.cost_basis_applied IS NULL)::int AS missing_lines
            FROM orders o
            JOIN order_details od ON od.order_id = o.id
            JOIN journal_entries je
              ON je.source_type = 'order_sale' AND je.source_id = o.id
            GROUP BY o.id, o.invoice_no
            HAVING COUNT(*) FILTER (WHERE od.cost_basis_applied IS NULL) > 0
            ORDER BY o.id
        `,
    },
    {
        key: "location_stock_value_inconsistencies",
        severity: "blocking",
        requiresColumn: { table: "product_location_stock", column: "inventory_value" },
        query: `
            SELECT id, product_id, point_of_sale_id, stock,
                   average_unit_cost::text, inventory_value::text,
                   ROUND(stock * average_unit_cost, 2)::text AS expected_value
            FROM product_location_stock
            WHERE inventory_value < 0
               OR average_unit_cost < 0
               OR (stock = 0 AND inventory_value <> 0)
               OR ABS(inventory_value - ROUND(stock * average_unit_cost, 2))
                    > GREATEST(0.01, stock * 0.00005 + 0.01)
            ORDER BY product_id, point_of_sale_id
        `,
    },
    {
        key: "product_stock_differs_from_location_total",
        severity: "blocking",
        query: `
            SELECT p.id AS product_id, p.stock AS product_stock,
                   COALESCE(SUM(pls.stock), 0)::int AS location_stock
            FROM products p
            LEFT JOIN product_location_stock pls ON pls.product_id = p.id
            GROUP BY p.id, p.stock
            HAVING p.stock <> COALESCE(SUM(pls.stock), 0)
            ORDER BY p.id
        `,
    },
    {
        key: "inventory_subledger_differs_from_account_1435",
        severity: "blocking",
        requiresColumn: { table: "product_location_stock", column: "inventory_value" },
        query: `
            WITH owners AS (
                SELECT DISTINCT created_by_id AS account_id FROM products
                UNION
                SELECT DISTINCT created_by_id AS account_id FROM chart_accounts
            ), subledger AS (
                SELECT p.created_by_id AS account_id,
                       COALESCE(SUM(pls.inventory_value), 0) AS available_value
                FROM products p
                LEFT JOIN product_location_stock pls ON pls.product_id = p.id
                GROUP BY p.created_by_id
            ), transit AS (
                SELECT account_id,
                       COALESCE(SUM(quantity_sent * COALESCE(unit_cost_applied, 0)), 0) AS transit_value
                FROM stock_transfers
                WHERE status = 'in_transit'
                GROUP BY account_id
            ), ledger AS (
                SELECT ca.created_by_id AS account_id,
                       COALESCE(SUM(jel.debit - jel.credit), 0) AS ledger_value
                FROM chart_accounts ca
                LEFT JOIN journal_entry_lines jel ON jel.chart_account_id = ca.id
                WHERE ca.code = '1435'
                GROUP BY ca.created_by_id
            )
            SELECT o.account_id,
                   ROUND(COALESCE(s.available_value, 0) + COALESCE(t.transit_value, 0), 2)::text AS subledger_value,
                   ROUND(COALESCE(l.ledger_value, 0), 2)::text AS ledger_value,
                   ROUND(COALESCE(s.available_value, 0) + COALESCE(t.transit_value, 0) - COALESCE(l.ledger_value, 0), 2)::text AS difference
            FROM owners o
            LEFT JOIN subledger s ON s.account_id = o.account_id
            LEFT JOIN transit t ON t.account_id = o.account_id
            LEFT JOIN ledger l ON l.account_id = o.account_id
            WHERE ABS(COALESCE(s.available_value, 0) + COALESCE(t.transit_value, 0) - COALESCE(l.ledger_value, 0)) > 0.01
            ORDER BY o.account_id
        `,
    },
    {
        key: "manual_voucher_lifecycle_inconsistencies",
        severity: "blocking",
        requiresColumn: { table: "manual_journal_vouchers", column: "status" },
        query: `
            SELECT id, status, posted_entry_id, reversal_entry_id,
                   posted_at, voided_at, void_reason
            FROM manual_journal_vouchers
            WHERE (status = 'draft' AND (posted_entry_id IS NOT NULL OR reversal_entry_id IS NOT NULL))
               OR (status = 'posted' AND (posted_entry_id IS NULL OR reversal_entry_id IS NOT NULL))
               OR (status = 'voided' AND (posted_entry_id IS NULL OR reversal_entry_id IS NULL OR void_reason IS NULL))
            ORDER BY created_at
        `,
    },
    {
        key: "control_account_lines_missing_third_party",
        severity: "blocking",
        requiresColumn: { table: "journal_entry_lines", column: "third_party_type" },
        query: `
            SELECT jel.id AS line_id, je.id AS entry_id, je.source_type,
                   ca.code AS account_code, jel.debit::text, jel.credit::text
            FROM journal_entry_lines jel
            JOIN journal_entries je ON je.id = jel.journal_entry_id
            JOIN chart_accounts ca ON ca.id = jel.chart_account_id
            WHERE ca.code IN ('1305', '2205')
              AND (jel.third_party_type IS NULL OR jel.third_party_id IS NULL OR jel.third_party_name IS NULL)
            ORDER BY je.entry_date, je.id
        `,
    },
    {
        key: "multiple_in_flight_credit_notes_per_invoice",
        severity: "blocking",
        query: `
            SELECT invoice_id, COUNT(*)::int AS note_count,
                   ARRAY_AGG(id ORDER BY created_at) AS credit_note_ids
            FROM electronic_credit_notes
            WHERE status IN ('issuing', 'submitted')
            GROUP BY invoice_id
            HAVING COUNT(*) > 1
            ORDER BY invoice_id
        `,
    },
    {
        key: "accepted_credit_notes_with_unapplied_local_effect",
        severity: "warning",
        requiresColumn: { table: "electronic_credit_notes", column: "local_effect_status" },
        query: `
            SELECT ecn.id, ecn.invoice_id, ecn.local_effect_status,
                   ecn.local_effect_attempts, ecn.local_effect_error,
                   ecn.created_at
            FROM electronic_credit_notes ecn
            WHERE ecn.status = 'accepted'
              AND ecn.local_effect_status IN ('pending', 'failed')
            ORDER BY ecn.created_at
        `,
    },
];

const main = async () => {
    let blockingFindings = 0;
    const report = [];

    for (const check of checks) {
        try {
            if (check.requiresColumn) {
                const [{ exists }] = await prisma.$queryRaw`
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = ${check.requiresColumn.table}
                          AND column_name = ${check.requiresColumn.column}
                    ) AS exists
                `;
                if (!exists) {
                    report.push({
                        check: check.key,
                        severity: check.severity,
                        skipped: true,
                        reason: `column ${check.requiresColumn.table}.${check.requiresColumn.column} is not deployed yet`,
                    });
                    continue;
                }
            }
            const rows = await prisma.$queryRawUnsafe(check.query);
            if (check.severity === "blocking") blockingFindings += rows.length;
            report.push({ check: check.key, severity: check.severity, count: rows.length, rows });
        } catch (error) {
            // Optional checks may target columns introduced by a migration
            // that this very preflight is being run before. PostgreSQL 42703
            // means "undefined column"; report it explicitly, never disguise
            // an actual query/connectivity error as a clean result.
            if (check.severity === "warning" && error?.meta?.code === "42703") {
                report.push({ check: check.key, severity: check.severity, skipped: true, reason: error.meta.message });
                continue;
            }
            throw error;
        }
    }

    console.log(JSON.stringify({
        auditedAt: new Date().toISOString(),
        readOnly: true,
        safeToDeployAccountingConstraints: blockingFindings === 0,
        blockingFindings,
        checks: report,
    }, null, 2));

    if (blockingFindings > 0) process.exitCode = 2;
};

main()
    .catch((error) => {
        console.error("Accounting integrity audit failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
