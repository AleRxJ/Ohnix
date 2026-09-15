CREATE TABLE "discovery_dimension_configs" (
    "id" TEXT NOT NULL,
    "detector_key" TEXT NOT NULL,
    "dimension_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovery_dimension_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "discovery_dimension_configs_detector_key_dimension_key_key" ON "discovery_dimension_configs"("detector_key", "dimension_key");
