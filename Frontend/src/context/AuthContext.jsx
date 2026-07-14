import React, { createContext, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../api/api.js";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authenticated, setAuthenticated] = useState(false);

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

    // Login function
    const login = async (credentials) => {
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
                toast.success("Login successful");
                return { success: true };
            } else {
                toast.error(data.message || "Login failed");
                return { success: false, message: data.message };
            }
        } catch (error) {
            const errorMessage =
                error.response?.data?.message || "Something went wrong";
            toast.error(errorMessage);
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
                toast.success("Logged out successfully");
            } else {
                toast.error(response.data.message || "Logout failed");
            }
        } catch (error) {
            console.error("Logout error:", error);
            toast.error(error.response?.data?.message || "Logout failed");
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
