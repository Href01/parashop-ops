-- 051 — AGENT META ADS : les clips animes par Higgsfield (image de depart → video).
--
-- Additive et idempotente. Ne touche ni produits, ni commandes, ni clientes.
--
-- Chaque demande d'animation est une ligne : ce qui a ete envoye (modele, consigne,
-- image de depart, duree), le cout estime par Higgsfield AVANT l'envoi (le plafond du
-- jour se calcule dessus), l'etat de la generation, et le clip copie sur Cloudinary
-- (Higgsfield ne garde ses sorties que 7 jours). Une generation echouee ou refusee
-- n'est pas facturee par Higgsfield et ne compte pas dans le plafond.

CREATE TABLE IF NOT EXISTS "AdsClipGeneration" (
  id           serial PRIMARY KEY,
  option_id    integer REFERENCES "AdsCreativeOption"(id) ON DELETE SET NULL,
  creatif_id   integer REFERENCES "AdsCreative"(id) ON DELETE SET NULL,
  modele       text NOT NULL,                 -- cle du BOS (kling-3-turbo…)
  endpoint     text NOT NULL,                 -- l'endpoint Higgsfield appele
  prompt       text NOT NULL,                 -- la consigne de mouvement envoyee, mot pour mot
  image_url    text NOT NULL,                 -- l'image de depart (Cloudinary)
  duree        integer NOT NULL,              -- secondes demandees
  request_id   text,                          -- l'identifiant Higgsfield (suivi, support)
  status_url   text,
  statut       text NOT NULL DEFAULT 'soumise'
               CHECK (statut IN ('soumise', 'en_cours', 'televersement', 'terminee', 'echouee', 'refusee', 'annulee')),
  usd_estime   numeric(8, 3),                 -- ce que Higgsfield a estime avant l'envoi
  video_source text,                          -- l'URL Higgsfield (7 jours)
  clip_url     text,                          -- la copie Cloudinary, posee dans le plan
  erreur       text,
  demande_par  text,                          -- e-mail, ou 'agent'
  cree_le      timestamptz NOT NULL DEFAULT now(),
  maj_le       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ads_clip_generation_jour ON "AdsClipGeneration" (cree_le);
CREATE INDEX IF NOT EXISTS ads_clip_generation_option ON "AdsClipGeneration" (option_id, cree_le DESC);
