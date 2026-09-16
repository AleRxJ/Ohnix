import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../../api/api";
import useI18n from "../useI18n";
import { resolveApiErrorMessage } from "../../utils/apiError";
import { useDataInvalidation } from "../useDataInvalidation";
import { getConnectivityState } from "../../offline/connectivity";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { queueCreate, queueUpdate, queueDelete, readMirrorAll, mirrorReplaceAll } from "../../offline/entityQueue";

const ERROR_CODES = {
    employee_document_exists: "payroll.error_employee_document_exists",
    employee_has_payroll_history: "payroll.error_employee_has_payroll_history",
};

// Full-mirror CRUD hook for Employee - same recipe as useProducts.js/
// useCashAccounts.js, simplified (no images, no stock).
export const useEmployees = () => {
    const { t } = useI18n();
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchEmployees = useCallback(async () => {
        if (!getConnectivityState()) {
            setEmployees(await readMirrorAll("employees"));
            setLoading(false);
            return;
        }
        try {
            const response = await api.get("/employees");
            const data = response.data.data || [];
            setEmployees(data);
            mirrorReplaceAll("employees", data);
        } catch (err) {
            if (!err.response) {
                setEmployees(await readMirrorAll("employees"));
            } else {
                toast.error(resolveApiErrorMessage(err, t, ERROR_CODES, "payroll.failed_load_employees"));
            }
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        fetchEmployees();
    }, [fetchEmployees]);

    useDataInvalidation("employee", fetchEmployees);
    useEffect(() => subscribeSyncCompleted(fetchEmployees), [fetchEmployees]);

    const createEmployee = async (fields) => {
        if (!getConnectivityState()) {
            const optimistic = await queueCreate({ entity: "employees", url: "/employees", fields });
            toast.success(t("common.offline_saved_locally"));
            setEmployees((prev) => [optimistic, ...prev]);
            return { success: true, data: optimistic };
        }
        try {
            const response = await api.post("/employees", fields);
            toast.success(t("payroll.employee_created"));
            await fetchEmployees();
            return { success: true, data: response.data.data };
        } catch (err) {
            toast.error(resolveApiErrorMessage(err, t, ERROR_CODES, "payroll.failed_create_employee"));
            return { success: false, error: err };
        }
    };

    const updateEmployee = async (id, fields) => {
        if (!getConnectivityState()) {
            const optimistic = await queueUpdate({ entity: "employees", url: `/employees/${id}`, id, fields });
            toast.success(t("common.offline_saved_locally"));
            setEmployees((prev) => prev.map((e) => (e._id === id ? optimistic : e)));
            return { success: true, data: optimistic };
        }
        try {
            const response = await api.patch(`/employees/${id}`, fields);
            toast.success(t("payroll.employee_updated"));
            await fetchEmployees();
            return { success: true, data: response.data.data };
        } catch (err) {
            toast.error(resolveApiErrorMessage(err, t, ERROR_CODES, "payroll.failed_update_employee"));
            return { success: false, error: err };
        }
    };

    const deleteEmployee = async (id) => {
        if (!getConnectivityState()) {
            await queueDelete({ entity: "employees", url: `/employees/${id}`, id });
            toast.success(t("common.offline_deleted_locally"));
            setEmployees((prev) => prev.filter((e) => e._id !== id));
            return { success: true };
        }
        try {
            await api.delete(`/employees/${id}`);
            toast.success(t("payroll.employee_deleted"));
            setEmployees((prev) => prev.filter((e) => e._id !== id));
            return { success: true };
        } catch (err) {
            toast.error(resolveApiErrorMessage(err, t, ERROR_CODES, "payroll.failed_delete_employee"));
            return { success: false, error: err };
        }
    };

    return { employees, loading, fetchEmployees, createEmployee, updateEmployee, deleteEmployee };
};
