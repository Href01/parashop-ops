-- Migration 024: automatic stock decrement on shipment (multi-channel, idempotent, forward-only)
--
-- Physical stock now moves by itself: when an order LEAVES the warehouse (gets a
-- Sendit tracking number, or is marked DELIVERED) the ordered units are removed
-- from Product.stock and logged as an 'Sale' InventoryMovement. If that order is
-- later CANCELLED, the units are added back ('Return').
--
-- SAFETY GUARANTEES:
--  1. Forward-only  — only orders created at/after `stock_autodecrement_since`
--     are ever touched, so the ~130 historical orders (whose stock was already
--     maintained by hand) are NEVER re-deducted, even if edited later.
--  2. Idempotent    — at most one 'Sale' (and one 'Return') movement per order;
--     the trigger checks existence before acting, so re-syncs never double-count.
--  3. Traceable     — every automatic change is an InventoryMovement row visible
--     in the Historique tab ("Vente auto #123" / "Retour auto #123").
--  4. Reversible    — DROP the trigger to disable; the cutoff means no back-damage.

-- Enable it as of now. Existing orders (created before this) stay untouched.
INSERT INTO "AppSetting" (key, value)
VALUES ('stock_autodecrement_since', NOW()::text)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION apply_order_stock_movement() RETURNS TRIGGER AS $$
DECLARE
  cutoff timestamptz;
  is_consumed boolean;
  rec RECORD;
  cur_stock integer;
BEGIN
  -- Forward-only gate: ignore anything created before auto-decrement was enabled.
  SELECT value::timestamptz INTO cutoff FROM "AppSetting" WHERE key = 'stock_autodecrement_since';
  IF cutoff IS NULL OR NEW."createdAt" < cutoff THEN
    RETURN NEW;
  END IF;

  -- "Left the warehouse": shipped (has tracking) or delivered, and not cancelled.
  is_consumed := (NEW."senditTrackingId" IS NOT NULL OR NEW.status = 'DELIVERED')
                 AND NEW.status <> 'CANCELLED';

  -- DECREMENT once, when the order becomes consumed.
  IF is_consumed AND NOT EXISTS (
    SELECT 1 FROM "InventoryMovement" WHERE "orderId" = NEW.id AND type = 'Sale'
  ) THEN
    FOR rec IN
      SELECT oi."productId" AS pid, SUM(oi.quantity)::int AS qty
      FROM "OrderItem" oi
      JOIN "Product" p ON p.id = oi."productId"
      WHERE oi."orderId" = NEW.id AND p."trackInventory" = true
      GROUP BY oi."productId"
    LOOP
      SELECT stock INTO cur_stock FROM "Product" WHERE id = rec.pid;
      INSERT INTO "InventoryMovement"
        ("productId", "type", "quantity", "stockBefore", "stockAfter", "reason", "orderId", "performedBy", "createdAt")
        VALUES (rec.pid, 'Sale', -rec.qty, cur_stock, cur_stock - rec.qty,
                'Vente auto #' || NEW.id, NEW.id, 'auto', NOW());
      UPDATE "Product" SET stock = stock - rec.qty WHERE id = rec.pid;
    END LOOP;
  END IF;

  -- RETURN once, if a previously-consumed order gets cancelled (e.g. COD refused).
  IF NEW.status = 'CANCELLED'
     AND EXISTS (SELECT 1 FROM "InventoryMovement" WHERE "orderId" = NEW.id AND type = 'Sale')
     AND NOT EXISTS (SELECT 1 FROM "InventoryMovement" WHERE "orderId" = NEW.id AND type = 'Return') THEN
    FOR rec IN
      SELECT oi."productId" AS pid, SUM(oi.quantity)::int AS qty
      FROM "OrderItem" oi
      JOIN "Product" p ON p.id = oi."productId"
      WHERE oi."orderId" = NEW.id AND p."trackInventory" = true
      GROUP BY oi."productId"
    LOOP
      SELECT stock INTO cur_stock FROM "Product" WHERE id = rec.pid;
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

DROP TRIGGER IF EXISTS trigger_apply_order_stock ON "Order";
CREATE TRIGGER trigger_apply_order_stock
AFTER INSERT OR UPDATE ON "Order"
FOR EACH ROW
EXECUTE FUNCTION apply_order_stock_movement();
