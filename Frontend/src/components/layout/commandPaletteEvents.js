// Anything can open the command palette (sidebar search button, mobile
// header) without prop-drilling or a context - CommandPalette.jsx is a
// single app-wide instance mounted in DashboardLayout that listens for this.
export const OPEN_COMMAND_PALETTE_EVENT = "ohnix:open-command-palette";

export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");
export const COMMAND_PALETTE_SHORTCUT = isMac ? "⌘K" : "Ctrl K";
