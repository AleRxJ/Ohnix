import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { searchKnowledge } from "./assistantKnowledge.service.js";
import { callAssistantModel } from "./assistantModel.service.js";
import { runAssistantAgent } from "./assistantAgent.service.js";
import { getCompanyState, relevantStateModules, flattenFindings, describeCompanyState } from "./assistantCompanyState.service.js";
import { recordGuidance, recordKnowledgeGap } from "./assistantLearning.service.js";

const MAX_MESSAGE_LENGTH = 2000;

// Only the "the model call itself failed" case is canned now - "this isn't
// in Ohnix's knowledge base" is handled by the agent itself (an empty
// search result tells it to say so and suggest support, or to ask a
// narrowing question), since a guided conversation can often recover from a
// bad first search where a fixed fallback message just dead-ends.
const PROVIDER_ERROR_MESSAGE = {
    es: "El asistente no está disponible en este momento. Intenta de nuevo en unos minutos o contacta a soporte.",
    en: "The assistant isn't available right now. Please try again in a few minutes or contact support.",
};
const GREETING_MESSAGE = {
    es: "¡Hola! Soy el asistente de Ohnix. Puedo ayudarte a entender cómo funciona la plataforma: productos, ventas, compras, clientes, contabilidad o facturación DIAN. ¿En qué necesitas ayuda?",
    en: "Hi! I'm the Ohnix assistant. I can help you understand how the platform works: products, sales, purchases, customers, accounting, or DIAN invoicing. What do you need help with?",
};

// Offered with the greeting so the very first turn already steers toward a
// concrete starting point instead of an open "what do you need?". The
// accounting set is its own because that module is where people most often
// don't know what to ask in the first place.
const GREETING_CHOICES = {
    accounting: {
        es: ["Estoy empezando con la contabilidad", "No entiendo esta pantalla", "Algo no me cuadra", "Quiero cerrar el mes"],
        en: ["I'm just getting started with accounting", "I don't understand this screen", "Something doesn't add up", "I want to close the month"],
    },
    default: {
        es: ["¿Qué puedo hacer en esta pantalla?", "Cómo registro una venta", "Quiero entender la contabilidad", "Facturación electrónica DIAN"],
        en: ["What can I do on this screen?", "How do I record a sale?", "I want to understand accounting", "DIAN electronic invoicing"],
    },
};

// A plain "Hola" has no article about greetings, so it used to fall through
// to NO_MATCH_MESSAGE - technically correct (nothing in the knowledge base
// covers small talk) but a bad first impression, since a greeting is the
// single most likely first message a real user sends. Answered here,
// deterministically, before touching search or the model at all - no KB
// lookup, no LLM call, so it's free and can't hallucinate.
// Deliberately whole-message-only (every token must be a greeting word) so
// "hola, cómo registro una venta" still falls through to real retrieval
// instead of getting short-circuited into the canned greeting.
const GREETING_WORDS = new Set([
    "hola", "holaa", "holaaa", "buenas", "buenos", "buen", "dia", "dias", "día", "días",
    "tarde", "tardes", "noche", "noches", "hey", "ey", "saludos", "que", "qué", "tal",
    "hi", "hello", "hey", "greetings", "morning", "afternoon", "evening", "good",
]);

const isGreetingOnly = (text) => {
    const words = text.toLowerCase().match(/\p{L}+/gu) || [];
    return words.length > 0 && words.every((word) => GREETING_WORDS.has(word));
};

const normalizeLocale = (locale) => (locale === "en" ? "en" : "es");

const assertOwnedConversation = async (conversationId, userId) => {
    const conversation = await prisma.chatConversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true },
    });
    if (!conversation) {
        throw new ApiError(404, "Conversation not found");
    }
    return conversation;
};

// Modules whose company state the widget can open with (see getAssistantNudge).
const NUDGE_MODULES = new Set(["accounting", "finance"]);

const MODULE_KEY_PATTERN = /^[a-z0-9_-]{1,60}$/;
const cleanPageKey = (value) => (typeof value === "string" && MODULE_KEY_PATTERN.test(value) ? value : null);

export const askAssistant = async ({ userId, user = null, conversationId, message, module, tab, locale }) => {
    const trimmed = message?.trim();
    if (!trimmed) {
        throw new ApiError(400, "Message is required");
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
        throw new ApiError(400, `Message must be at most ${MAX_MESSAGE_LENGTH} characters`);
    }
    const safeLocale = normalizeLocale(locale);
    const safeModule = cleanPageKey(module);
    const safeTab = cleanPageKey(tab);

    const conversation = conversationId
        ? await assertOwnedConversation(conversationId, userId)
        : await prisma.chatConversation.create({
              data: { userId, title: trimmed.slice(0, 80) },
              select: { id: true },
          });

    // Read before this turn's user message is written, so it's exactly the
    // prior turns. Newest-first + reverse to only pull the tail of a long
    // conversation.
    const history = conversationId
        ? (
              await prisma.chatMessage.findMany({
                  where: { conversationId: conversation.id },
                  orderBy: { createdAt: "desc" },
                  take: 10,
                  select: { role: true, content: true, actions: true },
              })
          ).reverse()
        : [];

    await prisma.chatMessage.create({
        data: {
            conversationId: conversation.id,
            role: "user",
            content: trimmed,
            module: safeModule,
        },
    });

    let content;
    let sources = null;
    let actions = null;
    let knowledgeGap = false;

    // What Ohnix knows about this company in the modules this turn touches
    // (assistantCompanyState.service.js) - gated per module, never throws.
    const companyState = await getCompanyState(user, relevantStateModules({ module: safeModule, message: trimmed, history }));
    const findings = flattenFindings(companyState);

    if (isGreetingOnly(trimmed)) {
        const defaultChoices = (GREETING_CHOICES[safeModule] || GREETING_CHOICES.default)[safeLocale];
        const top = NUDGE_MODULES.has(safeModule) ? companyState[safeModule]?.[0] : null;
        // Proactive greeting: on Accounting/Finance, lead with the most
        // important thing Ohnix sees there for this company (still no LLM
        // call) and make "help me with that" the first choice.
        content = top ? `${GREETING_MESSAGE[safeLocale]}\n\n${top.nudge[safeLocale]}` : GREETING_MESSAGE[safeLocale];
        actions = { choices: top ? [top.cta[safeLocale], ...defaultChoices.slice(0, 3)] : defaultChoices };
    } else {
        try {
            const result = await runAssistantAgent({
                companyState: describeCompanyState(companyState),
                message: trimmed,
                history,
                locale: safeLocale,
                module: safeModule,
                tab: safeTab,
                callModel: callAssistantModel,
                searchKnowledge,
            });
            content = result.content;
            actions = result.actions;
            sources = result.sources.length ? result.sources : null;
            knowledgeGap = result.knowledgeGap === true;
        } catch (error) {
            console.error("[assistant] agent failed:", error);
            content = PROVIDER_ERROR_MESSAGE[safeLocale];
        }
    }

    const assistantMessage = await prisma.chatMessage.create({
        data: {
            conversationId: conversation.id,
            role: "assistant",
            content,
            module: safeModule,
            // Prisma rejects a plain null for a Json column - undefined
            // omits it, leaving the column's own NULL.
            sources: sources ?? undefined,
            actions: actions ?? undefined,
        },
    });

    // Learning loop (assistantLearning.service.js) - bookkeeping only, so a
    // failure here is logged and never costs the person the reply above.
    try {
        if (user && findings.length && actions) {
            await recordGuidance({
                accountId: user.prismaId,
                actorId: userId,
                conversationId: conversation.id,
                messageId: assistantMessage.id,
                findings,
                actions,
            });
        }
        if (knowledgeGap) {
            await recordKnowledgeGap({
                userId,
                conversationId: conversation.id,
                messageId: assistantMessage.id,
                module: safeModule,
                tab: safeTab,
                locale: safeLocale,
                question: trimmed,
            });
        }
    } catch (error) {
        console.error("[assistant] learning bookkeeping failed:", error);
    }

    // Touch updatedAt so the conversation list (most-recent-first) reflects
    // this turn even though no column on ChatConversation itself changed.
    await prisma.chatConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
    });

    return {
        conversationId: conversation.id,
        message: {
            id: assistantMessage.id,
            role: assistantMessage.role,
            content: assistantMessage.content,
            sources: assistantMessage.sources,
            actions: assistantMessage.actions,
            createdAt: assistantMessage.createdAt,
        },
    };
};

// What the widget shows when opened on a module with nothing typed yet: the
// single most important finding about this company, as a message plus one
// tap-to-send choice. Null when there's nothing worth interrupting for (or
// the person can't see that module's data).
export const getAssistantNudge = async ({ user, module, locale }) => {
    if (!NUDGE_MODULES.has(module)) return null;
    const safeLocale = normalizeLocale(locale);
    const top = (await getCompanyState(user, [module]))[module]?.[0];
    if (!top) return null;
    // priority/module drive the widget's insight card (signal bars, color,
    // "lo que veo en tu contabilidad/finanzas" eyebrow).
    return { key: top.key, module, priority: top.priority, message: top.nudge[safeLocale], choice: top.cta[safeLocale] };
};

export const listConversations = (userId) =>
    prisma.chatConversation.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, createdAt: true, updatedAt: true },
        take: 50,
    });

export const getConversationMessages = async (userId, conversationId) => {
    await assertOwnedConversation(conversationId, userId);
    return prisma.chatMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            role: true,
            content: true,
            sources: true,
            actions: true,
            createdAt: true,
            feedback: { select: { rating: true } },
        },
    });
};

export const submitFeedback = async (userId, messageId, rating, comment) => {
    const message = await prisma.chatMessage.findFirst({
        where: { id: messageId, role: "assistant", conversation: { userId } },
        select: { id: true },
    });
    if (!message) {
        throw new ApiError(404, "Message not found");
    }

    return prisma.chatFeedback.upsert({
        where: { messageId },
        create: { messageId, rating, comment: comment?.trim() || null },
        update: { rating, comment: comment?.trim() || null },
    });
};
