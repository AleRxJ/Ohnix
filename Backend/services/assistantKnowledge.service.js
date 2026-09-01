import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

// Postgres full-text search over the curated, human-reviewed knowledge base
// (AssistantKnowledgeChunk). Deliberately not a vector/embedding search - at
// the size of this knowledge base (tens to a couple hundred articles),
// tsvector ranking is free, needs no extra infra, and is good enough. Revisit
// with pgvector only if the KB grows large enough that keyword matching
// starts missing paraphrased questions (see assistant architecture review,
// 2026-08-31).
const MAX_RESULTS = 5;

const toTsConfig = (locale) => (locale === "en" ? "english" : "spanish");

const runSearch = async ({ query, locale, moduleFilter }) => {
    const tsConfig = toTsConfig(locale);
    return prisma.$queryRaw`
        SELECT "id", "module", "title", "body"
        FROM "assistant_knowledge_chunks"
        WHERE "is_published" = true
          AND "locale" = ${locale}
          ${moduleFilter}
          AND to_tsvector(${tsConfig}::regconfig, "title" || ' ' || "body")
              @@ plainto_tsquery(${tsConfig}::regconfig, ${query})
        ORDER BY ts_rank(
            to_tsvector(${tsConfig}::regconfig, "title" || ' ' || "body"),
            plainto_tsquery(${tsConfig}::regconfig, ${query})
        ) DESC
        LIMIT ${MAX_RESULTS}
    `;
};

// Scoped to the page the user was on first (a products question asked from
// /products should prefer the products article over a same-titled mention
// elsewhere), falling back to the full knowledge base only if that comes up
// empty - a question can be legitimate even if it doesn't match the current
// screen (e.g. asking about accounting while looking at inventory).
export const searchKnowledge = async ({ query, module, locale = "es" }) => {
    const trimmedQuery = query?.trim();
    if (!trimmedQuery) return [];

    if (module) {
        const scoped = await runSearch({
            query: trimmedQuery,
            locale,
            moduleFilter: Prisma.sql`AND ("module" = ${module} OR "module" = 'general')`,
        });
        if (scoped.length > 0) return scoped;
    }

    return runSearch({ query: trimmedQuery, locale, moduleFilter: Prisma.empty });
};
