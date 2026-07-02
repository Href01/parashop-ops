-- Migration 022: harden calculate_order_profit against a stray total=0 / codAmount=0.
-- The cash base used COALESCE(codAmount, total, revenue), but COALESCE only skips
-- NULL — a real 0 (e.g. a prepaid order whose total was left at 0) was taken as the
-- cash received, giving a bogus negative profit. NULLIF(..,0) treats 0 as "not set"
-- so it falls through to the next value.
CREATE OR REPLACE FUNCTION public.calculate_order_profit()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW."productsTotal" := (SELECT COALESCE(SUM(price*quantity),0) FROM "OrderItem" WHERE "orderId"=NEW.id);
  NEW."revenue" := NEW."productsTotal" - COALESCE(NEW."discountTotal",0);
  NEW."estimatedProfit" := COALESCE(NULLIF(NEW."codAmount",0), NULLIF(NEW."total",0), NEW."revenue") - (
    SELECT COALESCE(SUM(COALESCE(oi."unitCost", p."costPrice", 0) * oi.quantity),0)
    FROM "OrderItem" oi LEFT JOIN "Product" p ON p.id=oi."productId" WHERE oi."orderId"=NEW.id
  ) - COALESCE(NEW."estimatedDeliveryCost",0);
  IF NEW."actualDeliveryCost" IS NOT NULL THEN
    NEW."finalProfit" := COALESCE(NULLIF(NEW."codAmount",0), NULLIF(NEW."total",0), NEW."revenue") - (
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
