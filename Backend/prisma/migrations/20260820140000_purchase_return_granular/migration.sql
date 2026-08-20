-- Purchase returns move from a single automatic all-or-nothing event
-- (triggered by flipping purchase_status to "returned") to an explicit,
-- repeatable action: the user picks a line and a quantity, and can do this
-- more than once per line while quantity - returned_quantity > 0. Under that
-- model "fully returned" is derived as returned_quantity = quantity instead
-- of tracked by a one-shot flag, so return_processed no longer means
-- anything - see purchase.service.js#processReturn.
ALTER TABLE "purchase_details" DROP COLUMN "return_processed";
