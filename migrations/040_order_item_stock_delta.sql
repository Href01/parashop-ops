-- Migration 040 : modifier les lignes d'une commande deja expediee doit bouger le stock
--
-- LE PROBLEME (constate sur la commande #330)
-- Le fondateur a retire un produit d'une commande et en a ajoute un autre. Le
-- stock n'a pas bouge : le produit retire est reste decompte, l'ajoute ne l'a
-- jamais ete.
--
-- POURQUOI. Le declencheur de la migration 024 est pose sur "Order", pas sur
-- "OrderItem", et il ne decremente QU'UNE FOIS par commande -- le mouvement
-- 'Sale' lui sert de marqueur d'idempotence. L'editeur de lignes du BOS appelle
-- bien un UPDATE sur "Order" (il recalcule `productsTotal`), donc le
-- declencheur se rallume ; mais il voit ce marqueur, conclut « deja fait » et
-- repart sans rien toucher. L'idempotence qui protege des resynchronisations
-- protegeait aussi, par accident, des vraies modifications.
--
-- Rien du cote applicatif ne rattrapait cela : `app/api/ops/orders/[id]/items`
-- n'ecrit que dans "OrderItem" et "Order"."productsTotal".
--
-- LE CORRECTIF
-- Un declencheur sur "OrderItem" qui applique la DIFFERENCE, et seulement quand
-- la commande a deja quitte l'entrepot. Au niveau de la base, comme la 034 :
-- cela couvre le BOS, les imports, les corrections SQL a la main et toute
-- source future -- pas seulement la route qu'on vient de lire.
--
-- CE QU'IL NE FAIT PAS, VOLONTAIREMENT
--  * Une commande pas encore expediee n'est pas touchee : aucune unite n'est
--    encore sortie, et l'expedition decomptera les lignes telles qu'elles
--    seront a ce moment-la. Deduire ici produirait un double decompte.
--  * Une commande deja annulee et rendue ('Return' pose) n'est pas touchee non
--    plus : ses unites sont revenues, modifier la liste ne les fait pas
--    repartir.
--
-- POURQUOI 'Adjustment' ET NON 'Sale'/'Return'. Ces deux types portent une
-- semantique de declencheur : 'Sale' marque « deja decompte », 'Return' marque
-- « deja rendu ». Poser un 'Return' pour une ligne retiree empecherait une
-- annulation ulterieure de rendre le reste de la commande. 'Adjustment' est le
-- type neutre des corrections, deja utilise, et visible dans l'Historique.

-- ---------------------------------------------------------------------------
-- Applique la sortie (p_units > 0) ou le retour (p_units < 0) d'une ligne.
-- Eclate les packs exactement comme le declencheur de la migration 034 : une
-- ligne est SOIT un produit reel, SOIT un pack, jamais les deux.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_order_line_stock(p_order int, p_product int, p_units int)
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
      -- Ligne normale : le produit lui-meme.
      SELECT p_product AS pid, p_units AS qty
      WHERE NOT EXISTS (SELECT 1 FROM "Bundle" b WHERE b."productId" = p_product)
      UNION ALL
      -- Ligne de pack : on l'eclate en composants reels.
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
  LOOP
    CONTINUE WHEN rec.qty = 0;
    SELECT stock INTO cur_stock FROM "Product" WHERE id = rec.pid;
    INSERT INTO "InventoryMovement"
      ("productId", "type", "quantity", "stockBefore", "stockAfter", "reason", "orderId", "performedBy", "createdAt")
      VALUES (rec.pid, 'Adjustment', -rec.qty, cur_stock, cur_stock - rec.qty,
              CASE WHEN rec.qty > 0
                   THEN 'Ligne ajoutee #' || p_order
                   ELSE 'Ligne retiree #' || p_order END,
              p_order, 'auto', NOW());
    UPDATE "Product" SET stock = stock - rec.qty WHERE id = rec.pid;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Le declencheur : la difference, et seulement sur une commande deja sortie.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_order_item_stock_delta() RETURNS TRIGGER AS $$
DECLARE
  v_order int;
  deja_sortie boolean;
BEGIN
  v_order := COALESCE(NEW."orderId", OLD."orderId");

  -- « Deja sortie » = le decrement automatique a eu lieu et n'a pas ete rendu.
  -- Ce seul test remplace la barriere de date de la migration 024 : un mouvement
  -- 'Sale' automatique n'existe que pour les commandes posterieures au seuil.
  SELECT EXISTS (SELECT 1 FROM "InventoryMovement" WHERE "orderId" = v_order AND type = 'Sale')
     AND NOT EXISTS (SELECT 1 FROM "InventoryMovement" WHERE "orderId" = v_order AND type = 'Return')
    INTO deja_sortie;

  IF NOT deja_sortie THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM apply_order_line_stock(v_order, NEW."productId", NEW.quantity);

  ELSIF TG_OP = 'DELETE' THEN
    PERFORM apply_order_line_stock(v_order, OLD."productId", -OLD.quantity);

  ELSE
    -- Changer le produit d'une ligne, c'est rendre l'ancien et sortir le neuf.
    IF NEW."productId" IS DISTINCT FROM OLD."productId" THEN
      PERFORM apply_order_line_stock(v_order, OLD."productId", -OLD.quantity);
      PERFORM apply_order_line_stock(v_order, NEW."productId", NEW.quantity);
    ELSIF NEW.quantity IS DISTINCT FROM OLD.quantity THEN
      PERFORM apply_order_line_stock(v_order, NEW."productId", NEW.quantity - OLD.quantity);
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_order_item_stock ON "OrderItem";
CREATE TRIGGER trigger_order_item_stock
AFTER INSERT OR UPDATE OR DELETE ON "OrderItem"
FOR EACH ROW
EXECUTE FUNCTION apply_order_item_stock_delta();
