-- 054 — AGENT META ADS : un plan filme peut durer jusqu'a 30 s.
--
-- Additive et idempotente : elle elargit une borne, aucune ligne ne change.
--
-- Seedance 2.5 filme un plan-sequence de 30 s en une seule prise (le FOOH « Le colis
-- Shine » : le camion, le pont, le carton qui glisse et s'ouvre, 14 s sans coupure).
-- La borne de 6 s (migration 049) datait des plans animes. La regle fine reste dans le
-- code : 6 s pour un plan anime, 30 s pour un plan filme (verifierOption).

ALTER TABLE "AdsCreativeOption" DROP CONSTRAINT IF EXISTS "AdsCreativeOption_duree_check";
ALTER TABLE "AdsCreativeOption" ADD CONSTRAINT "AdsCreativeOption_duree_check"
  CHECK (duree IS NULL OR duree BETWEEN 1 AND 30);
