// Reads which of a detector's registered dimensions are active, right now,
// WITHOUT a deploy - see crossFactorCorrelation.detector.js's header
// comment and DiscoveryDimensionConfig's schema.prisma comment for the full
// reasoning (config-as-data, never code that writes itself).
//
// A dimension with no row here just uses its own registry entry's
// `defaultEnabled` - an empty table (day one, or any environment nobody has
// configured yet) is byte-for-byte the same behavior as before this existed.

import { prisma } from "../db/prisma.js";

export const getEnabledDimensionKeys = async ({ detectorKey, registry, db = prisma }) => {
    const overrides = await db.discoveryDimensionConfig.findMany({
        where: { detectorKey, dimensionKey: { in: registry.map((d) => d.key) } },
        select: { dimensionKey: true, enabled: true },
    });
    const overrideByKey = new Map(overrides.map((o) => [o.dimensionKey, o.enabled]));

    return new Set(registry.filter((d) => overrideByKey.get(d.key) ?? d.defaultEnabled).map((d) => d.key));
};
