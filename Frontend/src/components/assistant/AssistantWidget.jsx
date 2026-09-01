import { useEffect, useId, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useLocation } from "react-router-dom";
import { Input, Spin, Tooltip } from "antd";
import {
    CloseOutlined,
    SendOutlined,
    LikeOutlined,
    LikeFilled,
    DislikeOutlined,
    DislikeFilled,
    PlusOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import useIsMobile from "../../hooks/useIsMobile";
import { assistantService } from "../../services/assistantService";

const CONVERSATION_STORAGE_KEY = "ohnix.assistant.conversationId";
const SUGGESTION_KEYS = ["suggestion_1", "suggestion_2", "suggestion_3", "suggestion_4"];

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
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [conversationId, setConversationId] = useState(
        () => window.localStorage.getItem(CONVERSATION_STORAGE_KEY) || null
    );
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [feedbackGiven, setFeedbackGiven] = useState({});
    const listEndRef = useRef(null);
    const panelRef = useRef(null);

    useEffect(() => {
        listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, sending]);

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
        if (!trimmed || sending) return;

        const userMessage = { id: `local-${Date.now()}`, role: "user", content: trimmed };
        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setSending(true);

        try {
            const result = await assistantService.sendMessage({
                conversationId,
                message: trimmed,
                module: currentModule,
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

    const handleNewConversation = () => {
        setConversationId(null);
        setMessages([]);
        setFeedbackGiven({});
        window.localStorage.removeItem(CONVERSATION_STORAGE_KEY);
    };

    return (
        <>
            {!open && (
                <div className="no-print fixed bottom-24 right-6 z-[1050]">
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        aria-label={t("assistant.fab_label")}
                        title={t("assistant.fab_label")}
                        className="assistant-fab flex items-center justify-center h-12 w-12 rounded-full cursor-pointer transition-transform duration-150 hover:-translate-y-0.5"
                        style={{
                            background: "linear-gradient(135deg, rgba(41,216,213,0.18), rgba(68,243,240,0.22))",
                            border: "1px solid rgba(41,216,213,0.4)",
                            boxShadow: "0 8px 28px rgba(41,216,213,0.35)",
                            backdropFilter: "blur(6px)",
                        }}
                    >
                        <AssistantSparkleIcon size={24} />
                    </button>
                </div>
            )}

            {open && (
                <div
                    ref={panelRef}
                    className={`assistant-panel-in no-print fixed z-[1051] flex flex-col overflow-hidden ${isMobile ? "inset-0" : "bottom-24 right-6 rounded-3xl"}`}
                    style={
                        isMobile
                            ? { background: "var(--ohnix-surface-card)" }
                            : {
                                  width: 400,
                                  maxWidth: "calc(100vw - 48px)",
                                  height: "min(640px, calc(100vh - 140px))",
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
                                {SUGGESTION_KEYS.map((key) => (
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
                            disabled={sending}
                        />
                        <button
                            type="button"
                            onClick={() => sendText(input)}
                            disabled={sending || !input.trim()}
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
                .assistant-suggestion-chip:hover {
                    border-color: #29D8D5 !important;
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
                }
            `}</style>
        </>
    );
};

export default AssistantWidget;
