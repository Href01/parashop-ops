-- 032_return_moves.sql
-- Flexible return/exchange: an exchange can restock the returned product (if resellable)
-- AND ship a different replacement product (which leaves stock). We store the exact stock
-- moves applied so "annuler le tag" reverses them precisely, and re-tagging is clean.
--
-- returnMoves = [{ "productId": 12, "qty": 1 }, ...]  (qty signed: +restock, −shipped)

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "returnMoves" JSONB;
