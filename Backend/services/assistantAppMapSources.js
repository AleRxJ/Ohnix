// File-system side of the app map: reads the frontend sources and locale
// files the builder needs. Kept apart from assistantAppMapBuilder.js so the
// builder stays pure (string in, chunks out) and the sync service, which
// runs on the server where Frontend/ may not be deployed, never imports
// anything that touches Frontend/ paths.
import fs from "node:fs";
import path from "node:path";
import { APP_MAP_MODULES, buildModuleChunks, hashChunks } from "./assistantAppMapBuilder.js";

export const APP_MAP_OUTPUT_PATH = "data/assistantAppMap.generated.json";
const LOCALES = ["es", "en"];
const IMPORT_COMPONENT = /^import\s+([A-Z][\w$]*)\s+from\s+["'](\.{1,2}\/[^"']+)["']/gm;

const resolveImport = (fromFile, specifier) => {
    const base = path.resolve(path.dirname(fromFile), specifier);
    return [base, `${base}.jsx`, `${base}.js`].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
};

const readPage = (srcRoot, page) => {
    const pageFile = path.join(srcRoot, page.page);
    const pageSource = fs.readFileSync(pageFile, "utf8");
    const importedSources = {};
    for (const [, , specifier] of pageSource.matchAll(IMPORT_COMPONENT)) {
        const file = resolveImport(pageFile, specifier);
        if (file) importedSources[specifier] = fs.readFileSync(file, "utf8");
    }
    return { page, pageSource, importedSources };
};

export const buildAppMapFromDisk = ({ repoRoot }) => {
    const srcRoot = path.join(repoRoot, "Frontend", "src");
    const locales = Object.fromEntries(
        LOCALES.map((locale) => [locale, JSON.parse(fs.readFileSync(path.join(srcRoot, "locales", locale, "common.json"), "utf8"))])
    );

    const chunks = APP_MAP_MODULES.flatMap((config) =>
        buildModuleChunks({
            config,
            pages: config.pages.map((page) => readPage(srcRoot, page)),
            extraSources: Object.fromEntries(
                (config.errorSources || []).map((file) => [file, fs.readFileSync(path.join(srcRoot, file), "utf8")])
            ),
            locales,
        })
    );

    return { hash: hashChunks(chunks), chunks };
};
