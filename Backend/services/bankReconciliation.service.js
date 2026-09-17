import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";

// Conciliación deliberately simple: a BankStatementEntry is a line already
// structured by the caller (no bank-file-format parser in this scope - see
// the Fase 3 plan). Reconciling = pairing an entry with a CashMovement that
// already exists in the ledger; nothing about the ledger itself changes.

const assertCashAccountOwned = async (accountId, cashAccountId) => {
    const cashAccount = await prisma.cashAccount.findFirst({ where: { id: cashAccountId, createdById: accountId } });
    if (!cashAccount) throw new ApiError(404, "Cash account not found.", [], "", "cash_account_not_found");
    return cashAccount;
};

export const isReconciliationAmountMatch = (statementAmount, movementAmount) =>
    Math.abs(Number(statementAmount) - Number(movementAmount)) < 0.005;

export const createStatementEntries = async ({ accountId, actorId, cashAccountId, entries }) => {
    await assertCashAccountOwned(accountId, cashAccountId);

    if (!Array.isArray(entries) || entries.length === 0) {
        throw new ApiError(400, "At least one bank statement entry is required.", [], "", "reconciliation_entries_required");
    }
    if (entries.length > 1000) {
        throw new ApiError(413, "The bank statement exceeds the 1,000-row import limit.", [], "", "reconciliation_import_limit");
    }

    const fingerprints = new Set();
    const data = entries.map((entry, index) => {
        const amount = Number(entry.amount);
        const entryDate = new Date(entry.entryDate);
        if (!entry.entryDate || Number.isNaN(entryDate.getTime()) || !Number.isFinite(amount) || amount === 0) {
            throw new ApiError(400, `Bank statement entry ${index + 1} is invalid.`, [{ index: index + 1 }], "", "reconciliation_entry_invalid");
        }
        const description = entry.description?.trim() || null;
        const fingerprint = `${entryDate.toISOString()}|${amount.toFixed(2)}|${description || ""}`;
        if (fingerprints.has(fingerprint)) {
            throw new ApiError(409, `Bank statement row ${index + 1} is duplicated.`, [{ index: index + 1 }], "", "reconciliation_entry_duplicate");
        }
        fingerprints.add(fingerprint);
        return {
            cashAccountId,
            entryDate,
            description,
            amount,
            createdById: actorId,
            importFingerprint: entry.importFingerprint?.trim() || null,
        };
    });

    const created = await prisma.bankStatementEntry.createMany({ data, skipDuplicates: true });
    const unmatched = await prisma.bankStatementEntry.findMany({
        where: { cashAccountId, matchedMovementId: null },
        orderBy: { entryDate: "desc" },
    });
    return { unmatched, importedCount: created.count, skippedCount: data.length - created.count };
};

export const listUnmatchedStatementEntries = async ({ accountId, cashAccountId }) => {
    await assertCashAccountOwned(accountId, cashAccountId);
    return prisma.bankStatementEntry.findMany({
        where: { cashAccountId, matchedMovementId: null },
        orderBy: { entryDate: "desc" },
    });
};

export const listUnmatchedMovements = async ({ accountId, cashAccountId }) => {
    await assertCashAccountOwned(accountId, cashAccountId);
    return prisma.cashMovement.findMany({
        where: { cashAccountId, reconciledAt: null },
        orderBy: { createdAt: "desc" },
    });
};

const normalizedWords = (value) => new Set(String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 2));
export const scoreReconciliationCandidate = (entry, movement) => {
    if (!isReconciliationAmountMatch(entry.amount, movement.delta)) return null;
    const days = Math.abs(new Date(entry.entryDate) - new Date(movement.createdAt)) / 86400000;
    if (days > 15) return null;
    const left = normalizedWords(entry.description);
    const right = normalizedWords(`${movement.reason || ""} ${movement.sourceType || ""}`);
    const shared = [...left].filter((word) => right.has(word)).length;
    const textScore = left.size ? Math.min(shared / left.size, 1) * 20 : 0;
    return Math.max(0, Math.round(100 - days * 4 + textScore));
};

export const suggestMatches = async ({ accountId, cashAccountId }) => {
    await assertCashAccountOwned(accountId, cashAccountId);
    const [entries, movements] = await Promise.all([
        prisma.bankStatementEntry.findMany({ where: { cashAccountId, matchedMovementId: null }, orderBy: { entryDate: "asc" } }),
        prisma.cashMovement.findMany({ where: { cashAccountId, reconciledAt: null }, orderBy: { createdAt: "asc" } }),
    ]);
    const used = new Set();
    return entries.map((entry) => {
        const candidates = movements.map((movement) => ({ movement, score: scoreReconciliationCandidate(entry, movement) })).filter((row) => row.score !== null && !used.has(row.movement.id)).sort((a, b) => b.score - a.score);
        const best = candidates[0];
        if (!best) return null;
        const ambiguous = candidates[1] && best.score - candidates[1].score < 10;
        if (!ambiguous) used.add(best.movement.id);
        return { entry, movement: best.movement, score: best.score, ambiguous: Boolean(ambiguous) };
    }).filter(Boolean);
};

export const getReconciliationSummary = async ({ accountId, cashAccountId }) => {
    await assertCashAccountOwned(accountId, cashAccountId);
    const [entries, unmatchedMovements] = await Promise.all([
        prisma.bankStatementEntry.findMany({ where: { cashAccountId }, select: { amount: true, matchedMovementId: true } }),
        prisma.cashMovement.count({ where: { cashAccountId, reconciledAt: null } }),
    ]);
    const absolute = (rows) => rows.reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
    const matched = entries.filter((row) => row.matchedMovementId);
    const unmatched = entries.filter((row) => !row.matchedMovementId);
    return {
        statement_count: entries.length,
        matched_count: matched.length,
        unmatched_count: unmatched.length,
        unmatched_movement_count: unmatchedMovements,
        statement_volume: Number(absolute(entries).toFixed(2)),
        matched_volume: Number(absolute(matched).toFixed(2)),
        unmatched_volume: Number(absolute(unmatched).toFixed(2)),
        coverage_percent: entries.length ? Number((matched.length / entries.length * 100).toFixed(1)) : 0,
    };
};

export const getReconciliationReport = async ({ accountId, cashAccountId, dateFrom, dateTo, status = "all" }) => {
    await assertCashAccountOwned(accountId, cashAccountId);
    if (!['all', 'matched', 'unmatched'].includes(status)) throw new ApiError(400, "The reconciliation status is invalid.", [], "", "reconciliation_status_invalid");
    const entryDate = {};
    if (dateFrom) {
        const parsed = new Date(dateFrom);
        if (Number.isNaN(parsed.getTime())) throw new ApiError(400, "The start date is invalid.", [], "", "reconciliation_start_date_invalid");
        entryDate.gte = parsed;
    }
    if (dateTo) {
        const parsed = new Date(dateTo);
        if (Number.isNaN(parsed.getTime())) throw new ApiError(400, "The end date is invalid.", [], "", "reconciliation_end_date_invalid");
        entryDate.lte = parsed;
    }
    const rows = await prisma.bankStatementEntry.findMany({
        where: {
            cashAccountId,
            ...(Object.keys(entryDate).length ? { entryDate } : {}),
            ...(status === "matched" ? { matchedMovementId: { not: null } } : status === "unmatched" ? { matchedMovementId: null } : {}),
        },
        include: { matchedMovement: { select: { id: true, delta: true, sourceType: true, sourceId: true, reason: true, reconciledAt: true, createdAt: true } } },
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        take: 5000,
    });
    return rows;
};

export const matchEntry = async ({ accountId, cashAccountId, entryId, movementId }) => {
    await assertCashAccountOwned(accountId, cashAccountId);

    const [entry, movement] = await Promise.all([
        prisma.bankStatementEntry.findFirst({ where: { id: entryId, cashAccountId } }),
        prisma.cashMovement.findFirst({ where: { id: movementId, cashAccountId } }),
    ]);
    if (!entry) throw new ApiError(404, "Bank statement entry not found.", [], "", "reconciliation_entry_not_found");
    if (!movement) throw new ApiError(404, "Cash movement not found.", [], "", "reconciliation_movement_not_found");
    if (entry.matchedMovementId) throw new ApiError(400, "This bank statement entry is already reconciled.", [], "", "reconciliation_entry_already_matched");
    if (movement.reconciledAt) throw new ApiError(400, "This cash movement is already reconciled.", [], "", "reconciliation_movement_already_matched");
    if (!isReconciliationAmountMatch(entry.amount, movement.delta)) {
        throw new ApiError(422, "Bank statement amount and sign must exactly match the cash movement.", [], "", "reconciliation_amount_mismatch");
    }

    try {
        return await prisma.$transaction(async (tx) => {
            const movementClaim = await tx.cashMovement.updateMany({ where: { id: movementId, cashAccountId, reconciledAt: null }, data: { reconciledAt: new Date() } });
            if (movementClaim.count !== 1) throw new ApiError(409, "The cash movement was reconciled in another session.", [], "", "reconciliation_concurrent_change");
            const entryClaim = await tx.bankStatementEntry.updateMany({ where: { id: entryId, cashAccountId, matchedMovementId: null }, data: { matchedMovementId: movementId } });
            if (entryClaim.count !== 1) throw new ApiError(409, "The bank statement entry was reconciled in another session.", [], "", "reconciliation_concurrent_change");
            return tx.bankStatementEntry.findUniqueOrThrow({ where: { id: entryId } });
        }, { isolationLevel: "Serializable" });
    } catch (error) {
        if (error?.code === "P2034" || error?.code === "P2002") throw new ApiError(409, "The reconciliation changed in another session.", [], "", "reconciliation_concurrent_change");
        throw error;
    }
};
