import { toast } from "react-hot-toast";
import { api } from "../api/api";
// Plain service module, not a React component/hook - can't call useI18n()
// (a hook) here, so this uses the i18next instance directly instead. i18n.t
// works the same as the hook's `t` once i18next has initialized (App.jsx
// imports ./i18n/config on startup, before any of these methods can run).
import i18n from "../i18n/config";

export const userService = {
    // Profile update
    async updateProfile(username) {
        try {
            const response = await api.patch("/users/update-account", {
                username,
            });

            if (response.data.success) {
                toast.success(i18n.t("profile.update_success_toast"), {
                    position: "top-right",
                    duration: 3000,
                });
            }

            return response.data;
        } catch (error) {
            toast.error(
                error.response?.data?.message || i18n.t("profile.update_failed_toast"),
                {
                    position: "top-right",
                    duration: 4000,
                }
            );
            throw error;
        }
    },

    async updatePreferredLanguage(preferredLanguage) {
        const response = await api.patch("/users/update-account", {
            preferredLanguage,
        });

        return response.data;
    },

    async updatePreferredTheme(theme) {
        const response = await api.patch("/users/update-account", {
            theme,
        });

        return response.data;
    },

    // Avatar upload
    async updateAvatar(file) {
        const formData = new FormData();
        formData.append("avatar", file);

        try {
            const response = await api.patch("/users/avatar", formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            });

            if (response.data.success) {
                toast.success(i18n.t("profile.avatar_update_success_toast"));
            }

            return response.data;
        } catch (error) {
            toast.error(
                error.response?.data?.message || i18n.t("profile.avatar_update_failed_toast")
            );
            throw error;
        }
    },

    // Password management
    async sendChangePasswordOtp() {
        try {
            await api.post("/users/send-change-password-otp");
            toast.success(i18n.t("profile.otp_sent_toast"));
        } catch (error) {
            toast.error(error.response?.data?.message || i18n.t("profile.otp_send_failed_toast"));
            throw error;
        }
    },

    async verifyOtp(otp) {
        try {
            const response = await api.post(
                "/users/verify-change-password-otp",
                { otp }
            );
            return response.data;
        } catch (error) {
            toast.error(error.response?.data?.message || i18n.t("profile.otp_invalid_toast"), {
                position: "top-right",
                duration: 4000,
            });
            throw error;
        }
    },

    async changePassword(oldPassword, newPassword, otp) {
        try {
            const response = await api.post("/users/change-password", {
                oldPassword,
                newPassword,
                otp,
            });

            if (response.data.success) {
                toast.success(i18n.t("profile.password_change_success_toast"));
            }

            return response.data;
        } catch (error) {
            toast.error(
                error.response?.data?.message || i18n.t("profile.password_change_failed_toast"),
                {
                    position: "top-right",
                    duration: 4000,
                }
            );
            throw error;
        }
    },
};
