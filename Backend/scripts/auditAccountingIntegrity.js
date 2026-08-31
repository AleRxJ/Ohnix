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
            SELECT source_type, source_id, COUNT(*)::int AS entry_count,
                   ARRAY_AGG(id ORDER BY created_at) AS entry_ids
            FROM journal_entries
            WHERE source_id IS NOT NULL
              AND source_type IN (
                'order_sale', 'purchase', 'order_payment', 'purchase_payment',
                'order_cancellation', 'credit_note_restock',
                'credit_note_financial', 'period_close'
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
