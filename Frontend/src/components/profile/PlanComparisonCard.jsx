import React, { useEffect, useState } from "react";
import { Card, Typography, Button, Skeleton } from "antd";
import { RocketOutlined, CheckCircleOutlined, ArrowRightOutlined, TrophyOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { subscriptionService } from "../../services/subscriptionService";
import { FEATURE_LABELS } from "../../hooks/useSubscription";
import { useMarketPricing } from "../../hooks/useMarketPricing";

const { Title, Text } = Typography;

const PLAN_ORDER = ["starter", "growth", "scale", "enterprise"];

// { limitKey: matches PLAN_LIMITS in pricing.middleware.js, metricKey:
// matches the shared profile.subscription.metrics.* labels already used by
// SubscriptionPlanCard's usage bars, so a numeric limit reads with the same
// name in both places. }
export const LIMIT_ROWS = [
    { limitKey: "maxProducts", metricKey: "products" },
    { limitKey: "maxCustomers", metricKey: "customers" },
    { limitKey: "maxSuppliers", metricKey: "suppliers" },
    { limitKey: "maxCategories", metricKey: "categories" },
    { limitKey: "maxUnits", metricKey: "units" },
    { limitKey: "maxOrders", metricKey: "orders" },
    { limitKey: "maxPurchases", metricKey: "purchases" },
    { limitKey: "maxMonthlyOrders", metricKey: "monthly_orders" },
    { limitKey: "maxMonthlyPurchases", metricKey: "monthly_purchases" },
];

export const formatLimit = (value) => (value === null || value === undefined ? "∞" : value.toLocaleString());

// Shared with the upgrade-request modal (Billing.jsx) so both places show
// the exact same market-aware price for a given plan instead of the modal
// growing its own copy that could drift from this one.
export const getPlanPriceLabel = (plan, priceByPlanKey, t) => {
    if (!plan) return null;
    if (plan.priceUSD === null) return t("profile.subscription.comparison.custom_price");
    const marketPrice = priceByPlanKey[plan.key];
    if (!marketPrice) return `$${plan.priceUSD}`;
    // "$" alone is ambiguous between USD and COP.
    return marketPrice.currency === "COP" ? `${marketPrice.label} COP` : marketPrice.label;
};

// "What's missing, what would I gain by upgrading" - the thing Billing.jsx
// never actually answered before: it only showed the current plan's own
// feature list with a small "minimum plan" tag on locked rows, no numeric
// limit deltas and no dedicated "here's what changes" summary anywhere.
const PlanComparisonCard = ({ currentPlan, onRequestUpgrade }) => {
    const { t, currentLanguage } = useI18n();
    const lang = currentLanguage === "es" ? "es" : "en";
    const [plans, setPlans] = useState(null);
    const [loading, setLoading] = useState(true);
    // Market-aware price for the "Sube a X y obtén" header - this used to
    // always show `$${priceUSD}` (the USD reference number) regardless of
    // the visitor's real currency, so a Colombian user could see "$49/mes"
    // here right above the real "$99.000 COP/mes" checkout price below,
    // contradicting each other on the same page.
    const { priceByPlanKey } = useMarketPricing();

    useEffect(() => {
        let active = true;
        subscriptionService
            .getPlanCatalog()
            .then((res) => {
                if (active) setPlans(res?.data?.plans || null);
            })
            .catch(() => {
                if (active) setPlans(null);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    if (loading) {
        return (
            <Card className="mt-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)]">
                <Skeleton active paragraph={{ rows: 3 }} />
            </Card>
        );
    }

    if (!plans) return null;

    const currentIndex = PLAN_ORDER.indexOf(currentPlan);
    const nextPlanKey =
        currentIndex >= 0 && currentIndex < PLAN_ORDER.length - 1 ? PLAN_ORDER[currentIndex + 1] : null;

    const current = plans.find((p) => p.key === currentPlan);
    const next = nextPlanKey ? plans.find((p) => p.key === nextPlanKey) : null;

    if (!current) return null;

    if (!next) {
        return (
            <Card className="mt-4 rounded-2xl border border-[#f59e0b]/25 bg-[#f59e0b]/5">
                <div className="flex items-center gap-3">
                    <TrophyOutlined className="text-xl text-[#f59e0b]" />
                    <Text className="text-sm text-[var(--ohnix-text-soft)]">
                        {t("profile.subscription.comparison.top_plan_message")}
                    </Text>
                </div>
            </Card>
        );
    }

    const priceLabel = (plan) => getPlanPriceLabel(plan, priceByPlanKey, t);

    const newFeatures = FEATURE_LABELS.filter(({ key }) => !current.features[key] && next.features[key]);

    const limitDeltas = LIMIT_ROWS.map((row) => ({
        ...row,
        currentValue: current.limits[row.limitKey],
        nextValue: next.limits[row.limitKey],
    })).filter((row) => row.nextValue !== row.currentValue);

    const seatsChanged = current.teamSeats !== next.teamSeats;

    return (
        <Card className="mt-4 rounded-2xl border border-[#29D8D5]/25 bg-gradient-to-br from-[#29D8D5]/[0.06] to-transparent">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#29D8D5]/30 bg-[#29D8D5]/10">
                        <RocketOutlined className="text-[#29D8D5]" />
                    </div>
                    <div>
                        <Title level={5} className="!m-0 !text-[var(--ohnix-text-primary)]">
                            {t("profile.subscription.comparison.title", { plan: next.displayName[lang] })}
                        </Title>
                        <Text className="text-xs text-[var(--ohnix-text-muted)]">
                            {t(`profile.subscription.plan_${current.key}`)} ({priceLabel(current)}
                            {t("profile.subscription.comparison.per_month")})
                            {" → "}
                            {t(`profile.subscription.plan_${next.key}`)} ({priceLabel(next)}
                            {t("profile.subscription.comparison.per_month")})
                        </Text>
                    </div>
                </div>
                <Button
                    type="primary"
                    icon={<RocketOutlined />}
                    onClick={onRequestUpgrade}
                    className="h-9 shrink-0 rounded-lg border-0 bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] font-medium text-[#021314]"
                >
                    {t("profile.subscription.comparison.cta", { plan: next.displayName[lang] })}
                </Button>
            </div>

            {limitDeltas.length > 0 && (
                <div className="mt-4">
                    <Text className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ohnix-text-muted)]">
                        {t("profile.subscription.comparison.more_capacity")}
                    </Text>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {limitDeltas.map((row) => (
                            <div
                                key={row.limitKey}
                                className="flex items-center justify-between rounded-lg border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-2 text-xs"
                            >
                                <span className="text-[var(--ohnix-text-muted)]">
                                    {t(`profile.subscription.metrics.${row.metricKey}`)}
                                </span>
                                <span className="font-semibold text-[var(--ohnix-text-primary)]">
                                    {formatLimit(row.currentValue)}
                                    <ArrowRightOutlined style={{ fontSize: 10 }} className="mx-1 text-[#29D8D5]" />
                                    {formatLimit(row.nextValue)}
                                </span>
                            </div>
                        ))}
                        {seatsChanged && (
                            <div className="flex items-center justify-between rounded-lg border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-2 text-xs">
                                <span className="text-[var(--ohnix-text-muted)]">
                                    {t("profile.subscription.metrics.team_seats")}
                                </span>
                                <span className="font-semibold text-[var(--ohnix-text-primary)]">
                                    {formatLimit(current.teamSeats)}
                                    <ArrowRightOutlined style={{ fontSize: 10 }} className="mx-1 text-[#29D8D5]" />
                                    {formatLimit(next.teamSeats)}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {newFeatures.length > 0 && (
                <div className="mt-4">
                    <Text className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ohnix-text-muted)]">
                        {t("profile.subscription.comparison.new_features")}
                    </Text>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {newFeatures.map(({ key, es, en }) => (
                            <div key={key} className="flex items-center gap-2 text-xs text-[var(--ohnix-text-soft)]">
                                <CheckCircleOutlined className="text-[#29D8D5]" style={{ fontSize: 13 }} />
                                <span>{lang === "es" ? es : en}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Card>
    );
};

export default PlanComparisonCard;
