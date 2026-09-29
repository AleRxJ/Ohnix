// Level colors shared by the role editor (picker, summary chips, module
// icons) so a level always reads the same: none = neutral, view = info blue,
// edit = Ohnix cyan, admin = status purple (the "critical actions" tier).
export const LEVEL_COLORS = {
    none: "var(--ohnix-text-dim)",
    view: "var(--ohnix-status-info)",
    edit: "#29D8D5",
    admin: "var(--ohnix-status-purple)",
};

// Translucent version of any color (works with CSS variables too).
export const tint = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
