import { useState } from "react";
import toast from "react-hot-toast";
import { api } from "../../api/api.js";
import useI18n from "../useI18n";
import { resolveApiErrorMessage } from "../../utils/apiError";

// Single-warranty operations for the detail Drawer (status changes,
// attachments, manual notifications, settings) - split from useWarranties.js
// the same way Orders splits list state from per-record operations
// (useOrders.js vs useOrderOperations.js).
export const useWarrantyDetails = () => {
    const { t } = useI18n();
    const [warranty, setWarranty] = useState(null);
    const [loading, setLoading] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [notifying, setNotifying] = useState(false);
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    const fetchWarrantyDetails = async (id) => {
        setLoading(true);
        try {
            const response = await api.get(`/warranties/${id}`);
            setWarranty(response.data.data);
            return response.data.data;
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t) || t("warranties.error_fetching"));
            return null;
        } finally {
            setLoading(false);
        }
    };

    const changeStatus = async (id, status, comment) => {
        setUpdating(true);
        try {
            const response = await api.patch(`/warranties/${id}/status`, { status, comment });
            setWarranty(response.data.data);
            toast.success(t("warranties.status_updated"));
            return true;
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t) || t("warranties.error_updating_status"));
            return false;
        } finally {
            setUpdating(false);
        }
    };

    const updateDetails = async (id, patch) => {
        setUpdating(true);
        try {
            const response = await api.patch(`/warranties/${id}`, patch);
            setWarranty(response.data.data);
            toast.success(t("warranties.updated_successfully"));
            return true;
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t) || t("warranties.error_updating"));
            return false;
        } finally {
            setUpdating(false);
        }
    };

    const addAttachments = async (id, files) => {
        const formData = new FormData();
        Array.from(files).forEach((file) => formData.append("files", file));
        setUpdating(true);
        try {
            const response = await api.post(`/warranties/${id}/attachments`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            setWarranty(response.data.data);
            toast.success(t("warranties.attachments_added"));
            return true;
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t) || t("warranties.error_uploading"));
            return false;
        } finally {
            setUpdating(false);
        }
    };

    const removeAttachment = async (id, attachmentId) => {
        try {
            await api.delete(`/warranties/${id}/attachments/${attachmentId}`);
            await fetchWarrantyDetails(id);
            return true;
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t) || t("warranties.error_deleting"));
            return false;
        }
    };

    const fetchPreview = async (id, channel, event) => {
        setPreviewLoading(true);
        try {
            const response = await api.get(`/warranties/${id}/notify/preview`, { params: { channel, event } });
            setPreview(response.data.data);
            return response.data.data;
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t) || t("warranties.error_preview"));
            return null;
        } finally {
            setPreviewLoading(false);
        }
    };

    const sendNotification = async (id, { channel, event }) => {
        setNotifying(true);
        try {
            await api.post(`/warranties/${id}/notify`, { channel, event });
            toast.success(t("warranties.notification_sent"));
            await fetchWarrantyDetails(id);
            return true;
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t) || t("warranties.error_notifying"));
            return false;
        } finally {
            setNotifying(false);
        }
    };

    return {
        warranty,
        loading,
        updating,
        notifying,
        preview,
        previewLoading,
        fetchWarrantyDetails,
        changeStatus,
        updateDetails,
        addAttachments,
        removeAttachment,
        fetchPreview,
        sendNotification,
        setWarranty,
    };
};
