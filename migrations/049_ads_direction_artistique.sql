-- 049 — AGENT META ADS : le directeur artistique (Claude) — options, carrousels, Reels animes.
--
-- Additive et idempotente. Ne touche ni produits, ni commandes, ni clientes.
--
-- Achraf decrit ce qu'il veut (brief, styles, options ou carrousel). La demande
-- part dans la file de l'agent (genre « direction »). Claude regarde les vraies
-- photos produit, ecrit les consignes d'image (plusieurs OPTIONS a comparer pour
-- une image, ou une SERIE de cartes coherentes pour un carrousel), fait generer
-- chaque visuel par le modele d'image d'OpenAI, les regarde, et regenere ceux
-- qui sont rates. Chaque option ou carte garde sa consigne (modifiable), son
-- texte a poser (fr, darija, ar), la note du directeur artistique et ses visuels.

-- 1. La file de l'agent accepte les demandes de direction artistique, rattachees a une creation.
ALTER TABLE "AdsAgentRequest" DROP CONSTRAINT IF EXISTS "AdsAgentRequest_genre_check";
ALTER TABLE "AdsAgentRequest" ADD CONSTRAINT "AdsAgentRequest_genre_check"
  CHECK (genre IN ('analyse', 'creatifs', 'audit', 'question', 'direction'));
ALTER TABLE "AdsAgentRequest" ADD COLUMN IF NOT EXISTS creatif_id integer REFERENCES "AdsCreative"(id) ON DELETE SET NULL;
ALTER TABLE "AdsAgentRequest" ADD COLUMN IF NOT EXISTS parametres jsonb;   -- { type: options|carrousel|reel, nombre, format, styles, qualite, produitIds }
ALTER TABLE "AdsAgentRequest" ADD COLUMN IF NOT EXISTS resultat text;      -- le mot de fin de l'agent (ce qu'il a fait, ce qu'il a regenere)

-- 2. Les options (image seule) et les cartes (carrousel).
CREATE TABLE IF NOT EXISTS "AdsCreativeOption" (
  id          serial PRIMARY KEY,
  creatif_id  integer NOT NULL REFERENCES "AdsCreative"(id) ON DELETE CASCADE,
  demande_id  integer REFERENCES "AdsAgentRequest"(id) ON DELETE SET NULL,
  serie       integer NOT NULL DEFAULT 1,       -- une direction artistique : un lot d'options, ou une serie de cartes
  carte       integer CHECK (carte IS NULL OR carte BETWEEN 1 AND 10),   -- NULL = option d'image seule ; 1..10 = carte du carrousel
  role        text,                             -- carrousel : accroche, produit, benefice, preuve, choix…
  concept     text NOT NULL,
  pourquoi    text,                             -- pourquoi ce visuel devrait convertir
  prompt      text NOT NULL,                    -- la consigne ecrite par Claude pour le modele d'image (modifiable)
  texte       jsonb NOT NULL DEFAULT '{}',      -- le texte pose sur l'image : { fr, darija, ar }
  position    text NOT NULL DEFAULT 'haut' CHECK (position IN ('haut', 'bas')),
  format      text NOT NULL CHECK (format IN ('feed', 'story', 'carre')),
  produit_ids integer[],                        -- produits PEINTS dans l'image : NULL = tous ceux de la creation ; {} = aucun (decor vide, texture)
  -- Reel anime : chaque option est un plan. Le decor est genere ; les VRAIS produits,
  -- detoures, sont poses et animes par-dessus (rebond, pop, glisse…) par le BOS.
  animes      integer[],                        -- produits detoures animes sur le plan
  mouvement   text CHECK (mouvement IS NULL OR mouvement IN ('rebond', 'pop', 'glisse', 'zoom', 'duo', 'fin')),
  duree       numeric CHECK (duree IS NULL OR duree BETWEEN 1 AND 6),   -- secondes
  style       text,                             -- le decor commun a la serie
  brief       text,                             -- ce qu'Achraf a demande, mot pour mot
  qualite     text,
  note        text,                             -- le controle du directeur artistique sur le visuel genere
  modele      text,                             -- le modele qui a ecrit la consigne
  cree_le     timestamptz NOT NULL DEFAULT now(),
  maj_le      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ads_creative_option_creatif ON "AdsCreativeOption" (creatif_id, serie, carte);

-- 3. Un visuel appartient a une option ou a une carte. Choix : un visuel par
--    carte de carrousel, un visuel pour l'image seule de la creation.
ALTER TABLE "AdsCreativeImage" ADD COLUMN IF NOT EXISTS option_id integer REFERENCES "AdsCreativeOption"(id) ON DELETE SET NULL;
ALTER TABLE "AdsCreativeImage" ADD COLUMN IF NOT EXISTS carte integer;
CREATE INDEX IF NOT EXISTS ads_creative_image_option ON "AdsCreativeImage" (option_id);
