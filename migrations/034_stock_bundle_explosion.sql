-- Migration 034: le decrement automatique doit eclater les packs
--
-- LE PROBLEME (constate sur la commande #280)
-- Un pack est un produit vitrine : il n'a pas de stock propre, donc
-- `trackInventory = false`. Le declencheur de la migration 024 filtre justement
-- sur `trackInventory = true` — il sautait donc la ligne, et rien n'etait
-- decremente. Aucun InventoryMovement, aucun composant touche.
--
-- Le checkout du site ne montrait pas le probleme parce qu'il decompose les
-- packs lui-meme (explodeBundle) et enregistre des lignes de composants. La
-- commande manuelle du BOS, elle, inserait le produit-pack tel quel.
--
-- La consequence etait silencieuse et grave : le stock affiche d'un pack est
-- recalcule depuis ses composants (refresh_bundle_stock). Les composants ne
-- baissant jamais, le pack restait vendable indefiniment. Survente garantie.
--
-- LE CORRECTIF
-- Le declencheur resout desormais lui-meme les lignes de pack en composants.
-- C'est une protection de fond : elle couvre le BOS, les imports et toute
-- source future qui oublierait de decomposer. Aucun risque de double
-- decrement — une ligne est SOIT un produit-pack, SOIT un produit reel, jamais
-- les deux, et le site continue d'enregistrer directement des composants.

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
      WITH expanded AS (
        -- Ligne normale : le produit lui-meme.
        SELECT oi."productId" AS pid, oi.quantity AS qty
        FROM "OrderItem" oi
        WHERE oi."orderId" = NEW.id
          AND NOT EXISTS (SELECT 1 FROM "Bundle" b WHERE b."productId" = oi."productId")
        UNION ALL
        -- Ligne de pack : on l'eclate en composants reels.
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

-- Le declencheur lui-meme n'a pas change (024 l'a deja pose sur INSERT/UPDATE) :
-- CREATE OR REPLACE FUNCTION suffit, la fonction est remplacee en place.
