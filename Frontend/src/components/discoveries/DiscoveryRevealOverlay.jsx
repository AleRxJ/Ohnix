import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useI18n from "../../hooks/useI18n";
import { useDiscoveries } from "../../context/DiscoveryContext";
import { DISCOVERY_TYPE_COLORS, formatRelativeTime } from "./discoveryMeta";

const REVEAL_PRIORITY_THRESHOLD = 7;
const STORAGE_KEY = "ohnix.discoveries.revealedIds";

const getRevealedIds = () => {
    try {
        return new Set(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"));
    } catch {
        return new Set();
    }
};

const markRevealed = (id) => {
    try {
        const ids = getRevealedIds();
        ids.add(id);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    } catch {
        // localStorage unavailable (private window, blocked storage) - the
        // reveal just shows again next session, not a functional failure.
    }
};

// Mission section 4: "OHNIX ENCONTRÓ ALGO" - the one moment this whole
// engine is built around. Shown at most once per Discovery (tracked in
// localStorage, per viewer - not gamified, not repeatable by refreshing),
// and only for a genuinely high-priority finding - mission rule 5 means
// most sessions show nothing here at all, which is correct, not a bug.
const DiscoveryRevealOverlay = () => {
    const { t } = useI18n();
    const navigate = useNavigate();
    const { discoveries, loading, canView } = useDiscoveries();
    const [candidate, setCandidate] = useState(null);
    const [visible, setVisible] = useState(false);
    // Evaluate "is there a reveal-worthy Discovery" exactly once against the
    // context's first load, same as the old standalone fetch did - without
    // this guard, a later refresh() from elsewhere (e.g. the widget) would
    // re-run this and could pop the reveal moment again mid-session.
    const triggeredRef = useRef(false);

    useEffect(() => {
        if (loading || !canView || triggeredRef.current) return;
        triggeredRef.current = true;
        const revealed = getRevealedIds();
        const best = [...discoveries]
            .filter((d) => d.priority_score >= REVEAL_PRIORITY_THRESHOLD && !revealed.has(d._id))
            .sort((a, b) => b.priority_score - a.priority_score)[0];
        if (best) {
            setCandidate(best);
            // A beat after mount, not instantly on paint - lets the
            // dashboard itself render first so this reads as something
            // arriving, not a flash-of-content blocker.
            window.setTimeout(() => setVisible(true), 260);
        }
    }, [loading, canView, discoveries]);

    if (!candidate) return null;

    const color = DISCOVERY_TYPE_COLORS[candidate.type] || DISCOVERY_TYPE_COLORS.new_pattern;

    const dismiss = () => {
        markRevealed(candidate._id);
        setVisible(false);
        window.setTimeout(() => setCandidate(null), 220);
    };

    const openIt = () => {
        markRevealed(candidate._id);
        setVisible(false);
        navigate("/discoveries", { state: { openId: candidate._id } });
    };

    return (
        <div
            className="no-print fixed inset-0 z-[2000] flex items-center justify-center"
            style={{
                background: "var(--ohnix-modal-mask)",
                backdropFilter: "blur(6px)",
                opacity: visible ? 1 : 0,
                transition: "opacity 320ms ease",
                pointerEvents: visible ? "auto" : "none",
            }}
            role="dialog"
            aria-modal="true"
            aria-label={t("discoveries.widget_fab_label")}
            onKeyDown={(e) => e.key === "Escape" && dismiss()}
        >
            <div className="relative flex flex-col items-center text-center px-8" style={{ maxWidth: 620 }}>
                <div className="relative flex items-center justify-center shrink-0" style={{ width: 220, height: 130 }}>
                    <span className="discovery-reveal-ring" style={{ borderColor: `color-mix(in srgb, ${color} 55%, transparent)` }} />
                    <span className="discovery-reveal-ring d2" style={{ borderColor: `color-mix(in srgb, ${color} 55%, transparent)` }} />
                    <span className="discovery-reveal-ring d3" style={{ borderColor: `color-mix(in srgb, ${color} 55%, transparent)` }} />
                    <span className="discovery-reveal-core" style={{ background: `linear-gradient(135deg, ${color}, #fca5a5)`, boxShadow: `0 0 34px 6px color-mix(in srgb, ${color} 35%, transparent)` }} />
                </div>

                <div
                    className="discovery-reveal-in inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-5"
                    style={{ animationDelay: "300ms", border: "1px solid rgba(41,216,213,.35)", background: "rgba(41,216,213,.08)" }}
                >
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: "#44f3f0", boxShadow: "0 0 12px rgba(68,243,240,.9)" }} />
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--ohnix-alert-cyan-text)" }}>
                        {t("discoveries.reveal_eyebrow")}
                    </span>
                </div>

                <h1
                    className="discovery-reveal-in"
                    style={{ animationDelay: "460ms", margin: 0, fontSize: 28, lineHeight: 1.3, fontWeight: 700, color: "var(--ohnix-text-primary)" }}
                >
                    {candidate.title}
                </h1>

                <div
                    className="discovery-reveal-in flex items-center gap-4 mt-4 flex-wrap justify-center"
                    style={{ animationDelay: "600ms", fontSize: 13, color: "var(--ohnix-text-muted)" }}
                >
                    <span>{t("discoveries.reveal_detected_while_away", { time: formatRelativeTime(candidate.first_detected_at, t) })}</span>
                    <span style={{ width: 3, height: 3, borderRadius: 999, background: "var(--ohnix-text-dim)" }} />
                    <span>
                        {t("discoveries.priority_score_label")} <strong style={{ color: "var(--ohnix-text-soft)" }}>{candidate.priority_score.toFixed(1)}/10</strong>
                    </span>
                    <span style={{ width: 3, height: 3, borderRadius: 999, background: "var(--ohnix-text-dim)" }} />
                    <span>
                        {t("discoveries.score_confidence")} <strong style={{ color: "var(--ohnix-text-soft)" }}>{Math.round(candidate.confidence * 100)}%</strong>
                    </span>
                </div>

                <div className="discovery-reveal-in flex items-center gap-3 mt-7" style={{ animationDelay: "740ms" }}>
                    <button
                        type="button"
                        onClick={openIt}
                        className="cursor-pointer border-0"
                        style={{ padding: "12px 26px", borderRadius: 12, fontSize: 14, fontWeight: 600, color: "#021314", background: "linear-gradient(135deg,#29D8D5 0%,#44F3F0 100%)", boxShadow: "0 8px 28px rgba(41,216,213,.35)" }}
                    >
                        {t("discoveries.reveal_cta_view")}
                    </button>
                    <button
                        type="button"
                        onClick={dismiss}
                        className="cursor-pointer"
                        style={{ padding: "12px 22px", borderRadius: 12, fontSize: 14, fontWeight: 500, color: "var(--ohnix-text-muted)", background: "transparent", border: "1px solid var(--ohnix-line-4)" }}
                    >
                        {t("discoveries.reveal_cta_dismiss")}
                    </button>
                </div>
            </div>

            <style>{`
                .discovery-reveal-ring {
                    position: absolute; inset: 0; margin: auto;
                    width: 210px; height: 210px; border-radius: 999px;
                    border-width: 1.5px; border-style: solid;
                    animation: ohnix-discovery-reveal-ring 3.1s cubic-bezier(.22,1,.36,1) infinite;
                }
                .discovery-reveal-ring.d2 { animation-delay: 1.03s; }
                .discovery-reveal-ring.d3 { animation-delay: 2.06s; }
                @keyframes ohnix-discovery-reveal-ring {
                    0% { transform: scale(0.55); opacity: 0.85; }
                    100% { transform: scale(2.4); opacity: 0; }
                }
                .discovery-reveal-core {
                    position: relative; width: 16px; height: 16px; border-radius: 999px;
                    animation: ohnix-discovery-reveal-core 2.6s ease-in-out infinite;
                }
                @keyframes ohnix-discovery-reveal-core {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.12); }
                }
                .discovery-reveal-in {
                    opacity: 0;
                    animation: ohnix-discovery-reveal-up 750ms cubic-bezier(.22,1,.36,1) both;
                }
                @keyframes ohnix-discovery-reveal-up {
                    from { opacity: 0; transform: translate3d(0, 16px, 0); }
                    to { opacity: 1; transform: translate3d(0, 0, 0); }
                }
                @media (prefers-reduced-motion: reduce) {
                    .discovery-reveal-ring, .discovery-reveal-core, .discovery-reveal-in { animation: none !important; opacity: 1 !important; }
                }
            `}</style>
        </div>
    );
};

export default DiscoveryRevealOverlay;
