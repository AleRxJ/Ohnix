import React, { createContext, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../api/api.js";
import useI18n from "../hooks/useI18n";
import { clearOfflineDataOnLogout } from "../offline/db.js";
import { subscribeConnectivity } from "../offline/connectivity.js";

const AuthContext = createContext();

// Snapshot of the last confirmed session, so a reload while genuinely
// offline (see Frontend/src/sw.js's navigateFallback) can restore the app
// instead of bouncing to /login - a network failure on the /users/current-user
// check below is not proof the session is invalid, only that it couldn't be
// confirmed right now. Deliberately just localStorage (synchronous, same
// place accessToken already lives) rather than Dexie - this only needs to
// answer "who was logged in last", not the fuller team/permissions snapshot
// OFFLINE_ARCHITECTURE.md's section 8 flags as still unsolved.
const LAST_KNOWN_USER_KEY = "ohnix:lastKnownUser";
const persistUserSnapshot = (user) => {
    try {
        localStorage.setItem(LAST_KNOWN_USER_KEY, JSON.stringify(user));
    } catch {
        // Storage full/unavailable (private browsing) - offline reload just
        // won't restore the session in that case, nothing else depends on it.
    }
};
const readUserSnapshot = () => {
    try {
        const raw = localStorage.getItem(LAST_KNOWN_USER_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};
const clearUserSnapshot = () => {
    try {
        localStorage.removeItem(LAST_KNOWN_USER_KEY);
    } catch {
        // Nothing to clean up if storage isn't available in the first place.
    }
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authenticated, setAuthenticated] = useState(false);
    const { t } = useI18n();

    // Check authentication status on mount
    useEffect(() => {
        checkAuthStatus();
    }, []);

    // Re-confirm for real once connectivity is back - closes the gap left by
    // the offline-snapshot restore in checkAuthStatus's catch block above. A
    // session that was optimistically restored while offline (browser
    // 'online' events aren't reliable either, but connectivity.js's own
    // reachability probe fires this event only once it's actually confirmed
    // reaching the server) gets its real answer here, including a genuine
    // logout if the session was actually invalidated in the meantime.
    useEffect(() => subscribeConnectivity((online) => {
        if (online) checkAuthStatus();
    }), []);

    // If accessToken stored in localStorage, set default header
    useEffect(() => {
        const token = localStorage.getItem("accessToken");
        if (token) {
            api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
        }
    }, []);

    // api.js's interceptor dispatches this the moment a silent token refresh
    // fails for real (refresh token expired/invalid too, not a network
    // failure - that case never reaches here) - the one signal that tells
    // this context to stop believing it's logged in right now, instead of
    // waiting for the next mount/reconnect check to happen to run. Mirrors
    // checkAuthStatus's own real-401 branch: clears the session but
    // deliberately leaves the offline outbox/mirror alone (same "requires
    // login again to resume syncing, pending work isn't lost" policy
    // OFFLINE_ARCHITECTURE.md section 8 describes for this exact case).
    useEffect(() => {
        const handleSessionExpired = () => {
            setUser(null);
            setAuthenticated(false);
            localStorage.removeItem("accessToken");
            clearUserSnapshot();
            delete api.defaults.headers.common["Authorization"];
            toast.error(t("auth.session_expired"), { duration: 6000 });
        };
        window.addEventListener("ohnix:session-expired", handleSessionExpired);
        return () => window.removeEventListener("ohnix:session-expired", handleSessionExpired);
    }, [t]);

    // Function to check if user is authenticated
    const checkAuthStatus = async () => {
        try {
            setLoading(true);
            const response = await api.get("/users/current-user");

            if (response.data.success) {
                setUser(response.data.data);
                setAuthenticated(true);
                persistUserSnapshot(response.data.data);
            } else {
                setUser(null);
                setAuthenticated(false);
                clearUserSnapshot();
            }
        } catch (error) {
            console.error("Auth check error:", error);
            if (!error.response) {
                // Real network failure (see connectivity.js's
                // reportNetworkFailure, triggered by this very error) - not
                // proof the session is invalid, only that it couldn't be
                // confirmed right now. Restore the last confirmed session
                // instead of bouncing to /login; checkAuthStatus reruns for
                // real the moment the app is back online (see the
                // subscribeConnectivity effect below), which replaces this
                // optimistic restore with the server's actual answer - if
                // the session really was invalidated in the meantime (e.g.
                // password changed from another device), that recheck logs
                // the user out for real then, not before.
                const snapshot = readUserSnapshot();
                if (snapshot) {
                    setUser(snapshot);
                    setAuthenticated(true);
                    return;
                }
            }
            // A real 401/403 (or no snapshot to fall back to) - only now is
            // it safe to treat this as "not logged in".
            setUser(null);
            setAuthenticated(false);
            clearUserSnapshot();
        } finally {
            setLoading(false);
        }
    };

    // Shared by login() and endImpersonation() - both swap in a brand-new
    // accessToken + user for the current browser session the exact same way.
    const applySession = (sessionUser, token) => {
        setUser(sessionUser);
        if (token) {
            localStorage.setItem("accessToken", token);
            api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
        }
        setAuthenticated(true);
        persistUserSnapshot(sessionUser);
    };

    // Login function. `silent` skips the success/error toasts - used right
    // after registration (Signup.jsx) to authenticate a brand-new account
    // without a redundant "logged in" toast on top of "account created".
    const login = async (credentials, { silent = false } = {}) => {
        try {
            const response = await api.post("/users/login", credentials);
            const data = response.data;

            if (data.success) {
                applySession(data.data.user, data.data.accessToken);
                if (!silent) toast.success(t("auth.login_success"));
                return { success: true };
            } else {
                if (!silent) toast.error(data.message || t("auth.login_failed"));
                return { success: false, message: data.message };
            }
        } catch (error) {
            // Logging in is the one thing that can never work offline - there's
            // no prior session to fall back to yet (unlike checkAuthStatus's
            // snapshot restore above, for a device that's logged in before).
            // "Error" alone here told a user with no internet nothing useful
            // about what to actually do next.
            const errorMessage = !error.response
                ? t("auth.login_requires_connection")
                : error.response?.data?.message || t("common.error");
            if (!silent) toast.error(errorMessage);
            return { success: false, message: errorMessage };
        }
    };

    // Swaps the current (impersonated) session back to the admin's own,
    // exactly like a fresh login - see Backend's endImpersonation.
    const endImpersonation = async () => {
        try {
            const response = await api.post("/users/impersonation/end");
            const data = response.data;
            if (data.success) {
                applySession(data.data.user, data.data.accessToken);
                return { success: true };
            }
            toast.error(data.message || t("common.error"));
            return { success: false, message: data.message };
        } catch (error) {
            const errorMessage = error.response?.data?.message || t("common.error");
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
                clearUserSnapshot();
                delete api.defaults.headers.common["Authorization"];
                await clearOfflineDataOnLogout();
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
        applySession,
        endImpersonation,
    };

    return (
        <AuthContext.Provider value={authContextValue}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
