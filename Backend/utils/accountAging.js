const round2 = (value) => Number(Number(value).toFixed(2));

export const getAgingBucket = (rawDays) => {
    if (rawDays === null) return "unscheduled";
    if (rawDays <= 0) return "not_due";
    if (rawDays <= 30) return "days_1_30";
    if (rawDays <= 60) return "days_31_60";
    if (rawDays <= 90) return "days_61_90";
    return "over_90";
};

export const summarizeAging = (documents) => {
    const aging = { not_due: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, unscheduled: 0 };
    for (const document of documents) aging[document.aging_bucket] += Number(document.pending);
    return Object.fromEntries(Object.entries(aging).map(([key, value]) => [key, round2(value)]));
};
