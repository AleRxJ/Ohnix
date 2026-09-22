import { prisma } from "../db/prisma.js";
import { computeDiscoveryScore, applyLearnedConfidence } from "./discoveryScoring.js";
import { runExplanationCheck } from "./discoveryExplanation.service.js";
import { resolveIsEnglish } from "./discoveryLocale.service.js";

const OPEN_STATUSES_EXCLUDED = ["resolved", "dismissed"];

// Upserts a detector's candidate finding: if a still-open Discovery with the
// same (accountId, dedupeKey) already exists, this bumps lastSeenAt and
// refreshes its evidence/scores instead of creating a duplicate row -
// mission rule 5 ("Ohnix no debe necesitar encontrar algo todos los días")
// means re-running a detector every night must not spam a new card for the
// same ongoing situation. entities/predictions are only attached when a NEW
// Discovery is created; an update refreshes what changed (the numbers) and
// leaves prediction history alone.
export const upsertDiscovery = async ({
    accountId,
    detectorKey,
    type,
    dedupeKey,
    title,
    summary,
    hypothesis = null,
    unknowns = null,
    recommendation = null,
    scores,
    entityCount = 0,
    patternSince = null,
    evidence = [],
    entities = [],
    predictions = [],
    db = prisma,
}) => {
    // Mission section 9's learning loop, closed: a detector's track record
    // (DiscoveryPatternStats, updated by discoveryLearning.service.js as its
    // past predictions get checked) pulls this finding's confidence toward
    // how often that detector has actually been right before - capped so a
    // "usually right" detector still can't skip having real evidence for
    // THIS specific finding.
    const isEN = await resolveIsEnglish({ accountId, db });

    const patternStats = await db.discoveryPatternStats.findUnique({ where: { detectorKey } });
    const learned = applyLearnedConfidence({ confidence: scores.confidence, patternStats });
    const score = computeDiscoveryScore({ ...scores, confidence: learned.confidence });
    const learnedConfidenceEvidence = learned.blended
        ? [
              {
                  kind: "learned_confidence",
                  label: isEN ? "Confidence adjusted by this detector's track record" : "Confianza ajustada por historial de este detector",
                  data: {
                      fresh_confidence: learned.freshConfidence,
                      learned_confidence: learned.learnedConfidence,
                      blended_confidence: learned.confidence,
                      learned_weight: learned.weight,
                      predictions_checked: learned.totalPredictions,
                      predictions_correct: learned.correctPredictions,
                  },
                  sourceType: "discovery_pattern_stats",
                  sourceId: detectorKey,
              },
          ]
        : [];

    const existing = await db.discovery.findFirst({
        where: { accountId, dedupeKey, status: { notIn: OPEN_STATUSES_EXCLUDED } },
    });

    // Mission case G: this same pattern carried a human explanation before
    // - either a dismiss reason or a general "¿qué crees que está
    // pasando?" (setTeamExplanation, any status) - and it just came back.
    // That recurrence is real evidence the stated explanation didn't hold,
    // so it's attached as its own evidence entry on the NEW finding rather
    // than silently discarded - never framed as "you were wrong", just as a
    // fact worth re-checking against what was said. A row reaches this
    // branch only when it's NOT the account's current open row for this
    // dedupeKey (the `existing` check above already covers every status
    // except resolved/dismissed), so this can only ever match a genuinely
    // closed prior Discovery, never one still in play.
    let perceptionGapEvidence = [];
    if (!existing) {
        const priorClosed = await db.discovery.findFirst({
            where: {
                accountId,
                dedupeKey,
                OR: [{ dismissReason: { not: null } }, { teamExplanation: { not: null } }],
            },
            orderBy: { updatedAt: "desc" },
            select: { id: true, dismissReason: true, dismissedAt: true, teamExplanation: true, teamExplanationAt: true },
        });
        if (priorClosed) {
            const explanation = priorClosed.teamExplanation || priorClosed.dismissReason;
            const explanationAt = priorClosed.teamExplanationAt || priorClosed.dismissedAt;
            const daysAgo = explanationAt ? Math.round((Date.now() - new Date(explanationAt).getTime()) / (24 * 60 * 60 * 1000)) : null;
            perceptionGapEvidence = [
                {
                    kind: "perception_gap",
                    label: isEN ? "Contrast with your previous explanation" : "Contraste con tu explicación anterior",
                    data: {
                        previous_explanation: explanation,
                        explanation_days_ago: daysAgo,
                        note: isEN
                            ? "This explanation was given for this same pattern before, and it came back."
                            : "Esta explicación se había dado para este mismo patrón, y volvió a presentarse.",
                    },
                    sourceType: "discovery",
                    sourceId: priorClosed.id,
                },
            ];
        }
    }

    if (existing) {
        await db.discoveryEvidence.deleteMany({ where: { discoveryId: existing.id } });
        const updated = await db.discovery.update({
            where: { id: existing.id },
            data: {
                lastSeenAt: new Date(),
                title,
                summary,
                hypothesis,
                unknowns,
                recommendation,
                entityCount,
                ...score,
                evidence: { create: [...evidence, ...learnedConfidenceEvidence] },
            },
        });
        return { discovery: updated, created: false };
    }

    const created = await db.discovery.create({
        data: {
            accountId,
            detectorKey,
            type,
            dedupeKey,
            title,
            summary,
            hypothesis,
            unknowns,
            recommendation,
            entityCount,
            patternSince,
            // Every current detector only calls upsertDiscovery after its OWN
            // confidence/threshold checks already passed (mission rule 5 - "no
            // news" is handled by returning early with no call at all) - there
            // is no separate multi-run "investigating"/"validated" pipeline
            // yet, so a brand-new finding goes straight to "published" (visible
            // to the user) instead of sitting at "detected" with nothing to
            // ever promote it. Those intermediate statuses stay in the enum for
            // a future detector that genuinely needs several nights of
            // corroboration before it's ready to show anyone.
            status: "published",
            publishedAt: new Date(),
            ...score,
            evidence: { create: [...evidence, ...perceptionGapEvidence, ...learnedConfidenceEvidence] },
            entities: { create: entities },
            predictions: { create: predictions },
        },
    });
    return { discovery: created, created: true };
};

export const listDiscoveries = async ({ accountId, status, type, db = prisma }) => {
    const rows = await db.discovery.findMany({
        where: { accountId, ...(status ? { status } : {}), ...(type ? { type } : {}) },
        orderBy: [{ priorityScore: "desc" }, { lastSeenAt: "desc" }],
    });
    return rows.map(toDiscoverySummary);
};

export const getDiscoveryDetail = async ({ accountId, id, db = prisma }) => {
    const row = await db.discovery.findFirst({
        where: { id, accountId },
        include: {
            evidence: { orderBy: { createdAt: "asc" } },
            entities: true,
            predictions: { orderBy: { createdAt: "asc" } },
        },
    });
    if (!row) return null;

    return {
        ...toDiscoverySummary(row),
        hypothesis: row.hypothesis,
        unknowns: row.unknowns,
        recommendation: row.recommendation,
        evidence: row.evidence.map((e) => ({
            _id: e.id,
            kind: e.kind,
            label: e.label,
            data: e.data,
            source_type: e.sourceType,
            source_id: e.sourceId,
            created_at: e.createdAt,
        })),
        entities: row.entities.map((e) => ({
            _id: e.id,
            entity_type: e.entityType,
            entity_id: e.entityId,
            role: e.role,
            metadata: e.metadata,
        })),
        predictions: row.predictions.map((p) => ({
            _id: p.id,
            statement: p.statement,
            predicted_data: p.predictedData,
            confidence_at_stake: Number(p.confidenceAtStake),
            check_after: p.checkAfter,
            checked_at: p.checkedAt,
            actual_data: p.actualData,
            outcome: p.outcome,
        })),
    };
};

export const updateDiscoveryStatus = async ({ accountId, id, status, reason = null, db = prisma }) => {
    const row = await db.discovery.findFirst({ where: { id, accountId } });
    if (!row) return null;

    const timestampFields =
        status === "published" ? { publishedAt: new Date() } :
        status === "resolved" ? { resolvedAt: new Date() } :
        // reason is optional (mission case G's perception-gap check only
        // needs SOME dismissals to carry one) - storing null here just
        // means this particular dismissal never becomes evidence later.
        status === "dismissed" ? { dismissedAt: new Date(), dismissReason: reason || null } :
        {};

    const updated = await db.discovery.update({ where: { id }, data: { status, ...timestampFields } });
    return toDiscoverySummary(updated);
};

// Mission case G, generalized: unlike dismissReason (only settable while
// closing a Discovery), a team explanation can be attached at any time,
// regardless of status - "¿qué crees que está pasando?" doesn't require
// the user to be done with the finding first. When `tag` matches a
// registered checker for this Discovery's detector, the check runs
// immediately and its verdict is stored as its own evidence entry - the
// user gets an answer now, not only if/when the pattern recurs.
export const setTeamExplanation = async ({ accountId, id, explanation, tag = null, db = prisma }) => {
    const row = await db.discovery.findFirst({ where: { id, accountId } });
    if (!row) return null;

    const updated = await db.discovery.update({
        where: { id },
        data: { teamExplanation: explanation || null, teamExplanationTag: tag || null, teamExplanationAt: new Date() },
    });

    const checkEvidence = await runExplanationCheck({ accountId, discovery: updated, tag, db });
    if (checkEvidence) {
        await db.discoveryEvidence.create({ data: { discoveryId: id, ...checkEvidence } });
    }

    return getDiscoveryDetail({ accountId, id, db });
};

const toDiscoverySummary = (row) => ({
    _id: row.id,
    detector_key: row.detectorKey,
    type: row.type,
    status: row.status,
    title: row.title,
    summary: row.summary,
    confidence: Number(row.confidence),
    impact_score: Number(row.impactScore),
    novelty_score: Number(row.noveltyScore),
    urgency_score: Number(row.urgencyScore),
    reversibility: Number(row.reversibility),
    priority_score: Number(row.priorityScore),
    entity_count: row.entityCount,
    pattern_since: row.patternSince,
    first_detected_at: row.firstDetectedAt,
    last_seen_at: row.lastSeenAt,
    published_at: row.publishedAt,
    resolved_at: row.resolvedAt,
    dismiss_reason: row.dismissReason,
    dismissed_at: row.dismissedAt,
    team_explanation: row.teamExplanation,
    team_explanation_tag: row.teamExplanationTag,
    team_explanation_at: row.teamExplanationAt,
});
