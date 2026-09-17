import PropTypes from "prop-types";
import useI18n from "../../hooks/useI18n";

const HEIGHTS = [35, 55, 70, 85, 100];

// 5-bar "signal strength" read on priority (0-10), tinted by the
// discovery's own type color - deliberately not a generic progress bar,
// ties back to the reveal moment's signal/radar motif so the same idea
// ("how strong is this signal") shows up consistently across the feed and
// the detail view.
const SignalBars = ({ priorityScore, color }) => {
    const { t } = useI18n();
    const filledCount = Math.max(1, Math.min(5, Math.round((priorityScore / 10) * 5)));
    return (
        <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 22 }} title={`${t("discoveries.priority_score_label")} ${priorityScore.toFixed(1)}/10`}>
            {HEIGHTS.map((height, i) => (
                <div
                    key={height}
                    style={{
                        width: 4,
                        borderRadius: 999,
                        height: `${height}%`,
                        background: i < filledCount ? color : "var(--ohnix-line-4)",
                        boxShadow: i < filledCount ? `0 0 8px ${color}` : "none",
                    }}
                />
            ))}
        </div>
    );
};

SignalBars.propTypes = {
    priorityScore: PropTypes.number.isRequired,
    color: PropTypes.string.isRequired,
};

export default SignalBars;
