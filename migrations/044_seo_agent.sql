-- 044 — AGENT SEO CONCURRENCE : demandes, rapports, actions, releves de resultats.
--
-- L'agent est un Claude qui tourne dans le cloud d'Anthropic (routine planifiee)
-- et parle au BOS par /api/ops/seo/agent/machine/* avec un jeton. Ces tables sont
-- sa memoire, et l'ecran /analytics/seo/concurrence les lit. Les positions REELLES
-- de Shine restent celles de Search Console ("SeoSearchDaily", migration 043) :
-- rien ici ne les duplique.
--
-- Additive et idempotente. Ne touche ni produits, ni commandes, ni clientes.

-- Les grappes et requetes suivies : modifiables depuis le BOS (telephone compris).
CREATE TABLE IF NOT EXISTS "SeoAgentGroup" (
  nom        text PRIMARY KEY,
  priorite   integer NOT NULL DEFAULT 2 CHECK (priorite BETWEEN 1 AND 3),
  pourquoi   text NOT NULL DEFAULT '',
  analyse_le timestamptz              -- derniere analyse approfondie : sert a la rotation quotidienne
);

CREATE TABLE IF NOT EXISTS "SeoAgentQuery" (
  requete  text PRIMARY KEY,
  grappe   text NOT NULL REFERENCES "SeoAgentGroup"(nom) ON UPDATE CASCADE,
  actif    boolean NOT NULL DEFAULT true,
  ajoute_le timestamptz NOT NULL DEFAULT now()
);

-- Une analyse demandee depuis le BOS. La routine horaire en reclame une a la fois.
CREATE TABLE IF NOT EXISTS "SeoAgentRequest" (
  id          serial PRIMARY KEY,
  cible       text NOT NULL,
  genre       text NOT NULL CHECK (genre IN ('requete', 'grappe', 'tout')),
  statut      text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'en_cours', 'termine', 'erreur')),
  demande_par text,
  demande_le  timestamptz NOT NULL DEFAULT now(),
  commence_le timestamptz,
  termine_le  timestamptz,
  erreur      text,
  rapport_id  integer
);
CREATE INDEX IF NOT EXISTS seo_agent_request_file ON "SeoAgentRequest" (statut, demande_le);

CREATE TABLE IF NOT EXISTS "SeoAgentReport" (
  id         serial PRIMARY KEY,
  demande_id integer REFERENCES "SeoAgentRequest"(id) ON DELETE SET NULL,
  source     text NOT NULL CHECK (source IN ('quotidien', 'demande')),
  cible      text NOT NULL,
  cree_le    timestamptz NOT NULL DEFAULT now(),
  modele     text,
  en_bref    text NOT NULL,
  concurrent text,                     -- le domaine a battre
  contenu    text NOT NULL,            -- le rapport complet, en Markdown
  requetes   jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS seo_agent_report_recent ON "SeoAgentReport" (cree_le DESC);

CREATE TABLE IF NOT EXISTS "SeoAgentAction" (
  id         serial PRIMARY KEY,
  rapport_id integer NOT NULL REFERENCES "SeoAgentReport"(id) ON DELETE CASCADE,
  priorite   integer NOT NULL DEFAULT 2,
  action     text NOT NULL,
  page       text,
  levier     text,
  effort     text CHECK (effort IS NULL OR effort IN ('S', 'M', 'L')),
  signal     text,
  effet      text,
  statut     text NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'fait', 'ecarte')),
  maj_le     timestamptz
);
CREATE INDEX IF NOT EXISTS seo_agent_action_ouvertes ON "SeoAgentAction" (statut, priorite);

-- Un releve par jour et par requete : l'ordre du moteur de recherche de l'agent.
-- Ce n'est PAS l'ordre exact de google.ma : l'ecran le dit.
CREATE TABLE IF NOT EXISTS "SeoSerpSnapshot" (
  jour       date NOT NULL,
  requete    text NOT NULL,
  source     text NOT NULL DEFAULT 'websearch',
  domaines   jsonb NOT NULL,
  urls       jsonb NOT NULL,
  shine_rang integer,
  releve_le  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (jour, requete, source)
);

-- Le suivi de depart (repris de scripts/seo/requetes-cibles.json du site).
INSERT INTO "SeoAgentGroup" (nom, priorite, pourquoi) VALUES
  ('milk-shake', 1, 'Marque n°1 des ventes (Spray Conditionner, Incredible Milk, Sun & More), en stock.'),
  ('olaplex', 1, 'Panier le plus eleve (395 DH). La grappe qui recule le plus dans Search Console (aout → sept. 2026).'),
  ('k-beauty', 2, '19 produits coreens lances le 24/09/2026 (depot-vente partenaire). Il faut d''abord exister.'),
  ('besoins-cheveux', 2, 'Requetes par besoin, sans marque : pages categorie et conseil.'),
  ('salerm-biokera', 3, 'Stock bloque en douane (temporaire) : suivi seulement, ne jamais desindexer.')
ON CONFLICT (nom) DO NOTHING;

INSERT INTO "SeoAgentQuery" (requete, grappe) VALUES
  ('milk shake maroc', 'milk-shake'), ('milk shake incredible milk maroc', 'milk-shake'),
  ('milk shake leave in conditioner maroc', 'milk-shake'), ('milk shake sun and more maroc', 'milk-shake'),
  ('milk shake integrity maroc', 'milk-shake'), ('milk shake no frizz maroc', 'milk-shake'),
  ('olaplex maroc', 'olaplex'), ('olaplex n°3 prix maroc', 'olaplex'), ('olaplex n°4 shampoing maroc', 'olaplex'),
  ('olaplex n°7 huile maroc', 'olaplex'), ('olaplex original maroc', 'olaplex'),
  ('beauty of joseon maroc', 'k-beauty'), ('crème solaire coréenne maroc', 'k-beauty'), ('anua maroc', 'k-beauty'),
  ('medicube maroc', 'k-beauty'), ('skin1004 maroc', 'k-beauty'), ('cosrx maroc', 'k-beauty'), ('sérum anti taches maroc', 'k-beauty'),
  ('soin cheveux abîmés maroc', 'besoins-cheveux'), ('spray démêlant cheveux maroc', 'besoins-cheveux'),
  ('protection chaleur cheveux maroc', 'besoins-cheveux'), ('produit anti frisottis maroc', 'besoins-cheveux'),
  ('salerm maroc', 'salerm-biokera'), ('salerm hi repair maroc', 'salerm-biokera'), ('biokera maroc', 'salerm-biokera')
ON CONFLICT (requete) DO NOTHING;
