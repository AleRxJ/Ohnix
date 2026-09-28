import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
    askAssistant,
    listConversations,
    getConversationMessages,
    getAssistantNudge,
    submitFeedback,
} from "../services/assistant.service.js";
import { getAssistantInsights } from "../services/assistantLearning.service.js";

const sendChatMessage = asyncHandler(async (req, res, next) => {
    const { message, conversation_id, module, tab, locale } = req.body;

    try {
        const result = await askAssistant({
            userId: req.user.actorId,
            // Full req.user (plan, team role) - the assistant checks the same
            // accounting gates as the accounting routes before reading any
            // of the company's books.
            user: req.user,
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

const getNudge = asyncHandler(async (req, res, next) => {
    try {
        const nudge = await getAssistantNudge({ user: req.user, module: req.query.module, locale: req.query.locale });
        return res.status(200).json(new ApiResponse(200, { nudge }, "Assistant nudge fetched successfully"));
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

const getInsights = asyncHandler(async (req, res, next) => {
    try {
        const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
        const insights = await getAssistantInsights({ days });
        return res.status(200).json(new ApiResponse(200, insights, "Assistant insights fetched successfully"));
    } catch (error) {
        console.error(error);
        return next(new ApiError(500, "Something went wrong. Please try again."));
    }
});

export { sendChatMessage, getConversations, getConversation, postFeedback, getNudge, getInsights };
