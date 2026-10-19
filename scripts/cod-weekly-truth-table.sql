-- ============================================================================
-- Shine Cosmetics - Fuite COD : table de verite hebdomadaire
-- ----------------------------------------------------------------------------
-- Objectif : mesurer le parcours reel d'une commande COD
--            posees -> confirmees -> livrees -> payees
--            (+ annulees / refusees / retours), puis la marge de contribution
--            par semaine, ville, canal et produit.
--
-- Source   : base Neon partagee, tables "Order", "OrderItem", "Product",
--            "OrderStatusHistory", "SenditStaging".
-- Periode  : par defaut les 4 dernieres semaines ISO (lundi -> dimanche),
--            derniere semaine incluse jusqu'a la date d'execution.
--            Surcharge possible :
--              psql "$DATABASE_URL" \
--                -v start_date=2026-09-21 -v end_date=2026-10-19 \
--                -f scripts/cod-weekly-truth-table.sql
--
-- Securite : transaction READ ONLY. Aucune ecriture, aucun DDL.
--
-- Definitions (a citer avec chaque chiffre) :
--   posee      = commande creee dans la periode ("Order"."createdAt").
--   confirmee  = statut CONFIRMED ou DELIVERED, ou passage CONFIRMED dans
--                "OrderStatusHistory" (une livraison implique une confirmation).
--   livree     = statut DELIVERED ("deliveredAt" renseigne par trigger).
--   payee      = "paymentStatus" = 'PAID' ET "paidAmount" > 0 (encaissement verifie).
--   annulee    = statut CANCELLED. Ventilation :
--                  refusee  = "senditStatus" REJECTED / REFUSED
--                  retour   = "senditStatus" RETURNED / RETURN, ou "returnedAt"
--                  annulee  = CANCELED / CANCELLED
--                  inconnue = statut Sendit NULL / PENDING / TOPICKUP
--   en cours   = statut PENDING ou CONFIRMED (denouement non encore connu).
--   resolues   = livrees + annulees (base du taux de livraison "a maturite").
--
--   CA produits livre = SUM("Order"."revenue") des livrees.
--     "revenue" = encaisse produits hors frais de livraison (migration 023),
--     pas le prix catalogue : les remises sont deduites.
--   encaisse theorique = COALESCE(codAmount, total, revenue) des livrees.
--   COGS = SUM(COALESCE("OrderItem"."unitCost", "Product"."costPrice", 0) * quantite).
--   livraison reelle = COALESCE("actualDeliveryCost", "estimatedDeliveryCost", 0).
--   retours = "returnOrFailedFees" + "returnDeliveryFee".
--   commission = "channelCommission" (Jumia / marketplaces).
--   marge de contribution = encaisse theorique - COGS - livraison reelle
--                            - retours - commission.
--     C'est la definition du BOS ("finalProfit" / "estimatedProfit") ;
--     la requete la recalcule pour rendre chaque terme visible.
--
-- Limites connues :
--   - Les commandes en cours ne sont pas encore resolues : le taux de livraison
--     est donne sur les posees ET sur les resolues. La derniere semaine est
--     partielle.
--   - L'attribution UTM est incomplete : "sourceChannel" est manuel, les UTM
--     et "campaignId" sont souvent vides. Pas de ROAS/CAC fiable par campagne
--     dans ce rapport.
--   - Une commande livree mais non marquee payee reste livree. Le funnel le
--     signale ; il n'est pas corrige automatiquement.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off
\pset null '(null)'

BEGIN TRANSACTION READ ONLY;

\if :{?start_date}
\else
  SELECT (date_trunc('week', current_date) - interval '3 weeks')::date AS start_date,
         (current_date + 1)::date AS end_date
  \gset
\endif

\echo ''
\echo '=== 0. Parametres ==='
SELECT :'start_date'::date AS debut,
       (:'end_date'::date - 1) AS fin_incluse,
       current_date AS execute_le,
       (:'end_date'::date - :'start_date'::date) AS jours;

-- ============================================================================
-- 1. Table de verite hebdomadaire (cohorte des commandes creees)
-- ============================================================================
\echo ''
\echo '=== 1. Table de verite hebdo : posees -> confirmees -> livrees -> payees ==='
WITH base AS (
  SELECT o.*,
         EXISTS (
           SELECT 1 FROM "OrderStatusHistory" h
           WHERE h."orderId" = o.id AND h."newStatus" = 'CONFIRMED'
         ) AS ever_confirmed,
         (o.status = 'DELIVERED') AS delivered,
         (o.status = 'CANCELLED') AS cancelled,
         (o.status IN ('PENDING', 'CONFIRMED')) AS in_progress,
         (o."paymentStatus" = 'PAID' AND COALESCE(o."paidAmount", 0) > 0) AS paid,
         (COALESCE(UPPER(o."senditStatus"), '') IN ('REJECTED', 'REFUSED')) AS refused,
         (COALESCE(UPPER(o."senditStatus"), '') IN ('RETURNED', 'RETURN')
           OR o."returnedAt" IS NOT NULL) AS returned
  FROM "Order" o
  WHERE o."createdAt" >= :'start_date'::date
    AND o."createdAt" <  :'end_date'::date
)
SELECT to_char(date_trunc('week', "createdAt"), 'IYYY-"S"IW') AS semaine,
       date_trunc('week', "createdAt")::date AS debut,
       (date_trunc('week', "createdAt") + interval '6 days')::date AS fin,
       COUNT(*) AS posees,
       COUNT(*) FILTER (WHERE status IN ('CONFIRMED', 'DELIVERED') OR ever_confirmed) AS confirmees,
       COUNT(*) FILTER (WHERE delivered) AS livrees,
       COUNT(*) FILTER (WHERE paid) AS payees,
       COUNT(*) FILTER (WHERE cancelled) AS annulees,
       COUNT(*) FILTER (WHERE refused) AS refusees,
       COUNT(*) FILTER (WHERE returned) AS retours,
       COUNT(*) FILTER (WHERE in_progress) AS en_cours,
       ROUND((100.0 * COUNT(*) FILTER (WHERE delivered)
              / NULLIF(COUNT(*) FILTER (WHERE delivered OR cancelled), 0))::numeric, 1) AS taux_livraison_resolues_pct,
       ROUND((100.0 * COUNT(*) FILTER (WHERE delivered)
              / NULLIF(COUNT(*), 0))::numeric, 1) AS taux_livraison_posees_pct,
       ROUND((100.0 * COUNT(*) FILTER (WHERE cancelled)
              / NULLIF(COUNT(*) FILTER (WHERE delivered OR cancelled), 0))::numeric, 1) AS taux_annulation_resolues_pct,
       ROUND(AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "createdAt")) / 86400)
             FILTER (WHERE delivered)::numeric, 2) AS delai_moyen_livraison_j,
       ROUND(SUM(revenue) FILTER (WHERE delivered)::numeric, 2) AS ca_produits_livre,
       ROUND(SUM(COALESCE("finalProfit", "estimatedProfit", 0))
             FILTER (WHERE delivered)::numeric, 2) AS marge_contribution,
       ROUND((100.0 * SUM(COALESCE("finalProfit", "estimatedProfit", 0))
              FILTER (WHERE delivered)
              / NULLIF(SUM(revenue) FILTER (WHERE delivered), 0))::numeric, 1) AS marge_pct_ca_produits
FROM base
GROUP BY 1, 2, 3
ORDER BY 2;

-- ============================================================================
-- 2. Funnel agrege sur la periode (4 semaines par defaut)
-- ============================================================================
\echo ''
\echo '=== 2. Funnel agrege de la periode ==='
WITH base AS (
  SELECT o.*,
         EXISTS (
           SELECT 1 FROM "OrderStatusHistory" h
           WHERE h."orderId" = o.id AND h."newStatus" = 'CONFIRMED'
         ) AS ever_confirmed,
         (o.status = 'DELIVERED') AS delivered,
         (o.status = 'CANCELLED') AS cancelled,
         (o.status IN ('PENDING', 'CONFIRMED')) AS in_progress,
         (o."paymentStatus" = 'PAID' AND COALESCE(o."paidAmount", 0) > 0) AS paid,
         (COALESCE(UPPER(o."senditStatus"), '') IN ('REJECTED', 'REFUSED')) AS refused,
         (COALESCE(UPPER(o."senditStatus"), '') IN ('RETURNED', 'RETURN')
           OR o."returnedAt" IS NOT NULL) AS returned
  FROM "Order" o
  WHERE o."createdAt" >= :'start_date'::date
    AND o."createdAt" <  :'end_date'::date
)
SELECT COUNT(*) AS posees,
       COUNT(*) FILTER (WHERE status IN ('CONFIRMED', 'DELIVERED') OR ever_confirmed) AS confirmees,
       COUNT(*) FILTER (WHERE delivered) AS livrees,
       COUNT(*) FILTER (WHERE paid) AS payees,
       COUNT(*) FILTER (WHERE cancelled) AS annulees,
       COUNT(*) FILTER (WHERE refused) AS refusees,
       COUNT(*) FILTER (WHERE returned) AS retours,
       COUNT(*) FILTER (WHERE in_progress) AS en_cours,
       ROUND((100.0 * COUNT(*) FILTER (WHERE status IN ('CONFIRMED', 'DELIVERED') OR ever_confirmed)
              / NULLIF(COUNT(*), 0))::numeric, 1) AS taux_confirmation_pct,
       ROUND((100.0 * COUNT(*) FILTER (WHERE delivered)
              / NULLIF(COUNT(*), 0))::numeric, 1) AS taux_livraison_posees_pct,
       ROUND((100.0 * COUNT(*) FILTER (WHERE delivered)
              / NULLIF(COUNT(*) FILTER (WHERE delivered OR cancelled), 0))::numeric, 1) AS taux_livraison_resolues_pct,
       ROUND((100.0 * COUNT(*) FILTER (WHERE cancelled)
              / NULLIF(COUNT(*) FILTER (WHERE delivered OR cancelled), 0))::numeric, 1) AS taux_annulation_resolues_pct,
       ROUND((100.0 * COUNT(*) FILTER (WHERE paid)
              / NULLIF(COUNT(*) FILTER (WHERE delivered), 0))::numeric, 1) AS taux_paiement_sur_livrees_pct,
       ROUND(AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "createdAt")) / 86400)
             FILTER (WHERE delivered)::numeric, 2) AS delai_moyen_livraison_j,
       ROUND(AVG(EXTRACT(EPOCH FROM ("paidAt" - "createdAt")) / 86400)
             FILTER (WHERE "paidAt" IS NOT NULL)::numeric, 2) AS delai_moyen_paiement_j,
       ROUND(SUM(revenue) FILTER (WHERE delivered)::numeric, 2) AS ca_produits_livre,
       ROUND(SUM(COALESCE("finalProfit", "estimatedProfit", 0))
             FILTER (WHERE delivered)::numeric, 2) AS marge_contribution
FROM base;

-- ============================================================================
-- 3. Vue hebdomadaire par canal (pour le suivi recurrent)
-- ============================================================================
\echo ''
\echo '=== 3. Semaine x canal : volume et taux de livraison ==='
WITH base AS (
  SELECT o.*,
         COALESCE(NULLIF(TRIM(o."sourceChannel"), ''), '(non renseigne)') AS canal,
         (o.status = 'DELIVERED') AS delivered,
         (o.status = 'CANCELLED') AS cancelled,
         (o.status IN ('PENDING', 'CONFIRMED')) AS in_progress
  FROM "Order" o
  WHERE o."createdAt" >= :'start_date'::date
    AND o."createdAt" <  :'end_date'::date
)
SELECT date_trunc('week', "createdAt")::date AS debut,
       canal,
       COUNT(*) AS posees,
       COUNT(*) FILTER (WHERE delivered) AS livrees,
       COUNT(*) FILTER (WHERE cancelled) AS annulees,
       COUNT(*) FILTER (WHERE in_progress) AS en_cours,
       ROUND((100.0 * COUNT(*) FILTER (WHERE delivered)
              / NULLIF(COUNT(*) FILTER (WHERE delivered OR cancelled), 0))::numeric, 1) AS taux_livraison_resolues_pct,
       ROUND(SUM(revenue) FILTER (WHERE delivered)::numeric, 2) AS ca_produits_livre,
       ROUND(SUM(COALESCE("finalProfit", "estimatedProfit", 0))
             FILTER (WHERE delivered)::numeric, 2) AS marge_contribution
FROM base
GROUP BY 1, 2
ORDER BY 1, 3 DESC, 2;

-- ============================================================================
-- 4. Ville sur la periode (4 semaines par defaut)
-- ============================================================================
\echo ''
\echo '=== 4. Ville : posees, livrees, annulees, delai, CA, marge ==='
WITH base AS (
  SELECT o.*,
         CASE
           WHEN LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", ''), '\s+', ' ', 'g')) LIKE 'casablanca%' THEN 'Casablanca'
           WHEN LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", ''), '\s+', ' ', 'g')) IN ('kenitra', 'kénitra') THEN 'Kenitra'
           WHEN LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", ''), '\s+', ' ', 'g')) IN ('temara', 'témara') THEN 'Temara'
           WHEN LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", ''), '\s+', ' ', 'g')) IN ('larache', 'laarache') THEN 'Larache'
           WHEN LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", ''), '\s+', ' ', 'g')) IN ('fes', 'fès') THEN 'Fes'
           ELSE INITCAP(LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", '(non renseignee)'), '\s+', ' ', 'g')))
         END AS ville,
         (o.status = 'DELIVERED') AS delivered,
         (o.status = 'CANCELLED') AS cancelled,
         (o.status IN ('PENDING', 'CONFIRMED')) AS in_progress
  FROM "Order" o
  WHERE o."createdAt" >= :'start_date'::date
    AND o."createdAt" <  :'end_date'::date
)
SELECT ville,
       COUNT(*) AS posees,
       COUNT(*) FILTER (WHERE delivered) AS livrees,
       COUNT(*) FILTER (WHERE cancelled) AS annulees,
       COUNT(*) FILTER (WHERE in_progress) AS en_cours,
       COUNT(*) FILTER (WHERE delivered OR cancelled) AS resolues,
       ROUND((100.0 * COUNT(*) FILTER (WHERE delivered)
              / NULLIF(COUNT(*) FILTER (WHERE delivered OR cancelled), 0))::numeric, 1) AS taux_livraison_resolues_pct,
       ROUND((100.0 * COUNT(*) FILTER (WHERE cancelled)
              / NULLIF(COUNT(*) FILTER (WHERE delivered OR cancelled), 0))::numeric, 1) AS taux_annulation_resolues_pct,
       ROUND(AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "createdAt")) / 86400)
             FILTER (WHERE delivered)::numeric, 2) AS delai_moyen_livraison_j,
       ROUND(AVG(revenue) FILTER (WHERE delivered)::numeric, 2) AS panier_moyen_livre,
       ROUND(SUM(revenue) FILTER (WHERE delivered)::numeric, 2) AS ca_produits_livre,
       ROUND(SUM(COALESCE("finalProfit", "estimatedProfit", 0))
             FILTER (WHERE delivered)::numeric, 2) AS marge_contribution,
       ROUND((100.0 * SUM(COALESCE("finalProfit", "estimatedProfit", 0))
              FILTER (WHERE delivered)
              / NULLIF(SUM(revenue) FILTER (WHERE delivered), 0))::numeric, 1) AS marge_pct_ca_produits
FROM base
GROUP BY 1
ORDER BY posees DESC, ville;

-- ============================================================================
-- 5. Canal sur la periode (4 semaines par defaut)
-- ============================================================================
\echo ''
\echo '=== 5. Canal : posees, livrees, annulees, delai, CA, marge ==='
WITH base AS (
  SELECT o.*,
         COALESCE(NULLIF(TRIM(o."sourceChannel"), ''), '(non renseigne)') AS canal,
         (o.status = 'DELIVERED') AS delivered,
         (o.status = 'CANCELLED') AS cancelled,
         (o.status IN ('PENDING', 'CONFIRMED')) AS in_progress,
         (o."paymentStatus" = 'PAID' AND COALESCE(o."paidAmount", 0) > 0) AS paid
  FROM "Order" o
  WHERE o."createdAt" >= :'start_date'::date
    AND o."createdAt" <  :'end_date'::date
)
SELECT canal,
       COUNT(*) AS posees,
       COUNT(*) FILTER (WHERE delivered) AS livrees,
       COUNT(*) FILTER (WHERE paid) AS payees,
       COUNT(*) FILTER (WHERE cancelled) AS annulees,
       COUNT(*) FILTER (WHERE in_progress) AS en_cours,
       COUNT(*) FILTER (WHERE delivered OR cancelled) AS resolues,
       ROUND((100.0 * COUNT(*) FILTER (WHERE delivered)
              / NULLIF(COUNT(*) FILTER (WHERE delivered OR cancelled), 0))::numeric, 1) AS taux_livraison_resolues_pct,
       ROUND((100.0 * COUNT(*) FILTER (WHERE cancelled)
              / NULLIF(COUNT(*) FILTER (WHERE delivered OR cancelled), 0))::numeric, 1) AS taux_annulation_resolues_pct,
       ROUND((100.0 * COUNT(*) FILTER (WHERE paid)
              / NULLIF(COUNT(*) FILTER (WHERE delivered), 0))::numeric, 1) AS taux_paiement_sur_livrees_pct,
       ROUND(AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "createdAt")) / 86400)
             FILTER (WHERE delivered)::numeric, 2) AS delai_moyen_livraison_j,
       ROUND(AVG(revenue) FILTER (WHERE delivered)::numeric, 2) AS panier_moyen_livre,
       ROUND(SUM(revenue) FILTER (WHERE delivered)::numeric, 2) AS ca_produits_livre,
       ROUND(SUM(COALESCE("finalProfit", "estimatedProfit", 0))
             FILTER (WHERE delivered)::numeric, 2) AS marge_contribution,
       ROUND((100.0 * SUM(COALESCE("finalProfit", "estimatedProfit", 0))
              FILTER (WHERE delivered)
              / NULLIF(SUM(revenue) FILTER (WHERE delivered), 0))::numeric, 1) AS marge_pct_ca_produits
FROM base
GROUP BY 1
ORDER BY posees DESC, canal;

-- ============================================================================
-- 6. Categorie sur la periode : CA et marge alloues au prorata des articles
-- ----------------------------------------------------------------------------
-- "productsTotal" peut etre au prix catalogue ; "revenue" est le net encaisse.
-- On alloue donc le revenue et l'encaisse de la commande au prorata de la
-- valeur article, pour que la somme des categories = le total commande.
-- ============================================================================
\echo ''
\echo '=== 6. Categorie : CA, COGS, marge brute et contribution (alloues) ==='
WITH orders AS (
  SELECT o.*,
         (o.status = 'DELIVERED') AS delivered,
         COALESCE(o."actualDeliveryCost", o."estimatedDeliveryCost", 0) AS delivery_cost,
         COALESCE(o."returnOrFailedFees", 0) + COALESCE(o."returnDeliveryFee", 0)
           + COALESCE(o."channelCommission", 0) AS other_costs,
         COALESCE(NULLIF(o."codAmount", 0), NULLIF(o."total", 0), o.revenue) AS cash_base
  FROM "Order" o
  WHERE o."createdAt" >= :'start_date'::date
    AND o."createdAt" <  :'end_date'::date
), items AS (
  SELECT o.id AS order_id,
         o.delivered,
         o.revenue,
         o.cash_base,
         o.delivery_cost,
         o.other_costs,
         p.category,
         oi.quantity,
         COALESCE(oi."unitCost", p."costPrice", 0) * oi.quantity AS cogs,
         oi.price * oi.quantity AS item_value,
         SUM(oi.price * oi.quantity) OVER (PARTITION BY o.id) AS order_item_value
  FROM orders o
  JOIN "OrderItem" oi ON oi."orderId" = o.id
  LEFT JOIN "Product" p ON p.id = oi."productId"
)
SELECT COALESCE(category, '(inconnue)') AS categorie,
       COUNT(DISTINCT order_id) FILTER (WHERE delivered) AS commandes_livrees,
       SUM(quantity) FILTER (WHERE delivered) AS unites_livrees,
       ROUND(SUM(revenue * item_value / NULLIF(order_item_value, 0))
             FILTER (WHERE delivered)::numeric, 2) AS ca_produits_alloue,
       ROUND(SUM(cogs) FILTER (WHERE delivered)::numeric, 2) AS cogs,
       ROUND(SUM(revenue * item_value / NULLIF(order_item_value, 0) - cogs)
             FILTER (WHERE delivered)::numeric, 2) AS marge_brute,
       ROUND((100.0 * SUM(revenue * item_value / NULLIF(order_item_value, 0) - cogs)
              FILTER (WHERE delivered)
              / NULLIF(SUM(revenue * item_value / NULLIF(order_item_value, 0))
                       FILTER (WHERE delivered), 0))::numeric, 1) AS marge_brute_pct,
       ROUND(SUM(cash_base * item_value / NULLIF(order_item_value, 0) - cogs
                 - delivery_cost * item_value / NULLIF(order_item_value, 0)
                 - other_costs * item_value / NULLIF(order_item_value, 0))
             FILTER (WHERE delivered)::numeric, 2) AS marge_contribution
FROM items
GROUP BY 1
ORDER BY ca_produits_alloue DESC NULLS LAST;

-- ============================================================================
-- 7. Produit sur la periode : volumes, taux de livraison, marge allouee
-- ============================================================================
\echo ''
\echo '=== 7. Produit : commandes, taux de livraison, CA, marge (alloues) ==='
WITH orders AS (
  SELECT o.*,
         (o.status = 'DELIVERED') AS delivered,
         (o.status = 'CANCELLED') AS cancelled,
         (o.status IN ('PENDING', 'CONFIRMED')) AS in_progress,
         COALESCE(o."actualDeliveryCost", o."estimatedDeliveryCost", 0) AS delivery_cost,
         COALESCE(o."returnOrFailedFees", 0) + COALESCE(o."returnDeliveryFee", 0)
           + COALESCE(o."channelCommission", 0) AS other_costs,
         COALESCE(NULLIF(o."codAmount", 0), NULLIF(o."total", 0), o.revenue) AS cash_base
  FROM "Order" o
  WHERE o."createdAt" >= :'start_date'::date
    AND o."createdAt" <  :'end_date'::date
), items AS (
  SELECT o.id AS order_id,
         o.delivered,
         o.cancelled,
         o.in_progress,
         o.revenue,
         o.cash_base,
         o.delivery_cost,
         o.other_costs,
         oi."productId",
         p.name AS product_name,
         oi.quantity,
         COALESCE(oi."unitCost", p."costPrice", 0) * oi.quantity AS cogs,
         oi.price * oi.quantity AS item_value,
         SUM(oi.price * oi.quantity) OVER (PARTITION BY o.id) AS order_item_value
  FROM orders o
  JOIN "OrderItem" oi ON oi."orderId" = o.id
  LEFT JOIN "Product" p ON p.id = oi."productId"
)
SELECT COALESCE(product_name, 'Produit #' || "productId") AS produit,
       COUNT(DISTINCT order_id) FILTER (WHERE delivered OR cancelled) AS commandes_resolues,
       COUNT(DISTINCT order_id) FILTER (WHERE delivered) AS commandes_livrees,
       COUNT(DISTINCT order_id) FILTER (WHERE cancelled) AS commandes_annulees,
       COUNT(DISTINCT order_id) FILTER (WHERE in_progress) AS commandes_en_cours,
       SUM(quantity) FILTER (WHERE delivered) AS unites_livrees,
       ROUND((100.0 * COUNT(DISTINCT order_id) FILTER (WHERE delivered)
              / NULLIF(COUNT(DISTINCT order_id) FILTER (WHERE delivered OR cancelled), 0))::numeric, 1) AS taux_livraison_resolues_pct,
       ROUND(SUM(revenue * item_value / NULLIF(order_item_value, 0))
             FILTER (WHERE delivered)::numeric, 2) AS ca_produits_alloue,
       ROUND(SUM(cogs) FILTER (WHERE delivered)::numeric, 2) AS cogs,
       ROUND(SUM(revenue * item_value / NULLIF(order_item_value, 0) - cogs)
             FILTER (WHERE delivered)::numeric, 2) AS marge_brute,
       ROUND((100.0 * SUM(revenue * item_value / NULLIF(order_item_value, 0) - cogs)
              FILTER (WHERE delivered)
              / NULLIF(SUM(revenue * item_value / NULLIF(order_item_value, 0))
                       FILTER (WHERE delivered), 0))::numeric, 1) AS marge_brute_pct,
       ROUND(SUM(cash_base * item_value / NULLIF(order_item_value, 0) - cogs
                 - delivery_cost * item_value / NULLIF(order_item_value, 0)
                 - other_costs * item_value / NULLIF(order_item_value, 0))
             FILTER (WHERE delivered)::numeric, 2) AS marge_contribution
FROM items
GROUP BY "productId", product_name
ORDER BY commandes_livrees DESC, ca_produits_alloue DESC NULLS LAST;

-- ============================================================================
-- 8. Decomposition de la marge de contribution (livrees de la periode)
-- ============================================================================
\echo ''
\echo '=== 8. Marge de contribution : chaque terme, et reconciliation BOS ==='
WITH orders AS (
  SELECT o.*,
         COALESCE(NULLIF(o."codAmount", 0), NULLIF(o."total", 0), o.revenue) AS cash_base,
         COALESCE(o."actualDeliveryCost", o."estimatedDeliveryCost", 0) AS delivery_cost,
         (SELECT COALESCE(SUM(COALESCE(oi."unitCost", p."costPrice", 0) * oi.quantity), 0)
          FROM "OrderItem" oi
          LEFT JOIN "Product" p ON p.id = oi."productId"
          WHERE oi."orderId" = o.id) AS cogs
  FROM "Order" o
  WHERE o."createdAt" >= :'start_date'::date
    AND o."createdAt" <  :'end_date'::date
    AND o.status = 'DELIVERED'
)
SELECT COUNT(*) AS livrees,
       ROUND(SUM(revenue)::numeric, 2) AS ca_produits,
       ROUND(SUM("deliveryFeeCharged")::numeric, 2) AS livraison_facturee,
       ROUND(SUM(cash_base)::numeric, 2) AS encaisse_theorique,
       ROUND(SUM(cogs)::numeric, 2) AS cogs,
       ROUND(SUM(delivery_cost)::numeric, 2) AS livraison_reelle,
       ROUND(SUM(COALESCE("actualDeliveryCost", 0))::numeric, 2) AS livraison_reelle_actual_seule,
       ROUND(SUM(COALESCE("returnOrFailedFees", 0) + COALESCE("returnDeliveryFee", 0))::numeric, 2) AS retours,
       ROUND(SUM(COALESCE("channelCommission", 0))::numeric, 2) AS commissions,
       ROUND(SUM(cash_base - cogs - delivery_cost
                 - COALESCE("returnOrFailedFees", 0) - COALESCE("returnDeliveryFee", 0)
                 - COALESCE("channelCommission", 0))::numeric, 2) AS marge_calculee,
       ROUND(SUM(COALESCE("finalProfit", "estimatedProfit", 0))::numeric, 2) AS marge_bos,
       COUNT(*) FILTER (WHERE "actualDeliveryCost" IS NULL) AS cout_reel_livraison_manquant,
       COUNT(*) FILTER (WHERE NOT ("paymentStatus" = 'PAID' AND COALESCE("paidAmount", 0) > 0)) AS livrees_non_marquees_payees,
       COUNT(*) FILTER (WHERE "senditStatus" IS NULL) AS sans_statut_sendit
FROM orders;

-- ============================================================================
-- 9. Qualite data : remplissage UTM / canal / campagne, doublons
-- ============================================================================
\echo ''
\echo '=== 9a. Remplissage des champs (periode) ==='
SELECT COUNT(*) AS commandes,
       COUNT(*) FILTER (WHERE NULLIF(TRIM("sourceChannel"), '') IS NULL) AS canal_manquant,
       COUNT(*) FILTER (WHERE NULLIF(TRIM("utmSource"), '') IS NULL) AS utm_source_manquant,
       COUNT(*) FILTER (WHERE NULLIF(TRIM("utmMedium"), '') IS NULL) AS utm_medium_manquant,
       COUNT(*) FILTER (WHERE NULLIF(TRIM("utmCampaign"), '') IS NULL) AS utm_campaign_manquant,
       COUNT(*) FILTER (WHERE "campaignId" IS NULL) AS campaign_id_manquant,
       COUNT(*) FILTER (WHERE NULLIF(TRIM("deliveryCity"), '') IS NULL) AS ville_manquante
FROM "Order"
WHERE "createdAt" >= :'start_date'::date
  AND "createdAt" <  :'end_date'::date;

\echo ''
\echo '=== 9b. Doublons suspects (meme telephone, meme total, < 48 h) ==='
SELECT a.id AS commande_1,
       b.id AS commande_2,
       a."deliveryPhone" AS telephone,
       a.total AS total,
       a."createdAt"::date AS date_1,
       b."createdAt"::date AS date_2
FROM "Order" a
JOIN "Order" b
  ON b.id > a.id
 AND REGEXP_REPLACE(a."deliveryPhone", '[^0-9]', '', 'g')
   = REGEXP_REPLACE(b."deliveryPhone", '[^0-9]', '', 'g')
 AND a.total = b.total
 AND ABS(EXTRACT(EPOCH FROM (b."createdAt" - a."createdAt")) / 3600) < 48
WHERE a."createdAt" >= :'start_date'::date
  AND a."createdAt" <  :'end_date'::date
  AND b."createdAt" >= :'start_date'::date
  AND b."createdAt" <  :'end_date'::date
ORDER BY a.id;

\echo ''
\echo '=== 9c. Remplissage des champs (90 jours) ==='
SELECT COUNT(*) AS commandes,
       COUNT(*) FILTER (WHERE NULLIF(TRIM("sourceChannel"), '') IS NULL) AS canal_manquant,
       COUNT(*) FILTER (WHERE NULLIF(TRIM("utmSource"), '') IS NULL) AS utm_source_manquant,
       COUNT(*) FILTER (WHERE NULLIF(TRIM("utmMedium"), '') IS NULL) AS utm_medium_manquant,
       COUNT(*) FILTER (WHERE NULLIF(TRIM("utmCampaign"), '') IS NULL) AS utm_campaign_manquant,
       COUNT(*) FILTER (WHERE "campaignId" IS NULL) AS campaign_id_manquant,
       COUNT(*) FILTER (WHERE NULLIF(TRIM("deliveryCity"), '') IS NULL) AS ville_manquante
FROM "Order"
WHERE "createdAt" >= :'end_date'::date - 90
  AND "createdAt" <  :'end_date'::date;

-- ============================================================================
-- 10. Contexte 90 jours : canal, ville, motifs d'annulation, historique mensuel
-- ============================================================================
\echo ''
\echo '=== 10a. 90 jours par canal ==='
WITH base AS (
  SELECT o.*,
         COALESCE(NULLIF(TRIM(o."sourceChannel"), ''), '(non renseigne)') AS canal,
         (o.status = 'DELIVERED') AS delivered,
         (o.status = 'CANCELLED') AS cancelled,
         (o.status IN ('PENDING', 'CONFIRMED')) AS in_progress
  FROM "Order" o
  WHERE o."createdAt" >= :'end_date'::date - 90
    AND o."createdAt" <  :'end_date'::date
)
SELECT canal,
       COUNT(*) AS posees,
       COUNT(*) FILTER (WHERE delivered) AS livrees,
       COUNT(*) FILTER (WHERE cancelled) AS annulees,
       COUNT(*) FILTER (WHERE in_progress) AS en_cours,
       ROUND((100.0 * COUNT(*) FILTER (WHERE delivered)
              / NULLIF(COUNT(*) FILTER (WHERE delivered OR cancelled), 0))::numeric, 1) AS taux_livraison_resolues_pct,
       ROUND((100.0 * COUNT(*) FILTER (WHERE cancelled)
              / NULLIF(COUNT(*) FILTER (WHERE delivered OR cancelled), 0))::numeric, 1) AS taux_annulation_resolues_pct,
       ROUND(SUM(revenue) FILTER (WHERE delivered)::numeric, 2) AS ca_produits_livre,
       ROUND(SUM(COALESCE("finalProfit", "estimatedProfit", 0))
             FILTER (WHERE delivered)::numeric, 2) AS marge_contribution
FROM base
GROUP BY 1
ORDER BY posees DESC, canal;

\echo ''
\echo '=== 10b. 90 jours par ville (villes avec >= 2 commandes resolues) ==='
WITH base AS (
  SELECT o.*,
         CASE
           WHEN LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", ''), '\s+', ' ', 'g')) LIKE 'casablanca%' THEN 'Casablanca'
           WHEN LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", ''), '\s+', ' ', 'g')) IN ('kenitra', 'kénitra') THEN 'Kenitra'
           WHEN LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", ''), '\s+', ' ', 'g')) IN ('temara', 'témara') THEN 'Temara'
           WHEN LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", ''), '\s+', ' ', 'g')) IN ('larache', 'laarache') THEN 'Larache'
           WHEN LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", ''), '\s+', ' ', 'g')) IN ('fes', 'fès') THEN 'Fes'
           ELSE INITCAP(LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", '(non renseignee)'), '\s+', ' ', 'g')))
         END AS ville,
         (o.status = 'DELIVERED') AS delivered,
         (o.status = 'CANCELLED') AS cancelled,
         (o.status IN ('PENDING', 'CONFIRMED')) AS in_progress
  FROM "Order" o
  WHERE o."createdAt" >= :'end_date'::date - 90
    AND o."createdAt" <  :'end_date'::date
)
SELECT ville,
       COUNT(*) AS posees,
       COUNT(*) FILTER (WHERE delivered) AS livrees,
       COUNT(*) FILTER (WHERE cancelled) AS annulees,
       COUNT(*) FILTER (WHERE in_progress) AS en_cours,
       ROUND((100.0 * COUNT(*) FILTER (WHERE delivered)
              / NULLIF(COUNT(*) FILTER (WHERE delivered OR cancelled), 0))::numeric, 1) AS taux_livraison_resolues_pct,
       ROUND((100.0 * COUNT(*) FILTER (WHERE cancelled)
              / NULLIF(COUNT(*) FILTER (WHERE delivered OR cancelled), 0))::numeric, 1) AS taux_annulation_resolues_pct,
       ROUND(AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "createdAt")) / 86400)
             FILTER (WHERE delivered)::numeric, 2) AS delai_moyen_livraison_j
FROM base
GROUP BY 1
HAVING COUNT(*) FILTER (WHERE delivered OR cancelled) >= 2
ORDER BY taux_annulation_resolues_pct DESC NULLS LAST, posees DESC;

\echo ''
\echo '=== 10c. 90 jours : motifs d''annulation (statut Sendit) ==='
SELECT COALESCE(UPPER("senditStatus"), '(null)') AS statut_sendit,
       COUNT(*) AS commandes,
       ROUND(SUM(total)::numeric, 2) AS valeur_postee
FROM "Order"
WHERE "createdAt" >= :'end_date'::date - 90
  AND "createdAt" <  :'end_date'::date
  AND status = 'CANCELLED'
GROUP BY 1
ORDER BY commandes DESC, statut_sendit;

\echo ''
\echo '=== 10d. Historique mensuel toutes periodes (contexte) ==='
SELECT date_trunc('month', "createdAt")::date AS mois,
       COUNT(*) AS posees,
       COUNT(*) FILTER (WHERE status = 'DELIVERED') AS livrees,
       COUNT(*) FILTER (WHERE status = 'CANCELLED') AS annulees,
       ROUND((100.0 * COUNT(*) FILTER (WHERE status = 'DELIVERED')
              / NULLIF(COUNT(*) FILTER (WHERE status IN ('DELIVERED', 'CANCELLED')), 0))::numeric, 1) AS taux_livraison_resolues_pct,
       ROUND((100.0 * COUNT(*) FILTER (WHERE status = 'CANCELLED')
              / NULLIF(COUNT(*) FILTER (WHERE status IN ('DELIVERED', 'CANCELLED')), 0))::numeric, 1) AS taux_annulation_resolues_pct,
       ROUND(SUM(revenue) FILTER (WHERE status = 'DELIVERED')::numeric, 2) AS ca_produits_livre,
       ROUND(SUM(COALESCE("finalProfit", "estimatedProfit", 0))
             FILTER (WHERE status = 'DELIVERED')::numeric, 2) AS marge_contribution,
       ROUND((100.0 * SUM(COALESCE("finalProfit", "estimatedProfit", 0))
              FILTER (WHERE status = 'DELIVERED')
              / NULLIF(SUM(revenue) FILTER (WHERE status = 'DELIVERED'), 0))::numeric, 1) AS marge_pct
FROM "Order"
GROUP BY 1
ORDER BY 1;

\echo ''
\echo '=== 10e. Toutes periodes par canal (structure) ==='
SELECT COALESCE(NULLIF(TRIM("sourceChannel"), ''), '(non renseigne)') AS canal,
       COUNT(*) AS posees,
       COUNT(*) FILTER (WHERE status = 'DELIVERED') AS livrees,
       COUNT(*) FILTER (WHERE status = 'CANCELLED') AS annulees,
       COUNT(*) FILTER (WHERE status IN ('PENDING', 'CONFIRMED')) AS en_cours,
       ROUND((100.0 * COUNT(*) FILTER (WHERE status = 'DELIVERED')
              / NULLIF(COUNT(*) FILTER (WHERE status IN ('DELIVERED', 'CANCELLED')), 0))::numeric, 1) AS taux_livraison_resolues_pct,
       ROUND((100.0 * COUNT(*) FILTER (WHERE status = 'CANCELLED')
              / NULLIF(COUNT(*) FILTER (WHERE status IN ('DELIVERED', 'CANCELLED')), 0))::numeric, 1) AS taux_annulation_resolues_pct
FROM "Order"
GROUP BY 1
ORDER BY posees DESC, canal;

\echo ''
\echo '=== 10f. 90 jours : synthese globale ==='
WITH base AS (
  SELECT o.*,
         (o.status = 'DELIVERED') AS delivered,
         (o.status = 'CANCELLED') AS cancelled,
         (o.status IN ('PENDING', 'CONFIRMED')) AS in_progress,
         (o."paymentStatus" = 'PAID' AND COALESCE(o."paidAmount", 0) > 0) AS paid
  FROM "Order" o
  WHERE o."createdAt" >= :'end_date'::date - 90
    AND o."createdAt" <  :'end_date'::date
)
SELECT COUNT(*) AS posees,
       COUNT(*) FILTER (WHERE delivered) AS livrees,
       COUNT(*) FILTER (WHERE paid) AS payees,
       COUNT(*) FILTER (WHERE cancelled) AS annulees,
       COUNT(*) FILTER (WHERE in_progress) AS en_cours,
       ROUND((100.0 * COUNT(*) FILTER (WHERE delivered)
              / NULLIF(COUNT(*) FILTER (WHERE delivered OR cancelled), 0))::numeric, 1) AS taux_livraison_resolues_pct,
       ROUND((100.0 * COUNT(*) FILTER (WHERE cancelled)
              / NULLIF(COUNT(*) FILTER (WHERE delivered OR cancelled), 0))::numeric, 1) AS taux_annulation_resolues_pct,
       ROUND((100.0 * COUNT(*) FILTER (WHERE paid)
              / NULLIF(COUNT(*) FILTER (WHERE delivered), 0))::numeric, 1) AS taux_paiement_sur_livrees_pct,
       ROUND(AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "createdAt")) / 86400)
             FILTER (WHERE delivered)::numeric, 2) AS delai_moyen_livraison_j,
       ROUND(SUM(revenue) FILTER (WHERE delivered)::numeric, 2) AS ca_produits_livre,
       ROUND(SUM(COALESCE("finalProfit", "estimatedProfit", 0))
             FILTER (WHERE delivered)::numeric, 2) AS marge_contribution
FROM base;

-- ============================================================================
-- 11. Alertes anomalies
-- ============================================================================
\echo ''
\echo '=== 11a. 90 jours : commandes a marge faible ou negative ==='
WITH orders AS (
  SELECT o.*,
         COALESCE(o."finalProfit", o."estimatedProfit", 0) AS marge,
         COALESCE(o."actualDeliveryCost", o."estimatedDeliveryCost", 0) AS delivery_cost,
         (SELECT COALESCE(SUM(COALESCE(oi."unitCost", p."costPrice", 0) * oi.quantity), 0)
          FROM "OrderItem" oi
          LEFT JOIN "Product" p ON p.id = oi."productId"
          WHERE oi."orderId" = o.id) AS cogs
  FROM "Order" o
  WHERE o."createdAt" >= :'end_date'::date - 90
    AND o."createdAt" <  :'end_date'::date
    AND o.status = 'DELIVERED'
)
SELECT id,
       "orderNumber",
       "deliveryCity" AS ville,
       "sourceChannel" AS canal,
       ROUND(revenue::numeric, 2) AS ca_produits,
       ROUND(cogs::numeric, 2) AS cogs,
       ROUND(delivery_cost::numeric, 2) AS livraison_reelle,
       ROUND(marge::numeric, 2) AS marge,
       ROUND((100.0 * marge / NULLIF(revenue, 0))::numeric, 1) AS marge_pct,
       ROUND((revenue - cogs - delivery_cost)::numeric, 2) AS marge_apres_livraison
FROM orders
WHERE marge < 0
   OR (revenue - cogs - delivery_cost) < 0
   OR (100.0 * marge / NULLIF(revenue, 0)) < 20
ORDER BY marge_pct NULLS LAST;

\echo ''
\echo '=== 11b. 90 jours : villes a taux d''annulation >= 20 % (>= 3 resolues) ==='
WITH base AS (
  SELECT o.*,
         CASE
           WHEN LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", ''), '\s+', ' ', 'g')) LIKE 'casablanca%' THEN 'Casablanca'
           WHEN LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", ''), '\s+', ' ', 'g')) IN ('kenitra', 'kénitra') THEN 'Kenitra'
           WHEN LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", ''), '\s+', ' ', 'g')) IN ('temara', 'témara') THEN 'Temara'
           WHEN LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", ''), '\s+', ' ', 'g')) IN ('larache', 'laarache') THEN 'Larache'
           WHEN LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", ''), '\s+', ' ', 'g')) IN ('fes', 'fès') THEN 'Fes'
           ELSE INITCAP(LOWER(REGEXP_REPLACE(COALESCE(o."deliveryCity", '(non renseignee)'), '\s+', ' ', 'g')))
         END AS ville,
         (o.status = 'DELIVERED') AS delivered,
         (o.status = 'CANCELLED') AS cancelled
  FROM "Order" o
  WHERE o."createdAt" >= :'end_date'::date - 90
    AND o."createdAt" <  :'end_date'::date
)
SELECT ville,
       COUNT(*) FILTER (WHERE delivered OR cancelled) AS resolues,
       COUNT(*) FILTER (WHERE cancelled) AS annulees,
       ROUND((100.0 * COUNT(*) FILTER (WHERE cancelled)
              / NULLIF(COUNT(*) FILTER (WHERE delivered OR cancelled), 0))::numeric, 1) AS taux_annulation_pct
FROM base
GROUP BY 1
HAVING COUNT(*) FILTER (WHERE delivered OR cancelled) >= 3
   AND (100.0 * COUNT(*) FILTER (WHERE cancelled)
        / NULLIF(COUNT(*) FILTER (WHERE delivered OR cancelled), 0)) >= 20
ORDER BY taux_annulation_pct DESC, resolues DESC;

\echo ''
\echo '=== 11c. 90 jours : livrees non payees ou sans cout reel ==='
SELECT COUNT(*) AS livrees_90j,
       COUNT(*) FILTER (WHERE NOT ("paymentStatus" = 'PAID' AND COALESCE("paidAmount", 0) > 0)) AS livrees_non_payees,
       COUNT(*) FILTER (WHERE "actualDeliveryCost" IS NULL) AS sans_cout_reel_livraison,
       ROUND(SUM(revenue) FILTER (WHERE NOT ("paymentStatus" = 'PAID' AND COALESCE("paidAmount", 0) > 0))::numeric, 2) AS ca_non_verifie_paye
FROM "Order"
WHERE "createdAt" >= :'end_date'::date - 90
  AND "createdAt" <  :'end_date'::date
  AND status = 'DELIVERED';

COMMIT;
