// Fase 4 of the guided assistant: the Discovery Engine's learning loop
// ("predicción → resultado real → error → aprendizaje",
// discoveryLearning.service.js), applied to the assistant's own guidance.
//
// 1. recordGuidance: when a reply sends a company to the screen that fixes
//    one of its detected accounting findings, that's a prediction - "this
//    guidance clears the finding" - checked GUIDANCE_CHECK_DAYS later.
// 2. checkDueGuidance (nightly, assistantLearningScheduler.js): re-runs that
//    same detector. Finding gone = resolved; still there = unresolved.
// 3. AssistantGuidanceStats keeps a Laplace-smoothed success rate per
//    finding type (same formula as DiscoveryPatternStats); a type whose
//    guidance keeps failing tells the agent to slow down and verify each
//    step (see describeCompanyState).
// 4. recordKnowledgeGap: questions the model flagged it couldn't answer -
//    the to-do list for the knowledge base / app map.
//
// "Resolved" is correlation, not proof the chat did it - the person might
// have fixed it on their own. It's still the honest signal available, and
// the same caveat already applies to Discovery's predictions.
import { prisma } from "../db/prisma.js";
import { HIGHLIGHT_ANCHORS } from "./assistantNavigation.js";
import { ALL_STATE_DETECTORS } from "./assistantCompanyState.service.js";
import { smoothedConfidence } from "./discoveryLearning.service.js";

export const GUIDANCE_CHECK_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CHECKS_PER_RUN = 500;

// Which of the company's findings this reply is guiding on: the ones whose
// screen the reply sends the person to (navigate) or points at (highlight).
// Highest priority first, since findings arrive sorted.
export const matchGuidedFindings = (findings, actions) => {
    if (!findings?.length || !actions) return [];
    const targets = new Set(
        [actions.navigate?.target, HIGHLIGHT_ANCHORS[actions.highlight?.anchor]?.target].filter(Boolean)
    );
    return findings.filter((finding) => targets.has(finding.target));
};

export const recordGuidance = async ({ db = prisma, accountId, actorId, conversationId, messageId, findings, actions, now = new Date() }) => {
    const [finding] = matchGuidedFindings(findings, actions);
    if (!finding) return null;

    // One open prediction per (company, finding): a conversation that keeps
    // pointing at the same fix over several turns is one attempt, not five -
    // counting each turn would inflate both sides of the success rate.
    const open = await db.assistantGuidance.findFirst({
        where: { accountId, findingKey: finding.key, checkedAt: null },
        select: { id: true },
    });
    if (open) return null;

    return db.assistantGuidance.create({
        data: {
            accountId,
            actorId,
            conversationId,
            messageId,
            findingKey: finding.key,
            target: finding.target,
            checkAfter: new Date(now.getTime() + GUIDANCE_CHECK_DAYS * DAY_MS),
        },
    });
};

export const recordKnowledgeGap = ({ db = prisma, userId, conversationId, messageId, module, tab, locale, question }) =>
    db.assistantKnowledgeGap.create({
        data: { userId, conversationId, messageId, module, tab, locale, question: question.slice(0, 2000) },
    });

const updateStats = async ({ db, findingKey, wasResolved }) => {
    const existing = await db.assistantGuidanceStats.findUnique({ where: { findingKey } });
    const totalChecked = (existing?.totalChecked || 0) + 1;
    const resolved = (existing?.resolved || 0) + (wasResolved ? 1 : 0);
    const successRate = smoothedConfidence(resolved, totalChecked);
    await db.assistantGuidanceStats.upsert({
        where: { findingKey },
        update: { totalChecked, resolved, successRate },
        create: { findingKey, totalChecked, resolved, successRate },
    });
};

export const checkDueGuidance = async ({ db = prisma, now = new Date(), detectors = ALL_STATE_DETECTORS } = {}) => {
    const due = await db.assistantGuidance.findMany({
        where: { checkedAt: null, checkAfter: { lte: now } },
        orderBy: { checkAfter: "asc" },
        take: MAX_CHECKS_PER_RUN,
    });
    const byKey = new Map(detectors.map((detector) => [detector.key, detector]));
    const result = { checked: 0, resolved: 0, unresolved: 0, skipped: 0 };

    for (const guidance of due) {
        const detector = byKey.get(guidance.findingKey);
        if (!detector) {
            // Detector renamed/removed since - nothing meaningful to check,
            // and leaving it due would re-scan it every night forever.
            await db.assistantGuidance.update({ where: { id: guidance.id }, data: { checkedAt: now } });
            result.skipped += 1;
            continue;
        }
        try {
            const stillThere = await detector.run({ db, accountId: guidance.accountId, now });
            const wasResolved = !stillThere;
            await db.assistantGuidance.update({
                where: { id: guidance.id },
                data: { checkedAt: now, outcome: wasResolved ? "resolved" : "unresolved" },
            });
            await updateStats({ db, findingKey: guidance.findingKey, wasResolved });
            result.checked += 1;
            result[wasResolved ? "resolved" : "unresolved"] += 1;
        } catch (error) {
            // Left unchecked on purpose: a transient DB error shouldn't be
            // recorded as the guidance having failed. Retried next night.
            console.error(`[assistant-learning] check failed for guidance ${guidance.id}:`, error?.message);
        }
    }
    return result;
};

// Track record keyed by finding, for the prompt (assistantCompanyState.service.js) and the
// admin insights.
export const getGuidanceStats = async ({ db = prisma } = {}) => {
    const rows = await db.assistantGuidanceStats.findMany();
    return new Map(
        rows.map((row) => [row.findingKey, { totalChecked: row.totalChecked, resolved: row.resolved, successRate: Number(row.successRate) }])
    );
};

// Admin view of the loop: how guidance is performing per finding type,
// what's still waiting to be checked, and what people ask that the
// assistant couldn't answer or rated down.
export const getAssistantInsights = async ({ db = prisma, now = new Date(), days = 30 } = {}) => {
    const since = new Date(now.getTime() - days * DAY_MS);
    const [stats, pending, gaps, downvotes] = await Promise.all([
        db.assistantGuidanceStats.findMany({ orderBy: { successRate: "asc" } }),
        db.assistantGuidance.groupBy({ by: ["findingKey"], where: { checkedAt: null }, _count: { _all: true } }),
        db.assistantKnowledgeGap.findMany({
            where: { createdAt: { gte: since } },
            orderBy: { createdAt: "desc" },
            take: 100,
            select: { question: true, module: true, tab: true, locale: true, createdAt: true },
        }),
        db.chatFeedback.findMany({
            where: { rating: "down", createdAt: { gte: since } },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: { comment: true, createdAt: true, message: { select: { content: true, module: true } } },
        }),
    ]);
    return {
        since,
        guidance: stats.map((row) => ({
            finding_key: row.findingKey,
            total_checked: row.totalChecked,
            resolved: row.resolved,
            success_rate: Number(row.successRate),
            pending: pending.find((group) => group.findingKey === row.findingKey)?._count._all || 0,
        })),
        pending_without_history: pending
            .filter((group) => !stats.some((row) => row.findingKey === group.findingKey))
            .map((group) => ({ finding_key: group.findingKey, pending: group._count._all })),
        knowledge_gaps: gaps,
        downvoted_replies: downvotes.map((row) => ({
            reply: row.message.content,
            module: row.message.module,
            comment: row.comment,
            created_at: row.createdAt,
        })),
    };
};
