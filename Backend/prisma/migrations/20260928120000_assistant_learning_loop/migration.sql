-- Asistente guiado, Fase 4: ciclo de aprendizaje (guías verificadas, estadísticas por hallazgo, vacíos de conocimiento)
-- CreateEnum
CREATE TYPE "AssistantGuidanceOutcome" AS ENUM ('resolved', 'unresolved');

-- CreateTable
CREATE TABLE "assistant_guidances" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "finding_key" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "check_after" TIMESTAMP(3) NOT NULL,
    "checked_at" TIMESTAMP(3),
    "outcome" "AssistantGuidanceOutcome",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_guidances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_guidance_stats" (
    "id" TEXT NOT NULL,
    "finding_key" TEXT NOT NULL,
    "total_checked" INTEGER NOT NULL DEFAULT 0,
    "resolved" INTEGER NOT NULL DEFAULT 0,
    "success_rate" DECIMAL(4,3) NOT NULL DEFAULT 0.5,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_guidance_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_knowledge_gaps" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "module" TEXT,
    "tab" TEXT,
    "locale" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_knowledge_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assistant_guidances_message_id_key" ON "assistant_guidances"("message_id");

-- CreateIndex
CREATE INDEX "assistant_guidances_check_after_checked_at_idx" ON "assistant_guidances"("check_after", "checked_at");

-- CreateIndex
CREATE INDEX "assistant_guidances_account_id_finding_key_checked_at_idx" ON "assistant_guidances"("account_id", "finding_key", "checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_guidance_stats_finding_key_key" ON "assistant_guidance_stats"("finding_key");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_knowledge_gaps_message_id_key" ON "assistant_knowledge_gaps"("message_id");

-- CreateIndex
CREATE INDEX "assistant_knowledge_gaps_created_at_idx" ON "assistant_knowledge_gaps"("created_at");

