ALTER TABLE "order_details"
  ADD COLUMN "cost_basis_applied" DECIMAL(14, 4);

-- Baseline for rows that predate accounting or have no recoverable sale
-- entry. Freezing even this estimate is safer than allowing every future
-- Product.buyingPrice edit to keep rewriting the row.
UPDATE "order_details" od
SET "cost_basis_applied" = p."buying_price"
FROM "products" p, "orders" o
WHERE p.id = od."product_id"
  AND o.id = od."order_id"
  AND o."order_status" IN ('completed', 'returned', 'cancelled');

-- When the original sale entry exists, its credit to Inventarios (1435) is
-- the authoritative total historical cost. A journal entry does not retain
-- product-level allocation, so multi-line sales distribute that exact total
-- proportionally using the products' baseline costs. This preserves the
-- documented total and gives every line a stable unit basis for reversals.
WITH sale_cost AS (
  SELECT je."source_id" AS order_id, SUM(jel."credit") AS total_cost
  FROM "journal_entries" je
  JOIN "journal_entry_lines" jel ON jel."journal_entry_id" = je.id
  JOIN "chart_accounts" ca ON ca.id = jel."chart_account_id"
  WHERE je."source_type" = 'order_sale'
    AND ca."code" = '1435'
  GROUP BY je."source_id"
), line_weight AS (
  SELECT od.id, od."order_id", od.quantity, p."buying_price",
         SUM(od.quantity * p."buying_price") OVER (PARTITION BY od."order_id") AS total_weight,
         SUM(od.quantity) OVER (PARTITION BY od."order_id") AS total_quantity
  FROM "order_details" od
  JOIN "products" p ON p.id = od."product_id"
)
UPDATE "order_details" od
SET "cost_basis_applied" = ROUND(
  CASE
    WHEN lw.total_weight > 0 THEN sc.total_cost * lw."buying_price" / lw.total_weight
    WHEN lw.total_quantity > 0 THEN sc.total_cost / lw.total_quantity
    ELSE 0
  END,
  4
)
FROM line_weight lw
JOIN sale_cost sc ON sc.order_id = lw."order_id"
WHERE od.id = lw.id;

ALTER TABLE "order_details"
  ADD CONSTRAINT "order_details_cost_basis_applied_nonnegative"
  CHECK ("cost_basis_applied" IS NULL OR "cost_basis_applied" >= 0);
