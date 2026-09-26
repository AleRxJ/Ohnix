import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
    askAssistant,
    listConversations,
    getConversationMessages,
    submitFeedback,
} from "../services/assistant.service.js";

const sendChatMessage = asyncHandler(async (req, res, next) => {
    const { message, conversation_id, module, tab, locale } = req.body;

    try {
        const result = await askAssistant({
            userId: req.user.actorId,
            conversationId: conversation_id || null,
            message,
            module,
            tab,
            locale,
        });
        return res
            .status(200)
            .json(new ApiResponse(200, result, "Assistant reply generated"));
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const getConversations = asyncHandler(async (req, res, next) => {
    try {
        const conversations = await listConversations(req.user.actorId);
        return res
            .status(200)
            .json(new ApiResponse(200, conversations, "Conversations fetched successfully"));
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const getConversation = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    try {
        const messages = await getConversationMessages(req.user.actorId, id);
        return res
            .status(200)
            .json(new ApiResponse(200, messages, "Conversation fetched successfully"));
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const postFeedback = asyncHandler(async (req, res, next) => {
    const { message_id, rating, comment } = req.body;

    if (!message_id || !["up", "down"].includes(rating)) {
        return next(new ApiError(400, "message_id and a valid rating ('up' or 'down') are required"));
    }

    try {
        const feedback = await submitFeedback(req.user.actorId, message_id, rating, comment);
        return res
            .status(200)
            .json(new ApiResponse(200, feedback, "Feedback recorded successfully"));
    } catch (error) {
        if (error instanceof ApiError) return next(error);
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

export { sendChatMessage, getConversations, getConversation, postFeedback };
