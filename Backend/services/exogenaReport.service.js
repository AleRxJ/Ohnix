import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

const round2 = (value) => Number(Number(value || 0).toFixed(2));

// This is NOT a certified DIAN exógena file - the technical layout (column
// widths, encoding, the official 5001-5099 concept catalog) is defined by a
// resolution that's reissued most years, and getting a single byte wrong
// makes the file useless to the prevalidador. This report instead groups
// data Ohnix already has (payments to suppliers, retentions practiced by
// concept) the same way Formato 1001 asks for it, as a starting point for
// whoever prepares the actual DIAN submission - see
// accounting.exogena_disclaimer in the frontend for the exact wording shown
// to the user.
export const getExogenaReport = async ({ accountId, year }) => {
    const numericYear = Number(year);
    if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2200) {
        throw new ApiError(400, "The report year is invalid.", [], "", "exogena_invalid_year");
    }
    const from = new Date(Date.UTC(numericYear, 0, 1));
    const to = new Date(Date.UTC(numericYear + 1, 0, 1) - 1);

    // Total value of transactions with each supplier this year, regardless
    // of whether a retention applies - Formato 1001 requires reporting every
    // payment/abono above the DIAN threshold, not only the ones a retention
    // concept happened to be applied to.
    const ledgerRows = await prisma.journalEntryLine.groupBy({
        by: ["thirdPartyId", "thirdPartyName", "thirdPartyDocument"],
        where: {
            thirdPartyType: "supplier",
            thirdPartyId: { not: null },
            journalEntry: { period: { createdById: accountId }, entryDate: { gte: from, lte: to } },
        },
        _sum: { debit: true, credit: true },
    });

    const bySupplier = new Map();
    const ensureSupplier = (id, name, document) => {
        if (!bySupplier.has(id)) {
            bySupplier.set(id, { supplier_id: id, name, document, total_payments: 0, retentions: [], total_withheld: 0 });
        }
        return bySupplier.get(id);
    };

    for (const row of ledgerRows) {
        const entry = ensureSupplier(row.thirdPartyId, row.thirdPartyName, row.thirdPartyDocument);
        // Credit-normal (a purchase/expense liability or cash outflow credits
        // the supplier side) - matches balanceForType's convention in
        // financialStatements.service.js for liability/expense-side thirds.
        entry.total_payments = round2(entry.total_payments + Number(row._sum.credit || 0) - Number(row._sum.debit || 0));
    }

    // Retentions practiced, by supplier and DIAN concept - same source
    // withholdingReport.service.js#getWithholdingReport already uses.
    const retentionRows = await prisma.purchaseRetention.findMany({
        where: {
            purchase: {
                createdById: accountId,
                purchaseStatus: { in: ["completed", "returned"] },
                purchaseDate: { gte: from, lte: to },
            },
            withheldAmount: { gt: 0 },
        },
        include: { purchase: { include: { supplier: { select: { id: true, name: true, identification: true } } } } },
        orderBy: [{ purchase: { supplier: { name: "asc" } } }, { conceptCode: "asc" }],
    });

    for (const retention of retentionRows) {
        const supplier = retention.purchase.supplier;
        const entry = ensureSupplier(supplier.id, supplier.name, supplier.identification);
        const netWithheld = round2(Number(retention.withheldAmount) - Number(retention.returnedWithheldAmount));
        const existingConcept = entry.retentions.find((r) => r.concept_code === retention.conceptCode);
        if (existingConcept) {
            existingConcept.base_amount = round2(existingConcept.base_amount + Number(retention.baseAmount));
            existingConcept.withheld_amount = round2(existingConcept.withheld_amount + netWithheld);
        } else {
            entry.retentions.push({
                concept_code: retention.conceptCode,
                concept_name: retention.conceptName,
                tax_type: retention.taxType,
                base_amount: round2(Number(retention.baseAmount)),
                withheld_amount: netWithheld,
            });
        }
        entry.total_withheld = round2(entry.total_withheld + netWithheld);
    }

    const suppliers = [...bySupplier.values()].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const totals = {
        total_payments: round2(suppliers.reduce((sum, s) => sum + s.total_payments, 0)),
        total_withheld: round2(suppliers.reduce((sum, s) => sum + s.total_withheld, 0)),
    };
    return { year: numericYear, suppliers, totals };
};
