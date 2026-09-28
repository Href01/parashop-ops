-- 053 — AGENT META ADS : ce que chaque clip a coute en credits Higgsfield.
--
-- Additive et idempotente. Ne touche ni produits, ni commandes, ni clientes.
--
-- Higgsfield ne publie pas de grille officielle et ses couts changent : le directeur
-- artistique note le cout que l'outil lui a annonce (ou la baisse du solde) a chaque
-- clip pose. Le Studio additionne par creation et par mois. Les images faites par un
-- modele d'image Higgsfield gardent le leur dans "AdsCreativeImage".usage.credits.

ALTER TABLE "AdsClipGeneration" ADD COLUMN IF NOT EXISTS credits numeric(8, 2);
