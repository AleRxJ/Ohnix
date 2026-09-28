// Visual pieces of the Ohnix assistant, in the same language as the
// Discovery Engine (gradient surfaces, uppercase eyebrows, color-mix tints,
// the signal-bars motif) - each one shows something the assistant actually
// does rather than decorating a generic chat:
// - ContextLine: it knows which screen/tab you're on.
// - InsightCard: it has looked at your company's data (state detectors).
// - NextStep: it guides you to a screen or a specific button.
// - SourceChips: its answer is grounded in Ohnix's own screens.
// - ThinkingIndicator: what it's doing while you wait.
// Styles live in AssistantWidget's <style> block (assistant-* classes).
import { useEffect, useId, useState } from "react";
import PropTypes from "prop-types";
import { AimOutlined, ArrowRightOutlined, BookOutlined, EnvironmentOutlined, RightOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import SignalBars from "../discoveries/SignalBars";

// A gradient id is embedded once per rendered <svg>, so every instance needs
// its own unique id via useId() - reusing a literal string here would make
// every icon on the page point at whichever instance's <defs> happens to be
// last in the DOM, silently breaking the fill on all the earlier ones.
export const AssistantSparkleIcon = ({ size = 20 }) => {
    const gradientId = useId();
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#29D8D5" />
                    <stop offset="1" stopColor="#44F3F0" />
                </linearGradient>
            </defs>
            <path d="M12 2.5l1.7 4.9 4.9 1.7-4.9 1.7-1.7 4.9-1.7-4.9-4.9-1.7 4.9-1.7L12 2.5z" fill={`url(#${gradientId})`} />
            <path d="M19 14l.75 2.15L22 17l-2.25.85L19 20l-.75-2.15L16 17l2.25-.85L19 14z" fill={`url(#${gradientId})`} opacity="0.75" />
        </svg>
    );
};

AssistantSparkleIcon.propTypes = { size: PropTypes.number };

// The assistant's avatar: the sparkle inside a tinted orb, with a slow
// radar ring when `live` (header, empty state) - the same "signal" idea the
// Discovery reveal uses.
export const AssistantOrb = ({ size = 32, live = false }) => (
    <span className={`assistant-orb${live ? " is-live" : ""}`} style={{ width: size, height: size }}>
        <AssistantSparkleIcon size={Math.round(size * 0.56)} />
    </span>
);

AssistantOrb.propTypes = { size: PropTypes.number, live: PropTypes.bool };

// Route segment -> i18n label for the "you are here" line.
const MODULE_LABEL_KEYS = {
    dashboard: "assistant.nav.dashboard",
    products: "assistant.nav.products",
    categories: "assistant.nav.categories",
    orders: "assistant.nav.orders",
    quotations: "assistant.nav.quotations",
    "sales-quotations": "assistant.nav.quotations",
    purchases: "assistant.nav.purchases",
    customers: "assistant.nav.customers",
    suppliers: "assistant.nav.suppliers",
    finance: "assistant.nav.finance",
    accounting: "accounting.page_title",
    reports: "assistant.nav.reports",
    "electronic-invoices": "assistant.nav.electronic_invoices",
    "purchase-support-documents": "assistant.nav.support_documents",
    "fiscal-setup": "assistant.nav.fiscal_setup",
    "production-orders": "assistant.nav.production",
    team: "assistant.nav.team",
    integrations: "assistant.nav.integrations",
    billing: "assistant.nav.billing",
    discoveries: "assistant.nav.discoveries",
};

// Accounting tab keys whose label key isn't simply accounting.tab_<key>.
const ACCOUNTING_TAB_LABEL_OVERRIDES = {
    chart: "accounting.tab_chart_of_accounts",
    statements: "accounting.tab_financial_statements",
};

export const ContextLine = ({ module, tab, fallback }) => {
    const { t } = useI18n();
    const moduleKey = MODULE_LABEL_KEYS[module];
    if (!moduleKey) return <span className="assistant-context-line">{fallback}</span>;
    const tabKey = module === "accounting" && tab ? ACCOUNTING_TAB_LABEL_OVERRIDES[tab] || `accounting.tab_${tab}` : null;
    const tabLabel = tabKey ? t(tabKey) : null;
    return (
        <span className="assistant-context-line" title={t("assistant.context_hint")}>
            <EnvironmentOutlined />
            <span className="truncate">
                {t(moduleKey)}
                {tabLabel && tabLabel !== tabKey ? ` › ${tabLabel}` : ""}
            </span>
        </span>
    );
};

ContextLine.propTypes = { module: PropTypes.string, tab: PropTypes.string, fallback: PropTypes.node };

// Detector priority (0-100) -> the same urgency palette the rest of the
// app uses for status (rose > amber > accent).
const insightColor = (priority) =>
    priority >= 80 ? "var(--ohnix-status-rose)" : priority >= 60 ? "var(--ohnix-status-amber)" : "var(--ohnix-accent)";

export const InsightCard = ({ nudge, onAct, disabled }) => {
    const { t } = useI18n();
    const color = insightColor(nudge.priority || 0);
    return (
        <div className="assistant-insight assistant-message-in" style={{ "--insight": color }}>
            <div className="assistant-insight__top">
                <span className="assistant-eyebrow" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
                    {t(nudge.module === "finance" ? "assistant.insight_eyebrow_finance" : "assistant.insight_eyebrow_accounting")}
                </span>
                <SignalBars priorityScore={(nudge.priority || 0) / 10} color={color} />
            </div>
            <p className="assistant-insight__text">{nudge.message}</p>
            <button type="button" className="assistant-insight__cta" onClick={() => onAct(nudge.choice)} disabled={disabled}>
                <span>{nudge.choice}</span>
                <ArrowRightOutlined />
            </button>
        </div>
    );
};

InsightCard.propTypes = {
    nudge: PropTypes.shape({
        module: PropTypes.string,
        priority: PropTypes.number,
        message: PropTypes.string.isRequired,
        choice: PropTypes.string.isRequired,
    }).isRequired,
    onAct: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
};

const StepRow = ({ icon, kicker, label, onClick }) => (
    <button type="button" className="assistant-step" onClick={onClick}>
        <span className="assistant-step__icon">{icon}</span>
        <span className="assistant-step__body">
            <span className="assistant-step__kicker">{kicker}</span>
            <span className="assistant-step__label">{label}</span>
        </span>
        <RightOutlined className="assistant-step__chevron" />
    </button>
);

StepRow.propTypes = { icon: PropTypes.node, kicker: PropTypes.node, label: PropTypes.node, onClick: PropTypes.func.isRequired };

// The guided "where to go next" block under an assistant reply: a screen
// to open and/or the exact control to point at, each as one full-width row.
export const NextStep = ({ actions, onNavigate, onHighlight }) => {
    const { t } = useI18n();
    if (!actions?.navigate && !actions?.highlight) return null;
    return (
        <div className="assistant-next-step">
            <span className="assistant-eyebrow assistant-eyebrow--accent">{t("assistant.next_step")}</span>
            {actions.navigate && (
                <StepRow
                    icon={<ArrowRightOutlined />}
                    kicker={t("assistant.step_go_to")}
                    label={t(actions.navigate.labelKey)}
                    onClick={() => onNavigate(actions.navigate)}
                />
            )}
            {actions.highlight && (
                <StepRow
                    icon={<AimOutlined />}
                    kicker={t("assistant.step_show_me")}
                    label={t(actions.highlight.labelKey)}
                    onClick={() => onHighlight(actions.highlight)}
                />
            )}
        </div>
    );
};

NextStep.propTypes = {
    actions: PropTypes.shape({ navigate: PropTypes.object, highlight: PropTypes.object }),
    onNavigate: PropTypes.func.isRequired,
    onHighlight: PropTypes.func.isRequired,
};

// "Contabilidad › Periodos: cómo funciona (1/3)" -> "Contabilidad › Periodos":
// app-map chunk titles carry a part suffix that means nothing to the reader.
const shortSourceTitle = (title) => title.replace(/\s*\(\d+\/\d+\)$/, "").replace(/:\s*[^:›]+$/, "").trim() || title;

export const SourceChips = ({ sources }) => {
    const { t } = useI18n();
    const titles = [...new Set((sources || []).map((source) => shortSourceTitle(source.title)))];
    if (!titles.length) return null;
    return (
        <div className="assistant-sources">
            <span className="assistant-sources__label">{t("assistant.sources_label")}</span>
            {titles.map((title) => (
                <span key={title} className="assistant-source-chip" title={title}>
                    <BookOutlined />
                    <span className="truncate">{title}</span>
                </span>
            ))}
        </div>
    );
};

SourceChips.propTypes = { sources: PropTypes.arrayOf(PropTypes.shape({ title: PropTypes.string })) };

// Rotates through what the backend really does on a turn - reading the
// company's state only where there are detectors for it (knowsCompany).
const THINKING_STEP_MS = 1600;

export const ThinkingIndicator = ({ knowsCompany }) => {
    const { t } = useI18n();
    const steps = [
        "assistant.thinking_reading",
        ...(knowsCompany ? ["assistant.thinking_company"] : []),
        "assistant.thinking_searching",
        "assistant.thinking_next_step",
    ];
    const [index, setIndex] = useState(0);
    useEffect(() => {
        const timer = window.setInterval(() => setIndex((current) => Math.min(current + 1, steps.length - 1)), THINKING_STEP_MS);
        return () => window.clearInterval(timer);
    }, [steps.length]);
    return (
        <div className="assistant-thinking" role="status" aria-live="polite">
            <span key={index} className="assistant-thinking__text">{t(steps[index])}</span>
            <span className="assistant-thinking__scan" />
        </div>
    );
};

ThinkingIndicator.propTypes = { knowsCompany: PropTypes.bool };
