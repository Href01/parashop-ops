-- A cancelled order can be reopened after a customer correction. Inventory is
-- considered consumed when the latest lifecycle movement is Sale, and returned
-- when it is Return. Looking only for the existence of either movement made a
-- first cancellation permanent and prevented a later DELIVERED status from
-- consuming stock again.

CREATE OR REPLACE FUNCTION public.apply_order_line_stock(p_order int, p_product int, p_units int)
RETURNS void AS $$
DECLARE
  rec RECORD;
  cur_stock integer;
BEGIN
  IF p_units = 0 OR p_product IS NULL THEN
    RETURN;
  END IF;

  FOR rec IN
    WITH expanded AS (
      SELECT p_product AS pid, p_units AS qty
      WHERE NOT EXISTS (SELECT 1 FROM "Bundle" b WHERE b."productId" = p_product)
      UNION ALL
      SELECT bi."productId", p_units * bi.quantity
      FROM "Bundle" b
      JOIN "BundleItem" bi ON bi."bundleId" = b.id
      WHERE b."productId" = p_product
    )
    SELECT e.pid, SUM(e.qty)::int AS qty
    FROM expanded e
    JOIN "Product" p ON p.id = e.pid
    WHERE p."trackInventory" = true
    GROUP BY e.pid
    ORDER BY e.pid
  LOOP
    CONTINUE WHEN rec.qty = 0;
    SELECT COALESCE(stock, 0) INTO cur_stock FROM "Product" WHERE id = rec.pid FOR UPDATE;
    IF rec.qty > 0 AND cur_stock < rec.qty THEN
      RAISE EXCEPTION 'Insufficient stock for product %: % requested, % available', rec.pid, rec.qty, cur_stock
        USING ERRCODE = '23514';
    END IF;
    INSERT INTO "InventoryMovement"
      ("productId", type, quantity, "stockBefore", "stockAfter", reason, "orderId", "performedBy", "createdAt")
      VALUES (
        rec.pid,
        'Adjustment',
        -rec.qty,
        cur_stock,
        cur_stock - rec.qty,
        CASE WHEN rec.qty > 0
          THEN 'Ligne ajoutee #' || p_order
          ELSE 'Ligne retiree #' || p_order
        END,
        p_order,
        'auto',
        NOW()
      );
    UPDATE "Product" SET stock = cur_stock - rec.qty WHERE id = rec.pid;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.apply_order_item_stock_delta() RETURNS TRIGGER AS $$
DECLARE
  v_order int;
  v_inventory_state text;
BEGIN
  v_order := COALESCE(NEW."orderId", OLD."orderId");

  SELECT type INTO v_inventory_state
  FROM "InventoryMovement"
  WHERE "orderId" = v_order AND type IN ('Sale', 'Return')
  ORDER BY "createdAt" DESC, id DESC
  LIMIT 1;

  -- A returned/cancelled order is no longer consuming stock. Its lines may
  -- still be corrected, but only a later reopen to DELIVERED consumes them.
  IF v_inventory_state IS DISTINCT FROM 'Sale' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM apply_order_line_stock(v_order, NEW."productId", NEW.quantity);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM apply_order_line_stock(v_order, OLD."productId", -OLD.quantity);
  ELSIF NEW."productId" IS DISTINCT FROM OLD."productId" THEN
    PERFORM apply_order_line_stock(v_order, OLD."productId", -OLD.quantity);
    PERFORM apply_order_line_stock(v_order, NEW."productId", NEW.quantity);
  ELSIF NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    PERFORM apply_order_line_stock(v_order, NEW."productId", NEW.quantity - OLD.quantity);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.apply_order_stock_movement() RETURNS TRIGGER AS $$
DECLARE
  cutoff timestamptz;
  is_consumed boolean;
  inventory_state text;
  rec RECORD;
  cur_stock integer;
BEGIN
  SELECT value::timestamptz INTO cutoff FROM "AppSetting" WHERE key = 'stock_autodecrement_since';
  IF cutoff IS NULL OR NEW."createdAt" < cutoff THEN
    RETURN NEW;
  END IF;

  is_consumed := (NEW."senditTrackingId" IS NOT NULL OR NEW.status = 'DELIVERED')
                 AND NEW.status <> 'CANCELLED';

  SELECT type INTO inventory_state
  FROM "InventoryMovement"
  WHERE "orderId" = NEW.id AND type IN ('Sale', 'Return')
  ORDER BY "createdAt" DESC, id DESC
  LIMIT 1;

  IF is_consumed AND inventory_state IS DISTINCT FROM 'Sale' THEN
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
      SELECT COALESCE(stock, 0) INTO cur_stock FROM "Product" WHERE id = rec.pid FOR UPDATE;
      IF cur_stock < rec.qty THEN
        RAISE EXCEPTION 'Insufficient stock for product %: % requested, % available', rec.pid, rec.qty, cur_stock
          USING ERRCODE = '23514';
      END IF;
      INSERT INTO "InventoryMovement"
        ("productId", type, quantity, "stockBefore", "stockAfter", reason, "orderId", "performedBy", "createdAt")
        VALUES (rec.pid, 'Sale', -rec.qty, cur_stock, cur_stock - rec.qty,
                'Vente auto #' || NEW.id, NEW.id, 'auto', NOW());
      UPDATE "Product" SET stock = cur_stock - rec.qty WHERE id = rec.pid;
    END LOOP;
  ELSIF NEW.status = 'CANCELLED' AND inventory_state = 'Sale' THEN
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
      SELECT COALESCE(stock, 0) INTO cur_stock FROM "Product" WHERE id = rec.pid FOR UPDATE;
      INSERT INTO "InventoryMovement"
        ("productId", type, quantity, "stockBefore", "stockAfter", reason, "orderId", "performedBy", "createdAt")
        VALUES (rec.pid, 'Return', rec.qty, cur_stock, cur_stock + rec.qty,
                'Retour auto #' || NEW.id, NEW.id, 'auto', NOW());
      UPDATE "Product" SET stock = cur_stock + rec.qty WHERE id = rec.pid;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
