import React, { createContext, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../api/api.js";
import useI18n from "../hooks/useI18n";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authenticated, setAuthenticated] = useState(false);
    const { t } = useI18n();

    // Check authentication status on mount
    useEffect(() => {
        checkAuthStatus();
    }, []);

    // If accessToken stored in localStorage, set default header
    useEffect(() => {
        const token = localStorage.getItem("accessToken");
        if (token) {
            api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
        }
    }, []);

    // Function to check if user is authenticated
    const checkAuthStatus = async () => {
        try {
            setLoading(true);
            const response = await api.get("/users/current-user");

            if (response.data.success) {
                setUser(response.data.data);
                setAuthenticated(true);
            } else {
                setUser(null);
                setAuthenticated(false);
            }
        } catch (error) {
            console.error("Auth check error:", error);
            setUser(null);
            setAuthenticated(false);
        } finally {
            setLoading(false);
        }
    };

    // Login function. `silent` skips the success/error toasts - used right
    // after registration (Signup.jsx) to authenticate a brand-new account
    // without a redundant "logged in" toast on top of "account created".
    const login = async (credentials, { silent = false } = {}) => {
        try {
            const response = await api.post("/users/login", credentials);
            const data = response.data;

            if (data.success) {
                setUser(data.data.user);
                // store access token for subsequent API calls
                const token = data.data.accessToken;
                if (token) {
                    localStorage.setItem("accessToken", token);
                    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
                }
                setAuthenticated(true);
                if (!silent) toast.success(t("auth.login_success"));
                return { success: true };
            } else {
                if (!silent) toast.error(data.message || t("auth.login_failed"));
                return { success: false, message: data.message };
            }
        } catch (error) {
            const errorMessage =
                error.response?.data?.message || t("common.error");
            if (!silent) toast.error(errorMessage);
            return { success: false, message: errorMessage };
        }
    };

    // Logout function
    const logout = async () => {
        try {
            const response = await api.post("/users/logout");

            if (response.data.success) {
                setUser(null);
                setAuthenticated(false);
                localStorage.removeItem("accessToken");
                delete api.defaults.headers.common["Authorization"];
                toast.success(t("auth.logout_success"));
            } else {
                toast.error(response.data.message || t("auth.logout_failed"));
            }
        } catch (error) {
            console.error("Logout error:", error);
            toast.error(error.response?.data?.message || t("auth.logout_failed"));
        }
    };

    // Check if user is verified
    const isVerified = () => {
        return user?.isVerified === true;
    };

    const authContextValue = {
        user,
        setUser,
        loading,
        authenticated,
        login,
        logout,
        isVerified,
        refreshUser: checkAuthStatus,
    };

    return (
        <AuthContext.Provider value={authContextValue}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
