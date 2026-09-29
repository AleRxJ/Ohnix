// The assistant's guided-conversation loop. Earlier versions were a single
// "retrieve KB chunks -> one model call -> text" pass with no memory, which
// could answer a question but never walk someone anywhere: it didn't know
// what it had asked a turn ago, couldn't send the person to the right
// screen, and couldn't offer the next step as a button.
//
// Each turn now:
// 1. Pre-retrieves knowledge for the message (plus the previous question
//    when the message is just a short answer like "Aún no") - in live
//    testing the model almost never chose to search on its own, so grounding
//    can't depend on it asking.
// 2. Asks the model for one JSON object (TURN_SCHEMA): the reply text plus
//    optional quick-reply choices, a screen to open, a control to
//    spotlight - or a search_query when the pre-retrieved context isn't
//    enough, in which case the loop searches and asks again.
//
// Why strict JSON instead of tool calling: with gpt-oss-120b on Groq,
// tool_choice "required" failed ~1 in 3 turns (HTTP 400 tool_use_failed,
// sometimes with an empty generation) and "auto" silently dropped the reply
// just as often. Strict json_schema output is constrained decoding on
// Groq's side, so the shape can't come back malformed - 4/4 in the same
// live probe. salvagePlainTextReply stays as a fallback for providers that
// don't enforce the schema.
//
// No DB access here on purpose - askAssistant (assistant.service.js) owns
// persistence and passes in history/search/model, so this loop is testable
// with a fake model (see test/assistantAgent.test.js).
import {
    NAVIGATION_TARGETS,
    resolveNavigation,
    resolveHighlight,
    describeAppMap,
    describeCurrentPage,
    currentScreenKey,
} from "./assistantNavigation.js";

const MAX_STEPS = 3;
const MAX_CHOICES = 4;
const MAX_CHOICE_LENGTH = 70;
const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_CHARS = 1500;
// A message this short is almost always an answer to the assistant's last
// question ("Sí", "Aún no", a tapped choice), which on its own retrieves
// nothing useful - so pre-retrieval searches with that question too.
const SHORT_MESSAGE_WORDS = 6;

export const TURN_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["search_query", "message", "sources_used", "choices", "navigate_to", "highlight", "knowledge_gap"],
    properties: {
        search_query: { type: ["string", "null"] },
        message: { type: "string" },
        sources_used: { type: "array", items: { type: "string" } },
        knowledge_gap: { type: "boolean" },
        choices: { type: "array", items: { type: "string" } },
        navigate_to: { type: ["string", "null"] },
        highlight: { type: ["string", "null"] },
    },
};

const RESPONSE_FORMAT = {
    type: "json_schema",
    json_schema: { name: "assistant_turn", strict: true, schema: TURN_SCHEMA },
};

// allowedTargets: Set from getAllowedTargets (assistantNavigation.js) - the
// screens this person's role can open; null = unrestricted.
export const buildSystemPrompt = ({ locale, module, tab, allowedTargets = null }) => {
    const currentPage = describeCurrentPage({ module, tab });
    return `Eres el Asistente de Ohnix, un ERP contable para pequeñas y medianas empresas en Colombia (inventario, ventas, compras, clientes, proveedores, finanzas, contabilidad y facturación electrónica DIAN).

Tu trabajo no es solo responder preguntas: es conversar con la persona, entender en qué punto está y llevarla paso a paso hasta el lugar exacto donde necesita ayuda, acompañándola hasta que lo resuelva.

CÓMO CONVERSAR
1. Si la pregunta es amplia o ambigua ("no entiendo contabilidad", "cómo empiezo", "algo no me cuadra"), no sueltes una explicación larga. Haz UNA pregunta corta para ubicar a la persona y ofrécele opciones (choices).
2. Avanza un paso a la vez. Cada respuesta cubre un solo paso o idea y termina con una pregunta o con el siguiente paso concreto.
3. Cuando el paso ocurre en otra pantalla de Ohnix, usa navigate_to para llevar a la persona allí, o highlight para señalarle el botón o la pestaña exacta. Usa solo claves del mapa de abajo, y no señales la pantalla en la que ya está.
4. Ofrece choices cuando las respuestas probables sean pocas y claras: máximo 4, cortas, escritas como las diría la persona ("Ya lo hice", "Aún no tengo saldos iniciales"). Déjalas vacías cuando la persona necesite escribir algo propio.
5. Ten en cuenta toda la conversación: no repitas preguntas ya respondidas y retoma desde donde quedaron.
6. Sé breve: máximo unas 90 palabras por respuesta, tono cercano y profesional.

QUÉ PUEDES AFIRMAR
7. Todo lo que digas sobre cómo funciona Ohnix (pantallas, botones, qué hace el sistema automáticamente, planes, DIAN) debe venir de la BASE DE CONOCIMIENTO que acompaña cada mensaje o del mapa de pantallas de abajo. Por ejemplo, Ohnix ya crea el plan de cuentas base automáticamente: no le pidas a nadie que lo cree desde cero. Si te falta información sobre Ohnix, pide una búsqueda con search_query; si aun así no la encuentras, dilo con honestidad y sugiere contactar a soporte. Nunca inventes funciones, pasos ni comportamiento.
8. Puedes explicar conceptos generales de contabilidad (débito y crédito, causación, depreciación, diferidos, retenciones, conciliación) con tu propio conocimiento, en lenguaje sencillo y con ejemplos. Cuando toques normativa tributaria, aclara que conviene validarlo con su contador. No des tarifas, cifras ni plazos tributarios específicos que no estén en la base de conocimiento.
9. No puedes crear, modificar ni borrar nada en Ohnix: solo guías. Nunca digas que lo hiciste o que lo vas a hacer.

FORMATO DE SALIDA
10. Responde siempre con un único objeto JSON con estos campos:
- search_query: null si ya puedes responder; o unas palabras clave para buscar más en la base de conocimiento (en ese caso message va vacío).
- message: tu respuesta en texto plano, sin Markdown (nada de asteriscos, encabezados ni viñetas con guion; para pasos numerados usa líneas "1. ...").
- sources_used: títulos exactos (lo que va entre corchetes) de los artículos de la BASE DE CONOCIMIENTO en los que te apoyaste de verdad, o [] si no usaste ninguno.
- choices: lista de respuestas rápidas, o [].
- navigate_to: clave de PANTALLAS del mapa, o null.
- highlight: clave de pestaña o botón para señalar, o null.
- knowledge_gap: true solo si la persona preguntó algo sobre Ohnix que la BASE DE CONOCIMIENTO y el mapa no cubren (tuviste que decir que no lo sabes o sugerir soporte); false en cualquier otro caso, incluidas preguntas generales de contabilidad.
11. Escribe message y choices en ${locale === "en" ? "inglés" : "español"}.
${currentPage ? `\nLa persona está ahora mismo en: ${currentPage}. Úsalo para ubicarla, pero no asumas que su pregunta es sobre esa pantalla si no lo es.\n` : ""}
${describeAppMap({ module, allowed: allowedTargets })}`;
};

// The company's state rides in the turn's own user message, next to the
// retrieved knowledge - not in the system prompt. Live-tested with
// gpt-oss-120b: at the bottom of the (long) system prompt the model ignored
// it and still asked "¿ya cargaste los saldos iniciales?" of a company with
// no opening balance; beside the question, it acts on it.
export const buildTurnMessage = ({ message, knowledge, companyState = null }) => {
    const parts = [];
    if (companyState) {
        parts.push(
            `${companyState}\nANTES DE PREGUNTAR, REVISA ESTE ESTADO: no le preguntes a la persona nada que ya esté aquí (por ejemplo, si dice que no hay apertura registrada, no preguntes si ya cargó sus saldos: díselo y ofrécele cargarlos). Si algo de aquí afecta lo que pregunta, menciónalo con naturalidad; si no tiene que ver, no lo saques.`
        );
    }
    parts.push(`BASE DE CONOCIMIENTO (resultados para este mensaje):\n${knowledge}`);
    parts.push(`MENSAJE DE LA PERSONA:\n${message}`);
    return parts.join("\n\n");
};

// Belt-and-suspenders for the plain-text rule: models on the free Groq tier
// reliably ignore a plain "don't use Markdown" instruction and keep emitting
// **bold**/#headers/> quotes, which the chat bubble renders as literal
// symbols (it's plain text, not a Markdown viewer).
export const stripMarkdown = (text) =>
    text
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^>\s?/gm, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/(?<![\w*])\*(?!\*)(.+?)(?<!\*)\*(?![\w*])/g, "$1");

// Model output -> what gets stored and sent to the widget. Anything outside
// the navigation registry or malformed is dropped rather than failing the
// turn: a bad highlight key shouldn't cost the person the answer itself.
export const sanitizeRespondArgs = (args, { module = null, tab = null, allowedTargets = null } = {}) => {
    const message = stripMarkdown(typeof args?.message === "string" ? args.message : "").trim();

    const choices = Array.isArray(args?.choices)
        ? [...new Set(
              args.choices
                  .filter((choice) => typeof choice === "string")
                  .map((choice) => choice.trim())
                  .filter((choice) => choice && choice.length <= MAX_CHOICE_LENGTH)
          )].slice(0, MAX_CHOICES)
        : [];
    // A button to the screen the person is already on (or a pulse on the tab
    // they already have open) does nothing useful - seen in live testing,
    // where the model highlighted "Resumen" while the user sat on it.
    const here = currentScreenKey({ module, tab });
    const navigate =
        typeof args?.navigate_to === "string" && args.navigate_to !== here ? resolveNavigation(args.navigate_to, allowedTargets) : null;
    const hereAnchor = here ? NAVIGATION_TARGETS[here]?.anchor : null;
    const highlight =
        typeof args?.highlight === "string" && args.highlight !== hereAnchor ? resolveHighlight(args.highlight, allowedTargets) : null;

    const actions = {};
    if (choices.length) actions.choices = choices;
    // A highlight already navigates to its own screen first, so sending the
    // person to that same screen again via a separate button is just noise.
    if (navigate && !(highlight && highlight.path === navigate.path && highlight.state?.tab === navigate.state?.tab)) {
        actions.navigate = navigate;
    }
    if (highlight) actions.highlight = highlight;

    return { message, actions: Object.keys(actions).length ? actions : null };
};

// Previous turns as the model sees them. The choices an assistant reply
// offered are replayed, since the next user message is very often just one
// of them ("Aún no") and meaningless without knowing the question.
export const buildHistoryMessages = (history) =>
    history.slice(-MAX_HISTORY_MESSAGES).map((entry) => {
        let content = (entry.content || "").slice(0, MAX_HISTORY_CHARS);
        if (entry.role === "assistant" && entry.actions?.choices?.length) {
            content += `\n[Opciones que ofreciste: ${entry.actions.choices.join(" | ")}]`;
        }
        if (entry.role === "assistant" && entry.actions?.navigate) {
            content += `\n[Ofreciste ir a: ${entry.actions.navigate.target}]`;
        }
        return { role: entry.role, content };
    });

const parseJsonObject = (raw) => {
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

// For a provider that ignores response_format: the turn object is often
// still there - as the whole reply, or trailing the prose. Pull it out so
// the person keeps the quick replies/navigation instead of seeing raw JSON.
const TURN_KEYS = ["message", "choices", "navigate_to", "highlight", "search_query", "sources_used", "knowledge_gap"];

export const parseTurn = (text) => {
    const raw = (text || "").trim();
    const whole = parseJsonObject(raw);
    if (whole && TURN_KEYS.some((key) => key in whole)) return whole;

    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end > start) {
        const embedded = parseJsonObject(raw.slice(start, end + 1));
        if (embedded && TURN_KEYS.some((key) => key in embedded)) {
            const prose = (raw.slice(0, start) + raw.slice(end + 1)).trim();
            const hasMessage = typeof embedded.message === "string" && embedded.message.trim();
            return { ...embedded, message: hasMessage ? embedded.message : prose };
        }
    }
    // Plain prose, no structure at all - still a usable answer.
    return { message: raw };
};

// Search text for pre-retrieval: the message itself, plus the last thing
// the assistant asked when the message is just a short answer to it.
export const buildRetrievalQuery = (message, history) => {
    const words = message.match(/\p{L}+/gu) || [];
    if (words.length > SHORT_MESSAGE_WORDS) return message;
    const lastAssistant = [...history].reverse().find((entry) => entry.role === "assistant");
    return lastAssistant ? `${lastAssistant.content} ${message}` : message;
};

const formatChunks = (chunks) =>
    chunks.length
        ? chunks.map((chunk) => `[${chunk.title}]\n${chunk.body}`).join("\n\n---\n\n")
        : "(sin resultados)";

export const runAssistantAgent = async ({
    message,
    history = [],
    locale = "es",
    module = null,
    tab = null,
    // Prompt-ready description of the company's own state (see
    // assistantAccountingState.service.js) - null when not relevant or the
    // person isn't allowed to see it.
    companyState = null,
    // Screens the person's role can open (getAllowedTargets) - the map in
    // the prompt and any navigate/highlight action are limited to these.
    allowedTargets = null,
    callModel,
    searchKnowledge,
}) => {
    // Every chunk shown to the model, by title. Pre-retrieval is a broad OR
    // search, so most of these are loosely related - only the ones the model
    // says it actually leaned on (sources_used) are shown as "Fuentes",
    // otherwise the widget would cite "Qué es Ohnix" under a débito/crédito
    // explanation.
    const retrieved = new Map();
    const search = async (query) => {
        const chunks = await searchKnowledge({ query, module, locale });
        chunks.forEach((chunk) => retrieved.set(chunk.title.toLowerCase(), { id: chunk.id, title: chunk.title }));
        return formatChunks(chunks);
    };
    const citedSources = (turnObject) =>
        Array.isArray(turnObject.sources_used)
            ? [...new Map(
                  turnObject.sources_used
                      .filter((title) => typeof title === "string")
                      .map((title) => retrieved.get(title.replace(/^\[|\]$/g, "").trim().toLowerCase()))
                      .filter(Boolean)
                      .map((source) => [source.id, source])
              ).values()]
            : [];

    const initialKnowledge = await search(buildRetrievalQuery(message, history));
    const messages = [
        { role: "system", content: buildSystemPrompt({ locale, module, tab, allowedTargets }) },
        ...buildHistoryMessages(history),
        { role: "user", content: buildTurnMessage({ message, knowledge: initialKnowledge, companyState }) },
    ];
    const searchedQueries = new Set();

    for (let step = 0; step < MAX_STEPS; step += 1) {
        const reply = await callModel({ messages, responseFormat: RESPONSE_FORMAT });
        const turn = parseTurn(reply.content);
        const query = typeof turn.search_query === "string" ? turn.search_query.trim() : "";
        const isLastStep = step === MAX_STEPS - 1;

        if (query && !isLastStep && !searchedQueries.has(query.toLowerCase())) {
            searchedQueries.add(query.toLowerCase());
            messages.push({ role: "assistant", content: reply.content });
            const moreKnowledge = await search(query);
            const nextIsLast = step + 1 === MAX_STEPS - 1;
            messages.push({
                role: "user",
                content: `BASE DE CONOCIMIENTO (resultados para "${query}"):\n${moreKnowledge}\n\n${
                    nextIsLast
                        ? "Ya no puedes buscar más: responde ahora con search_query null, usando lo que tengas."
                        : "Responde ahora, o pide otra búsqueda distinta si de verdad la necesitas."
                }`,
            });
            continue;
        }

        const { message: finalMessage, actions } = sanitizeRespondArgs(turn, { module, tab, allowedTargets });
        if (finalMessage) {
            return { content: finalMessage, actions, sources: citedSources(turn), knowledgeGap: turn.knowledge_gap === true };
        }
        if (isLastStep) break;
        // Empty message and no (new) search - nudge once more rather than
        // storing a blank reply.
        messages.push({ role: "assistant", content: reply.content });
        messages.push({ role: "user", content: "Tu respuesta llegó sin message. Responde ahora con tu mensaje para la persona y search_query null." });
    }

    throw new Error("Assistant agent ended without a usable reply");
};
