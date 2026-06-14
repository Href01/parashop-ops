-- Migration 016: fix systemic profit bug.
-- calculate_order_profit() computed COGS from OrderItem.unitCost, which is
-- never populated (0/27 rows) → every order's profit equalled its revenue.
-- Now COGS falls back to Product.costPrice when unitCost is null.
CREATE OR REPLACE FUNCTION public.calculate_order_profit()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW."productsTotal" := (SELECT COALESCE(SUM(price*quantity),0) FROM "OrderItem" WHERE "orderId"=NEW.id);
  NEW."revenue" := NEW."productsTotal" - COALESCE(NEW."discountTotal",0);
  NEW."estimatedProfit" := NEW."revenue" - (
    SELECT COALESCE(SUM(COALESCE(oi."unitCost", p."costPrice", 0) * oi.quantity),0)
    FROM "OrderItem" oi LEFT JOIN "Product" p ON p.id=oi."productId" WHERE oi."orderId"=NEW.id
  ) - COALESCE(NEW."estimatedDeliveryCost",0);
  IF NEW."actualDeliveryCost" IS NOT NULL THEN
    NEW."finalProfit" := COALESCE(NEW."codAmount", NEW."revenue") - (
      SELECT COALESCE(SUM(COALESCE(oi."unitCost", p."costPrice", 0) * oi.quantity),0)
      FROM "OrderItem" oi LEFT JOIN "Product" p ON p.id=oi."productId" WHERE oi."orderId"=NEW.id
    ) - NEW."actualDeliveryCost" - COALESCE(NEW."returnOrFailedFees",0);
  END IF;
  IF NEW."revenue" > 0 THEN
    NEW."marginPercent" := (COALESCE(NEW."finalProfit", NEW."estimatedProfit") / NEW."revenue") * 100;
  END IF;
  RETURN NEW;
END;
$fn$;
-- Backfill existing orders: UPDATE "Order" SET status = status;
