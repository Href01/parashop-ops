-- 047 — AGENT META ADS : les donnees Meta au niveau de chaque publicite, la
-- strategie publicitaire d'Achraf, et la memoire de l'agent (demandes, rapports,
-- actions, creatifs).
--
-- Additive et idempotente. Ne touche ni produits, ni commandes, ni clientes, ni
-- les tables publicitaires existantes ("AdCampaign", "AdSpendDaily").
-- L'agent est un Claude (routines cloud) : il lit et ecrit ces tables par
-- /api/ops/ads/agent/machine/*, avec un jeton. Il ne modifie rien dans Meta.

-- Une publicite Meta et sa creation (texte, format, vignette), relue a chaque synchro.
CREATE TABLE IF NOT EXISTS "MetaAd" (
  ad_id         text PRIMARY KEY,
  nom           text,
  statut        text,                 -- effective_status : ACTIVE, PAUSED, ARCHIVED...
  campagne_id   text,
  campagne      text,
  objectif      text,                 -- OUTCOME_SALES, OUTCOME_ENGAGEMENT, POST_ENGAGEMENT...
  adset_id      text,
  adset         text,
  optimisation  text,                 -- optimization_goal de l'ensemble de pubs
  budget_jour   numeric,              -- MAD (ensemble ou campagne)
  format        text,                 -- object_type de la creation : SHARE, VIDEO, PHOTO...
  texte         text,
  titre         text,
  cta           text,
  vignette      text,                 -- URL signee par Meta : elle expire, relue a chaque synchro
  permalien     text,                 -- publication Instagram
  portee_7j     integer,              -- personnes touchees sur 7 jours (non additive par jour)
  frequence_7j  numeric,              -- fois ou chaque personne a vu la pub sur 7 jours
  cree_le       timestamptz,
  maj_le        timestamptz NOT NULL DEFAULT now()
);

-- Une ligne par publicite et par jour. Montants en MAD.
CREATE TABLE IF NOT EXISTS "MetaAdDaily" (
  jour                date NOT NULL,
  ad_id               text NOT NULL,
  depense             numeric NOT NULL DEFAULT 0,
  impressions         integer NOT NULL DEFAULT 0,
  portee              integer NOT NULL DEFAULT 0,
  clics_lien          integer NOT NULL DEFAULT 0,
  vues_page           integer NOT NULL DEFAULT 0,   -- landing_page_view
  paniers             integer NOT NULL DEFAULT 0,
  commandes_initiees  integer NOT NULL DEFAULT 0,
  achats              integer NOT NULL DEFAULT 0,   -- vus par le pixel
  valeur_achats       numeric NOT NULL DEFAULT 0,
  messages            integer NOT NULL DEFAULT 0,   -- conversations demarrees (DM Instagram, Messenger, WhatsApp)
  vues_video_3s       integer NOT NULL DEFAULT 0,
  thruplays           integer NOT NULL DEFAULT 0,
  engagements         integer NOT NULL DEFAULT 0,
  maj_le              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (jour, ad_id)
);
CREATE INDEX IF NOT EXISTS meta_ad_daily_ad ON "MetaAdDaily" (ad_id, jour);

-- Repartition du compte sur une fenetre glissante : age, sexe, placement, region.
CREATE TABLE IF NOT EXISTS "MetaBreakdown" (
  fin          date NOT NULL,
  jours        integer NOT NULL,
  dimension    text NOT NULL,
  valeur       text NOT NULL,
  depense      numeric NOT NULL DEFAULT 0,
  impressions  integer NOT NULL DEFAULT 0,
  clics_lien   integer NOT NULL DEFAULT 0,
  achats       integer NOT NULL DEFAULT 0,
  messages     integer NOT NULL DEFAULT 0,
  maj_le       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fin, jours, dimension, valeur)
);

-- La strategie publicitaire : une version par enregistrement, la derniere fait foi.
CREATE TABLE IF NOT EXISTS "AdsStrategy" (
  id           serial PRIMARY KEY,
  config       jsonb NOT NULL,
  modifie_par  text,
  modifie_le   timestamptz NOT NULL DEFAULT now()
);

-- Ce qu'Achraf demande a l'agent depuis le BOS ; la routine horaire en reclame une a la fois.
CREATE TABLE IF NOT EXISTS "AdsAgentRequest" (
  id           serial PRIMARY KEY,
  genre        text NOT NULL CHECK (genre IN ('analyse', 'creatifs', 'audit', 'question')),
  sujet        text NOT NULL,
  statut       text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'en_cours', 'termine', 'erreur')),
  demande_par  text,
  demande_le   timestamptz NOT NULL DEFAULT now(),
  commence_le  timestamptz,
  termine_le   timestamptz,
  erreur       text,
  rapport_id   integer
);
CREATE INDEX IF NOT EXISTS ads_agent_request_file ON "AdsAgentRequest" (statut, demande_le);

CREATE TABLE IF NOT EXISTS "AdsAgentReport" (
  id           serial PRIMARY KEY,
  demande_id   integer REFERENCES "AdsAgentRequest"(id) ON DELETE SET NULL,
  source       text NOT NULL CHECK (source IN ('quotidien', 'hebdo', 'demande')),
  titre        text NOT NULL,
  cree_le      timestamptz NOT NULL DEFAULT now(),
  modele       text,
  en_bref      text NOT NULL,
  contenu      text NOT NULL,          -- Markdown
  chiffres     jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ads_agent_report_recent ON "AdsAgentReport" (cree_le DESC);

-- Une decision recommandee : couper, reduire, augmenter, tester, lancer, corriger le suivi, offre.
CREATE TABLE IF NOT EXISTS "AdsAgentAction" (
  id           serial PRIMARY KEY,
  rapport_id   integer NOT NULL REFERENCES "AdsAgentReport"(id) ON DELETE CASCADE,
  priorite     integer NOT NULL DEFAULT 2 CHECK (priorite BETWEEN 1 AND 3),
  type         text NOT NULL CHECK (type IN ('couper', 'reduire', 'augmenter', 'tester', 'lancer', 'corriger_suivi', 'offre', 'autre')),
  action       text NOT NULL,
  cible        text,                   -- campagne, ensemble, pub ou produit vise
  signal       text,                   -- la preuve chiffree
  effet        text,
  effort       text CHECK (effort IS NULL OR effort IN ('S', 'M', 'L')),
  statut       text NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'fait', 'ecarte')),
  maj_le       timestamptz,
  fait_le      timestamptz
);
CREATE INDEX IF NOT EXISTS ads_agent_action_ouvertes ON "AdsAgentAction" (statut, priorite);

-- Une idee de creation publicitaire, du concept a la mise en ligne.
CREATE TABLE IF NOT EXISTS "AdsCreative" (
  id            serial PRIMARY KEY,
  rapport_id    integer REFERENCES "AdsAgentReport"(id) ON DELETE SET NULL,
  cree_le       timestamptz NOT NULL DEFAULT now(),
  produit_ids   integer[] NOT NULL DEFAULT '{}',
  angle         text NOT NULL,
  format        text NOT NULL CHECK (format IN ('image', 'carrousel', 'video', 'reel', 'story')),
  public        text,
  accroche      text NOT NULL,         -- les 3 premieres secondes / la premiere ligne
  script        text,                  -- deroule plan par plan (video) ou maquette (image)
  texte_fr      text,
  texte_darija  text,
  texte_ar      text,
  titre         text,
  cta           text,
  visuel        text,                  -- brief de prise de vue ou de montage
  statut        text NOT NULL DEFAULT 'idee' CHECK (statut IN ('idee', 'validee', 'produite', 'en_ligne', 'ecartee')),
  ad_id         text,                  -- la pub Meta quand elle est en ligne
  maj_le        timestamptz
);
