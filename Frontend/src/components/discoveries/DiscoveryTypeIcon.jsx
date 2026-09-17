import PropTypes from "prop-types";

// One consistent hand-drawn icon per Discovery.type - stroke-based, 24px
// grid, no fill except the odd accent dot - deliberately not antd/
// ant-design-icons glyphs, so a discovery reads as its own visual
// vocabulary rather than borrowing report-page iconography.
const PATHS = {
    risk: (
        <>
            <path d="M12 3.5 3 19h18L12 3.5z" />
            <path d="M12 10v4" />
            <circle cx="12" cy="16.6" r=".4" fill="currentColor" stroke="none" />
        </>
    ),
    opportunity: (
        <>
            <path d="M4 17 12 7l4 4 4-5" />
            <path d="M15 6h5v5" />
        </>
    ),
    contradiction: (
        <>
            <path d="M4 9h13M17 9l-3-3M17 9l-3 3" />
            <path d="M20 15H7M7 15l3-3M7 15l3 3" />
        </>
    ),
    connection: (
        <>
            <circle cx="6" cy="7" r="2.6" />
            <circle cx="18" cy="17" r="2.6" />
            <path d="M8.3 8.6 15.7 15.4" />
        </>
    ),
    new_pattern: <path d="M12 3l2.2 6.8H21l-5.6 4.1 2.1 6.9L12 16.8 6.5 20.8l2.1-6.9L3 9.8h6.8L12 3z" />,
    trajectory_shift: (
        <>
            <path d="M3 15l5-1 3-6 4 3 6-8" />
            <path d="M3 20h18" />
        </>
    ),
    perception_gap: (
        <>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
        </>
    ),
};

const DiscoveryTypeIcon = ({ type, size = 21 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {PATHS[type] || PATHS.new_pattern}
    </svg>
);

DiscoveryTypeIcon.propTypes = {
    type: PropTypes.string.isRequired,
    size: PropTypes.number,
};

export default DiscoveryTypeIcon;
