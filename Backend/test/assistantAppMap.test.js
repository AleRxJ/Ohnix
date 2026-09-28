import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildModuleChunks, classifyKey, splitTopLevelBlocks } from "../services/assistantAppMapBuilder.js";
import { buildAppMapFromDisk } from "../services/assistantAppMapSources.js";
import { loadAppMap, syncAppMapKnowledge } from "../services/assistantAppMapSync.service.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const PAGE = `import Imported from "../components/demo/Imported";

const ERROR_CODES = {
    boom: "demo.error_boom",
};

const errorMessage = (e) => ERROR_CODES[e];

const Guide = ({ title }) => <div>{title}</div>;

const FirstTab = () => {
    const { t } = useI18n();
    // Mentions Page in a comment - must not pull the root in.
    return <Guide title={t("demo.guide_first_title")} steps={[t("demo.guide_first_step_1")]} onError={errorMessage} label={t("demo.first_amount")} />;
};

const SecondTab = () => <p>{t("demo.second_amount_help")}{errorMessage}</p>;
const ThirdTab = () => <p>{errorMessage}</p>;
const FourthTab = () => <p>{errorMessage}</p>;
const FifthTab = () => <p>{errorMessage}</p>;

const Page = () => {
    const tabItems = [
        { key: "first", label: tabLabel(<X />, "demo.tab_first"), children: <FirstTab /> },
        { key: "second", label: tabLabel(<X />, "demo.tab_second"), children: <SecondTab /> },
        { key: "third", label: tabLabel(<X />, "demo.tab_third"), children: <ThirdTab /> },
        { key: "fourth", label: tabLabel(<X />, "demo.tab_fourth"), children: <FourthTab /> },
        { key: "imported", label: tabLabel(<X />, "demo.tab_imported"), children: <Imported /> },
        { key: "fifth", label: tabLabel(<X />, "demo.tab_fifth"), children: <FifthTab /> },
    ];
    return <Tabs items={tabItems} />;
};

export default Page;
`;

const IMPORTED = `// Mentions FirstTab and Page - separate module, must not be followed.
export default function Imported() { return t("demo.imported_caption"); }`;

const MESSAGES = {
    demo: {
        tab_first: "Primera",
        tab_first_caption: "Para qué sirve la primera.",
        tab_second: "Segunda",
        tab_third: "Tercera",
        tab_fourth: "Cuarta",
        tab_fifth: "Quinta",
        tab_imported: "Importada",
        imported_caption: "Pantalla que vive en otro archivo.",
        guide_first_title: "Aprende la primera",
        guide_first_step_1: "Haz clic en {{button}}.",
        first_amount: "Monto",
        second_amount_help: "Ayuda de la segunda.",
        error_boom: "Algo explotó.",
    },
};

const PAGE_CONFIG = { page: "pages/Demo.jsx", layout: "tabs" };
const CONFIG = { module: "demo", namespace: "demo", moduleLabel: { es: "Demo" }, pages: [PAGE_CONFIG] };
const build = () =>
    buildModuleChunks({
        config: CONFIG,
        pages: [{ page: PAGE_CONFIG, pageSource: PAGE, importedSources: { "../components/demo/Imported": IMPORTED } }],
        locales: { es: MESSAGES },
    });
const find = (chunks, title) => chunks.find((chunk) => chunk.title === title);

test("splitTopLevelBlocks finds column-0 declarations and skips imports", () => {
    const blocks = splitTopLevelBlocks(PAGE);
    assert.ok(blocks.has("FirstTab"));
    assert.ok(blocks.has("ERROR_CODES"));
    assert.ok(!blocks.has("Imported"));
});

test("classifyKey buckets keys by naming convention", () => {
    assert.equal(classifyKey("a.guide_x_title", "t"), "guide");
    assert.equal(classifyKey("a.opening_balance_step_2", "t"), "guide");
    assert.equal(classifyKey("a.guide_x_help", "t"), "help");
    assert.equal(classifyKey("a.tab_x_caption", "t"), "caption");
    assert.equal(classifyKey("a.error_boom", "t"), "error");
    assert.equal(classifyKey("a.empty_vouchers_title", "t"), "message");
    assert.equal(classifyKey("a.col_total", "Total"), "label");
});

test("each tab gets its own text, following its helpers but not the page root", () => {
    const chunks = build();
    const first = find(chunks, "Demo › Primera: cómo funciona");
    assert.match(first.body, /^Demo › Primera\.\nPara qué sirve la primera\./);
    assert.match(first.body, /Guía de la pantalla:\n- Aprende la primera\n- Haz clic en …\./);
    assert.deepEqual(first.tags, ["demo", "first"]);
    assert.match(find(chunks, "Demo › Primera: campos, botones y mensajes").body, /Monto/);
    // Nothing from other tabs leaked in via the comment mentioning Page.
    assert.doesNotMatch(first.body, /segunda|otro archivo/i);
});

test("imported component files contribute their text without being traversed", () => {
    const chunks = build();
    assert.match(find(chunks, "Demo › Importada: cómo funciona").body, /Pantalla que vive en otro archivo/);
    assert.doesNotMatch(find(chunks, "Demo › Importada: cómo funciona").body, /primera/i);
});

test("errors shared by many tabs move to their own chunk instead of every tab", () => {
    const chunks = build();
    const errors = find(chunks, "Demo: mensajes de error y validaciones");
    assert.match(errors.body, /- Algo explotó\./);
    assert.ok(chunks.filter((chunk) => /Algo explotó/.test(chunk.body)).length === 1);
});

test("the module map lists every tab with its caption", () => {
    const map = find(build(), "Demo: mapa de pantallas");
    assert.match(map.body, /- Primera: Para qué sirve la primera\./);
    assert.match(map.body, /- Quinta/);
});

// The committed file must match what the current frontend source produces
// - otherwise a UI change shipped without teaching the assistant about it.
test("data/assistantAppMap.generated.json is up to date with the frontend (run: npm run assistant:app-map)", () => {
    const fresh = buildAppMapFromDisk({ repoRoot });
    const committed = loadAppMap();
    assert.equal(committed.hash, fresh.hash);
});

test("the real accounting app map covers every tab in both languages", () => {
    const { chunks } = loadAppMap();
    for (const locale of ["es", "en"]) {
        const tabs = new Set(chunks.filter((chunk) => chunk.locale === locale && chunk.module === "accounting").map((chunk) => chunk.tags[1]));
        for (const tab of ["overview", "chart", "journal", "vouchers", "opening_balance", "periods", "taxes", "map", "errors"]) {
            assert.ok(tabs.has(tab), `${locale} app map is missing ${tab}`);
        }
    }
    assert.ok(chunks.every((chunk) => chunk.body.length <= 1400));
});

const fakeDb = (rows) => {
    const calls = { upsert: [], update: [], deleteMany: [] };
    return {
        calls,
        assistantKnowledgeChunk: {
            findMany: async () => rows,
            upsert: async (args) => calls.upsert.push(args),
            update: async (args) => calls.update.push(args),
            deleteMany: async (args) => calls.deleteMany.push(args),
        },
    };
};

test("syncAppMapKnowledge creates new, updates changed, deletes removed, skips unchanged", async () => {
    const chunk = (title, body) => ({ module: "demo", locale: "es", title, body, tags: ["demo", "x"], sourceType: "app_map" });
    const db = fakeDb([
        { id: "same", ...chunk("Igual", "a"), isPublished: true },
        { id: "changed", ...chunk("Cambia", "viejo"), isPublished: true },
        { id: "gone", ...chunk("Borrada", "z"), isPublished: true },
    ]);
    const result = await syncAppMapKnowledge({
        db,
        appMap: { hash: "h", chunks: [chunk("Igual", "a"), chunk("Cambia", "nuevo"), chunk("Nueva", "n")] },
    });

    assert.deepEqual(result, { hash: "h", created: 1, updated: 1, removed: 1, unchanged: 1 });
    assert.equal(db.calls.upsert[0].create.title, "Nueva");
    assert.equal(db.calls.update[0].where.id, "changed");
    assert.deepEqual(db.calls.deleteMany[0].where.id.in, ["gone"]);
});

// "sections" layout (e.g. Finance): one page, blocks listed in the config,
// "@root" = the page's own component minus the other sections.
const SECTIONS_PAGE = `import Planner from "../components/demo/Planner";

const Summary = () => <p>{t("demo.summary_help")}</p>;

const Money = () => (
    <div>
        {t("demo.money_caption")}
        <Summary />
        <Planner />
    </div>
);

export default Money;
`;
const PLANNER = `export default function Planner() { return t("demo.planner_help"); }`;
const ERROR_MAP = `export const DEMO_ERRORS = { late: "demo.error_late", ok: "demo.saved" };`;

const MONEY_PAGE = {
    page: "pages/Money.jsx",
    layout: "sections",
    sections: [
        { key: "main", component: "@root", label: { es: "Principal" }, captionKey: "demo.money_caption" },
        { key: "planner", component: "Planner", labelKey: "demo.planner_title" },
    ],
};

const buildSections = () =>
    buildModuleChunks({
        config: { module: "money", namespace: "demo", moduleLabel: { es: "Dinero" }, errorSources: ["utils/demoError.js"], pages: [MONEY_PAGE] },
        pages: [{ page: MONEY_PAGE, pageSource: SECTIONS_PAGE, importedSources: { "../components/demo/Planner": PLANNER } }],
        extraSources: { "utils/demoError.js": ERROR_MAP },
        locales: {
            es: {
                demo: {
                    money_caption: "Para manejar el dinero.",
                    summary_help: "Ayuda del resumen.",
                    planner_title: "Planificador",
                    planner_help: "Ayuda del planificador.",
                    error_late: "Vas tarde.",
                    saved: "Guardado.",
                },
            },
        },
    });

test("sections layout: @root excludes the other sections, each section gets its own chunk", () => {
    const chunks = buildSections();
    const main = find(chunks, "Dinero › Principal: cómo funciona");
    assert.match(main.body, /Para manejar el dinero\.[\s\S]*Ayuda del resumen\./);
    assert.doesNotMatch(main.body, /planificador/i);
    assert.match(find(chunks, "Dinero › Planificador: cómo funciona").body, /Ayuda del planificador\./);
    assert.deepEqual(find(chunks, "Dinero › Planificador: cómo funciona").tags, ["money", "planner"]);
});

test("errorSources contribute only their error messages to the module's error chunk", () => {
    const errors = find(buildSections(), "Dinero: mensajes de error y validaciones");
    assert.match(errors.body, /- Vas tarde\./);
    assert.doesNotMatch(errors.body, /Guardado/);
});

test("the real finance app map covers its sections and the reconciliation page", () => {
    const { chunks } = loadAppMap();
    const tags = new Set(chunks.filter((chunk) => chunk.module === "finance" && chunk.locale === "es").map((chunk) => chunk.tags[1]));
    for (const key of ["cash_accounts", "payment_methods", "payables", "receivables", "cash_integrity", "reconciliation", "map", "errors"]) {
        assert.ok(tags.has(key), `finance app map is missing ${key}`);
    }
});
