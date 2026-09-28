-- 052 — AGENT META ADS : discuter avec le directeur artistique AVANT qu'il cree.
--
-- Additive et idempotente. Ne touche ni produits, ni commandes, ni clientes.
--
-- Achraf veut s'aligner avant la creation : le directeur artistique propose d'abord
-- (l'idee, l'accroche, les plans, les modeles Higgsfield, ses questions) ; la demande
-- passe « a_valider » ; Achraf repond (le directeur artistique reprend la discussion)
-- ou valide (la creation part). Le fil est garde dans `echanges`.

ALTER TABLE "AdsAgentRequest" DROP CONSTRAINT IF EXISTS "AdsAgentRequest_statut_check";
ALTER TABLE "AdsAgentRequest" ADD CONSTRAINT "AdsAgentRequest_statut_check"
  CHECK (statut IN ('en_attente', 'en_cours', 'a_valider', 'termine', 'erreur'));

-- [{ auteur: 'agent' | 'achraf', texte, le, valide? }], dans l'ordre.
ALTER TABLE "AdsAgentRequest" ADD COLUMN IF NOT EXISTS echanges jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Quand Achraf a valide la proposition : la creation est permise a partir de la.
ALTER TABLE "AdsAgentRequest" ADD COLUMN IF NOT EXISTS valide_le timestamptz;
