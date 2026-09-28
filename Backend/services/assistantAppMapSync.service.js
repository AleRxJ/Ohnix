// Loads data/assistantAppMap.generated.json (the knowledge extracted from
// the frontend's screens - see assistantAppMapBuilder.js) into
// AssistantKnowledgeChunk on every server boot, so shipping a UI change and
// regenerating the file is the whole "teach the assistant" step - no manual
// seed run per environment.
//
// Only rows with sourceType "app_map" are managed here: hand-written
// articles (scripts/seedAssistantKnowledge.js) are never touched, and an
// app_map row whose screen no longer exists in the generated file is
// deleted, so the assistant can't keep describing a removed tab.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../db/prisma.js";

const SOURCE_TYPE = "app_map";
const APP_MAP_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "assistantAppMap.generated.json");

export const loadAppMap = () => JSON.parse(fs.readFileSync(APP_MAP_FILE, "utf8"));

const rowKey = (row) => `${row.module}|${row.locale}|${row.title}`;
const sameTags = (a = [], b = []) => a.length === b.length && a.every((tag, index) => tag === b[index]);

export const syncAppMapKnowledge = async ({ db = prisma, appMap = loadAppMap() } = {}) => {
    const existing = await db.assistantKnowledgeChunk.findMany({
        where: { sourceType: SOURCE_TYPE },
        select: { id: true, module: true, locale: true, title: true, body: true, tags: true, isPublished: true },
    });
    const existingByKey = new Map(existing.map((row) => [rowKey(row), row]));
    const wanted = new Set();
    let created = 0;
    let updated = 0;

    for (const chunk of appMap.chunks) {
        const key = rowKey(chunk);
        wanted.add(key);
        const row = existingByKey.get(key);
        const data = { body: chunk.body, tags: chunk.tags, sourceType: SOURCE_TYPE, isPublished: true };
        if (!row) {
            // upsert rather than create: a hand-written article could
            // (unlikely, but possible) already hold this exact title.
            await db.assistantKnowledgeChunk.upsert({
                where: { module_locale_title: { module: chunk.module, locale: chunk.locale, title: chunk.title } },
                create: { module: chunk.module, locale: chunk.locale, title: chunk.title, ...data },
                update: data,
            });
            created += 1;
        } else if (row.body !== chunk.body || !sameTags(row.tags, chunk.tags) || !row.isPublished) {
            await db.assistantKnowledgeChunk.update({ where: { id: row.id }, data });
            updated += 1;
        }
    }

    const staleIds = existing.filter((row) => !wanted.has(rowKey(row))).map((row) => row.id);
    if (staleIds.length) {
        await db.assistantKnowledgeChunk.deleteMany({ where: { id: { in: staleIds } } });
    }

    return { hash: appMap.hash, created, updated, removed: staleIds.length, unchanged: appMap.chunks.length - created - updated };
};
