import { ApiError } from "./ApiError.js";

// Sale-price floor for team members without the salesPriceOverride
// capability (team.permissions.js#CAPABILITIES): every line's effective unit
// price (after any line/header discount, in COP) must be at least the list
// price minus salesMaxDiscountPct. Selling ABOVE list price is always fine.
// Owners/solo users get FULL_CAPABILITIES and never hit this.
const EPSILON = 0.01;

export const findLinesBelowFloor = (lines, capabilities) => {
    if (!capabilities || capabilities.salesPriceOverride) return [];
    const factor = 1 - (Number(capabilities.salesMaxDiscountPct) || 0) / 100;
    return lines.filter((line) => {
        const listPrice = Number(line.listPrice);
        if (!Number.isFinite(listPrice) || listPrice <= 0) return false;
        return Number(line.effectivePrice) + EPSILON < listPrice * factor;
    });
};

export const assertSalePricesAllowed = (lines, capabilities) => {
    const below = findLinesBelowFloor(lines, capabilities);
    if (below.length === 0) return;
    const maxPct = Number(capabilities.salesMaxDiscountPct) || 0;
    const names = below.map((line) => line.label).filter(Boolean).slice(0, 3).join(", ");
    throw new ApiError(
        403,
        maxPct > 0
            ? `Tu rol permite un descuento máximo de ${maxPct}% sobre el precio de lista${names ? ` (revisa: ${names})` : ""}.`
            : `Tu rol no permite vender por debajo del precio de lista${names ? ` (revisa: ${names})` : ""}.`,
        [],
        "",
        "sale_price_below_allowed"
    );
};
