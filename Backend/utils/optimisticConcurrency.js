import { ApiError } from "./ApiError.js";

// The client sends back the updatedAt it last saw (captured when the edit
// form opened); the WHERE clause below only matches if nothing else wrote
// to this row since - same atomic-claim idiom used everywhere else in this
// codebase for concurrent writes (product/purchase/order stock, status
// transitions). Without this, two people editing the same product/category/
// unit/customer/supplier concurrently silently overwrite each other - the
// second save wins with no warning, even though neither one is "wrong".
// See the multi-user concurrency audit (2026-08-20).
//
// Falls back to a plain update when the caller didn't send an expected
// timestamp (older/other API clients, scripts) - this is additive
// protection, not a required contract.
export const updateWithConflictCheck = async ({
    model,
    id,
    expectedUpdatedAt,
    data,
    include,
    conflictMessage = "This record was changed by someone else. Reload to see the latest version.",
}) => {
    if (!expectedUpdatedAt) {
        return model.update({ where: { id }, data, include });
    }

    const claim = await model.updateMany({
        where: { id, updatedAt: expectedUpdatedAt },
        data,
    });

    if (claim.count === 0) {
        throw new ApiError(409, conflictMessage, [], "", "stale_edit_conflict");
    }

    return model.findUniqueOrThrow({ where: { id }, include });
};

export const parseExpectedUpdatedAt = (value) => {
    if (value === undefined || value === null || value === "") return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
};
