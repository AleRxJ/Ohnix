import { useEffect, useId, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useLocation, useNavigate } from "react-router-dom";
import { Input, Spin, Tooltip } from "antd";
import {
    CloseOutlined,
    SendOutlined,
    LikeOutlined,
    LikeFilled,
    DislikeOutlined,
    DislikeFilled,
    PlusOutlined,
    ArrowRightOutlined,
    AimOutlined,
    DisconnectOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import useIsMobile from "../../hooks/useIsMobile";
import { assistantService } from "../../services/assistantService";
import { useInventoryTour } from "../../context/InventoryTourContext";
import { useTeam } from "../../context/TeamContext";
import { getAssistantPageContext, spotlightAnchor } from "./assistantPageContext";
import { getConnectivityState, subscribeConnectivity } from "../../offline/connectivity";

const CONVERSATION_STORAGE_KEY = "ohnix.assistant.conversationId";
const SUGGESTION_KEYS = ["suggestion_1", "suggestion_2", "suggestion_3", "suggestion_4"];
// Accounting gets its own openers: people there most often don't know what
// to ask yet, so these start a guided conversation rather than a lookup.
const ACCOUNTING_SUGGESTION_KEYS = [
    "accounting_suggestion_1",
    "accounting_suggestion_2",
    "accounting_suggestion_3",
    "accounting_suggestion_4",
];

const FAB_SIZE = 48;
const EDGE_MARGIN = 8;
const DRAG_THRESHOLD = 6;
const POSITION_STORAGE_KEY = "ohnix.assistant.fabPosition";

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

// Mirrors DashboardLayout's own currentPage derivation (first path segment,
// "admin-<sub>" for /admin/*) - kept as its own tiny copy rather than a
// shared hook since this is the only other consumer and the two have no
// other behavior in common (that one also drives the document title).
const useCurrentModule = () => {
    const location = useLocation();
    const segments = location.pathname.split("/").filter(Boolean);
    if (segments[0] === "admin" && segments[1]) return `admin-${segments[1]}`;
    return segments[0] || "dashboard";
};

// A gradient id is embedded once per rendered <svg>, so every instance needs
// its own unique id via useId() - reusing a literal string here would make
// every icon on the page point at whichever instance's <defs> happens to be
// last in the DOM, silently breaking the fill on all the earlier ones.
const AssistantSparkleIcon = ({ size = 20 }) => {
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

AssistantSparkleIcon.propTypes = {
    size: PropTypes.number,
};

const TypingDots = () => (
    <span className="inline-flex items-center gap-1">
        <span className="assistant-typing-dot" style={{ animationDelay: "0ms" }} />
        <span className="assistant-typing-dot" style={{ animationDelay: "160ms" }} />
        <span className="assistant-typing-dot" style={{ animationDelay: "320ms" }} />
    </span>
);

const AssistantWidget = () => {
    const { t, currentLanguage } = useI18n();
    const isMobile = useIsMobile();
    const currentModule = useCurrentModule();
    const navigate = useNavigate();
    const location = useLocation();
    // Mirrors InventoryTourFab's own visibility check - that button sits
    // directly below this one (both right-6, so perfectly column-aligned),
    // so whenever it hides itself (tour open/completed/dismissed, team
    // member, still loading team info) this FAB needs to drop down into its
    // spot instead of leaving a gap.
    const tourState = useInventoryTour();
    const { isTeamMember, loading: teamLoading } = useTeam();
    const tourFabVisible = !(
        tourState.isOpen ||
        tourState.completed ||
        tourState.fabDismissed ||
        isTeamMember ||
        teamLoading
    );
    // bottom-24 (96px) left only a 24px gap above the tour pill's top edge
    // (bottom-6 + 48px tall) - visually too tight once both buttons' 28px
    // shadow blur is factored in, which is exactly what read as "overlapping"
    // on a real phone screen (reported on Android/BlueStacks). bottom-28
    // doubles that clearance to 40px.
    const fabPositionClass = tourFabVisible ? "bottom-28" : "bottom-6";
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [conversationId, setConversationId] = useState(
        () => window.localStorage.getItem(CONVERSATION_STORAGE_KEY) || null
    );
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [feedbackGiven, setFeedbackGiven] = useState({});
    const [pos, setPos] = useState(() => loadStoredPosition());
    const [dragging, setDragging] = useState(false);
    // The assistant needs the model on the server, so it can't answer
    // offline - but the rest of Ohnix keeps working offline, so this says
    // so plainly instead of letting a send fail into a generic error toast.
    const [online, setOnline] = useState(() => getConnectivityState());
    const listEndRef = useRef(null);
    const panelRef = useRef(null);
    const wrapRef = useRef(null);
    const dragInfo = useRef(null);
    const posRef = useRef(pos);
    const suppressClickRef = useRef(false);

    useEffect(() => {
        listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, sending]);

    useEffect(() => subscribeConnectivity(setOnline), []);

    // A dragged position is only meaningful for the viewport it was dragged
    // in - re-clamp on resize so shrinking the window (or rotating a
    // tablet) can't leave the FAB stuck partly or fully off-screen. Same
    // pattern as DiscoveryWidget.jsx/InventoryTourFab.jsx.
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

    // Floating-card widgets (unlike a full Drawer with its own dimming mask)
    // are expected to dismiss on an outside click - there's nothing else on
    // screen signaling "this is modal," so leaving it open until the user
    // finds the small X would feel stuck. The FAB itself is unmounted while
    // open (see below), so it never needs excluding from this check.
    useEffect(() => {
        if (!open || isMobile) return;
        const handleClickOutside = (event) => {
            if (!panelRef.current?.contains(event.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open, isMobile]);

    useEffect(() => {
        if (!open || !conversationId || messages.length > 0) return;
        setLoadingHistory(true);
        assistantService
            .getConversation(conversationId)
            .then((history) => {
                setMessages(history);
                const feedbackMap = {};
                history.forEach((m) => {
                    if (m.feedback?.rating) feedbackMap[m.id] = m.feedback.rating;
                });
                setFeedbackGiven(feedbackMap);
            })
            .catch(() => {
                // Stale/deleted conversation id - start fresh silently rather
                // than surfacing an error for something the user didn't do.
                window.localStorage.removeItem(CONVERSATION_STORAGE_KEY);
                setConversationId(null);
            })
            .finally(() => setLoadingHistory(false));
    }, [open, conversationId, messages.length]);

    const sendText = async (rawText) => {
        const trimmed = rawText.trim();
        if (!trimmed || sending || !online) return;

        const userMessage = { id: `local-${Date.now()}`, role: "user", content: trimmed };
        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setSending(true);

        try {
            const result = await assistantService.sendMessage({
                conversationId,
                message: trimmed,
                module: currentModule,
                tab: getAssistantPageContext().tab,
                locale: currentLanguage,
            });
            if (result.conversationId && result.conversationId !== conversationId) {
                setConversationId(result.conversationId);
                window.localStorage.setItem(CONVERSATION_STORAGE_KEY, result.conversationId);
            }
            setMessages((prev) => [...prev, result.message]);
        } catch {
            toast.error(t("assistant.error_generic"));
            setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
            setInput(trimmed);
        } finally {
            setSending(false);
        }
    };

    const handleFeedback = async (messageId, rating) => {
        if (feedbackGiven[messageId]) return;
        setFeedbackGiven((prev) => ({ ...prev, [messageId]: rating }));
        try {
            await assistantService.sendFeedback(messageId, rating);
        } catch {
            setFeedbackGiven((prev) => {
                const next = { ...prev };
                delete next[messageId];
                return next;
            });
        }
    };

    // "Ir a" and "Muéstrame dónde" both land on a screen resolved by the
    // backend registry (services/assistantNavigation.js) - path/state are
    // never free-form model output. Navigating only when needed keeps a
    // highlight on the current screen from resetting its filters/scroll.
    const goToScreen = (action) => {
        const sameTab = (location.state?.tab || null) === (action.state?.tab || null);
        if (location.pathname !== action.path || (action.state?.tab && !sameTab)) {
            navigate(action.path, action.state ? { state: action.state } : undefined);
        }
        // Full-screen on mobile - the person can't see what they were sent
        // to until the panel gets out of the way.
        if (isMobile) setOpen(false);
    };

    const handleNavigate = (action) => {
        goToScreen(action);
        if (action.anchor) spotlightAnchor(action.anchor);
    };

    const handleHighlight = async (action) => {
        goToScreen(action);
        const found = await spotlightAnchor(action.anchor);
        // Usually a permission gate (e.g. no edit access hides the "new"
        // buttons) rather than a bug - still worth telling the person why
        // nothing lit up.
        if (!found) toast(t("assistant.highlight_not_found"));
    };

    const handleNewConversation = () => {
        setConversationId(null);
        setMessages([]);
        setFeedbackGiven({});
        window.localStorage.removeItem(CONVERSATION_STORAGE_KEY);
    };

    // Draggable (and idle-faded via the is-draggable class) on touch too,
    // not just mouse - pointer events already unify both, and requiring a
    // mouse to reposition it would strand phone/tablet users with exactly
    // the overlap problem this dragging exists to solve.
    const draggable = true;

    // Draggable + idle-fade + panel-follows-the-FAB, same pattern (and same
    // reasoning) as DiscoveryWidget.jsx/InventoryTourFab.jsx: a chat bubble
    // fixed in one corner for an entire session eventually sits on top of
    // something the user needs to click. Once dragged, `pos` (persisted)
    // takes over from the tour-aware fabPositionClass entirely - the user
    // has taken manual control of where it lives.
    const handlePointerDown = (e) => {
        if (!draggable || (e.button !== undefined && e.button !== 0)) return;
        const rect = wrapRef.current.getBoundingClientRect();
        dragInfo.current = { startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top, moved: false };
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

    // Quick replies only make sense as answers to the latest question - older
    // messages' choices would answer something the conversation has already
    // moved past.
    const lastMessage = messages[messages.length - 1];
    const lastChoices = lastMessage?.role === "assistant" ? lastMessage.actions?.choices || [] : [];

    // Once dragged, the panel opens anchored to wherever the FAB now sits
    // instead of always the bottom-right corner - preferring upward (its
    // original corner's direction) but flipping below when there isn't
    // enough room above, clamped so it can never spill past the viewport.
    let panelStyle = null;
    if (pos && !isMobile) {
        const panelWidth = Math.min(400, window.innerWidth - EDGE_MARGIN * 2);
        const panelHeight = Math.min(640, window.innerHeight - EDGE_MARGIN * 2);
        let panelTop = pos.top - panelHeight - 12;
        if (panelTop < EDGE_MARGIN) panelTop = pos.top + FAB_SIZE + 12;
        panelStyle = {
            left: clamp(pos.left, EDGE_MARGIN, window.innerWidth - panelWidth - EDGE_MARGIN),
            top: clamp(panelTop, EDGE_MARGIN, window.innerHeight - panelHeight - EDGE_MARGIN),
            width: panelWidth,
            height: panelHeight,
        };
    }

    return (
        <>
            {!open && (
                <div
                    ref={wrapRef}
                    style={pos ? { left: pos.left, top: pos.top } : undefined}
                    className={
                        `no-print fixed z-[1050] assistant-fab-wrap${dragging ? " is-dragging" : ""}${draggable ? " is-draggable" : ""}` +
                        (pos ? "" : ` ${fabPositionClass} right-6`)
                    }
                >
                    <button
                        type="button"
                        onClick={handleFabClick}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        aria-label={t("assistant.fab_label")}
                        title={t("assistant.fab_label")}
                        className="assistant-fab flex items-center justify-center h-12 w-12 rounded-full cursor-pointer transition-transform duration-150 hover:-translate-y-0.5"
                        style={{
                            background: "linear-gradient(135deg, rgba(41,216,213,0.18), rgba(68,243,240,0.22))",
                            border: "1px solid rgba(41,216,213,0.4)",
                            boxShadow: "0 8px 28px rgba(41,216,213,0.35)",
                            touchAction: "none",
                        }}
                    >
                        <AssistantSparkleIcon size={24} />
                    </button>
                </div>
            )}

            {open && (
                <div
                    ref={panelRef}
                    className={`assistant-panel-in no-print fixed z-[1051] flex flex-col overflow-hidden ${
                        isMobile ? "inset-0" : panelStyle ? "rounded-3xl" : `${fabPositionClass} right-6 rounded-3xl`
                    }`}
                    style={
                        isMobile
                            ? { background: "var(--ohnix-surface-card)" }
                            : {
                                  ...(panelStyle || { width: 400, maxWidth: "calc(100vw - 48px)", height: "min(640px, calc(100vh - 140px))" }),
                                  background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                                  border: "1px solid var(--ohnix-line-3)",
                                  boxShadow: "0 24px 70px rgba(0,0,0,0.35)",
                              }
                    }
                >
                    <div
                        className="flex items-center gap-2.5 px-4 py-3.5 shrink-0"
                        style={{
                            borderBottom: "1px solid var(--ohnix-line-3)",
                            background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                        }}
                    >
                        <div
                            className="flex items-center justify-center h-8 w-8 rounded-xl shrink-0"
                            style={{ background: "rgba(41,216,213,0.12)" }}
                        >
                            <AssistantSparkleIcon size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-base font-bold text-[var(--ohnix-text-primary)]">
                                {t("assistant.panel_title")}
                            </div>
                            <div className="text-xs font-normal text-[var(--ohnix-text-muted)]">
                                {t("assistant.panel_subtitle")}
                            </div>
                        </div>
                        <Tooltip title={t("assistant.new_conversation")}>
                            <button
                                type="button"
                                onClick={handleNewConversation}
                                aria-label={t("assistant.new_conversation")}
                                className="flex items-center justify-center h-8 w-8 rounded-lg border-0 cursor-pointer shrink-0"
                                style={{ background: "var(--ohnix-surface-card-soft)", color: "var(--ohnix-text-muted)" }}
                            >
                                <PlusOutlined />
                            </button>
                        </Tooltip>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label={t("assistant.close")}
                            className="flex items-center justify-center h-8 w-8 rounded-lg border-0 cursor-pointer shrink-0"
                            style={{ background: "transparent", color: "var(--ohnix-text-muted)" }}
                        >
                            <CloseOutlined />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ minHeight: 0 }}>
                    {loadingHistory && (
                        <div className="flex justify-center py-6">
                            <Spin size="small" />
                        </div>
                    )}

                    {!loadingHistory && messages.length === 0 && (
                        <div className="py-6">
                            <div className="text-sm text-[var(--ohnix-text-muted)] text-center px-4 mb-4">
                                {t("assistant.empty_state")}
                            </div>
                            <div className="flex flex-col gap-2 px-2">
                                {(currentModule === "accounting" ? ACCOUNTING_SUGGESTION_KEYS : SUGGESTION_KEYS).map((key) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => sendText(t(`assistant.${key}`))}
                                        className="assistant-suggestion-chip text-left text-sm rounded-xl px-3.5 py-2.5 cursor-pointer transition-colors duration-150"
                                        style={{
                                            background: "var(--ohnix-surface-card-soft)",
                                            border: "1px solid var(--ohnix-line-3)",
                                            color: "var(--ohnix-text-primary)",
                                        }}
                                    >
                                        {t(`assistant.${key}`)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((message) => (
                        <div
                            key={message.id}
                            className={`assistant-message-in flex items-end gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            {message.role === "assistant" && (
                                <div
                                    className="flex items-center justify-center h-7 w-7 rounded-full shrink-0"
                                    style={{ background: "rgba(41,216,213,0.12)" }}
                                >
                                    <AssistantSparkleIcon size={14} />
                                </div>
                            )}
                            <div
                                className="max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                                style={
                                    message.role === "user"
                                        ? { background: "linear-gradient(135deg, #29D8D5 0%, #44F3F0 100%)", color: "#021314" }
                                        : { background: "var(--ohnix-surface-card-soft)", color: "var(--ohnix-text-primary)", border: "1px solid var(--ohnix-line-3)" }
                                }
                            >
                                <div>{message.content}</div>

                                {message.role === "assistant" && (message.actions?.navigate || message.actions?.highlight) && (
                                    <div className="flex flex-wrap gap-2 mt-2.5">
                                        {message.actions.navigate && (
                                            <button
                                                type="button"
                                                onClick={() => handleNavigate(message.actions.navigate)}
                                                className="assistant-action-btn inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-1.5 cursor-pointer"
                                            >
                                                <ArrowRightOutlined />
                                                {t("assistant.go_to", { label: t(message.actions.navigate.labelKey) })}
                                            </button>
                                        )}
                                        {message.actions.highlight && (
                                            <button
                                                type="button"
                                                onClick={() => handleHighlight(message.actions.highlight)}
                                                className="assistant-action-btn inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-1.5 cursor-pointer"
                                            >
                                                <AimOutlined />
                                                {t("assistant.show_me", { label: t(message.actions.highlight.labelKey) })}
                                            </button>
                                        )}
                                    </div>
                                )}

                                {Array.isArray(message.sources) && message.sources.length > 0 && (
                                    <div className="mt-2 pt-2 text-xs opacity-70" style={{ borderTop: "1px solid var(--ohnix-line-4)" }}>
                                        {t("assistant.sources_label")}: {message.sources.map((s) => s.title).join(", ")}
                                    </div>
                                )}

                                {message.role === "assistant" && !message.id.startsWith("local-") && (
                                    <div className="flex items-center gap-2 mt-2">
                                        <button
                                            type="button"
                                            onClick={() => handleFeedback(message.id, "up")}
                                            aria-label={t("assistant.feedback_prompt")}
                                            className="border-0 bg-transparent cursor-pointer p-0.5"
                                            style={{ color: feedbackGiven[message.id] === "up" ? "#29D8D5" : "var(--ohnix-text-muted)" }}
                                        >
                                            {feedbackGiven[message.id] === "up" ? <LikeFilled /> : <LikeOutlined />}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleFeedback(message.id, "down")}
                                            aria-label={t("assistant.feedback_prompt")}
                                            className="border-0 bg-transparent cursor-pointer p-0.5"
                                            style={{ color: feedbackGiven[message.id] === "down" ? "#FF6B6B" : "var(--ohnix-text-muted)" }}
                                        >
                                            {feedbackGiven[message.id] === "down" ? <DislikeFilled /> : <DislikeOutlined />}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {!sending && lastChoices.length > 0 && (
                        <div className="assistant-message-in flex flex-wrap justify-end gap-2 pl-9">
                            {lastChoices.map((choice) => (
                                <button
                                    key={choice}
                                    type="button"
                                    onClick={() => sendText(choice)}
                                    disabled={!online}
                                    className="assistant-suggestion-chip text-sm rounded-full px-3.5 py-1.5 cursor-pointer transition-colors duration-150 disabled:opacity-40"
                                    style={{
                                        background: "var(--ohnix-surface-card-soft)",
                                        border: "1px solid rgba(41,216,213,0.45)",
                                        color: "var(--ohnix-text-primary)",
                                    }}
                                >
                                    {choice}
                                </button>
                            ))}
                        </div>
                    )}

                    {sending && (
                        <div className="assistant-message-in flex items-end gap-2 justify-start">
                            <div
                                className="flex items-center justify-center h-7 w-7 rounded-full shrink-0"
                                style={{ background: "rgba(41,216,213,0.12)" }}
                            >
                                <AssistantSparkleIcon size={14} />
                            </div>
                            <div
                                className="rounded-2xl px-4 py-3 text-sm flex items-center gap-2"
                                style={{ background: "var(--ohnix-surface-card-soft)", color: "var(--ohnix-text-muted)", border: "1px solid var(--ohnix-line-3)" }}
                            >
                                <TypingDots /> {t("assistant.thinking")}
                            </div>
                        </div>
                    )}
                    <div ref={listEndRef} />
                </div>

                <div className="px-4 py-3" style={{ borderTop: "1px solid var(--ohnix-line-3)" }}>
                    {!online && (
                        <div className="flex items-center gap-2 text-xs rounded-lg px-3 py-2 mb-2" style={{ background: "var(--ohnix-surface-card-soft)", color: "var(--ohnix-text-muted)", border: "1px solid var(--ohnix-line-3)" }}>
                            <DisconnectOutlined />
                            {t("assistant.offline_notice")}
                        </div>
                    )}
                    <div className="flex items-end gap-2">
                        <Input.TextArea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onPressEnter={(e) => {
                                if (!e.shiftKey) {
                                    e.preventDefault();
                                    sendText(input);
                                }
                            }}
                            placeholder={t("assistant.input_placeholder")}
                            autoSize={{ minRows: 1, maxRows: 4 }}
                            disabled={sending || !online}
                        />
                        <button
                            type="button"
                            onClick={() => sendText(input)}
                            disabled={sending || !online || !input.trim()}
                            aria-label={t("assistant.send")}
                            className="flex items-center justify-center h-9 w-9 shrink-0 rounded-lg border-0 cursor-pointer disabled:opacity-40"
                            style={{ background: "linear-gradient(135deg, #29D8D5 0%, #44F3F0 100%)", color: "#021314" }}
                        >
                            <SendOutlined />
                        </button>
                    </div>
                    <div className="text-[11px] text-[var(--ohnix-text-muted)] mt-2 leading-snug">
                        {t("assistant.disclaimer")}
                    </div>
                </div>
            </div>
            )}

            <style>{`
                .assistant-fab {
                    animation: ohnix-assistant-fab-pulse 2.6s ease-in-out infinite;
                }
                .assistant-fab:hover {
                    box-shadow: 0 10px 32px rgba(41,216,213,0.5) !important;
                }
                @keyframes ohnix-assistant-fab-pulse {
                    0%, 100% { box-shadow: 0 8px 28px rgba(41,216,213,0.35), 0 0 0 0 rgba(41,216,213,0.35); }
                    50% { box-shadow: 0 8px 28px rgba(41,216,213,0.35), 0 0 0 8px rgba(41,216,213,0); }
                }
                .assistant-fab-wrap.is-draggable .assistant-fab { cursor: grab; }
                .assistant-fab-wrap.is-draggable.is-dragging .assistant-fab { cursor: grabbing; }
                .assistant-fab-wrap.is-draggable {
                    opacity: 0.55;
                    transition: opacity 220ms ease;
                }
                .assistant-fab-wrap.is-draggable:hover,
                .assistant-fab-wrap.is-draggable.is-dragging {
                    opacity: 1;
                }
                .assistant-suggestion-chip:hover {
                    border-color: #29D8D5 !important;
                }
                .assistant-action-btn {
                    background: rgba(41,216,213,0.12);
                    border: 1px solid rgba(41,216,213,0.4);
                    color: var(--ohnix-text-primary);
                    transition: background 150ms ease;
                }
                .assistant-action-btn:hover {
                    background: rgba(41,216,213,0.22);
                }
                .assistant-spotlight {
                    position: relative;
                    z-index: 2;
                    border-radius: 8px;
                    animation: ohnix-assistant-spotlight 1.1s ease-in-out 4;
                }
                @keyframes ohnix-assistant-spotlight {
                    0%, 100% { box-shadow: 0 0 0 2px rgba(41,216,213,0.9), 0 0 0 0 rgba(41,216,213,0.45); }
                    50% { box-shadow: 0 0 0 2px rgba(41,216,213,0.9), 0 0 0 10px rgba(41,216,213,0); }
                }
                .assistant-panel-in {
                    animation: ohnix-assistant-panel-in 200ms ease-out;
                    transform-origin: bottom right;
                }
                @keyframes ohnix-assistant-panel-in {
                    from { opacity: 0; transform: translateY(12px) scale(0.97); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .assistant-message-in {
                    animation: ohnix-assistant-message-in 220ms ease-out;
                }
                @keyframes ohnix-assistant-message-in {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .assistant-typing-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 9999px;
                    background: var(--ohnix-text-muted);
                    display: inline-block;
                    animation: ohnix-assistant-typing 1.1s ease-in-out infinite;
                }
                @keyframes ohnix-assistant-typing {
                    0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
                    40% { opacity: 1; transform: scale(1); }
                }
                @media (prefers-reduced-motion: reduce) {
                    .assistant-fab, .assistant-message-in, .assistant-typing-dot, .assistant-panel-in {
                        animation: none;
                    }
                    .assistant-spotlight {
                        animation: none;
                        box-shadow: 0 0 0 2px rgba(41,216,213,0.9);
                    }
                    .assistant-fab-wrap.is-draggable { transition: none; }
                }
            `}</style>
        </>
    );
};

export default AssistantWidget;
