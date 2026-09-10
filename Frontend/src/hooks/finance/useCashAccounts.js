import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { financeService } from "../../services/financeService";
import { useDataInvalidation } from "../useDataInvalidation";
import useI18n from "../useI18n";
import { getConnectivityState } from "../../offline/connectivity";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { queueCreate, queueUpdate, readMirrorAll, mirrorReplaceAll } from "../../offline/entityQueue";
import { enqueueOperation } from "../../offline/outbox";
import { financeErrorMessage } from "../../utils/financeError";

// Combined hook (list + CRUD + movements/reconciliation) - same shape as
// usePurchase.js rather than the two-hook orders split, since Finance.jsx is
// a single page with no separate "operations" consumer.
export const useCashAccounts = () => {
    const { t } = useI18n();
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const load = useCallback(async () => {
        if (!getConnectivityState()) {
            setAccounts(await readMirrorAll("cashAccounts"));
            setLoading(false);
            return;
        }
        try {
            const res = await financeService.listCashAccounts();
            setAccounts(res?.data || []);
            mirrorReplaceAll("cashAccounts", res?.data || []);
        } catch (err) {
            if (!err.response) {
                setAccounts(await readMirrorAll("cashAccounts"));
                return;
            }
            toast.error(financeErrorMessage(err, t));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        load();
    }, [load]);

    // No socket event is emitted by the backend for finance mutations yet
    // (see the Fase 3b plan) - kept subscribed anyway in case another module
    // ever reuses "cashAccount" as its resource key, at zero cost while none
    // does.
    useDataInvalidation("cashAccount", load);

    // Refetch once a full sync cycle completes (not merely "connectivity
    // came back") - see useOrders.js for why the raw connectivity event
    // alone races the outbox drain.
    useEffect(() => subscribeSyncCompleted(load), [load]);

    const createAccount = async (values) => {
        setSubmitting(true);
        if (!getConnectivityState()) {
            await queueCreate({ entity: "cashAccounts", url: "/finance/cash-accounts", fields: values, optimisticExtra: { is_active: true, balance: 0 } });
            toast.success(t("common.offline_saved_locally"));
            await load();
            setSubmitting(false);
            return true;
        }
        try {
            await financeService.createCashAccount(values);
            toast.success(t("finance.created"));
            await load();
            return true;
        } catch (err) {
            toast.error(financeErrorMessage(err, t));
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const updateAccount = async (id, values) => {
        setSubmitting(true);
        if (!getConnectivityState()) {
            await queueUpdate({ entity: "cashAccounts", url: `/finance/cash-accounts/${id}`, id, fields: values });
            toast.success(t("common.offline_saved_locally"));
            await load();
            setSubmitting(false);
            return true;
        }
        try {
            await financeService.updateCashAccount(id, values);
            toast.success(t("finance.updated"));
            await load();
            return true;
        } catch (err) {
            toast.error(financeErrorMessage(err, t));
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const deactivateAccount = async (id) => {
        if (!getConnectivityState()) {
            // A state change (is_active: false), not a removal - the account
            // still needs to be visible (e.g. its historical balance/movements),
            // so this goes through queueUpdate, not queueDelete.
            await queueUpdate({
                entity: "cashAccounts",
                url: `/finance/cash-accounts/${id}/deactivate`,
                id,
                fields: {},
                optimisticPatch: { is_active: false },
                method: "post",
            });
            toast.success(t("common.offline_saved_locally"));
            await load();
            return;
        }
        try {
            await financeService.deactivateCashAccount(id);
            toast.success(t("finance.deactivated"));
            await load();
        } catch (err) {
            toast.error(financeErrorMessage(err, t));
        }
    };

    const transferCash = async (values) => {
        setSubmitting(true);
        if (!getConnectivityState()) {
            // Action-only (touches two accounts' balances at once) - no
            // optimistic balance change is attempted here on purpose (see
            // syncEngine.js's comment on never guessing at money/inventory
            // outcomes the server alone is authoritative over). The
            // accounts' balances simply stay at their last-synced figures
            // until this drains for real.
            await enqueueOperation({
                entity: "cashAccounts",
                opType: "custom",
                request: { method: "post", url: "/finance/transfers", data: values },
            });
            toast.success(t("common.offline_saved_locally"));
            setSubmitting(false);
            return true;
        }
        try {
            await financeService.transferCash(values);
            toast.success(t("finance.transfer_success"));
            await load();
            return true;
        } catch (err) {
            toast.error(financeErrorMessage(err, t, "finance.transfer_failed"));
            return false;
        } finally { setSubmitting(false); }
    };
    const adjustCash = async (values) => {
        setSubmitting(true);
        if (!getConnectivityState()) {
            await enqueueOperation({
                entity: "cashAccounts",
                opType: "custom",
                request: { method: "post", url: "/finance/adjustments", data: values },
            });
            toast.success(t("common.offline_saved_locally"));
            setSubmitting(false);
            return true;
        }
        try {
            await financeService.adjustCash(values);
            toast.success(t("finance.adjustment_success"));
            await load();
            return true;
        } catch (err) {
            toast.error(financeErrorMessage(err, t, "finance.adjustment_failed"));
            return false;
        } finally { setSubmitting(false); }
    };

    return {
        accounts,
        loading,
        submitting,
        load,
        createAccount,
        updateAccount,
        deactivateAccount,
        transferCash,
        adjustCash,
    };
};

// Separate hook for the movements/reconciliation drawer - only fetched once
// a specific account's drawer is opened, not on every Finance.jsx render.
export const useCashAccountMovements = (cashAccountId) => {
    const { t } = useI18n();
    const [movements, setMovements] = useState([]);
    const [unmatchedMovements, setUnmatchedMovements] = useState([]);
    const [unmatchedEntries, setUnmatchedEntries] = useState([]);
    const [reconciliationSummary, setReconciliationSummary] = useState({});
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const load = useCallback(async () => {
        if (!cashAccountId) return;
        setLoading(true);
        try {
            const [movementsRes, unmatchedMovementsRes, unmatchedEntriesRes, summaryRes] = await Promise.all([
                financeService.listCashAccountMovements(cashAccountId),
                financeService.listUnmatchedMovements(cashAccountId),
                financeService.listUnmatchedEntries(cashAccountId),
                financeService.getReconciliationSummary(cashAccountId),
            ]);
            setMovements(movementsRes?.data || []);
            setUnmatchedMovements(unmatchedMovementsRes?.data || []);
            setUnmatchedEntries(unmatchedEntriesRes?.data || []);
            setReconciliationSummary(summaryRes?.data || {});
        } catch (err) {
            toast.error(financeErrorMessage(err, t));
        } finally {
            setLoading(false);
        }
    }, [cashAccountId, t]);

    useEffect(() => {
        load();
    }, [load]);

    const addStatementEntry = async (values) => {
        setSubmitting(true);
        try {
            await financeService.createStatementEntries(cashAccountId, [values]);
            toast.success(t("finance.entry_added"));
            await load();
            return true;
        } catch (err) {
            toast.error(financeErrorMessage(err, t));
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const addStatementEntries = async (entries) => {
        setSubmitting(true);
        try {
            const response = await financeService.createStatementEntries(cashAccountId, entries);
            const imported = response?.data?.imported_count ?? entries.length;
            const skipped = response?.data?.skipped_count ?? 0;
            toast.success(t("finance.import_success", { count: imported, skipped }));
            await load();
            return true;
        } catch (err) {
            toast.error(financeErrorMessage(err, t, "finance.import_failed"));
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const matchEntry = async (entryId, movementId) => {
        setSubmitting(true);
        try {
            await financeService.matchEntry({ cashAccountId, entryId, movementId });
            toast.success(t("finance.matched"));
            await load();
            return true;
        } catch (err) {
            toast.error(financeErrorMessage(err, t));
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const getSuggestions = async () => {
        try { const response = await financeService.getReconciliationSuggestions(cashAccountId); return response?.data || []; }
        catch (err) { toast.error(financeErrorMessage(err, t, "finance.suggestions_failed")); return null; }
    };

    const matchEntries = async (rows) => {
        setSubmitting(true); let completed = 0;
        try {
            for (const row of rows) { await financeService.matchEntry({ cashAccountId, entryId: row.entry._id, movementId: row.movement._id }); completed += 1; }
            toast.success(t("finance.suggestions_applied", { count: completed })); await load(); return true;
        } catch (err) { toast.error(financeErrorMessage(err, t, "finance.suggestions_failed")); await load(); return false; }
        finally { setSubmitting(false); }
    };

    const registerStatementExpense = async (payload) => {
        setSubmitting(true);
        try {
            await financeService.registerManualExpense(payload);
            toast.success(t("finance.bank_charge_success"));
            await load();
            return true;
        } catch (err) {
            toast.error(financeErrorMessage(err, t, "finance.bank_charge_failed"));
            return false;
        } finally { setSubmitting(false); }
    };

    const registerStatementIncome = async (payload) => {
        setSubmitting(true);
        try {
            await financeService.registerManualIncome(payload);
            toast.success(t("finance.bank_income_success"));
            await load();
            return true;
        } catch (err) {
            toast.error(financeErrorMessage(err, t, "finance.bank_income_failed"));
            return false;
        } finally { setSubmitting(false); }
    };

    return {
        movements,
        unmatchedMovements,
        unmatchedEntries,
        reconciliationSummary,
        loading,
        submitting,
        addStatementEntry,
        addStatementEntries,
        matchEntry,
        getSuggestions,
        matchEntries,
        registerStatementExpense,
        registerStatementIncome,
    };
};
