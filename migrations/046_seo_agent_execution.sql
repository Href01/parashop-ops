-- 046 — AGENT SEO : l'agent EXECUTE une action a la demande (« Faire par l'agent »).
--
-- Additive et idempotente. Ne touche ni produits, ni commandes, ni clientes.
--
-- Une demande de genre 'action' vise une action existante (cible = son id) :
-- la routine horaire l'execute — article redige et enregistre en BROUILLON
-- (jamais publie), ou modification du code poussee sur une branche claude/…
-- avec pull request (jamais fusionnee). Achraf relit et publie / fusionne.
ALTER TABLE "SeoAgentRequest" DROP CONSTRAINT IF EXISTS "SeoAgentRequest_genre_check";
ALTER TABLE "SeoAgentRequest" ADD CONSTRAINT "SeoAgentRequest_genre_check"
  CHECK (genre IN ('requete', 'grappe', 'tout', 'action'));

-- Ce que l'agent a produit en executant l'action :
--   { "type": "brouillon", "postId": 12, "slug": "…", "titre": "…" }
--   { "type": "pr", "branche": "claude/seo-action-23", "url": "https://github.com/…/pull/7" | null, "resume": "…" }
ALTER TABLE "SeoAgentAction" ADD COLUMN IF NOT EXISTS livrable jsonb;
ALTER TABLE "SeoAgentAction" ADD COLUMN IF NOT EXISTS livre_le timestamptz;
