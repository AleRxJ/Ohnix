-- Self-service "bajar de plan" support: the customer keeps their current
-- (higher) plan through the already-paid period, and this records which
-- lower plan to switch to once it naturally lapses - no proration, no
-- immediate charge (see the Subscription.scheduledPlan comment in
-- schema.prisma for why). Nullable, no default: most rows never schedule
-- a downgrade at all.
ALTER TABLE "subscriptions"
  ADD COLUMN "scheduled_plan" "PlanType";
