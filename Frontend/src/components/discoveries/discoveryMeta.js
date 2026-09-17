// Shared type/status -> color + copy mapping, used by the feed card, the
// detail drawer, the reveal overlay and the floating widget so all four
// agree on what a given Discovery.type/status looks like without
// redefining it three times.
//
// Colors are NOT invented for this feature - they're the same status
// tokens already defined in src/index.css (--ohnix-status-*), so a
// Discovery's type reads as "one more state in Ohnix's existing visual
// language" rather than a competing palette bolted on top of it.
//
// These are CSS var() references, not resolved hex, on purpose: danger/
// success/info/warning are re-tuned darker in the light theme for contrast
// on a white background (see the "[data-ohnix-theme="lite"]" block in
// index.css - e.g. status-danger goes #fb7185 -> #be123c), while accent/
// accent-2/status-purple/status-amber are the app's own documented
// exception and stay identical in both themes. Hardcoding any of these to
// a literal hex would silently freeze it at its dark-theme value and wash
// out on a light background.
export const DISCOVERY_TYPE_COLORS = {
    risk: "var(--ohnix-status-danger)",
    opportunity: "var(--ohnix-status-success)",
    contradiction: "var(--ohnix-status-amber)",
    connection: "var(--ohnix-status-info)",
    new_pattern: "var(--ohnix-status-purple)",
    trajectory_shift: "var(--ohnix-accent-2)",
    perception_gap: "var(--ohnix-status-warning)",
};

// Only rendered when a Discovery is NOT in its default "published" state -
// browsing dismissed/actioned/resolved/learned findings still needs to say
// so, but a freshly-published one just shows how long ago it fired instead
// (see DiscoveryListCard/DiscoveryDetailDrawer) - repeating "PUBLICADO" on
// every card added no signal.
export const DISCOVERY_STATUS_LABEL_COLORS = {
    detected: "var(--ohnix-text-muted)",
    investigating: "var(--ohnix-status-info)",
    validated: "var(--ohnix-accent-2)",
    actioned: "var(--ohnix-status-success)",
    resolved: "var(--ohnix-text-muted)",
    dismissed: "var(--ohnix-text-dim)",
    learned: "var(--ohnix-status-purple)",
};

export const discoveryTypeLabelKey = (type) => `discoveries.type_${type}`;
export const discoveryStatusLabelKey = (status) => `discoveries.status_${status}`;

// Mirrors Backend/services/discoveryExplanation.service.js's
// EXPLANATION_TAGS exactly - a small closed set on purpose (mission case G
// is explicit about not inventing conclusions from free text), not every
// tag has a real check yet (see CHECKED_EXPLANATION_TAGS below), the rest
// still get stored and feed the recurrence-based perception-gap check.
export const EXPLANATION_TAGS = ["seasonal", "competitor", "service_issue", "pricing", "already_fixed", "other"];
export const explanationTagLabelKey = (tag) => `discoveries.explanation_tag_${tag}`;

// Only these (detectorKey, tag) pairs get an immediate evidence-backed
// verdict when saved - used purely to decide whether to show a "esto se
// puede verificar" hint next to the tag option; the backend is the actual
// source of truth (an unregistered pair just stores the explanation with
// no check, which is still a fine outcome).
export const CHECKED_EXPLANATION_TAGS = { customer_churn_risk: ["seasonal"] };

export const EXPLANATION_OUTCOME_COLORS = {
    supported: "var(--ohnix-status-success)",
    contradicted: "var(--ohnix-status-danger)",
    inconclusive: "var(--ohnix-text-dim)",
};

// Human labels for every evidence key the 6 detectors actually emit (see
// Backend/services/detectors/*.detector.js) - the raw snake_case key
// ("gap_pct", "avg_delay_prior_days"...) is a fine internal name but reads
// as an API response, not something Ohnix is telling you, when shown
// as-is in a stat tile. Translated via discoveries.evidence.<key> in the
// locale files; falls back to a humanized version of the key for anything
// not listed there (a future detector's evidence still renders, just less
// polished until it earns its own entry).
export const labelForEvidenceKey = (key, t) =>
    t(`discoveries.evidence.${key}`, { defaultValue: key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) });

// A number formatted with locale thousands separators, a "_pct" suffixed
// key shown as a percentage - deliberately NOT currency-formatted here,
// since evidence payloads mix money, ratios, percentages and counts across
// detectors and this renderer has no per-detector knowledge of which is
// which; showing the raw number is honest, showing it with the wrong unit
// symbol would not be.
export const formatEvidenceValue = (key, value) => {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "number") {
        return /pct$/i.test(key) ? `${value}%` : value.toLocaleString("es-CO");
    }
    if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
    return String(value);
};

const RELATIVE_UNITS = [
    { limit: 60, divisor: 1, unit: "second" },
    { limit: 3600, divisor: 60, unit: "minute" },
    { limit: 86400, divisor: 3600, unit: "hour" },
    { limit: 2592000, divisor: 86400, unit: "day" },
    { limit: 31536000, divisor: 2592000, unit: "month" },
    { limit: Infinity, divisor: 31536000, unit: "year" },
];

// "hace 6 horas" / "6 hours ago" rather than a raw timestamp - a
// Discovery's age is part of its story (mission section 4: it worked while
// you were away), a datetime string reads like log output. Needs the `t`
// from useI18n (every call site already has it) so this follows the
// active UI language instead of always rendering in Spanish.
export const formatRelativeTime = (date, t) => {
    if (!date) return "";
    const seconds = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 45) return t("discoveries.time_just_now");
    const bucket = RELATIVE_UNITS.find((u) => seconds < u.limit) || RELATIVE_UNITS[RELATIVE_UNITS.length - 1];
    const count = Math.max(1, Math.round(seconds / bucket.divisor));
    return t(`discoveries.time_ago_${bucket.unit}`, { count });
};

// Initials for a cohort_sample entity chip (customer/supplier name) - "María
// Vargas" -> "MV". Falls back to "?" for a null/empty name so a missing
// name never renders a blank chip.
export const initialsFor = (name) => {
    if (!name || typeof name !== "string") return "?";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
};
