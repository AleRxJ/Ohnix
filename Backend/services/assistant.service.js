import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { searchKnowledge } from "./assistantKnowledge.service.js";
import { generateAssistantReply } from "./assistantModel.service.js";

const MAX_MESSAGE_LENGTH = 2000;

// Two distinct "the assistant didn't answer" cases, deliberately worded
// differently: one means "this isn't in Ohnix's knowledge base yet" (a
// content gap), the other means "the model call itself failed" (a transient
// outage). Conflating them would make a real product-content gap look like a
// flaky service, and vice versa.
const NO_MATCH_MESSAGE = {
    es: "No tengo información confirmada sobre esto todavía. Te recomiendo contactar a soporte para que te ayuden directamente.",
    en: "I don't have confirmed information about this yet. I'd recommend contacting support so they can help you directly.",
};
const PROVIDER_ERROR_MESSAGE = {
    es: "El asistente no está disponible en este momento. Intenta de nuevo en unos minutos o contacta a soporte.",
    en: "The assistant isn't available right now. Please try again in a few minutes or contact support.",
};
const GREETING_MESSAGE = {
    es: "¡Hola! Soy el asistente de Ohnix. Puedo ayudarte a entender cómo funciona la plataforma: productos, ventas, compras, clientes, contabilidad o facturación DIAN. ¿En qué necesitas ayuda?",
    en: "Hi! I'm the Ohnix assistant. I can help you understand how the platform works: products, sales, purchases, customers, accounting, or DIAN invoicing. What do you need help with?",
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

const buildSystemPrompt = ({ locale, module }) => `Eres el Asistente de Ohnix, un ERP/contable para pequeñas y medianas empresas en Colombia (inventario, ventas, compras, clientes, proveedores, contabilidad y facturación electrónica DIAN).

Reglas estrictas, sin excepción:
1. Responde ÚNICAMENTE con base en el CONTEXTO que se entrega junto con la pregunta. No uses conocimiento externo ni supongas nada que no esté ahí.
2. Si el CONTEXTO no contiene la respuesta, dilo explícitamente y sugiere contactar a soporte. Nunca inventes procedimientos, cifras, normativa tributaria, requisitos DIAN o comportamiento de la plataforma que no esté en el CONTEXTO.
3. En temas de DIAN, impuestos, IVA o contabilidad sé especialmente conservador: cíñete a lo que dice el CONTEXTO y aclara que esto no reemplaza asesoría contable o tributaria profesional.
4. Nunca afirmes que una funcionalidad está disponible si el CONTEXTO no lo confirma.
5. Eres puramente informativo: nunca digas que vas a crear, modificar o eliminar algo dentro de Ohnix, ni que puedes hacerlo.
6. Responde en ${locale === "en" ? "inglés" : "español"}, de forma breve, clara y en un tono cercano y profesional.
7. No uses formato Markdown (nada de asteriscos, guiones de lista, encabezados o bloques de cita). Escribe en texto plano; para pasos numerados usa líneas simples como "1. ..." sin negritas. La interfaz que muestra tu respuesta no interpreta Markdown, así que cualquier símbolo de ese tipo se vería literalmente.
8. No repitas el título de la fuente dentro de tu respuesta - la interfaz ya muestra por separado de qué artículo salió la información.
${module ? `\nEl usuario está actualmente en la sección "${module}" de Ohnix - prioriza esa sección si es relevante para la pregunta.` : ""}`;

const buildUserPrompt = (question, chunks) => {
    const context = chunks
        .map((chunk) => `[${chunk.title}]\n${chunk.body}`)
        .join("\n\n---\n\n");
    return `CONTEXTO:\n${context}\n\nPREGUNTA DEL USUARIO:\n${question}`;
};

// Belt-and-suspenders for rule 7 in the system prompt: models on the free
// Groq tier reliably ignore a plain "don't use Markdown" instruction and
// keep emitting **bold**/#headers/> quotes, which the chat bubble renders as
// literal asterisks and symbols (it's plain text, not a Markdown viewer).
// Stripping the common markers here means a future model swap that's worse
// at following that instruction still renders cleanly.
const stripMarkdown = (text) =>
    text
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^>\s?/gm, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/(?<![\w*])\*(?!\*)(.+?)(?<!\*)\*(?![\w*])/g, "$1");

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

export const askAssistant = async ({ userId, conversationId, message, module, locale }) => {
    const trimmed = message?.trim();
    if (!trimmed) {
        throw new ApiError(400, "Message is required");
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
        throw new ApiError(400, `Message must be at most ${MAX_MESSAGE_LENGTH} characters`);
    }
    const safeLocale = normalizeLocale(locale);

    const conversation = conversationId
        ? await assertOwnedConversation(conversationId, userId)
        : await prisma.chatConversation.create({
              data: { userId, title: trimmed.slice(0, 80) },
              select: { id: true },
          });

    await prisma.chatMessage.create({
        data: {
            conversationId: conversation.id,
            role: "user",
            content: trimmed,
            module: module || null,
        },
    });

    let content;
    let sources = null;

    if (isGreetingOnly(trimmed)) {
        content = GREETING_MESSAGE[safeLocale];
    } else {
        const chunks = await searchKnowledge({ query: trimmed, module, locale: safeLocale });

        if (chunks.length === 0) {
            content = NO_MATCH_MESSAGE[safeLocale];
        } else {
            sources = chunks.map((chunk) => ({ id: chunk.id, title: chunk.title }));
            try {
                const rawContent = await generateAssistantReply(
                    buildSystemPrompt({ locale: safeLocale, module }),
                    buildUserPrompt(trimmed, chunks)
                );
                content = stripMarkdown(rawContent);
            } catch (error) {
                console.error("[assistant] model call failed:", error);
                content = PROVIDER_ERROR_MESSAGE[safeLocale];
                sources = null;
            }
        }
    }

    const assistantMessage = await prisma.chatMessage.create({
        data: {
            conversationId: conversation.id,
            role: "assistant",
            content,
            module: module || null,
            sources,
        },
    });

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
            createdAt: assistantMessage.createdAt,
        },
    };
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
