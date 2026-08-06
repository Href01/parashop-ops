-- Migration 036: tracer le DENOUEMENT des commandes, pas seulement leur creation
--
-- LE PROBLEME
-- Le flux analytics ne contenait qu'ORDER_CREATED. Rien pour la confirmation, la
-- livraison ou l'annulation.
--
-- En paiement a la livraison, c'est un angle mort majeur : une commande passee
-- n'est pas une vente. Mesure sur 90 jours, commandes du site :
--   Instagram : 14 commandes -> 11 livrees (78,6 %)
--   Search    : 10 commandes ->  8 livrees (80,0 %)
--   Direct    : 15 commandes -> 10 livrees (66,7 %)
-- Douze points d'ecart entre Instagram et le direct. Une commande refusee coute
-- l'aller, le retour et l'emballage : c'est de l'argent negatif, pas un zero.
--
-- Le taux de conversion affiche (1,48 %) compte donc des commandes PASSEES. Le
-- vrai tourne autour de 1,1 %, et il varie selon la source — ce qui devrait
-- piloter les budgets publicitaires.
--
-- POURQUOI UN DECLENCHEUR ET PAS DU CODE APPLICATIF
-- Le statut d'une commande change depuis au moins quatre endroits : le BOS, la
-- synchro Sendit, la promotion d'un colis, et parfois une correction manuelle en
-- SQL. Instrumenter chaque appelant garantit qu'on en oubliera un. En base, la
-- capture est totale par construction.
--
-- L'evenement porte le sessionId de la commande quand il existe (commandes du
-- site) et NULL sinon (commandes manuelles WhatsApp / Instagram) : la colonne est
-- nullable, et distinguer les deux est en soi une information.

CREATE OR REPLACE FUNCTION emit_order_lifecycle_event() RETURNS TRIGGER AS $$
DECLARE
  v_name text;
BEGIN
  -- Rien a dire si le statut n'a pas bouge.
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_name := CASE NEW.status
    WHEN 'CONFIRMED' THEN 'ORDER_CONFIRMED'
    WHEN 'DELIVERED' THEN 'ORDER_DELIVERED'
    WHEN 'CANCELLED' THEN 'ORDER_CANCELLED'
    ELSE NULL
  END;
  IF v_name IS NULL THEN RETURN NEW; END IF;

  -- Idempotence : un seul evenement de chaque type par commande. La synchro
  -- Sendit repasse sur les memes commandes a chaque execution.
  IF EXISTS (
    SELECT 1 FROM "AnalyticsEvent"
    WHERE name = v_name AND (props->>'orderId')::int = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO "AnalyticsEvent" ("sessionId", "userId", name, path, props, "createdAt")
  VALUES (
    NEW."sessionId",
    NEW."userId",
    v_name,
    NULL,
    jsonb_build_object(
      'orderId',       NEW.id,
      'total',         NEW.total,
      'sourceChannel', NEW."sourceChannel",
      'utmSource',     NEW."utmSource",
      'utmMedium',     NEW."utmMedium",
      'utmCampaign',   NEW."utmCampaign",
      'city',          NEW."deliveryCity",
      'paymentMethod', NEW."paymentMethod",
      -- Delai entre la commande et son denouement : combien de jours pour
      -- encaisser reellement, et ou ca traine.
      'hoursSinceOrder',
        ROUND(EXTRACT(EPOCH FROM (NOW() - NEW."createdAt")) / 3600.0)::int
    ),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_order_lifecycle_event ON "Order";
CREATE TRIGGER trigger_order_lifecycle_event
AFTER INSERT OR UPDATE OF status ON "Order"
FOR EACH ROW EXECUTE FUNCTION emit_order_lifecycle_event();
