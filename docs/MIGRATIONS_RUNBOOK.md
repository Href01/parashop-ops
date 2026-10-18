# Runbook migrations & release — Shine Cosmetics

**Statut :** procédure préparée, à exécuter par **Achraf uniquement**.
**Dernière mise à jour :** 2026-10-18.
**Règle absolue :** aucune migration ni aucun déploiement n'est lancé par un
agent. Ce document prépare, vérifie et fournit les commandes exactes.

---

## 1. Topologie à retenir

`parashop` (site) et `parashop-ops` (BOS) sont deux déploiements Vercel
distincts sur **une seule base Neon partagée**.

| Élément | Propriétaire | Suivi |
|---|---|---|
| Schéma de base (tables `Product`, `Order`, `Homepage*`, …) | `parashop/prisma/migrations/` | table `_prisma_migrations` |
| SQL additif hors Prisma (`migrations/*.sql`) | `parashop/migrations/` | **aucun suivi** |
| Schéma BOS (tables `AdCampaign`, `Seo*`, `AppSetting`, triggers stock, …) | `parashop-ops/migrations/` | **aucun suivi** |

Conséquences :

- `npx prisma migrate deploy` ne voit **que** `parashop/prisma/migrations/`.
- Les fichiers `parashop/migrations/*.sql` et **tous** les fichiers
  `parashop-ops/migrations/*.sql` doivent être appliqués à la main, dans l'ordre,
  et vérifiés par requête (aucune table de suivi).
- `prisma migrate dev` est interdit sur la prod (il peut reset). Seul
  `prisma migrate deploy` est autorisé, après répétition sur clone.

---

## 2. Inventaire — site (`parashop`)

### 2.1 Migrations Prisma suivies (20)

Ordre lexicographique = ordre d'application. Les 7 premières sont appliquées
depuis longtemps ; les **13 suivantes** sont à vérifier/appliquer.

```text
20260324135843_init
20260324225239_add_password
20260424_add_flash_deals_brand_features
20260424_add_slider_sponsored
20260428163643_add_performance_indexes
20260428163648_add_performance_indexes
20260507_add_behavioral_analytics_indexes
20260712000000_add_virtual_stock
20260715000000_add_import_unavailable
20260727000000_add_bundles
20260727120000_bundle_stock_sync
20260813000000_add_channel_commission
20260815000000_fix_bot_false_positives
20260818000000_repair_session_bounds
20260907000000_product_meta_title
20260912000000_homepage_studio
20260912010000_inventory_reservation_guards
20260912020000_analytics_schema
20260913000000_page_surface
20260920000000_studio_templates
```

**Écart documentaire à corriger dans les runbooks historiques :** le runbook
`docs/HOMEPAGE_V4B_LAUNCH.md` annonce **12** migrations en attente et s'arrête à
`page_surface`. Il manque `20260920000000_studio_templates` (ajoutée le
2026-09-19), appliquée jusqu'ici hors Prisma par
`node scripts/migrate-studio-templates.mjs --apply`, **sans écriture dans
`_prisma_migrations`**. La séquence réelle à réconcilier est donc de **13**
migrations, `studio_templates` en dernier.

Toutes les 13 sont relisibles sans risque (`IF NOT EXISTS` ou blocs `DO $$`
gardés). `page_surface` contient trois `ADD CONSTRAINT` mais chacun est protégé
par `IF NOT EXISTS (SELECT 1 FROM pg_constraint …)`.

### 2.1bis Constat vérifié sur la prod (lecture seule, 2026-10-18)

Requêtes du §4 exécutées en `SELECT` uniquement :

- `_prisma_migrations` contient **19 lignes** : les 7 premières migrations, les
  11 suivantes jusqu'à `analytics_schema`, plus un essai échoué/annulé de
  `20260507_add_behavioral_analytics_indexes` (ligne `rolled_back_at` non nulle,
  suivie de la ligne réussie — normal, ne pas la nettoyer).
- **`20260913000000_page_surface` n'est pas enregistrée**, mais ses effets sont
  présents : colonnes `HomepageRevision.surface` / `HomepageAuditLog.surface`,
  contrainte `HomepagePublication_surface_check`, index partiels
  `HomepageRevision_surface_draft_key` et `_published_key`.
- **`20260920000000_studio_templates` n'est pas enregistrée**, mais la table
  `StudioTemplate` existe.
- Tous les objets des SQL hors Prisma sont présents : `Post.editorial`,
  `Product.discontinued`, `FlashDeal/Campaign.discountPercent`,
  `AnalyticsSession.userAgent`, `is_bot_user_agent()`, `OrderItemChange`,
  `Order.senditDistrictId`, `OrderAuditLog`.
- `MessageLog.waMessageId` et `MessageLog.mediaId` sont présents.

Conclusion : deux migrations ont été appliquées **hors Prisma**. `prisma
migrate deploy` les rejouera (idempotentes) et les enregistrera. C'est la
réconciliation recommandée, sur clone d'abord.

Index partiels créés par ces migrations (à vérifier explicitement) :

```sql
-- 20260507_add_behavioral_analytics_indexes
idx_event_jsonb_product            -- WHERE props->>'productId' IS NOT NULL
-- 20260601_create_analytics_star_schema
idx_dim_user_current               -- WHERE "isCurrent" = TRUE
idx_dim_page_product               -- WHERE "productId" IS NOT NULL
-- 20260913000000_page_surface
HomepageRevision_surface_draft_key     -- UNIQUE WHERE "status" = 'DRAFT'
HomepageRevision_surface_published_key -- UNIQUE WHERE "status" = 'PUBLISHED'
```

### 2.2 SQL hors Prisma du site (7)

À appliquer **après** les migrations Prisma, dans cet ordre (la fonction bot doit
exister avant la colonne générée) :

```text
1. migrations/add-bot-detection-function.sql      CREATE OR REPLACE FUNCTION  (idempotent)
2. migrations/add-useragent-column.sql            dépend de is_bot_user_agent() (idempotent)
3. migrations/add-discontinued-column.sql         ADD COLUMN IF NOT EXISTS    (idempotent)
4. migrations/add-limited-time-discount.sql       ADD/DROP CONSTRAINT gardés  (idempotent)
5. migrations/add-order-item-change-log.sql       CREATE TABLE IF NOT EXISTS  (idempotent)
6. migrations/20260926_blog_editorial.sql         ADD COLUMN IF NOT EXISTS    (idempotent)
7. migrations/migrate-old-event-names.sql         UPDATE de données           (rejouable)
```

Aucun de ces fichiers n'est enregistré dans `_prisma_migrations`. Vérifier leur
présence avec les requêtes du §4 avant de les rejouer.

`MessageLog` (utilisé par le BOS) n'est pas entièrement décrit par
`schema.prisma`. Vérifier aussi `waMessageId`, `mediaId` et l'index unique
`waMessageId` sur l'environnement cible (cf. `HOMEPAGE_V4B_LAUNCH.md`).

---

## 3. Inventaire — BOS (`parashop-ops`)

**53 fichiers numérotés + 2 fichiers legacy non numérotés (55 au total).** Les numéros `004`
et `009` sont des trous volontaires. Ordre d'application : `001` → `055`, puis
les deux legacy.

```text
001_add_bos_tables.sql
002_add_customers_inventory.sql
003_add_campaigns_events.sql
005_add_sendit_fields.sql
006_add_order_performance_indexes.sql
007_create_event_calculate_function.sql
008_content_multi_products.sql
010_campaign_event_link.sql
011_content_organic_metrics.sql
012_integration_token.sql
013_adcampaign_meta_sync.sql
014_adcampaign_engagement.sql
015_sendit_staging.sql
016_fix_profit_cogs_fallback.sql
017_app_setting.sql
018_profit_includes_charged_delivery.sql
019_sendit_staging_payment_method.sql
020_ad_spend_daily.sql
021_order_capi_delivered.sql
022_profit_nullif_zero.sql
023_revenue_from_paid.sql
024_auto_stock_decrement.sql
025_delivered_at.sql
026_operating_expenses.sql
027_payment_reconciliation.sql
028_sendit_invariants.sql
029_sendit_cash_ledger.sql
030_goal_targets.sql
031_order_returns.sql
032_return_moves.sql
033_price_changes.sql
034_stock_bundle_explosion.sql
035_cost_follows_purchases.sql
036_order_lifecycle_events.sql
037_integration_sync_runs.sql
038_order_creation_integrity.sql
039_sendit_district_cache.sql
040_order_item_stock_delta.sql
041_realtime_heartbeat.sql
042_partner_consignment.sql
043_seo_insights.sql
044_seo_agent.sql
045_seo_agent_changements.sql
046_seo_agent_execution.sql
047_ads_agent.sql
048_ads_creative_images.sql
049_ads_direction_artistique.sql
050_ads_site_etapes_lecons.sql
051_ads_clips_higgsfield.sql
052_ads_direction_discussion.sql
053_ads_credits_higgsfield.sql
054_ads_plan_filme_long.sql
055_order_edit_integrity.sql
add_sendit_district_id.sql      -- legacy, NON idempotent (ADD COLUMN sans IF NOT EXISTS)
add_order_audit_log.sql         -- legacy, NON idempotent (CREATE TABLE/INDEX sans IF NOT EXISTS)
```

Points d'attention sur la séquence :

- **Stock / triggers :** `024` → `034` → `038` → `040` → `055` remplacent
  progressivement les mêmes triggers (`Order`/`OrderItem`). L'ordre est
  obligatoire ; `055` est la version autoritaire. Ne jamais sauter une étape.
- **Sendit :** `015`, `019`, `027`, `028`, `029`, `037`, `039` construisent le
  staging, le ledger COD et les invariants. `039` crée `SenditDistrictCache`.
- **Fonctions :** `007` crée `calculate_event_metrics`, `017` crée `AppSetting`
  (utilisé par `024`/`034`/`038`/`055`), `028` ajoute des contraintes gardées.
- **Legacy :** à exécuter **une seule fois**. `add_sendit_district_id.sql`
  ajoute `Order.senditDistrictId` ; `add_order_audit_log.sql` crée
  `OrderAuditLog`. Les rejouer échoue (objet déjà présent) : c'est attendu.
- `scripts/run-migration.js` exécute le fichier entier en un seul
  `pool.query`, **sans transaction et sans suivi**. En cas d'échec au milieu,
  inspecter l'état avant de rejouer.

Index partiels BOS (à vérifier) :

```sql
idx_product_sku            -- 001, UNIQUE WHERE "sku" IS NOT NULL
idx_adcampaign_external    -- 013, UNIQUE WHERE "externalId" IS NOT NULL
order_returned_at_idx      -- 031, WHERE "returnedAt" IS NOT NULL
Product_partnerId_idx      -- 042, WHERE "partnerId" IS NOT NULL
```

---

## 4. Pré-vol en lecture seule (aucune écriture)

À lancer sur la cible **avant** toute migration. Ne jamais afficher
`DATABASE_URL` dans un log ou un commentaire.

```sql
-- 1. Historique Prisma : noms, état, checksums
SELECT migration_name, finished_at, rolled_back_at, checksum
FROM _prisma_migrations
ORDER BY migration_name;

-- 2. Les 13 migrations attendues sont-elles enregistrées ?
SELECT migration_name
FROM _prisma_migrations
WHERE migration_name IN (
  '20260712000000_add_virtual_stock',
  '20260715000000_add_import_unavailable',
  '20260727000000_add_bundles',
  '20260727120000_bundle_stock_sync',
  '20260813000000_add_channel_commission',
  '20260815000000_fix_bot_false_positives',
  '20260818000000_repair_session_bounds',
  '20260907000000_product_meta_title',
  '20260912000000_homepage_studio',
  '20260912010000_inventory_reservation_guards',
  '20260912020000_analytics_schema',
  '20260913000000_page_surface',
  '20260920000000_studio_templates'
)
ORDER BY migration_name;

-- 3. Présence des objets des migrations hors Prisma / BOS
SELECT
  to_regclass('public."StudioTemplate"')            AS studio_template,
  to_regclass('public."OrderAuditLog"')              AS order_audit_log,
  to_regclass('public."SenditDistrictCache"')        AS sendit_district_cache,
  to_regclass('public."AppSetting"')                 AS app_setting,
  to_regclass('public."IntegrationSyncRun"')         AS integration_sync_run;

SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'Order'            AND column_name = 'senditDistrictId') OR
    (table_name = 'Post'             AND column_name = 'editorial')       OR
    (table_name = 'Product'          AND column_name = 'discontinued')    OR
    (table_name = 'FlashDeal'        AND column_name = 'discountPercent') OR
    (table_name = 'Campaign'         AND column_name = 'discountPercent') OR
    (table_name = 'AnalyticsSession' AND column_name = 'userAgent')
  )
ORDER BY table_name, column_name;

SELECT proname FROM pg_proc WHERE proname = 'is_bot_user_agent';

-- 4. Index partiels réellement présents
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND indexdef ILIKE '% WHERE %'
ORDER BY tablename, indexname;

-- 5. Intégrité des triggers stock (055 doit être la dernière version)
SELECT tgname, pg_get_triggerdef(t.oid) AS def
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal AND c.relname IN ('Order', 'OrderItem')
ORDER BY c.relname, tgname;
```

Interprétation :

- Migration listée + `finished_at` non nul → appliquée.
- Migration listée + `rolled_back_at` non nul → annulée, à rejouer.
- `studio_templates` absent de `_prisma_migrations` mais
  `to_regclass('public."StudioTemplate"')` non nul → appliquée hors Prisma :
  `prisma migrate deploy` la rejouera sans risque (idempotente) et l'enregistrera.
- Objet présent mais migration absente : **ne pas** utiliser
  `prisma migrate resolve` sans avoir comparé la structure réelle au SQL.

---

## 5. Répétition sur clone restauré (obligatoire)

1. **Sauvegarde.** Créer une branche Neon ou un dump vérifié de la prod.
2. **Restaurer** ce dump dans une base jetable. `DATABASE_URL` pointe
   uniquement sur cette base.
3. **Comparer l'historique** : `npx prisma migrate status` dans `parashop`.
   Noter les migrations `pending` et les éventuels écarts de checksum.
4. **Rejouer les 13 migrations Prisma** :
   ```bash
   npx prisma migrate deploy
   ```
   Vérifier que `studio_templates` est bien enregistrée à la fin.
5. **Rejouer les 7 SQL du site** dans l'ordre du §2.2 :
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/add-bot-detection-function.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/add-useragent-column.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/add-discontinued-column.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/add-limited-time-discount.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/add-order-item-change-log.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20260926_blog_editorial.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/migrate-old-event-names.sql
   ```
6. **Rejouer le BOS**, un fichier à la fois, depuis `parashop-ops` :
   ```bash
   node scripts/run-migration.js 001_add_bos_tables.sql
   # … 002 → 055, dans l'ordre exact du §3 …
   node scripts/run-migration.js 055_order_edit_integrity.sql
   node scripts/run-migration.js add_sendit_district_id.sql
   node scripts/run-migration.js add_order_audit_log.sql
   ```
7. **Vérifier** avec les requêtes du §4, puis :
   ```bash
   npx tsc --noEmit
   npm test
   npm run build
   ```
8. **Détruire la base de répétition** après validation.

---

## 6. Procédure production (Achraf uniquement)

Ordre recommandé : **sauvegarde → migrations → déploiement site → déploiement
BOS → smoke tests**.

1. Sauvegarde Neon vérifiée (branche ou dump), horodatée.
2. Sur le commit validé, dans `parashop` :
   ```bash
   npx prisma migrate status
   npx prisma migrate deploy
   ```
3. Appliquer les 7 SQL du site **uniquement si** le §4 montre qu'ils manquent.
4. Dans `parashop-ops`, appliquer les fichiers BOS manquants (le §4 permet de
   savoir lesquels ; ne jamais rejouer les deux legacy).
5. Relancer les requêtes de vérification du §4.
6. Déployer `parashop` (Vercel), puis `parashop-ops`.
7. Smoke tests :
   - site : `/`, une fiche produit, `/marques/<brand>`, `/ar`, checkout.
   - BOS : login, `/orders`, `/inventory`, `/ads`, un cron manuel avec
     `Authorization: Bearer $CRON_SECRET`.
8. Consigner les sorties (migrations appliquées, checksums, index partiels).

---

## 7. Rollback

- **Application :** promouvoir le déploiement Vercel précédent (site ou BOS).
  Les migrations de cette release sont additives : l'ancien code reste
  compatible avec le nouveau schéma.
- **Base :** il n'existe pas de migration descendante. En cas de corruption,
  restaurer la sauvegarde Neon. Ne jamais tenter un `DROP` manuel en prod.
- **Migration interrompue :** `run-migration.js` n'étant pas transactionnel,
  inspecter les objets créés, compléter manuellement le fichier si possible,
  sinon restaurer. Les fichiers `001`–`055` sont idempotents ; les deux legacy
  ne le sont pas.

---

## 8. Risques connus (état au 2026-10-18)

| Risque | Impact | Mitigation |
|---|---|---|
| `studio_templates` appliquée hors `_prisma_migrations` | `migrate deploy` peut la rejouer / historique faux | migration idempotente ; vérifier puis laisser `migrate deploy` l'enregistrer |
| 2 fichiers BOS legacy non idempotents | rejeu = erreur | exécuter une seule fois, vérifier avant |
| `scripts/run-migration.js` sans transaction ni suivi | application partielle possible | un fichier à la fois, clone d'abord |
| `dotenv` non déclaré (avant ce runbook) | `run-migration.js` cassé après un `npm ci` propre | déclaré en `devDependencies` |
| README migrations annonçait `049` | numéro suivant faux | corrigé en `056` |
| Build site exige `RESEND_API_KEY` à l'import | build d'un clone propre impossible sans secret | instanciation paresseuse de Resend |
| `.env.example` BOS incomplet | variables prod oubliées, revalidation silencieuse | template complété |
| Node non épinglé côté BOS | build/tooling divergents | `engines` + `.nvmrc` (24) |
