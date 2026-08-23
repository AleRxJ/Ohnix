-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JournalSourceType" ADD VALUE 'order_cancellation';
ALTER TYPE "JournalSourceType" ADD VALUE 'order_return';
ALTER TYPE "JournalSourceType" ADD VALUE 'purchase_return';
ALTER TYPE "JournalSourceType" ADD VALUE 'credit_note_restock';

