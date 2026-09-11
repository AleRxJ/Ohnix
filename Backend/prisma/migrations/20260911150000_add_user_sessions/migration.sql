CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "sid" TEXT NOT NULL,
    "device_class" TEXT NOT NULL,
    "device_label" TEXT,
    "refresh_token" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_sessions_sid_key" ON "user_sessions"("sid");
CREATE UNIQUE INDEX "user_sessions_user_id_device_id_key" ON "user_sessions"("user_id", "device_id");
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Replaced by one refresh token per UserSession row above - a single global
-- column forced a second device's login to silently invalidate the first
-- device's refresh token, defeating multi-device sessions at the token-
-- refresh layer even after the sid-based single-session check was relaxed.
ALTER TABLE "users" DROP COLUMN "refresh_token";
