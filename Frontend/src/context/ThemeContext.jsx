import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import AuthContext from "./AuthContext";
import { userService } from "../services/userService";

const STORAGE_KEY = "ohnix.theme";
const DEFAULT_THEME = "dark";
const VALID_THEMES = ["dark", "lite"];

const ThemeContext = createContext(null);

const getStoredTheme = () => {
    if (typeof window === "undefined") {
        return DEFAULT_THEME;
    }

    const storedTheme = window.localStorage.getItem(STORAGE_KEY);
    return VALID_THEMES.includes(storedTheme) ? storedTheme : DEFAULT_THEME;
};

export const ThemeProvider = ({ children }) => {
    const { user, authenticated } = useContext(AuthContext);
    const [theme, setThemeState] = useState(getStoredTheme);
    // Which user's persisted preference we've already applied - guards
    // against this same reconciliation re-firing (and clobbering a manual
    // toggle) on every unrelated re-render while the same user stays logged in.
    const syncedUserIdRef = useRef(null);

    useEffect(() => {
        window.localStorage.setItem(STORAGE_KEY, theme);
        // Set on <html> so it's available before any component mounts.
        // Harmless for the public marketing site: those pages use literal
        // hardcoded colors, not var(--ohnix-*) tokens, so they never
        // consult this attribute regardless of where it lives.
        document.documentElement.setAttribute("data-ohnix-theme", theme);
    }, [theme]);

    // The theme belongs to the account, not the browser: once a user is
    // known, adopt *their* saved preference (default dark) instead of
    // whatever was last left in this browser's localStorage - otherwise a
    // second person logging in on the same machine would inherit the
    // previous person's choice. On logout, reset to the default so a guest
    // (or the next person) starts from dark again.
    useEffect(() => {
        const userId = user?.id || user?._id || null;

        if (authenticated && userId && syncedUserIdRef.current !== userId) {
            syncedUserIdRef.current = userId;
            setThemeState(VALID_THEMES.includes(user?.theme) ? user.theme : DEFAULT_THEME);
        } else if (!authenticated && syncedUserIdRef.current !== null) {
            syncedUserIdRef.current = null;
            setThemeState(DEFAULT_THEME);
        }
    }, [authenticated, user]);

    const setTheme = (nextTheme) => {
        if (!VALID_THEMES.includes(nextTheme)) {
            return;
        }

        setThemeState(nextTheme);

        if (authenticated) {
            userService.updatePreferredTheme(nextTheme).catch(() => {
                // Keep the UI theme change even if persistence fails.
            });
        }
    };

    const toggleTheme = () => {
        setTheme(theme === "dark" ? "lite" : "dark");
    };

    const value = useMemo(
        () => ({ theme, setTheme, toggleTheme, isLite: theme === "lite" }),
        [theme, authenticated]
    );

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);

    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }

    return context;
};
