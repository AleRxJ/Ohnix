import { useEffect } from "react";

// A handful of distinct, readable-on-dark-badge colors, picked deterministically
// per user so the same person's highlight stays the same color across fields
// and re-renders instead of flickering between colors.
const COLORS = ["#F59E0B", "#38BDF8", "#A78BFA", "#FB7185", "#34D399", "#F472B6", "#FBBF24"];

const colorForUser = (userId) => {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
    }
    return COLORS[hash % COLORS.length];
};

const ATTR = "data-ohnix-presence-field";

const clearHighlights = () => {
    document.querySelectorAll(`[${ATTR}]`).forEach((el) => {
        el.removeAttribute(ATTR);
        el.style.removeProperty("--ohnix-presence-color");
    });
};

// Renders nothing - highlights whichever field each *other* viewer currently
// has focused (see hooks/useResourcePresence.js's field-level presence) by
// tagging the surrounding .ant-form-item with a data attribute the CSS in
// index.css turns into an outline + name tag. Targets the whole Form.Item
// rather than the raw input so it works the same for a plain text field and
// a Select (whose focusable DOM node is often a near-invisible search
// input, not the visible box).
const FieldPresenceHighlighter = ({ viewers = [], currentUserId }) => {
    useEffect(() => {
        clearHighlights();

        viewers
            .filter((v) => v.userId !== currentUserId && v.field)
            .forEach((v) => {
                const target = document.getElementById(v.field);
                const el = target?.closest(".ant-form-item") || target;
                if (!el) return;
                el.setAttribute(ATTR, v.username || "");
                el.style.setProperty("--ohnix-presence-color", colorForUser(v.userId));
            });

        return clearHighlights;
    }, [viewers, currentUserId]);

    return null;
};

export default FieldPresenceHighlighter;
