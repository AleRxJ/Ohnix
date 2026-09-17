import { useNavigate } from "react-router-dom";
import useI18n from "../../hooks/useI18n";
import { useDiscoveries } from "../../context/DiscoveryContext";
import DiscoveryTypeIcon from "./DiscoveryTypeIcon";
import SignalBars from "./SignalBars";
import { DISCOVERY_TYPE_COLORS, formatRelativeTime } from "./discoveryMeta";

// The dashboard's own headline slot for Ohnix's flagship capability - the
// top live Discovery surfaces here, on the page every session already
// opens to, instead of only in the corner widget someone has to notice on
// their own. Renders nothing at all when there's nothing to show (mission
// rule 5, see DiscoveryRevealOverlay's own comment) - that's correct, not
// a bug, so this never reserves empty space "just in case".
const DiscoveryDashboardHero = () => {
    const { t } = useI18n();
    const navigate = useNavigate();
    const { top, openCount, loading, canView } = useDiscoveries();

    if (!canView || loading || top.length === 0) return null;

    const discovery = top[0];
    const color = DISCOVERY_TYPE_COLORS[discovery.type] || DISCOVERY_TYPE_COLORS.new_pattern;
    const extraCount = openCount - 1;

    return (
        <section className="mt-6 animate-fade-up">
            <button
                type="button"
                onClick={() => navigate("/discoveries", { state: { openId: discovery._id } })}
                className="discovery-hero-card"
            >
                <div
                    className="discovery-hero-card__icon"
                    style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)`, borderColor: `color-mix(in srgb, ${color} 32%, transparent)` }}
                >
                    <DiscoveryTypeIcon type={discovery.type} size={26} />
                </div>

                <div className="discovery-hero-card__body">
                    <div className="discovery-hero-card__eyebrow">
                        <span className="discovery-hero-card__pulse" aria-hidden="true" />
                        {t("discoveries.reveal_eyebrow")}
                    </div>
                    <h3 className="discovery-hero-card__title">{discovery.title}</h3>
                    <p className="discovery-hero-card__summary">{discovery.summary}</p>
                    <div className="discovery-hero-card__meta">
                        <span>{formatRelativeTime(discovery.first_detected_at, t)}</span>
                        <span className="discovery-hero-card__dot" aria-hidden="true" />
                        <span>{t("discoveries.confidence_short", { pct: Math.round(discovery.confidence * 100) })}</span>
                        {extraCount > 0 && (
                            <>
                                <span className="discovery-hero-card__dot" aria-hidden="true" />
                                <span>{t("discoveries.hero_more_count", { count: extraCount })}</span>
                            </>
                        )}
                    </div>
                </div>

                <div className="discovery-hero-card__side">
                    <SignalBars priorityScore={discovery.priority_score} color={color} />
                    <span className="discovery-hero-card__cta">
                        {t("discoveries.reveal_cta_view")}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                    </span>
                </div>
            </button>
        </section>
    );
};

export default DiscoveryDashboardHero;
