import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Spin } from "antd";
import { CloseOutlined, ArrowRightOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import useIsMobile from "../../hooks/useIsMobile";
import { useDiscoveries } from "../../context/DiscoveryContext";
import DiscoveryTypeIcon from "./DiscoveryTypeIcon";
import { DISCOVERY_TYPE_COLORS, formatRelativeTime } from "./discoveryMeta";

const FAB_SIZE = 48;
const EDGE_MARGIN = 8;
const DRAG_THRESHOLD = 6;
const POSITION_STORAGE_KEY = "ohnix.discoveries.fabPosition";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const loadStoredPosition = () => {
    try {
        const raw = JSON.parse(window.localStorage.getItem(POSITION_STORAGE_KEY) || "null");
        if (!raw || typeof raw.left !== "number" || typeof raw.top !== "number") return null;
        return raw;
    } catch {
        return null;
    }
};

const savePosition = (pos) => {
    try {
        window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(pos));
    } catch {
        // localStorage unavailable - the drag just doesn't persist across
        // reloads, not a functional failure.
    }
};

// The mission's central experience: "Ohnix estuvo trabajando mientras yo no
// estaba" - a floating widget the user notices on their own, not a report
// they had to think to go look at. Mirrors AssistantWidget.jsx's FAB+panel
// structure (same local-useState-only approach, same outside-click-closes
// behavior) but sits at the opposite corner so the two never collide, and
// fetches once on mount rather than on open - there's nothing to catch up
// on mid-session since new discoveries only ever appear from the nightly
// engine run, not from anything the user just did. The FAB pulses in the
// brand teal (Ohnix's own "signal" idiom, see DiscoveryRevealOverlay) -
// individual findings get their own type color once opened.
//
// Draggable + idle-fade on desktop only (see isMobile gates below): a fixed
// widget parked over live content for an entire session is exactly the
// "estorboso" (in the way) complaint this responds to, so it can be dragged
// anywhere and rests at reduced opacity until the mouse is actually on it.
// Touch layouts skip both - there's no hover state to fade against, and
// drag would fight the page's own scroll gesture.
const DiscoveryWidget = () => {
    const { t } = useI18n();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const { discoveries, top: sortedTop, loading, canView } = useDiscoveries();
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(() => loadStoredPosition());
    const [dragging, setDragging] = useState(false);
    const panelRef = useRef(null);
    const wrapRef = useRef(null);
    const dragInfo = useRef(null);
    const posRef = useRef(pos);
    const suppressClickRef = useRef(false);

    useEffect(() => {
        if (!open || isMobile) return;
        const handleClickOutside = (event) => {
            if (!panelRef.current?.contains(event.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open, isMobile]);

    // A dragged position is only meaningful for the viewport it was dragged
    // in - re-clamp on resize so shrinking the window (or rotating a
    // tablet) can't leave the FAB stuck partly or fully off-screen.
    useEffect(() => {
        if (!pos) return;
        const handleResize = () => {
            setPos((prev) => {
                if (!prev) return prev;
                const next = {
                    left: clamp(prev.left, EDGE_MARGIN, window.innerWidth - FAB_SIZE - EDGE_MARGIN),
                    top: clamp(prev.top, EDGE_MARGIN, window.innerHeight - FAB_SIZE - EDGE_MARGIN),
                };
                return next.left === prev.left && next.top === prev.top ? prev : next;
            });
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [pos]);

    if (!canView || (!loading && discoveries.length === 0)) return null;

    const top = sortedTop.slice(0, 3);
    const draggable = !isMobile;

    const goToDiscoveries = (openId) => {
        setOpen(false);
        navigate("/discoveries", openId ? { state: { openId } } : undefined);
    };

    const handlePointerDown = (e) => {
        if (!draggable || (e.button !== undefined && e.button !== 0)) return;
        // The wrapper's own rect, not the button's - Badge shifts the button
        // a few px within it for the count bubble, and left/top below are
        // applied to the wrapper, so measuring anything else would drift.
        const rect = wrapRef.current.getBoundingClientRect();
        dragInfo.current = {
            startX: e.clientX,
            startY: e.clientY,
            startLeft: rect.left,
            startTop: rect.top,
            moved: false,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e) => {
        if (!dragInfo.current) return;
        const dx = e.clientX - dragInfo.current.startX;
        const dy = e.clientY - dragInfo.current.startY;
        if (!dragInfo.current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragInfo.current.moved = true;
        if (!dragging) setDragging(true);
        const next = {
            left: clamp(dragInfo.current.startLeft + dx, EDGE_MARGIN, window.innerWidth - FAB_SIZE - EDGE_MARGIN),
            top: clamp(dragInfo.current.startTop + dy, EDGE_MARGIN, window.innerHeight - FAB_SIZE - EDGE_MARGIN),
        };
        posRef.current = next;
        setPos(next);
    };

    const handlePointerUp = () => {
        const wasDrag = Boolean(dragInfo.current?.moved);
        dragInfo.current = null;
        setDragging(false);
        if (wasDrag) {
            suppressClickRef.current = true;
            if (posRef.current) savePosition(posRef.current);
        }
    };

    const handleFabClick = () => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
        }
        setOpen(true);
    };

    // Once dragged, the panel opens anchored to wherever the FAB now sits
    // instead of always bottom-left - preferring upward (like the FAB's
    // original corner) but flipping below when there isn't enough room
    // above, and clamped so it can never spill past the viewport.
    let panelStyle = null;
    if (pos && !isMobile) {
        const panelWidth = Math.min(380, window.innerWidth - EDGE_MARGIN * 2);
        const panelHeight = Math.min(560, window.innerHeight - EDGE_MARGIN * 2);
        let panelTop = pos.top - panelHeight - 12;
        if (panelTop < EDGE_MARGIN) panelTop = pos.top + FAB_SIZE + 12;
        panelStyle = {
            left: clamp(pos.left, EDGE_MARGIN, window.innerWidth - panelWidth - EDGE_MARGIN),
            top: clamp(panelTop, EDGE_MARGIN, window.innerHeight - panelHeight - EDGE_MARGIN),
            width: panelWidth,
            maxHeight: panelHeight,
        };
    }

    return (
        <>
            {!open && (
                // left-6 only below md - at md+ the sidebar (DashboardSidebar.jsx,
                // 260px wide when expanded) sits in that exact corner and its own
                // bottom user-profile card was rendering right under the FAB, so on
                // desktop this clears past it instead of floating on top of it.
                // Once the user has dragged it, `pos` (persisted) takes over instead.
                <div
                    ref={wrapRef}
                    style={pos ? { left: pos.left, top: pos.top } : undefined}
                    className={
                        `no-print fixed z-[1050] discovery-fab-wrap${dragging ? " is-dragging" : ""}${draggable ? " is-draggable" : ""}` +
                        (pos ? "" : " bottom-6 left-6 md:left-[292px]")
                    }
                >
                    <Badge count={discoveries.length} offset={[-6, 6]} color="#44f3f0">
                        <button
                            type="button"
                            onClick={handleFabClick}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            aria-label={t("discoveries.widget_fab_label")}
                            title={t("discoveries.widget_fab_label")}
                            className="discovery-fab relative flex items-center justify-center h-12 w-12 rounded-full transition-transform duration-150 hover:-translate-y-0.5"
                            style={{
                                background: "linear-gradient(135deg, rgba(41,216,213,0.16), rgba(68,243,240,0.2))",
                                border: "1px solid rgba(41,216,213,0.4)",
                                backdropFilter: "blur(6px)",
                                touchAction: draggable ? "none" : "manipulation",
                            }}
                        >
                            <span className="discovery-fab-ring" aria-hidden="true" />
                            <span style={{ width: 10, height: 10, borderRadius: 999, background: "linear-gradient(135deg,#29d8d5,#44f3f0)" }} />
                        </button>
                    </Badge>
                </div>
            )}

            {open && (
                <div
                    ref={panelRef}
                    className={`discovery-panel-in no-print fixed z-[1051] flex flex-col overflow-hidden ${
                        isMobile ? "inset-0" : panelStyle ? "rounded-3xl" : "bottom-6 left-6 md:left-[292px] rounded-3xl"
                    }`}
                    style={
                        isMobile
                            ? { background: "var(--ohnix-surface-card)" }
                            : {
                                  ...(panelStyle || { width: 380, maxWidth: "calc(100vw - 48px)", maxHeight: "min(560px, calc(100vh - 140px))" }),
                                  background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                                  border: "1px solid var(--ohnix-line-3)",
                                  boxShadow: "0 24px 70px rgba(0,0,0,0.35)",
                              }
                    }
                >
                    <div
                        className="flex items-center gap-2.5 px-4 py-3.5 shrink-0"
                        style={{ borderBottom: "1px solid var(--ohnix-line-3)" }}
                    >
                        <div className="flex items-center justify-center h-8 w-8 rounded-xl shrink-0" style={{ background: "rgba(41,216,213,0.12)" }}>
                            <span style={{ width: 8, height: 8, borderRadius: 999, background: "linear-gradient(135deg,#29d8d5,#44f3f0)", display: "block" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-base font-bold text-[var(--ohnix-text-primary)]">{t("discoveries.widget_panel_title")}</div>
                            <div className="text-xs text-[var(--ohnix-text-muted)]">{t("discoveries.widget_panel_subtitle")}</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label={t("discoveries.widget_close")}
                            className="flex items-center justify-center h-8 w-8 rounded-lg border-0 cursor-pointer shrink-0"
                            style={{ background: "transparent", color: "var(--ohnix-text-muted)" }}
                        >
                            <CloseOutlined />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2" style={{ minHeight: 0 }}>
                        {loading && (
                            <div className="flex justify-center py-8">
                                <Spin size="small" />
                            </div>
                        )}
                        {!loading &&
                            top.map((d) => {
                                const color = DISCOVERY_TYPE_COLORS[d.type] || DISCOVERY_TYPE_COLORS.new_pattern;
                                return (
                                    <button
                                        key={d._id}
                                        type="button"
                                        onClick={() => goToDiscoveries(d._id)}
                                        className="w-full text-left rounded-2xl px-3.5 py-3 cursor-pointer flex gap-3 items-start"
                                        style={{ background: "var(--ohnix-surface-card-soft)", border: "1px solid var(--ohnix-line-3)" }}
                                    >
                                        <div
                                            className="flex items-center justify-center rounded-lg shrink-0"
                                            style={{ width: 30, height: 30, background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
                                        >
                                            <DiscoveryTypeIcon type={d.type} size={16} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-[var(--ohnix-text-primary)] leading-snug line-clamp-2">{d.title}</div>
                                            <div className="text-[11px] mt-1" style={{ color: "var(--ohnix-text-dim)" }}>{formatRelativeTime(d.first_detected_at, t)}</div>
                                        </div>
                                    </button>
                                );
                            })}
                    </div>

                    <div className="px-4 py-3" style={{ borderTop: "1px solid var(--ohnix-line-3)" }}>
                        <button
                            type="button"
                            onClick={() => goToDiscoveries()}
                            className="w-full flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold cursor-pointer border-0"
                            style={{ background: "linear-gradient(135deg, #29D8D5 0%, #44F3F0 100%)", color: "#021314" }}
                        >
                            {t("discoveries.view_all")} <ArrowRightOutlined />
                        </button>
                    </div>
                </div>
            )}

            <style>{`
                .discovery-fab-ring {
                    position: absolute;
                    inset: 0;
                    margin: auto;
                    width: 100%;
                    height: 100%;
                    border-radius: 999px;
                    border: 1px solid rgba(41,216,213,0.55);
                    animation: ohnix-discovery-signal-ring 2.6s cubic-bezier(.22,1,.36,1) infinite;
                }
                @keyframes ohnix-discovery-signal-ring {
                    0% { transform: scale(0.75); opacity: 0.8; }
                    100% { transform: scale(1.7); opacity: 0; }
                }
                .discovery-fab {
                    cursor: pointer;
                }
                .discovery-fab:hover {
                    box-shadow: 0 10px 32px rgba(41,216,213,0.4) !important;
                }
                .discovery-fab-wrap.is-draggable .discovery-fab { cursor: grab; }
                .discovery-fab-wrap.is-draggable.is-dragging .discovery-fab { cursor: grabbing; }
                .discovery-fab-wrap.is-draggable {
                    opacity: 0.55;
                    transition: opacity 220ms ease;
                }
                .discovery-fab-wrap.is-draggable:hover,
                .discovery-fab-wrap.is-draggable.is-dragging {
                    opacity: 1;
                }
                .discovery-panel-in {
                    animation: ohnix-discovery-panel-in 200ms ease-out;
                    transform-origin: bottom left;
                }
                @keyframes ohnix-discovery-panel-in {
                    from { opacity: 0; transform: translateY(12px) scale(0.97); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @media (prefers-reduced-motion: reduce) {
                    .discovery-fab-ring, .discovery-panel-in { animation: none; }
                    .discovery-fab-wrap.is-draggable { transition: none; }
                }
            `}</style>
        </>
    );
};

export default DiscoveryWidget;
