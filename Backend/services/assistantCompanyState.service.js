// Orchestrates the per-module state detectors (assistantAccountingState /
// assistantFinanceState): which modules a conversation touches, the same
// access gates each module's own routes apply, the learning loop's track
// record per finding, and the prompt text the agent receives.
//
// Finding keys are unique across modules (finance ones are prefixed
// "finance_"), since AssistantGuidance/AssistantGuidanceStats key on them.
import { prisma } from "../db/prisma.js";
import { ACCOUNTING_STATE_DETECTORS, canSeeAccounting } from "./assistantAccountingState.service.js";
import { FINANCE_STATE_DETECTORS, canSeeFinance } from "./assistantFinanceState.service.js";

export const STATE_MODULES = {
    accounting: {
        detectors: ACCOUNTING_STATE_DETECTORS,
        canSee: canSeeAccounting,
        heading: "ESTADO DE LA CONTABILIDAD DE ESTA EMPRESA",
        nothingPending: "no se detectó nada pendiente (hay movimientos, apertura registrada, sin borradores, sin procesos fallidos ni meses anteriores abiertos)",
        topic: /contab|asiento|comprobante|apertura|saldos? inicial|periodo|cierre|depreci|diferid|amortiz|balance|libro|cuenta contable|puc|activo fijo|retenci|\biva\b|\bica\b|accounting|journal|voucher|ledger|opening balance|closing/i,
    },
    finance: {
        detectors: FINANCE_STATE_DETECTORS,
        canSee: canSeeFinance,
        heading: "ESTADO DE LAS FINANZAS DE ESTA EMPRESA",
        nothingPending: "no se detectó nada pendiente (hay cajas o bancos activos, sin diferencias de integridad, sin pagos ni cobros vencidos, extractos conciliados)",
        topic: /\bcaja|banco|bancari|extracto|concilia|cobr|cartera|por pagar|pagos? vencid|proveedor.*pag|flujo de caja|efectivo|saldo|finanz|cash|bank|reconcil|payable|receivable|overdue/i,
    },
};

// Every detector across modules - what the nightly learning check re-runs.
export const ALL_STATE_DETECTORS = Object.values(STATE_MODULES).flatMap((config) => config.detectors);

// Which modules' state is worth loading for this turn: the one the person
// is on, plus any the message (or the question it answers) talks about.
// Each costs queries and prompt tokens, so nothing loads "just in case".
export const relevantStateModules = ({ module, message, history = [] }) => {
    const lastAssistant = [...history].reverse().find((entry) => entry.role === "assistant");
    const text = `${message} ${lastAssistant?.content || ""}`;
    return Object.entries(STATE_MODULES)
        .filter(([key, config]) => key === module || config.topic.test(text))
        .map(([key]) => key);
};

// Runs every detector; one failing (bad data, a schema drift) never takes
// the others - or the assistant's reply - down with it.
export const runDetectors = async ({ detectors, accountId, db = prisma, now = new Date(), scope }) => {
    const results = await Promise.all(
        detectors.map(async (detector) => {
            try {
                const finding = await detector.run({ db, accountId, now, scope });
                return finding ? { key: detector.key, priority: detector.priority, ...finding } : null;
            } catch (error) {
                console.error(`[assistant] state detector ${detector.key} failed:`, error);
                return null;
            }
        })
    );
    return results.filter(Boolean).sort((a, b) => b.priority - a.priority);
};

// Attaches each finding type's guidance track record (AssistantGuidanceStats,
// written by assistantLearning.service.js's nightly check). Read directly
// here rather than through that service to keep the two free of a circular
// import (it imports ALL_STATE_DETECTORS from this file).
export const attachGuidanceTrack = async ({ findings, db = prisma }) => {
    if (!findings?.length) return findings;
    const rows = await db.assistantGuidanceStats.findMany({ where: { findingKey: { in: findings.map((finding) => finding.key) } } });
    const byKey = new Map(rows.map((row) => [row.findingKey, row]));
    return findings.map((finding) => {
        const row = byKey.get(finding.key);
        return row ? { ...finding, track: { totalChecked: row.totalChecked, resolved: row.resolved, successRate: Number(row.successRate) } } : finding;
    });
};

// A turn can hit these detectors several times in a minute (greeting, nudge,
// each message) and the finance planners scan every open invoice - a short
// per-company cache keeps that cheap. Five minutes is short enough that
// "I just fixed it" shows up on the next conversation.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

const scopeKey = (user) => (user.posScopeAll !== false ? "all" : [...(user.posScopeIds || [])].sort().join(","));

const loadModuleState = async (user, module, now) => {
    const config = STATE_MODULES[module];
    if (!(await config.canSee(user))) return null;
    const key = `${user.prismaId}|${module}|${scopeKey(user)}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now.getTime()) return cached.findings;

    const findings = await runDetectors({
        detectors: config.detectors,
        accountId: user.prismaId,
        now,
        scope: { posScopeAll: user.posScopeAll !== false, posScopeIds: user.posScopeIds || [] },
    });
    let withTrack = findings;
    try {
        withTrack = await attachGuidanceTrack({ findings });
    } catch (error) {
        console.error("[assistant] guidance track lookup failed:", error);
    }
    const tagged = withTrack.map((finding) => ({ ...finding, module }));
    cache.set(key, { findings: tagged, expiresAt: now.getTime() + CACHE_TTL_MS });
    return tagged;
};

// { accounting: findings | null, finance: ... } for the requested modules;
// null for a module means "not allowed to see it" (distinct from [] =
// allowed, nothing pending). Never throws.
export const getCompanyState = async (user, modules, { now = new Date() } = {}) => {
    if (!user || !modules?.length) return {};
    const entries = await Promise.all(
        modules.map(async (module) => {
            try {
                return [module, await loadModuleState(user, module, now)];
            } catch (error) {
                console.error(`[assistant] ${module} state failed:`, error);
                return [module, null];
            }
        })
    );
    return Object.fromEntries(entries);
};

export const clearCompanyStateCache = () => cache.clear();

// All visible findings across modules, most important first.
export const flattenFindings = (state) =>
    Object.values(state || {})
        .filter(Array.isArray)
        .flat()
        .sort((a, b) => b.priority - a.priority);

// Below this many checked outcomes the rate is mostly the smoothing prior,
// not evidence - same spirit as discoveryScoring.js's trust threshold.
const MIN_TRACK_SAMPLES = 5;
const LOW_SUCCESS_RATE = 0.4;

const trackNote = (track) => {
    if (!track || track.totalChecked < MIN_TRACK_SAMPLES || track.successRate >= LOW_SUCCESS_RATE) return "";
    return ` (Historial: cuando el asistente guió sobre esto, el problema se resolvió en ${track.resolved} de ${track.totalChecked} casos. Sé más concreto: da los pasos exactos uno por uno y confirma que la persona completó cada uno antes de seguir.)`;
};

const describeModule = (module, findings) => {
    const config = STATE_MODULES[module];
    if (!findings.length) return `${config.heading} (datos reales de Ohnix): ${config.nothingPending}.`;
    return `${config.heading} (datos reales de Ohnix, de lo más a lo menos importante):\n${findings
        .map((finding) => `- ${finding.summary} [pantalla: ${finding.target}]${trackNote(finding.track)}`)
        .join("\n")}`;
};

// Prompt block for the agent - only the modules the person may see.
export const describeCompanyState = (state) => {
    const sections = Object.entries(state || {})
        .filter(([, findings]) => Array.isArray(findings))
        .map(([module, findings]) => describeModule(module, findings));
    return sections.length ? sections.join("\n\n") : null;
};
