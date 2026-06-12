# Deployment

Current as of 2026-06-08.

## Production

- Domain: `https://ops.shinecosmetics.ma`
- Platform: Vercel
- Expected branch: `main`
- App port: Next/Vercel managed in production; local `start` uses port `3001`

## Required Vercel Environment Variables

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="https://ops.shinecosmetics.ma"
SENDIT_PUBLIC_KEY="..."
SENDIT_PRIVATE_KEY="..."
```

Do not add an order sync webhook secret for BOS order creation. BOS and the storefront share the same database; webhook order creation is disabled to prevent duplicates.

## Pre-Deploy Checks

Run locally before pushing to the production branch:

```bash
npm run type-check
npm run lint
npm run build
```

## Deploy

```bash
git push origin main
```

Vercel will install dependencies, build the Next.js app, and deploy `ops.shinecosmetics.ma`.

## Production Smoke Test

- Sign in as an allowed founder.
- Confirm the dashboard loads or shows a controlled retry state.
- Open `/orders` and confirm search/filter/pagination controls respond.
- Create a test/manual order only if it is safe for the live database.
- Confirm Sendit shipment creation only on a real order that should be sent.
- Check `/campaigns/new` and `/events/new` creation redirects in a safe workflow.

## Rollback

Use Vercel's deployment history to promote the last known good deployment. Do not restore webhook order creation as a rollback path; it can duplicate orders because both apps share the same database.
