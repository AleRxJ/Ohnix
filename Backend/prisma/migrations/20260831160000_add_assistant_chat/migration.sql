CREATE TYPE "ChatMessageRole" AS ENUM ('user', 'assistant');
CREATE TYPE "ChatFeedbackRating" AS ENUM ('up', 'down');

CREATE TABLE "assistant_knowledge_chunks" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "source_type" TEXT NOT NULL DEFAULT 'guide',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assistant_knowledge_chunks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assistant_knowledge_chunks_module_locale_title_key"
ON "assistant_knowledge_chunks"("module", "locale", "title");
CREATE INDEX "assistant_knowledge_chunks_module_locale_is_published_idx"
ON "assistant_knowledge_chunks"("module", "locale", "is_published");

CREATE TABLE "chat_conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_conversations_user_id_updated_at_idx"
ON "chat_conversations"("user_id", "updated_at");

ALTER TABLE "chat_conversations"
ADD CONSTRAINT "chat_conversations_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "ChatMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "module" TEXT,
    "sources" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_messages_conversation_id_created_at_idx"
ON "chat_messages"("conversation_id", "created_at");

ALTER TABLE "chat_messages"
ADD CONSTRAINT "chat_messages_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "chat_feedback" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "rating" "ChatFeedbackRating" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_feedback_message_id_key"
ON "chat_feedback"("message_id");

ALTER TABLE "chat_feedback"
ADD CONSTRAINT "chat_feedback_message_id_fkey"
FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
