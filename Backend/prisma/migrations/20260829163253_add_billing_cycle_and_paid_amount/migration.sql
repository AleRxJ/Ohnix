-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');

-- AlterTable
ALTER TABLE "plan_upgrade_requests" ADD COLUMN     "billing_cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "paid_amount" INTEGER,
ADD COLUMN     "paid_currency" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "billing_cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY';
