// Builds the assistant's "app map" knowledge straight from the frontend's
// own source, instead of hand-written articles. For each screen listed in
// APP_MAP_PAGES it finds the component every tab renders, follows every
// top-level component/lookup table that component uses (and imported
// component files) and collects the i18n text it can show: captions, the
// in-app "Cómo usar esta sección" guides, field help, empty states,
// confirmations, error messages. That text is already written for end
// users and kept current by whoever builds the screen - turning it into
// knowledge chunks means the assistant learns a new tab or a renamed button
// the moment the UI ships it, with nobody writing an article.
//
// Deliberately regex-based rather than a real JSX parser: it only needs
// top-level declarations, identifiers and "ns.key" string literals, all of
// which are line/lexeme-level in this codebase's style, and it keeps the
// backend free of a parser dependency it would only use here. Anything it
// can't see statically (a key built with a template string) is simply
// missed, never invented.
//
// Pure: takes file contents in, returns chunks out. Reading files and
// writing the generated JSON is scripts/generateAssistantAppMap.js; loading
// it into the DB is assistantAppMapSync.service.js.
import crypto from "node:crypto";

export const APP_MAP_PAGES = [
    {
        module: "accounting",
        page: "pages/Accounting.jsx",
        namespace: "accounting",
        moduleLabel: { es: "Contabilidad", en: "Accounting" },
        // Top-level blocks that aren't a tab but deserve their own chunk.
        extraBlocks: [{ block: "AccountingQuickStart", slug: "primeros-pasos", title: { es: "primeros pasos", en: "getting started" } }],
    },
];

const TOP_LEVEL_DECLARATION = /^(?:export\s+(?:default\s+)?)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/;
const IMPORT_COMPONENT = /^import\s+([A-Z][\w$]*)\s+from\s+["'](\.{1,2}\/[^"']+)["']/gm;
const TAB_ITEM = /\{\s*key:\s*"([a-z0-9_]+)",\s*label:[^\n]*?"([a-z]+\.[a-z0-9_]+)"\)?,\s*children:\s*<([A-Z][\w$]*)/g;
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

// A key used by more than this many tabs is page chrome (column headers,
// "Guardar", the shared error map) rather than something about one screen.
const SHARED_KEY_TAB_THRESHOLD = 3;
const MAX_CHUNK_CHARS = 1400;
const MAX_LABEL_CHARS = 60;

// Splits a source file into top-level declarations. Relies on the
// codebase's formatting (top-level declarations start at column 0), which
// is enforced by its linter/prettier style - not a general JS parser.
export const splitTopLevelBlocks = (source) => {
    const blocks = new Map();
    let current = null;
    for (const line of source.split(/\r?\n/)) {
        const match = TOP_LEVEL_DECLARATION.exec(line);
        if (match) {
            current = { name: match[1], lines: [] };
            blocks.set(current.name, current);
        } else if (/^(import|export\s*\{)/.test(line)) {
            current = null;
            continue;
        }
        if (current) current.lines.push(line);
    }
    return new Map([...blocks].map(([name, block]) => [name, block.lines.join("\n")]));
};

export const findKeyLiterals = (text, namespaces) => {
    const pattern = new RegExp(`["'\`]((?:${namespaces.join("|")})\\.[a-z0-9_]+)["'\`]`, "g");
    return [...text.matchAll(pattern)].map((match) => match[1]);
};

// Every i18n key a block can show, following references to other
// top-level blocks (components, lookup tables, helpers) transitively.
// `opaque` blocks (imported component files) contribute their keys but are
// never followed: they're separate modules, so an identifier inside them -
// even in a comment - says nothing about this page's blocks. Following
// them once pulled the page's root component, and with it every tab, into
// every tab.
const collectKeys = (startName, blocks, namespaces, opaque = new Set()) => {
    const seen = new Set();
    const keys = [];
    const stack = [startName];
    while (stack.length) {
        const name = stack.pop();
        if (seen.has(name) || !blocks.has(name)) continue;
        seen.add(name);
        const text = blocks.get(name);
        for (const key of findKeyLiterals(text, namespaces)) keys.push(key);
        if (opaque.has(name)) continue;
        for (const [identifier] of text.matchAll(IDENTIFIER)) {
            if (identifier !== name && blocks.has(identifier) && !seen.has(identifier)) stack.push(identifier);
        }
    }
    return [...new Set(keys)];
};

const lookup = (messages, dottedKey) =>
    dottedKey.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), messages);

const cleanText = (value) =>
    value
        .replace(/\{\{\s*[\w.]+\s*\}\}/g, "…")
        .replace(/<\/?[a-z][^>]*>/gi, "")
        .replace(/\s+/g, " ")
        .trim();

// Buckets a key by its name and text - naming conventions in the locale
// files are consistent enough (guide_*, *_help, *_caption, empty_*,
// error_*) that this is reliable; anything unrecognized falls back on text
// length (long = explanatory, short = a label).
export const classifyKey = (key, text) => {
    const name = key.split(".").pop();
    if (/^error_|_(failed|invalid|required|not_found|too_long|unbalanced)$/.test(name)) return "error";
    if ((/^guide_/.test(name) && !/_help$/.test(name)) || /_step_\d+$/.test(name)) return "guide";
    if (/_(caption|summary|subtitle)$/.test(name)) return "caption";
    if (/_(help|hint|tooltip|explanation|note|description|info|body)$/.test(name)) return "help";
    if (/^(empty_|no_)|_(confirm|confirmation|warning|success|empty)(_|$)/.test(name)) return "message";
    if (text.length > MAX_LABEL_CHARS) return "help";
    return "label";
};

const HEADINGS = {
    es: {
        howItWorks: "cómo funciona",
        details: "campos, botones y mensajes",
        guide: "Guía de la pantalla",
        help: "Ayudas y conceptos",
        labels: "Campos, columnas y botones",
        messages: "Mensajes que puede mostrar",
        errors: "mensajes de error y validaciones",
        map: "mapa de pantallas",
        mapIntro: (moduleLabel) => `Pantallas (pestañas) del módulo ${moduleLabel} en Ohnix y para qué sirve cada una:`,
    },
    en: {
        howItWorks: "how it works",
        details: "fields, buttons and messages",
        guide: "Screen guide",
        help: "Help and concepts",
        labels: "Fields, columns and buttons",
        messages: "Messages it can show",
        errors: "error and validation messages",
        map: "screen map",
        mapIntro: (moduleLabel) => `Screens (tabs) of the ${moduleLabel} module in Ohnix and what each one is for:`,
    },
};

// Packs lines into bodies of at most MAX_CHUNK_CHARS without splitting a
// line, so one chunk never ends mid-sentence. Every body starts with
// `header` (which screen this is): a search can return part 2/3 on its own,
// and without it neither the ranking nor the model would know which screen
// that part is about.
const packLines = (header, lines) => {
    const bodies = [];
    let current = header;
    for (const line of lines) {
        if (current !== header && current.length + line.length + 1 > MAX_CHUNK_CHARS) {
            bodies.push(current);
            current = header;
        }
        current = `${current}\n${line}`;
    }
    if (current !== header) bodies.push(current);
    return bodies;
};

// "Label · label · ..." lists, wrapped into several lines so a screen with
// dozens of labels still packs into normal-sized chunks.
const MAX_LIST_LINE_CHARS = 500;
const listLines = (heading, items) => {
    const lines = [];
    let current = [];
    for (const item of items) {
        if (current.length && [...current, item].join(" · ").length > MAX_LIST_LINE_CHARS) {
            lines.push(current.join(" · "));
            current = [];
        }
        current.push(item);
    }
    if (current.length) lines.push(current.join(" · "));
    return lines.map((line) => `${heading}: ${line}`);
};

const withPartTitles = (baseTitle, bodies) =>
    bodies.map((body, index) => ({ title: bodies.length > 1 ? `${baseTitle} (${index + 1}/${bodies.length})` : baseTitle, body }));

const texts = (keys, messages) =>
    keys
        .map((key) => ({ key, value: lookup(messages, key) }))
        .filter((entry) => typeof entry.value === "string" && entry.value.trim())
        .map((entry) => ({ key: entry.key, text: cleanText(entry.value) }))
        .filter((entry) => entry.text);

const screenChunks = ({ moduleLabel, screenLabel, keys, messages, headings }) => {
    const entries = texts(keys, messages);
    const byKind = { caption: [], guide: [], help: [], label: [], message: [], error: [] };
    const seenText = new Set();
    for (const entry of entries) {
        if (seenText.has(entry.text)) continue;
        seenText.add(entry.text);
        byKind[classifyKey(entry.key, entry.text)].push(entry.text);
    }

    const header = `${moduleLabel} › ${screenLabel}.`;
    const how = [...byKind.caption];
    if (byKind.guide.length) how.push(`${headings.guide}:`, ...byKind.guide.map((text) => `- ${text}`));
    if (byKind.help.length) how.push(`${headings.help}:`, ...byKind.help.map((text) => `- ${text}`));

    const details = listLines(headings.labels, byKind.label);
    const messageLines = [...byKind.message, ...byKind.error];
    if (messageLines.length) details.push(`${headings.messages}:`, ...messageLines.map((text) => `- ${text}`));

    const baseTitle = `${moduleLabel} › ${screenLabel}`;
    return [
        ...withPartTitles(`${baseTitle}: ${headings.howItWorks}`, packLines(header, how)),
        ...withPartTitles(`${baseTitle}: ${headings.details}`, packLines(header, details)),
    ];
};

export const buildPageChunks = ({ config, pageSource, importedSources, locales }) => {
    const namespaces = [config.namespace];
    const blocks = splitTopLevelBlocks(pageSource);
    const opaque = new Set();
    // An imported component file is folded in as one block under its import
    // name - enough to collect its text from the tab that renders it.
    for (const [name, relativePath] of [...pageSource.matchAll(IMPORT_COMPONENT)].map((m) => [m[1], m[2]])) {
        const imported = importedSources[relativePath];
        if (imported !== undefined && !blocks.has(name)) {
            blocks.set(name, imported);
            opaque.add(name);
        }
    }
    // The page's own root component (the block declaring the tabs) renders
    // every tab - reaching it from anywhere would merge all tabs into one.
    for (const [name, text] of blocks) {
        if (TAB_ITEM.test(text)) blocks.delete(name);
        TAB_ITEM.lastIndex = 0;
    }

    const tabs = [...pageSource.matchAll(TAB_ITEM)].map(([, key, labelKey, component]) => ({
        key,
        labelKey,
        keys: collectKeys(component, blocks, namespaces, opaque),
    }));
    if (tabs.length === 0) {
        throw new Error(`No tabs found in ${config.page} - did its tabItems format change?`);
    }

    // Keys shared by many tabs are page chrome - dropped from every tab's
    // chunk (they'd make every tab match every search), except errors,
    // which get their own chunks below.
    const usage = new Map();
    for (const tab of tabs) for (const key of tab.keys) usage.set(key, (usage.get(key) || 0) + 1);
    const isShared = (key) => usage.get(key) > SHARED_KEY_TAB_THRESHOLD;
    const sharedErrorKeys = [...usage.keys()].filter((key) => isShared(key) && classifyKey(key, "") === "error").sort();

    const chunks = [];
    for (const [locale, messages] of Object.entries(locales)) {
        const headings = HEADINGS[locale];
        const moduleLabel = config.moduleLabel[locale];
        const push = (entries, tags) =>
            entries.forEach(({ title, body }) =>
                chunks.push({ module: config.module, locale, title, body, tags, sourceType: "app_map" })
            );

        const mapLines = [];
        for (const tab of tabs) {
            const screenLabel = cleanText(lookup(messages, tab.labelKey) || tab.key);
            const caption = lookup(messages, `${tab.labelKey}_caption`);
            mapLines.push(`- ${screenLabel}${typeof caption === "string" ? `: ${cleanText(caption)}` : ""}`);
            push(
                screenChunks({
                    moduleLabel,
                    screenLabel,
                    // The tab's own caption leads its chunk even when its
                    // component never renders it (some only show it in the
                    // module map) - it's the best one-line "what is this".
                    keys: [`${tab.labelKey}_caption`, ...tab.keys.filter((key) => !isShared(key))],
                    messages,
                    headings,
                }),
                [config.module, tab.key]
            );
        }
        push(withPartTitles(`${moduleLabel}: ${headings.map}`, packLines(headings.mapIntro(moduleLabel), mapLines)), [config.module, "map"]);

        for (const extra of config.extraBlocks || []) {
            const keys = collectKeys(extra.block, blocks, namespaces, opaque).filter((key) => !isShared(key));
            push(
                screenChunks({ moduleLabel, screenLabel: extra.title[locale], keys, messages, headings }),
                [config.module, extra.slug]
            );
        }

        const errorLines = texts(sharedErrorKeys, messages).map((entry) => `- ${entry.text}`);
        if (errorLines.length) {
            push(withPartTitles(`${moduleLabel}: ${headings.errors}`, packLines(`${moduleLabel}: ${headings.errors}.`, errorLines)), [config.module, "errors"]);
        }
    }
    return chunks;
};

export const hashChunks = (chunks) =>
    crypto.createHash("sha256").update(JSON.stringify(chunks)).digest("hex").slice(0, 16);
