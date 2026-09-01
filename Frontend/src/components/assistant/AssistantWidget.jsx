import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Drawer, Input, Spin, Tooltip } from "antd";
import {
    MessageOutlined,
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

    useEffect(() => {
        listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, sending]);

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

    const handleSend = async () => {
        const trimmed = input.trim();
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
                        className="flex items-center justify-center h-12 w-12 rounded-full border-0 cursor-pointer transition-transform duration-150 hover:-translate-y-0.5"
                        style={{
                            background: "linear-gradient(135deg, #29D8D5 0%, #44F3F0 100%)",
                            color: "#021314",
                            boxShadow: "0 8px 28px rgba(41,216,213,0.4)",
                        }}
                    >
                        <MessageOutlined className="text-xl" />
                    </button>
                </div>
            )}

            <Drawer
                title={
                    <div>
                        <div className="text-base font-bold text-[var(--ohnix-text-primary)]">
                            {t("assistant.panel_title")}
                        </div>
                        <div className="text-xs font-normal text-[var(--ohnix-text-muted)]">
                            {t("assistant.panel_subtitle")}
                        </div>
                    </div>
                }
                placement="right"
                onClose={() => setOpen(false)}
                open={open}
                width={isMobile ? "100%" : 420}
                closeIcon={<CloseOutlined style={{ color: "var(--ohnix-text-muted)" }} />}
                extra={
                    <Tooltip title={t("assistant.new_conversation")}>
                        <button
                            type="button"
                            onClick={handleNewConversation}
                            aria-label={t("assistant.new_conversation")}
                            className="flex items-center justify-center h-8 w-8 rounded-lg border-0 cursor-pointer"
                            style={{ background: "var(--ohnix-surface-card-soft)", color: "var(--ohnix-text-muted)" }}
                        >
                            <PlusOutlined />
                        </button>
                    </Tooltip>
                }
                styles={{
                    mask: { backgroundColor: "rgba(0,0,0,0.45)" },
                    header: {
                        borderBottom: "1px solid var(--ohnix-line-3)",
                        background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    },
                    body: {
                        padding: 0,
                        background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                        display: "flex",
                        flexDirection: "column",
                    },
                }}
            >
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ minHeight: 0 }}>
                    {loadingHistory && (
                        <div className="flex justify-center py-6">
                            <Spin size="small" />
                        </div>
                    )}

                    {!loadingHistory && messages.length === 0 && (
                        <div className="text-sm text-[var(--ohnix-text-muted)] text-center py-8">
                            {t("assistant.empty_state")}
                        </div>
                    )}

                    {messages.map((message) => (
                        <div
                            key={message.id}
                            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            <div
                                className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
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
                        <div className="flex justify-start">
                            <div
                                className="rounded-2xl px-3.5 py-2.5 text-sm flex items-center gap-2"
                                style={{ background: "var(--ohnix-surface-card-soft)", color: "var(--ohnix-text-muted)", border: "1px solid var(--ohnix-line-3)" }}
                            >
                                <Spin size="small" /> {t("assistant.thinking")}
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
                                    handleSend();
                                }
                            }}
                            placeholder={t("assistant.input_placeholder")}
                            autoSize={{ minRows: 1, maxRows: 4 }}
                            disabled={sending}
                        />
                        <button
                            type="button"
                            onClick={handleSend}
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
            </Drawer>
        </>
    );
};

export default AssistantWidget;
