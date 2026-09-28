import test from "node:test";
import assert from "node:assert/strict";
import {
    runAssistantAgent,
    sanitizeRespondArgs,
    buildHistoryMessages,
    buildSystemPrompt,
    buildRetrievalQuery,
    parseTurn,
} from "../services/assistantAgent.service.js";

const turn = (fields) => ({
    content: JSON.stringify({ search_query: null, message: "", sources_used: [], choices: [], navigate_to: null, highlight: null, knowledge_gap: false, ...fields }),
});

// Scripted stand-in for the LLM: returns the queued replies in order and
// records every request so tests can assert on what the model was shown.
const scriptedModel = (replies) => {
    const requests = [];
    const fn = async (request) => {
        requests.push(structuredClone(request));
        const next = replies.shift();
        if (!next) throw new Error("model called more times than scripted");
        return next;
    };
    fn.requests = requests;
    return fn;
};

const recordingSearch = (resultsByCall = []) => {
    const calls = [];
    const fn = async (args) => {
        calls.push(args);
        return resultsByCall[calls.length - 1] || [];
    };
    fn.calls = calls;
    return fn;
};

test("sanitizeRespondArgs resolves navigation and highlight from the registry only", () => {
    const result = sanitizeRespondArgs({
        message: "Ve a **Apertura contable**",
        choices: ["Ya lo hice", "Ya lo hice", "", 42, "x".repeat(200), "Aún no"],
        navigate_to: "accounting.opening_balance",
        highlight: "accounting-chart-new-account",
    });
    assert.equal(result.message, "Ve a Apertura contable");
    assert.deepEqual(result.actions.choices, ["Ya lo hice", "Aún no"]);
    assert.equal(result.actions.navigate.path, "/accounting");
    assert.deepEqual(result.actions.navigate.state, { tab: "opening_balance" });
    assert.equal(result.actions.highlight.anchor, "accounting-chart-new-account");
    assert.deepEqual(result.actions.highlight.state, { tab: "chart" });
});

test("sanitizeRespondArgs drops unknown targets instead of passing model output through", () => {
    const result = sanitizeRespondArgs({ message: "Hola", navigate_to: "https://evil.example", highlight: "#root" });
    assert.equal(result.actions, null);
});

test("sanitizeRespondArgs skips a navigate button that duplicates the highlight's own screen", () => {
    const result = sanitizeRespondArgs({
        message: "Aquí",
        navigate_to: "accounting.vouchers",
        highlight: "accounting-vouchers-new",
    });
    assert.equal(result.actions.navigate, undefined);
    assert.equal(result.actions.highlight.anchor, "accounting-vouchers-new");
});

test("sanitizeRespondArgs drops navigation/highlight pointing at the screen the person is already on", () => {
    const result = sanitizeRespondArgs(
        { message: "Aquí estás", navigate_to: "accounting.overview", highlight: "accounting-tab-overview", choices: ["Ok"] },
        { module: "accounting", tab: "overview" }
    );
    assert.deepEqual(result.actions, { choices: ["Ok"] });
});

test("buildHistoryMessages replays offered choices so a short answer keeps its meaning", () => {
    const messages = buildHistoryMessages([
        { role: "user", content: "cómo empiezo" },
        { role: "assistant", content: "¿Ya cargaste saldos iniciales?", actions: { choices: ["Sí", "Aún no"] } },
    ]);
    assert.equal(messages.length, 2);
    assert.match(messages[1].content, /Opciones que ofreciste: Sí \| Aún no/);
});

test("buildSystemPrompt includes the current tab and the module's detailed map", () => {
    const prompt = buildSystemPrompt({ locale: "es", module: "accounting", tab: "journal" });
    assert.match(prompt, /pestaña "journal"/);
    assert.match(prompt, /accounting\.opening_balance:/);
    assert.match(prompt, /accounting-vouchers-new/);
});

test("buildSystemPrompt collapses other modules' sub-screens to keep the prompt small", () => {
    const prompt = buildSystemPrompt({ locale: "es", module: "products", tab: null });
    assert.doesNotMatch(prompt, /accounting\.opening_balance:/);
    assert.match(prompt, /accounting\.<overview\|chart\|/);
    assert.doesNotMatch(prompt, /accounting-vouchers-new/);
});

test("buildRetrievalQuery adds the previous question to a short answer", () => {
    const history = [{ role: "assistant", content: "¿Ya cargaste los saldos iniciales?" }];
    assert.equal(buildRetrievalQuery("Aún no", history), "¿Ya cargaste los saldos iniciales? Aún no");
    const long = "Quiero saber cómo registro la depreciación de un vehículo de la empresa";
    assert.equal(buildRetrievalQuery(long, history), long);
});

test("parseTurn recovers the turn object from trailing JSON or plain prose", () => {
    const trailing = parseTurn('Un débito aumenta activos.\n{"choices": ["Sí", "No"], "navigate_to": "accounting.journal"}');
    assert.equal(trailing.message, "Un débito aumenta activos.");
    assert.deepEqual(trailing.choices, ["Sí", "No"]);
    assert.deepEqual(parseTurn("Solo texto."), { message: "Solo texto." });
});

test("runAssistantAgent pre-retrieves knowledge and answers in a single model call", async () => {
    const model = scriptedModel([
        turn({ message: "Empecemos por la apertura.", sources_used: ["[Apertura contable]", "Inventada"], choices: ["Listo"], navigate_to: "accounting.opening_balance" }),
    ]);
    const search = recordingSearch([[
        { id: "k1", title: "Apertura contable", body: "Se cargan los saldos iniciales." },
        { id: "k9", title: "Qué es Ohnix", body: "Ohnix es un ERP." },
    ]]);
    const result = await runAssistantAgent({
        message: "cómo empiezo con contabilidad en Ohnix desde cero",
        history: [{ role: "user", content: "hola" }, { role: "assistant", content: "¡Hola!" }],
        module: "accounting",
        tab: "overview",
        callModel: model,
        searchKnowledge: search,
    });

    assert.equal(result.content, "Empecemos por la apertura.");
    assert.deepEqual(result.actions.choices, ["Listo"]);
    assert.equal(result.actions.navigate.target, "accounting.opening_balance");
    assert.deepEqual(result.sources, [{ id: "k1", title: "Apertura contable" }]);
    assert.equal(search.calls.length, 1);
    assert.equal(model.requests.length, 1);

    const sent = model.requests[0];
    assert.equal(sent.responseFormat.type, "json_schema");
    assert.deepEqual(sent.messages.map((m) => m.role), ["system", "user", "assistant", "user"]);
    assert.match(sent.messages.at(-1).content, /Se cargan los saldos iniciales[\s\S]*MENSAJE DE LA PERSONA:\ncómo empiezo/);
});

test("runAssistantAgent runs a follow-up search when the model asks for one", async () => {
    const model = scriptedModel([
        turn({ search_query: "cierre de periodo" }),
        turn({ message: "Se cierra desde Periodos.", sources_used: ["Periodos"], navigate_to: "accounting.periods" }),
    ]);
    const search = recordingSearch([[], [{ id: "k2", title: "Periodos", body: "Cerrar un periodo evita cambios." }]]);
    const result = await runAssistantAgent({ message: "cómo cierro el mes contable en la plataforma", callModel: model, searchKnowledge: search });

    assert.equal(result.content, "Se cierra desde Periodos.");
    assert.deepEqual(search.calls.map((c) => c.query), ["cómo cierro el mes contable en la plataforma", "cierre de periodo"]);
    assert.deepEqual(result.sources, [{ id: "k2", title: "Periodos" }]);
    assert.match(model.requests[1].messages.at(-1).content, /Cerrar un periodo evita cambios/);
});

test("runAssistantAgent stops searching on the last step and forces an answer", async () => {
    const model = scriptedModel([
        turn({ search_query: "a" }),
        turn({ search_query: "b" }),
        turn({ search_query: "c", message: "Con lo que tengo: ..." }),
    ]);
    const search = recordingSearch();
    const result = await runAssistantAgent({ message: "una pregunta bastante larga sobre algo raro", callModel: model, searchKnowledge: search });
    assert.equal(result.content, "Con lo que tengo: ...");
    // initial pre-retrieval + "a" + "b" - "c" is never run.
    assert.deepEqual(search.calls.map((c) => c.query).slice(1), ["a", "b"]);
    assert.match(model.requests[2].messages.at(-1).content, /Ya no puedes buscar más/);
});

test("runAssistantAgent doesn't repeat an identical search", async () => {
    const model = scriptedModel([
        turn({ search_query: "iva" }),
        turn({ search_query: "IVA", message: "Esto es lo que sé del IVA." }),
    ]);
    const search = recordingSearch();
    const result = await runAssistantAgent({ message: "cuéntame del iva en ohnix por favor ya", callModel: model, searchKnowledge: search });
    assert.equal(result.content, "Esto es lo que sé del IVA.");
    assert.equal(search.calls.length, 2);
});

test("runAssistantAgent nudges once when the reply comes back empty", async () => {
    const model = scriptedModel([turn({ message: "" }), turn({ message: "Ahora sí." })]);
    const result = await runAssistantAgent({ message: "hola?", callModel: model, searchKnowledge: recordingSearch() });
    assert.equal(result.content, "Ahora sí.");
});

test("runAssistantAgent accepts plain prose from a provider that ignores the schema", async () => {
    const model = scriptedModel([{ content: "**Hola**, te ayudo." }]);
    const result = await runAssistantAgent({ message: "hola?", callModel: model, searchKnowledge: recordingSearch() });
    assert.equal(result.content, "Hola, te ayudo.");
    assert.equal(result.actions, null);
});

test("runAssistantAgent throws when no usable reply ever arrives", async () => {
    const model = scriptedModel([turn({}), turn({}), turn({})]);
    await assert.rejects(runAssistantAgent({ message: "x", callModel: model, searchKnowledge: recordingSearch() }));
});

test("runAssistantAgent reports when the model flags a knowledge gap", async () => {
    const model = scriptedModel([turn({ message: "No tengo eso confirmado, te sugiero soporte.", knowledge_gap: true })]);
    const result = await runAssistantAgent({ message: "¿Ohnix hace nómina electrónica para Panamá?", callModel: model, searchKnowledge: recordingSearch() });
    assert.equal(result.knowledgeGap, true);
    const plain = await runAssistantAgent({ message: "hola?", callModel: scriptedModel([turn({ message: "Hola" })]), searchKnowledge: recordingSearch() });
    assert.equal(plain.knowledgeGap, false);
});
