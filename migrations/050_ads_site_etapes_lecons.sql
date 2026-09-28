-- 050 — AGENT META ADS : les vraies etapes du site, la routine numerotee, et ce que le directeur artistique apprend.
--
-- Additive et idempotente. Ne touche ni produits, ni commandes, ni clientes.
--
-- Trois Reels de suite avaient la meme charpente (chute → etiquette → DM → fin),
-- un pack de 4 produits n'en montrait que 3, et « les etapes du site » etaient
-- ecrites sur un decor. D'ou :
--   1. deux plans de plus : « etapes » (la routine, chaque produit avec son numero
--      et son nom) et « site » (les VRAIES captures du site dans un telephone, un
--      doigt qui touche le bon bouton) ;
--   2. les captures du tunnel d'achat, par produit (prises par scripts/ads/captures-site.mjs,
--      suivi bloque, rien de soumis) ;
--   3. les retours d'Achraf, relus par le directeur artistique avant chaque direction ;
--   4. la couverture du brief : quelle consigne d'Achraf est tenue par quel plan.

-- 1. Les plans « etapes » et « site ».
ALTER TABLE "AdsCreativeOption" DROP CONSTRAINT IF EXISTS "AdsCreativeOption_mouvement_check";
ALTER TABLE "AdsCreativeOption" ADD CONSTRAINT "AdsCreativeOption_mouvement_check"
  CHECK (mouvement IS NULL OR mouvement IN ('rebond', 'pop', 'glisse', 'duo', 'revele', 'etiquette', 'quiz', 'dm', 'zoom', 'fin', 'etapes', 'site'));

-- 2. Les captures du tunnel d'achat (mobile 390x844, x2), une ligne par produit et par ecran.
CREATE TABLE IF NOT EXISTS "AdsSiteCapture" (
  id          serial PRIMARY KEY,
  product_id  integer NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
  etape       text NOT NULL CHECK (etape IN ('produit', 'panier', 'livraison')),
  url         text NOT NULL,                 -- Cloudinary (shine-ads/site), servie avec CORS pour le canvas
  public_id   text,
  largeur     integer NOT NULL,
  hauteur     integer NOT NULL,
  cible       jsonb NOT NULL,                -- le bouton touche : { x, y, w, h } en fractions de la capture
  bouton      text,                          -- son libelle, tel qu'affiche (« Ajouter au panier »)
  prix        numeric(10, 2),                -- le prix du produit au moment de la capture : s'il change, la capture est perimee
  capture_le  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, etape)
);

-- 3. Ce que le directeur artistique doit retenir (les retours d'Achraf, les plus recents d'abord).
CREATE TABLE IF NOT EXISTS "AdsDirectionLecon" (
  id          serial PRIMARY KEY,
  texte       text NOT NULL CHECK (length(texte) BETWEEN 5 AND 600),
  creatif_id  integer REFERENCES "AdsCreative"(id) ON DELETE SET NULL,   -- la creation qui l'a appris, s'il y en a une
  par         text,
  active      boolean NOT NULL DEFAULT true,
  cree_le     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ads_direction_lecon_active ON "AdsDirectionLecon" (active, cree_le DESC);

-- 4. La couverture du brief : [{ consigne, plans: [1, 3] }], livree par Claude avec la direction.
ALTER TABLE "AdsAgentRequest" ADD COLUMN IF NOT EXISTS couverture jsonb;
