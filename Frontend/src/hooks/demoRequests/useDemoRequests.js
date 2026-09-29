import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../../api/api";
import useI18n from "../useI18n";
import { getConnectivityState } from "../../offline/connectivity";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { mirrorReplaceAll, mirrorUpsert, queueUpdate, readMirrorAll } from "../../offline/entityQueue";

const BASE = "/admin/demo-requests";

// Codes the backend returns for this module -> locale keys.
const ERROR_KEYS = {
    demo_account_email_taken: "admin_demo_requests.error_email_taken",
    demo_request_already_provisioned: "admin_demo_requests.error_already_provisioned",
    demo_access_email_failed: "admin_demo_requests.error_access_email",
    demo_catalog_name_column_required: "admin_demo_requests.error_name_column",
};

const byNewest = (a, b) => `${b.created_at || ""}`.localeCompare(`${a.created_at || ""}`);

// Admin "Solicitudes de demo". Offline: the list reads from the
// write-through mirror (db.js "demoRequests") and status/notes edits go
// through the outbox. Provisioning, the import preview, sending access and
// the file download are server actions with no meaningful offline form -
// the page disables them while offline instead of queueing them.
export const useDemoRequests = () => {
    const { t } = useI18n();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(false);

    const errorMessage = useCallback(
        (error) => {
            const key = ERROR_KEYS[error?.response?.data?.code];
            return key ? t(key) : error?.response?.data?.message || t("common.error");
        },
        [t]
    );

    const fetchRequests = useCallback(async () => {
        if (!getConnectivityState()) {
            setRequests((await readMirrorAll("demoRequests")).sort(byNewest));
            return;
        }
        try {
            setLoading(true);
            const response = await api.get(BASE);
            const records = response?.data?.data;
            if (Array.isArray(records)) {
                setRequests(records);
                await mirrorReplaceAll("demoRequests", records);
            }
        } catch (error) {
            if (!error.response) {
                setRequests((await readMirrorAll("demoRequests")).sort(byNewest));
                return;
            }
            toast.error(errorMessage(error));
        } finally {
            setLoading(false);
        }
    }, [errorMessage]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);
    useEffect(() => subscribeSyncCompleted(fetchRequests), [fetchRequests]);

    const replaceLocal = useCallback(async (record) => {
        setRequests((prev) => prev.map((item) => (item._id === record._id ? { ...item, ...record } : item)));
        await mirrorUpsert("demoRequests", record);
    }, []);

    // Status and internal notes - the only edits that make sense offline.
    const updateRequest = useCallback(
        async (id, fields) => {
            const queueLocally = async () => {
                const optimistic = await queueUpdate({ entity: "demoRequests", url: `${BASE}/${id}`, id, fields });
                setRequests((prev) => prev.map((item) => (item._id === id ? optimistic : item)));
                toast.success(t("admin_demo_requests.saved_offline"));
                return { success: true, offline: true };
            };
            if (!getConnectivityState()) return queueLocally();
            try {
                const response = await api.patch(`${BASE}/${id}`, fields);
                await replaceLocal(response.data.data);
                toast.success(t("admin_demo_requests.saved"));
                return { success: true };
            } catch (error) {
                if (!error.response) return queueLocally();
                toast.error(errorMessage(error));
                return { success: false };
            }
        },
        [errorMessage, replaceLocal, t]
    );

    const fetchDetail = useCallback(
        async (id) => {
            try {
                const response = await api.get(`${BASE}/${id}`);
                return response.data.data;
            } catch (error) {
                if (error.response) toast.error(errorMessage(error));
                return null;
            }
        },
        [errorMessage]
    );

    const previewImport = useCallback(
        async (id, mapping) => {
            try {
                const response = await api.post(`${BASE}/${id}/import-preview`, { mapping });
                return response.data.data;
            } catch (error) {
                toast.error(errorMessage(error));
                return null;
            }
        },
        [errorMessage]
    );

    // One Idempotency-Key per click: a retried request replays instead of
    // creating a second account / sending a second email.
    const runAction = useCallback(
        async (id, action, body) => {
            try {
                const response = await api.post(`${BASE}/${id}/${action}`, body, {
                    headers: { "Idempotency-Key": crypto.randomUUID() },
                    timeout: 90000,
                });
                await replaceLocal(response.data.data);
                return response.data.data;
            } catch (error) {
                toast.error(errorMessage(error));
                return null;
            }
        },
        [errorMessage, replaceLocal]
    );

    const provision = useCallback((id, mapping) => runAction(id, "provision", { mapping }), [runAction]);
    const sendAccess = useCallback((id) => runAction(id, "send-access", {}), [runAction]);

    const downloadCatalogFile = useCallback(
        async (id, fileName) => {
            try {
                const response = await api.get(`${BASE}/${id}/catalog-file`, { responseType: "blob" });
                const url = URL.createObjectURL(response.data);
                const link = document.createElement("a");
                link.href = url;
                link.download = fileName || "productos";
                link.click();
                URL.revokeObjectURL(url);
            } catch (error) {
                toast.error(errorMessage(error));
            }
        },
        [errorMessage]
    );

    return { requests, loading, fetchRequests, updateRequest, fetchDetail, previewImport, provision, sendAccess, downloadCatalogFile };
};
