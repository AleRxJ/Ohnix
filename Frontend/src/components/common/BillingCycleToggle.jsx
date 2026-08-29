import React from "react";
import useI18n from "../../hooks/useI18n";

/**
 * Monthly/annual segmented control for pricing pages - same pill-shaped
 * pattern as ThemeToggle (plain buttons, not an antd control, so the active
 * segment always renders in the Ohnix teal regardless of theme). `savingsLabel`
 * renders as a small badge on the annual option (e.g. "-17%" or a peso amount)
 * so the discount is visible without switching the toggle first.
 */
const BillingCycleToggle = ({ value, onChange, savingsLabel, className = "" }) => {
    const { t } = useI18n();

    const options = [
        { key: "MONTHLY", label: t("landing.pricing.billing_toggle.monthly") },
        { key: "ANNUAL", label: t("landing.pricing.billing_toggle.annual") },
    ];

    return (
        <div
            className={`inline-flex items-center gap-1 rounded-full border border-[var(--ohnix-line-5)] bg-[var(--ohnix-line-1)] p-1 ${className}`}
            role="group"
            aria-label={t("landing.pricing.billing_toggle.label")}
        >
            {options.map((option) => {
                const active = value === option.key;
                return (
                    <button
                        key={option.key}
                        type="button"
                        onClick={() => onChange(option.key)}
                        aria-pressed={active}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold leading-none transition-colors ${
                            active
                                ? "bg-[#29D8D5] text-[#021314]"
                                : "text-[var(--ohnix-text-muted)] hover:text-[var(--ohnix-text-primary)]"
                        }`}
                    >
                        <span>{option.label}</span>
                        {option.key === "ANNUAL" && savingsLabel && (
                            <span
                                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                                    active ? "bg-[#021314]/15 text-[#021314]" : "bg-[#29D8D5]/15 text-[#29D8D5]"
                                }`}
                            >
                                {savingsLabel}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export default BillingCycleToggle;
