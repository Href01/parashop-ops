-- 048 — AGENT META ADS : les visuels generes pour une creation (OpenAI), stockes sur Cloudinary.
--
-- Additive et idempotente. Ne touche ni produits, ni commandes, ni clientes.
-- Le visuel est une photo SANS texte : l'accroche, le prix et le bouton sont
-- poses par le BOS au-dessus (francais, darija, arabe de droite a gauche),
-- parce que les modeles d'image ecrivent mal, et l'arabe pas du tout.

CREATE TABLE IF NOT EXISTS "AdsCreativeImage" (
  id           serial PRIMARY KEY,
  creatif_id   integer NOT NULL REFERENCES "AdsCreative"(id) ON DELETE CASCADE,
  format       text NOT NULL CHECK (format IN ('feed', 'story', 'carre')),
  url          text NOT NULL,           -- Cloudinary (https), servie avec CORS pour la composition
  public_id    text,                    -- pour supprimer l'image chez Cloudinary
  largeur      integer NOT NULL,
  hauteur      integer NOT NULL,
  modele       text NOT NULL,
  qualite      text,
  prompt       text NOT NULL,           -- ce qui a ete demande, mot pour mot
  references_produits integer[] NOT NULL DEFAULT '{}',   -- fiches dont la photo a servi de reference
  demande_par  text,                    -- e-mail, ou 'agent'
  duree_ms     integer,
  usage        jsonb,                   -- ce que l'API renvoie (jetons), pour suivre le cout
  choisie      boolean NOT NULL DEFAULT false,
  cree_le      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ads_creative_image_creatif ON "AdsCreativeImage" (creatif_id, cree_le DESC);
CREATE INDEX IF NOT EXISTS ads_creative_image_jour ON "AdsCreativeImage" (cree_le);
