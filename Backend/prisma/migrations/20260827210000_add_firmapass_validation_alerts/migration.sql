-- CreateTable
CREATE TABLE "firmapass_validation_alerts" (
    "id" TEXT NOT NULL,
    "validation_uuid" TEXT NOT NULL,
    "nombre" TEXT,
    "estado" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "firmapass_validation_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "firmapass_validation_alerts_validation_uuid_key" ON "firmapass_validation_alerts"("validation_uuid");
