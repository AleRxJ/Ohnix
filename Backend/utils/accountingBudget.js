const round2 = (value) => Number((Number(value) || 0).toFixed(2));

export const calculateBudgetPerformance = ({ accountType, budget, actual, thresholdPercent = 10 }) => {
    const budgetAmount = round2(budget);
    const actualAmount = round2(actual);
    const variance = round2(actualAmount - budgetAmount);
    const variancePercent = budgetAmount > 0 ? round2((variance / budgetAmount) * 100) : null;
    const achievementPercent = budgetAmount > 0 ? round2((actualAmount / budgetAmount) * 100) : null;
    const threshold = Math.max(0, Number(thresholdPercent) || 0);
    const unfavorablePercent = accountType === "revenue"
        ? (budgetAmount > 0 ? ((budgetAmount - actualAmount) / budgetAmount) * 100 : 0)
        : (budgetAmount > 0 ? ((actualAmount - budgetAmount) / budgetAmount) * 100 : actualAmount > 0 ? Infinity : 0);
    const alert = unfavorablePercent >= threshold && unfavorablePercent > 0;
    return {
        budget: budgetAmount,
        actual: actualAmount,
        variance,
        variance_percent: variancePercent,
        achievement_percent: achievementPercent,
        status: alert ? (accountType === "revenue" ? "behind" : "over") : "on_track",
        alert,
    };
};
