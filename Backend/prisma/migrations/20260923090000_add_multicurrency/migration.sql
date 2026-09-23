-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('COP', 'USD', 'EUR');

-- AlterTable
ALTER TABLE "order_details" ADD COLUMN     "unitcost_foreign" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "order_payments" ADD COLUMN     "exchange_rate_difference" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "currency_code" "CurrencyCode" NOT NULL DEFAULT 'COP',
ADD COLUMN     "exchange_rate" DECIMAL(12,4) NOT NULL DEFAULT 1,
ADD COLUMN     "foreign_total" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "purchase_details" ADD COLUMN     "unitcost_foreign" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "purchase_payments" ADD COLUMN     "exchange_rate_difference" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "currency_code" "CurrencyCode" NOT NULL DEFAULT 'COP',
ADD COLUMN     "exchange_rate" DECIMAL(12,4) NOT NULL DEFAULT 1;

