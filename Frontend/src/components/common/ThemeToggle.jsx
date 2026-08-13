import React from "react";
import { useTheme } from "../../context/ThemeContext";
import useI18n from "../../hooks/useI18n";

/**
 * Dark/Lite switch. Built from plain buttons (not an antd control) since no
 * antd component in this app has ever been given a Lite-aware skin - reusing
 * one here would render with antd's default light look regardless of the
 * active theme.
 */
const ThemeToggle = ({ className = "", compact = false }) => {
    const { theme, setTheme } = useTheme();
    const { t } = useI18n();

    const options = [
        { key: "dark", icon: "🌙", label: t("common.theme_dark") },
        { key: "lite", icon: "☀️", label: t("common.theme_lite") },
    ];

    return (
        <div
            className={`inline-flex items-center gap-1 rounded-full border border-[var(--ohnix-line-5)] bg-[var(--ohnix-line-1)] p-1 ${className}`}
            role="group"
            aria-label={t("common.theme")}
        >
            {options.map((option) => {
                const active = theme === option.key;
                return (
                    <button
                        key={option.key}
                        type="button"
                        onClick={() => setTheme(option.key)}
                        aria-pressed={active}
                        title={option.label}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold leading-none transition-colors ${
                            active
                                ? "bg-[#29D8D5] text-[#021314]"
                                : "text-[var(--ohnix-text-muted)] hover:text-[var(--ohnix-text-primary)]"
                        }`}
                    >
                        <span aria-hidden="true">{option.icon}</span>
                        {!compact && <span>{option.label}</span>}
                    </button>
                );
            })}
        </div>
    );
};

export default ThemeToggle;
