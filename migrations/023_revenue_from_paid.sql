-- Migration 023: base "revenue" (CA) on what the customer actually PAID for the
-- products, not the catalogue price.
--
-- Before: revenue = productsTotal - discountTotal. But discounts are almost never
-- recorded in discountTotal, so revenue collapsed to the catalogue price. Meanwhile
-- estimatedProfit/finalProfit are built from the real cash collected (codAmount/total),
-- so margin = profit / revenue mixed two bases and overstated the CA (and understated
-- the margin %).
--
-- After: revenue = real products paid = (cash collected) - (delivery fee charged),
-- floored at 0. Cash collected = codAmount for COD, else total for prepaid. When no
-- collected amount is known (very old rows), fall back to the catalogue figure.
-- estimatedProfit/finalProfit are unchanged; marginPercent now reconciles because its
-- denominator uses the same real cash the profit is built from.
CREATE OR REPLACE FUNCTION public.calculate_order_profit()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW."productsTotal" := (SELECT COALESCE(SUM(price*quantity),0) FROM "OrderItem" WHERE "orderId"=NEW.id);
  NEW."revenue" := CASE
    WHEN COALESCE(NULLIF(NEW."codAmount",0), NULLIF(NEW."total",0)) IS NOT NULL
      THEN GREATEST(COALESCE(NULLIF(NEW."codAmount",0), NULLIF(NEW."total",0)) - COALESCE(NEW."deliveryFeeCharged",0), 0)
    ELSE NEW."productsTotal" - COALESCE(NEW."discountTotal",0)
  END;
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
