# Deployment — parashop-ops (BOS)

Current as of 2026-10-18.

## Production

- Domain: `https://ops.shinecosmetics.ma`
- Platform: Vercel
- Expected branch: `main` (Achraf merges; agents never push to `main`)
- Node: **24** locally and on Vercel (`engines: >=22.0.0 <25.0.0`, `.nvmrc`)
- App port: Next/Vercel managed in production; local `start` uses port `3001`
- Database: Neon, **shared with the storefront** (`parashop`)
- Migrations: see [`docs/MIGRATIONS_RUNBOOK.md`](docs/MIGRATIONS_RUNBOOK.md).
  Never run one unattended.

## Required Vercel environment variables

The exhaustive, grouped template is [`.env.example`](.env.example). The
production-critical set is:

```env
# Core
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://ops.shinecosmetics.ma

# Cron + server-to-server
CRON_SECRET=
INTERNAL_API_SECRET=

# Storefront coupling
WEBSITE_URL=https://www.shinecosmetics.ma
STOREFRONT_URL=https://www.shinecosmetics.ma
REVALIDATE_SECRET=

# Sendit
SENDIT_PUBLIC_KEY=
SENDIT_PRIVATE_KEY=
SENDIT_PICKUP_DISTRICT_ID=1

# Meta / Instagram
META_PIXEL_ID=
META_CAPI_TOKEN=
META_ACCESS_TOKEN=
META_GRAPH_VERSION=v21.0
META_APP_ID=
META_APP_SECRET=
META_AD_ACCOUNT_ID=
IG_USER_ID=
IG_ACCESS_TOKEN=

# Google Search Console
GSC_CLIENT_EMAIL=
GSC_PRIVATE_KEY=

# Neon health widget
NEON_API_KEY=
NEON_ORG_ID=
NEON_PROJECT_ID=

# Realtime
NEXT_PUBLIC_REALTIME_URL=
REALTIME_TOKEN=
```

Optional: `GATE_PASSWORD` (shared gate in front of the BOS), `META_CAPI_TEST_CODE`,
`IG_*` Graph overrides, `CLOUDINARY_*` for the local ads capture script.

`SENDIT_API_BASE_URL` is **not** read by the app: the base URL is fixed in
`lib/sendit.ts` (`https://app.sendit.ma/api/v1`).

Do not add an order sync webhook secret for BOS order creation. BOS and the
storefront share the same database; webhook order creation is disabled to prevent
duplicates.

## Pre-Deploy Checks

Run from a clean clone on Node 24, before opening the release PR:

```bash
npm ci
npm run type-check
npm run test:analytics
npm run test:orders
npm run test:seo
npm run lint
npm run build
```

The build must pass **without** any secret in the environment (Vercel supplies
them at runtime, not at build time).

## Deploy

Migrations first (see the runbook), then:

```bash
# Achraf only, after review and approval
git push origin main
```

Vercel installs dependencies, builds the Next.js app and deploys
`ops.shinecosmetics.ma`. Agents never merge, push to `main`, or deploy.

## Production Smoke Test

- Sign in as an allowed founder.
- Confirm the dashboard loads or shows a controlled retry state.
- Open `/orders` and confirm search/filter/pagination controls respond.
- Create a test/manual order only if it is safe for the live database.
- Confirm Sendit shipment creation only on a real order that should be sent.
- Check `/campaigns/new` and `/events/new` creation redirects in a safe workflow.
- Verify a cron manually with `Authorization: Bearer $CRON_SECRET`.

## Rollback

Use Vercel's deployment history to promote the last known good deployment. Do not
restore webhook order creation as a rollback path; it can duplicate orders because
both apps share the same database. Migrations are additive; if the database is
corrupted, restore the Neon backup — there are no down migrations.
