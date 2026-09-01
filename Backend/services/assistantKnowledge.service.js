import { prisma } from "../db/prisma.js";

// Postgres full-text search over the curated, human-reviewed knowledge base
// (AssistantKnowledgeChunk). Deliberately not a vector/embedding search - at
// the size of this knowledge base (tens to a couple hundred articles),
// tsvector ranking is free, needs no extra infra, and is good enough. Revisit
// with pgvector only if the KB grows large enough that keyword matching
// starts missing paraphrased questions (see assistant architecture review,
// 2026-08-31).
const MAX_RESULTS = 5;
// Added to ts_rank for a chunk whose module matches the page the user is on
// (or is a cross-module "general" article) - prefers page-relevant content
// when scores are close, without ever hard-excluding a better match from a
// different module the way an earlier "search this module, only fall back
// to the rest of the KB if that comes up completely empty" version did (a
// weak same-module match blocked a much better match elsewhere from ever
// being considered).
const MODULE_MATCH_BOOST = 0.3;

const toTsConfig = (locale) => (locale === "en" ? "english" : "spanish");

// Function words filtered out before building the query - not for grammar,
// but so a question like "¿Qué sabes de Ohnix?" doesn't get diluted down to
// "qué OR sabes OR de OR ohnix" (which would ignore the fact that "de" alone
// matches nearly every article and drown out ranking). Deliberately short:
// over-filtering just means those words are ignored, but under-filtering
// makes "no real match" (the safety fallback's only signal - see
// assistant.service.js NO_MATCH_MESSAGE) fire far less than it should.
const STOPWORDS = new Set([
    "que", "qué", "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
    "y", "o", "a", "en", "es", "son", "con", "por", "para", "se", "su", "sus",
    "tu", "tus", "mi", "mis", "como", "cómo", "cuál", "cual", "cuáles", "cuales",
    "dónde", "donde", "cuando", "cuándo", "al", "lo", "le", "les", "me", "te",
    "nos", "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas",
    "muy", "más", "mas", "menos", "sin", "sobre", "también", "tambien", "pero",
    "si", "no", "ya", "hay", "soy", "eres", "sabes", "sabe", "saber", "puedo",
    "puedes", "quiero", "quisiera", "necesito", "the", "a", "an", "of", "to",
    "is", "are", "do", "does", "what", "how", "where", "when", "which", "on",
    "in", "for", "with", "about", "know", "can", "could", "would", "i", "you",
]);

// Builds an OR query ("word1:* | word2:* | ...") instead of using
// plainto_tsquery's implicit AND. AND semantics made short, direct questions
// ("¿Cómo creo un producto?") work but silently failed anything phrased more
// conversationally ("¿Qué sabes de Ohnix?") whenever the article's wording
// didn't happen to repeat every one of the user's words - e.g. no article
// contains "saber", so requiring it AND "ohnix" matched nothing even though
// the general "Qué es Ohnix" article is exactly the right answer. OR
// (ranked by ts_rank, which still favors documents matching more terms) is
// far more forgiving of natural phrasing; the "did we find anything at all"
// safety check that gates the LLM call stays meaningful because STOPWORDS
// keeps function words from matching everything.
// Regex only keeps letters (incl. accented) - to_tsquery has its own mini
// grammar (&, |, !, <->, ') that stray punctuation would otherwise trip.
const buildOrQuery = (text) => {
    const words = [...new Set(text.toLowerCase().match(/\p{L}+/gu) || [])].filter(
        (word) => word.length >= 3 && !STOPWORDS.has(word)
    );
    if (words.length === 0) return null;
    return words.map((word) => `${word}:*`).join(" | ");
};

export const searchKnowledge = async ({ query, module, locale = "es" }) => {
    const tsQueryString = buildOrQuery(query || "");
    if (!tsQueryString) return [];

    const tsConfig = toTsConfig(locale);
    return prisma.$queryRaw`
        SELECT "id", "module", "title", "body"
        FROM "assistant_knowledge_chunks"
        WHERE "is_published" = true
          AND "locale" = ${locale}
          AND to_tsvector(${tsConfig}::regconfig, "title" || ' ' || "body")
              @@ to_tsquery(${tsConfig}::regconfig, ${tsQueryString})
        ORDER BY
            ts_rank(
                to_tsvector(${tsConfig}::regconfig, "title" || ' ' || "body"),
                to_tsquery(${tsConfig}::regconfig, ${tsQueryString})
            )
            + CASE WHEN "module" = ${module ?? ""} OR "module" = 'general' THEN ${MODULE_MATCH_BOOST} ELSE 0 END
            DESC
        LIMIT ${MAX_RESULTS}
    `;
};
