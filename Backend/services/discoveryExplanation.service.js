// Mission case G ("errores de percepción"), the real-time half of it: a
// user can tag their explanation with one of a small, closed set of
// checkable claims (never free-form NLP - the mission is explicit about not
// hallucinating conclusions from text), and if that detector+tag pair has a
// real check registered, it runs immediately and the result becomes its own
// DiscoveryEvidence entry. An untagged or unregistered explanation still
// gets stored (discoveryEngine.service.js#setTeamExplanation) for the
// slower, recurrence-based perception-gap check every detector already
// gets - this is additive, not a replacement.

import { prisma } from "../db/prisma.js";
import { checkSeasonalExplanation } from "./detectors/customerChurnRisk.detector.js";
import { resolveIsEnglish } from "./discoveryLocale.service.js";

// Shown to the user as the fixed set of selectable tags - keep this in sync
// with Frontend/src/components/discoveries/discoveryMeta.js's
// EXPLANATION_TAGS. Only "seasonal" has a real check today; the others are
// still valid things to say (and still feed the recurrence-based
// perception-gap check), they just don't get an instant evidence-backed
// verdict yet.
export const EXPLANATION_TAGS = ["seasonal", "competitor", "service_issue", "pricing", "already_fixed", "other"];

const CHECKERS = {
    customer_churn_risk: {
        seasonal: async ({ accountId, discovery, db }) => {
            const entities = await db.discoveryEntityLink.findMany({
                where: { discoveryId: discovery.id, entityType: "customer", role: "at_risk" },
                select: { entityId: true },
            });
            return checkSeasonalExplanation({ accountId, customerIds: entities.map((e) => e.entityId), db });
        },
    },
};

// Returns a DiscoveryEvidence-shaped {kind, label, data} entry when this
// (detectorKey, tag) pair has a real check and it ran, or null when there's
// nothing to check yet (mission rule 5 applies here too - no checker
// registered is not an error, it's "nothing to say").
export const runExplanationCheck = async ({ accountId, discovery, tag, db = prisma }) => {
    const checker = tag && CHECKERS[discovery.detectorKey]?.[tag];
    if (!checker) return null;

    const result = await checker({ accountId, discovery, db });
    if (!result) return null;

    const isEN = await resolveIsEnglish({ accountId, db });

    return {
        kind: "explanation_check",
        label: isEN ? "Your explanation checked against the evidence" : "Contraste de tu explicación con la evidencia",
        data: result,
        sourceType: null,
        sourceId: null,
    };
};
