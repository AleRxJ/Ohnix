// /reports/sales returns every completed day as a sparse `salesByDate` list
// keyed by UTC "YYYY-MM-DD" (order.orderDate.toISOString()), with no date
// range applied. The dashboard turns that into a fixed window - every day (or
// month) present, zero-filled - plus the window right before it, so the KPIs
// can say "vs período anterior" and the chart's x-axis is evenly spaced
// instead of jumping between whatever days happened to have sales. Buckets
// stay in UTC to match the backend's keys.

export const PERIODS = ["7d", "30d", "90d", "12m"];

const DAY_MS = 86400000;
const PERIOD_DAYS = { "7d": 7, "30d": 30, "90d": 90 };

const dayKey = (date) => date.toISOString().slice(0, 10);
const monthKey = (date) => date.toISOString().slice(0, 7);

const sumBuckets = (buckets) =>
    buckets.reduce(
        (acc, bucket) => ({ sales: acc.sales + bucket.sales, orders: acc.orders + bucket.orders }),
        { sales: 0, orders: 0 }
    );

export const buildSalesPeriod = (salesByDate = [], period = "30d", now = new Date()) => {
    const isMonthly = period === "12m";
    const totals = new Map();
    for (const row of salesByDate) {
        const key = isMonthly ? row._id.slice(0, 7) : row._id;
        const current = totals.get(key) || { sales: 0, orders: 0 };
        current.sales += Number(row.total) || 0;
        current.orders += Number(row.orders) || 0;
        totals.set(key, current);
    }

    const bucketAt = (offset) => {
        const date = isMonthly
            ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
            : new Date(now.getTime() - offset * DAY_MS);
        const key = isMonthly ? monthKey(date) : dayKey(date);
        return { key, date, ...(totals.get(key) || { sales: 0, orders: 0 }) };
    };

    const size = isMonthly ? 12 : PERIOD_DAYS[period];
    const points = [];
    const previous = [];
    for (let offset = size - 1; offset >= 0; offset -= 1) points.push(bucketAt(offset));
    for (let offset = size * 2 - 1; offset >= size; offset -= 1) previous.push(bucketAt(offset));

    return {
        isMonthly,
        points,
        current: sumBuckets(points),
        previous: sumBuckets(previous),
    };
};

// null when there's no previous period to compare against - a "+100%" off
// a zero baseline reads like real growth when it's really "first sales".
export const percentChange = (current, previous) =>
    previous > 0 ? ((current - previous) / previous) * 100 : null;
