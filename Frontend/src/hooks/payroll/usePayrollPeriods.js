import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../../api/api";
import useI18n from "../useI18n";
import { resolveApiErrorMessage } from "../../utils/apiError";
import { idempotencyHeaders } from "../../utils/idempotency";
import { useDataInvalidation } from "../useDataInvalidation";
import { getConnectivityState } from "../../offline/connectivity";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { queueCreate, queueUpdate, readMirrorAll, mirrorReplaceAll } from "../../offline/entityQueue";

const ERROR_CODES = {
    payroll_no_matching_employees: "payroll.error_no_matching_employees",
    payroll_legal_parameters_missing: "payroll.error_legal_parameters_missing",
    invalid_payroll_status_transition: "payroll.error_invalid_status_transition",
    insufficient_cash_balance: "payroll.error_insufficient_cash_balance",
    payroll_cash_account_not_found: "payroll.error_cash_account_not_found",
};

// Full-mirror hook for PayrollPeriod, including the offline queue for
// create/calculate/approve/pay/cancel - same idiom as
// useProductionOrders.js (sub-resource actions go through queueUpdate with
// an explicit method+url, since they aren't a plain resource PATCH).
export const usePayrollPeriods = () => {
    const { t } = useI18n();
    const [periods, setPeriods] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchPeriods = useCallback(async () => {
        if (!getConnectivityState()) {
            setPeriods(await readMirrorAll("payrollPeriods"));
            setLoading(false);
            return;
        }
        try {
            const response = await api.get("/payroll/periods");
            const data = response.data.data || [];
            setPeriods(data);
            mirrorReplaceAll("payrollPeriods", data);
        } catch (err) {
            if (!err.response) {
                setPeriods(await readMirrorAll("payrollPeriods"));
            } else {
                toast.error(resolveApiErrorMessage(err, t, ERROR_CODES, "payroll.failed_load_periods"));
            }
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        fetchPeriods();
    }, [fetchPeriods]);

    useDataInvalidation("payrollPeriod", fetchPeriods);
    useEffect(() => subscribeSyncCompleted(fetchPeriods), [fetchPeriods]);

    const createPeriod = async (payload) => {
        if (!getConnectivityState()) {
            const optimistic = await queueCreate({
                entity: "payrollPeriods",
                url: "/payroll/periods",
                fields: payload,
                optimisticExtra: { status: "draft", documents: [], total_net_pay: 0 },
            });
            toast.success(t("common.offline_saved_locally"));
            setPeriods((prev) => [optimistic, ...prev]);
            return { success: true, data: optimistic };
        }
        try {
            const response = await api.post("/payroll/periods", payload, idempotencyHeaders());
            toast.success(t("payroll.period_created"));
            await fetchPeriods();
            return { success: true, data: response.data.data };
        } catch (err) {
            toast.error(resolveApiErrorMessage(err, t, ERROR_CODES, "payroll.failed_create_period"));
            return { success: false, error: err };
        }
    };

    const runAction = async (id, action, successKey, extraFields = {}, optimisticPatch) => {
        if (!getConnectivityState()) {
            await queueUpdate({
                entity: "payrollPeriods",
                url: `/payroll/periods/${id}/${action}`,
                id,
                fields: extraFields,
                optimisticPatch,
                method: "patch",
            });
            toast.success(t("common.offline_saved_locally"));
            await fetchPeriods();
            return { success: true };
        }
        try {
            await api.patch(`/payroll/periods/${id}/${action}`, extraFields, idempotencyHeaders());
            toast.success(t(successKey));
            await fetchPeriods();
            return { success: true };
        } catch (err) {
            toast.error(resolveApiErrorMessage(err, t, ERROR_CODES, "payroll.failed_update_period"));
            return { success: false, error: err };
        }
    };

    const calculatePeriod = (id) => runAction(id, "calculate", "payroll.period_calculated", {}, { status: "calculated" });
    const approvePeriod = (id) => runAction(id, "approve", "payroll.period_approved", {}, { status: "approved" });
    const payPeriod = (id, { cashAccountId, paymentDate }) =>
        runAction(id, "pay", "payroll.period_paid", { cash_account_id: cashAccountId, payment_date: paymentDate }, { status: "paid" });
    const cancelPeriod = (id) => runAction(id, "cancel", "payroll.period_cancelled", {}, { status: "cancelled" });

    return { periods, loading, fetchPeriods, createPeriod, calculatePeriod, approvePeriod, payPeriod, cancelPeriod };
};
