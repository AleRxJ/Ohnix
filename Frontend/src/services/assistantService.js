import { api } from "../api/api";

export const assistantService = {
    sendMessage: async ({ conversationId, message, module, locale }) => {
        const response = await api.post("/assistant/chat", {
            conversation_id: conversationId || undefined,
            message,
            module,
            locale,
        });
        return response.data.data;
    },
    getConversation: async (conversationId) => {
        const response = await api.get(`/assistant/conversations/${conversationId}`);
        return response.data.data;
    },
    sendFeedback: async (messageId, rating, comment) => {
        const response = await api.post("/assistant/feedback", {
            message_id: messageId,
            rating,
            comment,
        });
        return response.data.data;
    },
};
