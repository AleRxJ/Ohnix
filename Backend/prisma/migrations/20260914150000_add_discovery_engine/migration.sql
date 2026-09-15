CREATE TYPE "DiscoveryType" AS ENUM ('risk', 'opportunity', 'contradiction', 'new_pattern', 'connection', 'trajectory_shift', 'perception_gap');
CREATE TYPE "DiscoveryStatus" AS ENUM ('detected', 'investigating', 'validated', 'published', 'actioned', 'resolved', 'dismissed', 'learned');
CREATE TYPE "DiscoveryPredictionOutcome" AS ENUM ('correct', 'incorrect', 'inconclusive');

CREATE TABLE "discoveries" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "detector_key" TEXT NOT NULL,
    "type" "DiscoveryType" NOT NULL,
    "status" "DiscoveryStatus" NOT NULL DEFAULT 'detected',
    "dedupe_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "hypothesis" TEXT,
    "unknowns" TEXT,
    "recommendation" TEXT,
    "confidence" DECIMAL(4,3) NOT NULL,
    "impact_score" DECIMAL(4,3) NOT NULL,
    "novelty_score" DECIMAL(4,3) NOT NULL,
    "urgency_score" DECIMAL(4,3) NOT NULL,
    "reversibility" DECIMAL(4,3) NOT NULL,
    "priority_score" DECIMAL(6,3) NOT NULL,
    "entity_count" INTEGER NOT NULL DEFAULT 0,
    "pattern_since" TIMESTAMP(3),
    "first_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "discoveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "discoveries_account_id_status_priority_score_idx"
ON "discoveries"("account_id", "status", "priority_score");
CREATE INDEX "discoveries_account_id_dedupe_key_status_idx"
ON "discoveries"("account_id", "dedupe_key", "status");
CREATE INDEX "discoveries_detector_key_idx"
ON "discoveries"("detector_key");

ALTER TABLE "discoveries"
ADD CONSTRAINT "discoveries_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "discovery_evidence" (
    "id" TEXT NOT NULL,
    "discovery_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "source_type" TEXT,
    "source_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discovery_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "discovery_evidence_discovery_id_idx"
ON "discovery_evidence"("discovery_id");

ALTER TABLE "discovery_evidence"
ADD CONSTRAINT "discovery_evidence_discovery_id_fkey"
FOREIGN KEY ("discovery_id") REFERENCES "discoveries"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "discovery_entity_links" (
    "id" TEXT NOT NULL,
    "discovery_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "role" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discovery_entity_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "discovery_entity_links_discovery_id_idx"
ON "discovery_entity_links"("discovery_id");
CREATE INDEX "discovery_entity_links_entity_type_entity_id_idx"
ON "discovery_entity_links"("entity_type", "entity_id");

ALTER TABLE "discovery_entity_links"
ADD CONSTRAINT "discovery_entity_links_discovery_id_fkey"
FOREIGN KEY ("discovery_id") REFERENCES "discoveries"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "discovery_predictions" (
    "id" TEXT NOT NULL,
    "discovery_id" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "predicted_data" JSONB NOT NULL,
    "confidence_at_stake" DECIMAL(4,3) NOT NULL,
    "check_after" TIMESTAMP(3) NOT NULL,
    "checked_at" TIMESTAMP(3),
    "actual_data" JSONB,
    "outcome" "DiscoveryPredictionOutcome",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discovery_predictions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "discovery_predictions_discovery_id_idx"
ON "discovery_predictions"("discovery_id");
CREATE INDEX "discovery_predictions_check_after_checked_at_idx"
ON "discovery_predictions"("check_after", "checked_at");

ALTER TABLE "discovery_predictions"
ADD CONSTRAINT "discovery_predictions_discovery_id_fkey"
FOREIGN KEY ("discovery_id") REFERENCES "discoveries"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "discovery_pattern_stats" (
    "id" TEXT NOT NULL,
    "detector_key" TEXT NOT NULL,
    "total_predictions" INTEGER NOT NULL DEFAULT 0,
    "correct_predictions" INTEGER NOT NULL DEFAULT 0,
    "current_confidence" DECIMAL(4,3) NOT NULL DEFAULT 0.5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "discovery_pattern_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "discovery_pattern_stats_detector_key_key"
ON "discovery_pattern_stats"("detector_key");

CREATE TABLE "metric_snapshots" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metric_key" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "metric_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "metric_snapshots_account_id_entity_type_entity_id_metric_k_key"
ON "metric_snapshots"("account_id", "entity_type", "entity_id", "metric_key", "period_start");
CREATE INDEX "metric_snapshots_account_id_metric_key_period_start_idx"
ON "metric_snapshots"("account_id", "metric_key", "period_start");

ALTER TABLE "metric_snapshots"
ADD CONSTRAINT "metric_snapshots_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
