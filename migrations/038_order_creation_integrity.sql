-- Persist the marketplace commission in every environment. The production
-- function already carried this correction, but no numbered migration did.
CREATE OR REPLACE FUNCTION public.calculate_order_profit()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW."productsTotal" := (SELECT COALESCE(SUM(price * quantity), 0) FROM "OrderItem" WHERE "orderId" = NEW.id);
  NEW."revenue" := CASE
    WHEN COALESCE(NULLIF(NEW."codAmount", 0), NULLIF(NEW."total", 0)) IS NOT NULL
      THEN GREATEST(COALESCE(NULLIF(NEW."codAmount", 0), NULLIF(NEW."total", 0)) - COALESCE(NEW."deliveryFeeCharged", 0), 0)
    ELSE NEW."productsTotal" - COALESCE(NEW."discountTotal", 0)
  END;
  NEW."estimatedProfit" := COALESCE(NULLIF(NEW."codAmount", 0), NULLIF(NEW."total", 0), NEW."revenue") - (
    SELECT COALESCE(SUM(COALESCE(oi."unitCost", p."costPrice", 0) * oi.quantity), 0)
    FROM "OrderItem" oi LEFT JOIN "Product" p ON p.id = oi."productId" WHERE oi."orderId" = NEW.id
  ) - COALESCE(NEW."estimatedDeliveryCost", 0) - COALESCE(NEW."channelCommission", 0);
  IF NEW."actualDeliveryCost" IS NOT NULL THEN
    NEW."finalProfit" := COALESCE(NULLIF(NEW."codAmount", 0), NULLIF(NEW."total", 0), NEW."revenue") - (
      SELECT COALESCE(SUM(COALESCE(oi."unitCost", p."costPrice", 0) * oi.quantity), 0)
      FROM "OrderItem" oi LEFT JOIN "Product" p ON p.id = oi."productId" WHERE oi."orderId" = NEW.id
    ) - NEW."actualDeliveryCost" - COALESCE(NEW."returnOrFailedFees", 0)
      - COALESCE(NEW."channelCommission", 0);
  END IF;
  IF NEW."revenue" > 0 THEN
    NEW."marginPercent" := (COALESCE(NEW."finalProfit", NEW."estimatedProfit") / NEW."revenue") * 100;
  END IF;
  RETURN NEW;
END;
$fn$;

-- Never let a sale movement make physical stock negative. Manual order
-- validation checks available stock before creation; this trigger is the last
-- line of defence for every other current or future order source.
CREATE OR REPLACE FUNCTION public.apply_order_stock_movement() RETURNS TRIGGER AS $$
DECLARE
  cutoff timestamptz;
  is_consumed boolean;
  rec RECORD;
  cur_stock integer;
BEGIN
  SELECT value::timestamptz INTO cutoff FROM "AppSetting" WHERE key = 'stock_autodecrement_since';
  IF cutoff IS NULL OR NEW."createdAt" < cutoff THEN
    RETURN NEW;
  END IF;

  is_consumed := (NEW."senditTrackingId" IS NOT NULL OR NEW.status = 'DELIVERED')
                 AND NEW.status <> 'CANCELLED';

  IF is_consumed AND NOT EXISTS (
    SELECT 1 FROM "InventoryMovement" WHERE "orderId" = NEW.id AND type = 'Sale'
  ) THEN
    FOR rec IN
      WITH expanded AS (
        SELECT oi."productId" AS pid, oi.quantity AS qty
        FROM "OrderItem" oi
        WHERE oi."orderId" = NEW.id
          AND NOT EXISTS (SELECT 1 FROM "Bundle" b WHERE b."productId" = oi."productId")
        UNION ALL
        SELECT bi."productId", oi.quantity * bi.quantity
        FROM "OrderItem" oi
        JOIN "Bundle" b ON b."productId" = oi."productId"
        JOIN "BundleItem" bi ON bi."bundleId" = b.id
        WHERE oi."orderId" = NEW.id
      )
      SELECT e.pid, SUM(e.qty)::int AS qty
      FROM expanded e
      JOIN "Product" p ON p.id = e.pid
      WHERE p."trackInventory" = true
      GROUP BY e.pid
      ORDER BY e.pid
    LOOP
      SELECT stock INTO cur_stock FROM "Product" WHERE id = rec.pid FOR UPDATE;
      IF cur_stock < rec.qty THEN
        RAISE EXCEPTION 'Insufficient stock for product %: % requested, % available', rec.pid, rec.qty, cur_stock
          USING ERRCODE = '23514';
      END IF;
      INSERT INTO "InventoryMovement"
        ("productId", "type", "quantity", "stockBefore", "stockAfter", "reason", "orderId", "performedBy", "createdAt")
        VALUES (rec.pid, 'Sale', -rec.qty, cur_stock, cur_stock - rec.qty,
                'Vente auto #' || NEW.id, NEW.id, 'auto', NOW());
      UPDATE "Product" SET stock = stock - rec.qty WHERE id = rec.pid;
    END LOOP;
  END IF;

  IF NEW.status = 'CANCELLED'
     AND EXISTS (SELECT 1 FROM "InventoryMovement" WHERE "orderId" = NEW.id AND type = 'Sale')
     AND NOT EXISTS (SELECT 1 FROM "InventoryMovement" WHERE "orderId" = NEW.id AND type = 'Return') THEN
    FOR rec IN
      WITH expanded AS (
        SELECT oi."productId" AS pid, oi.quantity AS qty
        FROM "OrderItem" oi
        WHERE oi."orderId" = NEW.id
          AND NOT EXISTS (SELECT 1 FROM "Bundle" b WHERE b."productId" = oi."productId")
        UNION ALL
        SELECT bi."productId", oi.quantity * bi.quantity
        FROM "OrderItem" oi
        JOIN "Bundle" b ON b."productId" = oi."productId"
        JOIN "BundleItem" bi ON bi."bundleId" = b.id
        WHERE oi."orderId" = NEW.id
      )
      SELECT e.pid, SUM(e.qty)::int AS qty
      FROM expanded e
      JOIN "Product" p ON p.id = e.pid
      WHERE p."trackInventory" = true
      GROUP BY e.pid
      ORDER BY e.pid
    LOOP
      SELECT stock INTO cur_stock FROM "Product" WHERE id = rec.pid FOR UPDATE;
      INSERT INTO "InventoryMovement"
        ("productId", "type", "quantity", "stockBefore", "stockAfter", "reason", "orderId", "performedBy", "createdAt")
        VALUES (rec.pid, 'Return', rec.qty, cur_stock, cur_stock + rec.qty,
                'Retour auto #' || NEW.id, NEW.id, 'auto', NOW());
      UPDATE "Product" SET stock = stock + rec.qty WHERE id = rec.pid;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
