# Checklist de release — hygiène dépôt + migrations

**Date :** 2026-10-18
**Tâche :** HRE-4 — *Release: hygiène du dépôt + runbook migrations exact*
**Règle :** préparation et vérification uniquement. Aucune migration, aucun
déploiement, aucun push sur `main` n'a été exécuté par l'agent.

---

## 1. Branches / PR

| Dépôt | Branche | Contenu |
|---|---|---|
| `parashop-ops` | `chore/release-hygiene` | engines/.nvmrc, `.gitignore`, `.env.example` complet, runbook migrations, CI, docs de déploiement |
| `parashop` | `fix/build-without-secrets` | Resend instancié paresseusement (build sans secret), `.env.example` complété |

---

## 2. Preuves d'exécution

Toutes les commandes ont été lancées sur des **clones propres** (`git clone`),
avec `npm ci`, sans fichier `.env` sauf mention contraire.

### 2.1 `parashop-ops`

| Commande | Résultat |
|---|---|
| `node --version` | `v24.14.0` |
| `npm ci` | 825 packages, exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run test:analytics` | 24/24 pass |
| `npm run test:orders` | 4/4 pass |
| `npm run test:seo` | 45/45 pass |
| `npm run build` (sans `.env`) | exit 0, build complet |
| `npm run lint` | **17 erreurs pré-existantes** (React Compiler), 307 problèmes au total — identiques sur `main` avant changement, aucune régression |

### 2.2 `parashop`

| Commande | Résultat |
|---|---|
| `npm ci` | 601 packages, exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm test` | **459/459 pass** |
| `npx prisma validate` | schéma valide |
| `npm run build` (sans secret) | passe le point de rupture précédent (`RESEND_API_KEY`) ; échoue ensuite sur le téléchargement `next/font/google` (réseau du runner), pas sur un fichier manquant |

Le build du site ne peut pas être validé de bout en bout dans cet environnement :
le runner ne télécharge pas les polices Google au moment du build. À rejouer sur
Vercel/CI. Le correctif Resend est vérifié par `tsc` et par le déplacement de
l'échec (plus aucune erreur « Missing API key » à l'import).

---

## 3. Réconciliation base (lecture seule)

Requêtes `SELECT` uniquement, aucune écriture, aucune migration.

- `_prisma_migrations` : **19 lignes**.
- `20260913000000_page_surface` **absente de l'historique**, mais tous ses
  effets sont présents (colonnes `surface`, contrainte, index partiels).
- `20260920000000_studio_templates` **absente de l'historique**, mais la table
  `StudioTemplate` existe.
- Tous les objets des SQL hors Prisma sont présents (`Post.editorial`,
  `Product.discontinued`, `discountPercent`, `userAgent`,
  `is_bot_user_agent()`, `OrderItemChange`, `Order.senditDistrictId`,
  `OrderAuditLog`, `SenditDistrictCache`, `AppSetting`, `IntegrationSyncRun`).
- `MessageLog.waMessageId` / `mediaId` présents.

**Action de réconciliation :** `npx prisma migrate deploy` rejouera les deux
migrations idempotentes et les enregistrera. À faire sur clone restauré d'abord,
puis en prod par Achraf.

---

## 4. Ce que l'agent a corrigé

### `parashop-ops`

- `engines.node = >=22.0.0 <25.0.0` + `.nvmrc` = `24` (aligné sur le site).
- `.gitignore` : `/scratch/`, `/artifacts/`, `/design/`, `!.env.example`.
- `.env.example` : template complet (Sendit, GSC, Meta, IG, Neon, crons,
  revalidation, realtime, Storefront) sans aucun secret ; suppression de
  `SENDIT_API_BASE_URL` (jamais lu, URL fixe dans `lib/sendit.ts`) ;
  `SENDIT_PICKUP_DISTRICT_ID` documenté.
- `dotenv` déclaré en `devDependencies` (utilisé par `scripts/run-migration.js`
  mais auparavant seulement transitif).
- `migrations/README.md` : prochain numéro `056`, ordre réel, legacy non
  idempotents, limites de `run-migration.js`.
- `docs/MIGRATIONS_RUNBOOK.md` : inventaire complet des deux dépôts, index
  partiels, requêtes de vérification, répétition, procédure prod, rollback.
- `.github/workflows/ci.yml` : Node 24, `npm ci`, type-check, 3 suites de tests,
  build.
- `DEPLOYMENT.md` : Node, variables, migrations, déploiement par Achraf.

### `parashop`

- `lib/email.ts` : `Resend` instancié à la demande (`getResend()`), plus à
  l'import. Le build et les routes n'exigent plus `RESEND_API_KEY` pour être
  évalués.
- `app/api/auth/forgot-password/route.ts` : utilise `getResend()`.
- `.env.example` : ajout de `WHATSAPP_BUSINESS_ID` (requis par
  `lib/whatsapp-templates.ts`) et de `SHINE_V4B_REFERENCE` (script de build).

---

## 5. Commandes exactes de release (Achraf uniquement)

### 5.1 Avant

```bash
# Sauvegarde Neon vérifiée, puis clone jetable
# Dans parashop, sur le commit approuvé :
npx prisma migrate status
npx prisma migrate deploy      # applique page_surface + studio_templates
npx prisma migrate status      # doit afficher "No pending migrations"
```

### 5.2 SQL hors Prisma du site (uniquement si le §4 du runbook montre un manque)

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/add-bot-detection-function.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/add-useragent-column.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/add-discontinued-column.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/add-limited-time-discount.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/add-order-item-change-log.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20260926_blog_editorial.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/migrate-old-event-names.sql
```

### 5.3 BOS

```bash
# Depuis parashop-ops, pour chaque fichier manquant, dans l'ordre exact :
node scripts/run-migration.js 001_add_bos_tables.sql
# … jusqu'à 055_order_edit_integrity.sql
# Ne rejouer les deux legacy que s'ils manquent (non idempotents) :
node scripts/run-migration.js add_sendit_district_id.sql
node scripts/run-migration.js add_order_audit_log.sql
```

### 5.4 Déploiement

```bash
# Après merge sur main par Achraf (Vercel auto-déploie)
# Site d'abord, puis BOS.
```

### 5.5 Vérification post-release

```sql
SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY migration_name;
SELECT tablename, indexname FROM pg_indexes
WHERE schemaname='public' AND indexdef ILIKE '% WHERE %' ORDER BY 1,2;
```

Puis smoke tests du §6 du runbook.

---

## 6. Risques / rollback

- Migrations additives : rollback applicatif = promouvoir le déploiement Vercel
  précédent.
- Pas de down migration : restauration Neon uniquement en cas de corruption.
- `run-migration.js` n'est pas transactionnel : un fichier à la fois, clone
  d'abord.
- Les deux fichiers legacy BOS ne sont pas idempotents.
- Le build du site dépend de ressources réseau (Google Fonts) et de
  `DATABASE_URL` pour les pages prérendues ; le valider sur Vercel/CI.
- `npm run lint` du BOS échoue déjà sur `main` (17 erreurs React Compiler) :
  hors périmètre de cette PR, à traiter séparément.

---

## 7. Suites suggérées

1. Faire passer les 17 erreurs ESLint pré-existantes du BOS, puis ajouter
   `npm run lint` au workflow CI.
2. Ajouter un workflow CI au site (typecheck + tests + build avec secrets
   Vercel disponibles).
3. Ajouter un script de vérification des migrations (numérotation, idempotence)
   pour empêcher un nouveau trou ou une régression d'ordre.
