-- 045 — AGENT SEO : changements prets a appliquer, et date du « Fait » pour mesurer l'impact.
--
-- Additive et idempotente : quatre colonnes nullables sur "SeoAgentAction"
-- (migration 044). Ne touche ni produits, ni commandes, ni clientes.

-- La modification exacte proposee par l'agent (titre Google ou question de FAQ
-- d'une fiche), que le bouton « Appliquer » ecrit tel quel. NULL = recommandation
-- a faire a la main.
ALTER TABLE "SeoAgentAction" ADD COLUMN IF NOT EXISTS changement jsonb;

-- La valeur remplacee, gardee pour « Annuler » : une modification appliquee en
-- un clic doit pouvoir se defaire en un clic.
ALTER TABLE "SeoAgentAction" ADD COLUMN IF NOT EXISTS avant jsonb;
ALTER TABLE "SeoAgentAction" ADD COLUMN IF NOT EXISTS applique_le timestamptz;

-- Le jour ou l'action a ete faite : le point zero de la mesure d'impact
-- (Search Console, N jours avant contre N jours apres).
ALTER TABLE "SeoAgentAction" ADD COLUMN IF NOT EXISTS fait_le timestamptz;
UPDATE "SeoAgentAction" SET fait_le = maj_le WHERE statut = 'fait' AND fait_le IS NULL;
