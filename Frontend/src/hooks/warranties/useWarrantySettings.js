import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../../api/api.js";
import useI18n from "../useI18n";
import { resolveApiErrorMessage } from "../../utils/apiError";

export const useWarrantySettings = () => {
    const { t } = useI18n();
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const fetchSettings = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get("/warranties/settings");
            setSettings(response.data.data);
            return response.data.data;
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t) || t("warranties.error_fetching_settings"));
            return null;
        } finally {
            setLoading(false);
        }
    }, [t]);

    const saveSettings = async (payload) => {
        setSaving(true);
        try {
            await api.put("/warranties/settings", payload);
            toast.success(t("warranties.settings_saved"));
            await fetchSettings();
            return true;
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t) || t("warranties.error_saving_settings"));
            return false;
        } finally {
            setSaving(false);
        }
    };

    return { settings, loading, saving, fetchSettings, saveSettings };
};
