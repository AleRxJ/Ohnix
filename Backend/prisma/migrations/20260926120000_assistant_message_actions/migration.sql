-- Asistente guiado: acciones de UI (opciones, navegación, señalar botón) por mensaje
-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN "actions" JSONB;
