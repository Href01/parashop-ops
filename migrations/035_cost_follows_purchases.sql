-- Migration 035: le cout de revient suit les achats reels
--
-- LE PROBLEME
-- Les achats sont bien enregistres avec leur prix (InventoryMovement type
-- 'Purchase', colonne costPerUnit) — mais Product."costPrice" ne bougeait
-- jamais apres coup. Un produit rachete plus cher gardait le prix du PREMIER
-- achat, et le BOS calculait la marge avec un prix qu'on ne paie plus.
--
-- Constate sur 7 produits, toujours dans le meme sens (fiche trop basse) :
--   Ampoules Vitamine E   : fiche 93,75 — achats a 93,75 puis 125
--   Shampoing Cheveux Secs: fiche 70,00 — achat unique a 105
--   Apres-shampoing masque: fiche 101,25 — achat unique a 135
-- Soit environ 3 400 MAD de marge surestimee sur les commandes livrees.
--
-- LE CORRECTIF
-- 1. Un achat met a jour le cout du produit : moyenne ponderee de TOUS les
--    achats chiffres. C'est le cout moyen pondere (CUMP), la methode adaptee
--    quand le prix depend de la quantite commandee au fournisseur.
-- 2. Le cout d'un pack suit celui de ses composants. Depuis que le pack
--    s'enregistre en une seule ligne, sa marge depend entierement de ce champ :
--    il ne peut plus se permettre de deriver en silence.
--
-- Les achats SANS costPerUnit sont ignores : ils ne doivent pas tirer la
-- moyenne vers zero. (16 achats sur 50 sont dans ce cas aujourd'hui.)

-- ── 1. Cout moyen pondere d'un produit, depuis ses achats ────────────────────
CREATE OR REPLACE FUNCTION refresh_product_cost(p_product_id integer)
RETURNS void AS $$
DECLARE v_cost numeric;
BEGIN
  SELECT SUM("costPerUnit" * quantity) / NULLIF(SUM(quantity), 0)
    INTO v_cost
  FROM "InventoryMovement"
  WHERE "productId" = p_product_id
    AND type = 'Purchase'
    AND "costPerUnit" IS NOT NULL
    AND quantity > 0;

  IF v_cost IS NOT NULL THEN
    UPDATE "Product"
       SET "costPrice" = ROUND(v_cost, 2)
     WHERE id = p_product_id
       AND "costPrice" IS DISTINCT FROM ROUND(v_cost, 2);
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION on_purchase_recorded() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'Purchase' THEN
    PERFORM refresh_product_cost(NEW."productId");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_purchase_updates_cost ON "InventoryMovement";
CREATE TRIGGER trigger_purchase_updates_cost
AFTER INSERT OR UPDATE ON "InventoryMovement"
FOR EACH ROW EXECUTE FUNCTION on_purchase_recorded();

-- ── 2. Le cout d'un pack = somme des couts de ses composants ─────────────────
CREATE OR REPLACE FUNCTION refresh_bundle_cost(p_bundle_id integer)
RETURNS void AS $$
DECLARE
  v_cost numeric;
  v_product_id integer;
BEGIN
  SELECT "productId" INTO v_product_id FROM "Bundle" WHERE id = p_bundle_id;
  IF v_product_id IS NULL THEN RETURN; END IF;

  -- NULL si un seul composant n'a pas de cout : mieux vaut « cout inconnu »
  -- qu'un total faux qui gonflerait la marge du pack.
  SELECT SUM(c."costPrice" * bi.quantity) INTO v_cost
  FROM "BundleItem" bi
  JOIN "Product" c ON c.id = bi."productId"
  WHERE bi."bundleId" = p_bundle_id
    AND NOT EXISTS (
      SELECT 1 FROM "BundleItem" bi2 JOIN "Product" c2 ON c2.id = bi2."productId"
      WHERE bi2."bundleId" = p_bundle_id AND c2."costPrice" IS NULL
    );

  UPDATE "Product"
     SET "costPrice" = ROUND(v_cost, 2)
   WHERE id = v_product_id
     AND "costPrice" IS DISTINCT FROM ROUND(v_cost, 2);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION on_component_cost_change() RETURNS TRIGGER AS $$
DECLARE r RECORD;
BEGIN
  -- Garde-fou anti-recursion : un pack n'est jamais composant d'un autre pack,
  -- mais on ne repropage que si le cout a REELLEMENT change.
  IF NEW."costPrice" IS NOT DISTINCT FROM OLD."costPrice" THEN RETURN NEW; END IF;
  FOR r IN SELECT DISTINCT "bundleId" FROM "BundleItem" WHERE "productId" = NEW.id LOOP
    PERFORM refresh_bundle_cost(r."bundleId");
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_component_cost_change ON "Product";
CREATE TRIGGER trigger_component_cost_change
AFTER UPDATE OF "costPrice" ON "Product"
FOR EACH ROW EXECUTE FUNCTION on_component_cost_change();
