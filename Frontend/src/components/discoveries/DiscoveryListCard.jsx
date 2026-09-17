import PropTypes from "prop-types";
import useI18n from "../../hooks/useI18n";
import DiscoveryTypeIcon from "./DiscoveryTypeIcon";
import SignalBars from "./SignalBars";
import { DISCOVERY_TYPE_COLORS, DISCOVERY_STATUS_LABEL_COLORS, discoveryTypeLabelKey, discoveryStatusLabelKey, formatRelativeTime } from "./discoveryMeta";

const DiscoveryListCard = ({ discovery, onClick }) => {
    const { t } = useI18n();
    const color = DISCOVERY_TYPE_COLORS[discovery.type] || DISCOVERY_TYPE_COLORS.new_pattern;
    const isPublished = discovery.status === "published";

    return (
        <button
            type="button"
            onClick={onClick}
            className="discovery-signal-card"
            style={{
                "--glow": color,
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                gap: 16,
                alignItems: "flex-start",
                padding: "16px 18px",
                borderRadius: 18,
                border: "1px solid var(--ohnix-line-3)",
                background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
            }}
        >
            <div
                style={{
                    flexShrink: 0,
                    width: 42,
                    height: 42,
                    borderRadius: 13,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: `color-mix(in srgb, ${color} 12%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
                    color,
                }}
            >
                <DiscoveryTypeIcon type={discovery.type} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                    <span
                        style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            padding: "4px 10px",
                            borderRadius: 999,
                            color,
                            background: `color-mix(in srgb, ${color} 14%, transparent)`,
                        }}
                    >
                        {t(discoveryTypeLabelKey(discovery.type)).toUpperCase()}
                    </span>
                    {isPublished ? (
                        <span style={{ fontSize: 11, color: "var(--ohnix-text-dim)" }}>{formatRelativeTime(discovery.first_detected_at, t)}</span>
                    ) : (
                        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", color: DISCOVERY_STATUS_LABEL_COLORS[discovery.status] }}>
                            {t(discoveryStatusLabelKey(discovery.status)).toUpperCase()}
                        </span>
                    )}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35, marginBottom: 4, color: "var(--ohnix-text-primary)" }}>{discovery.title}</div>
                <div
                    style={{
                        fontSize: 12.5,
                        color: "var(--ohnix-text-muted)",
                        lineHeight: 1.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                    }}
                >
                    {discovery.summary}
                </div>
            </div>

            <div style={{ flexShrink: 0, width: 84, textAlign: "right" }}>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                    <SignalBars priorityScore={discovery.priority_score} color={color} />
                </div>
                <div style={{ fontSize: 10.5, color: "var(--ohnix-text-muted)" }}>
                    {t("discoveries.confidence_short", { pct: Math.round(discovery.confidence * 100) })}
                </div>
            </div>
        </button>
    );
};

DiscoveryListCard.propTypes = {
    discovery: PropTypes.shape({
        _id: PropTypes.string,
        type: PropTypes.string,
        status: PropTypes.string,
        priority_score: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        confidence: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        first_detected_at: PropTypes.string,
        title: PropTypes.string,
        summary: PropTypes.string,
    }).isRequired,
    onClick: PropTypes.func.isRequired,
};

export default DiscoveryListCard;
