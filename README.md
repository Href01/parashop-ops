# Shine Cosmetics BOS

Internal Business Operating System for Shine Cosmetics founders. It manages orders, products, inventory, customers, campaigns, events, content planning, work priorities, and dashboard analytics for `ops.shinecosmetics.ma`.

## Current State

Last updated: 2026-06-08

- Production: https://ops.shinecosmetics.ma
- Main storefront: https://shinecosmetics.ma
- Runtime: Next.js 16, React 19, raw SQL via `pg`, Neon PostgreSQL
- Auth: NextAuth credentials provider, restricted to the two founder emails in `lib/auth.ts`
- Data sync: storefront and BOS share the same database; order webhook creation is intentionally disabled to avoid duplicate orders
- Dev port: `3001`

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3001`.

Create `.env.local`:

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3001"
SENDIT_PUBLIC_KEY="..."
SENDIT_PRIVATE_KEY="..."
```

Database migrations are raw SQL files in `migrations/`. Apply them manually with `psql` when needed:

```bash
psql "$DATABASE_URL" -f migrations/001_add_bos_tables.sql
```

## Commands

```bash
npm run dev         # local server on port 3001
npm run type-check  # TypeScript validation
npm run lint        # ESLint, with legacy backlog surfaced as warnings
npm run build       # production build check
```

## Architecture Notes

- Clean app URLs are used: `/orders`, `/products`, `/campaigns`, not `/ops/orders`.
- API routes live under `/api/ops/*`.
- `schema.prisma` may exist for migration history, but the app does not use Prisma Client.
- Order creation and updates use raw SQL plus validation in `lib/validation/order.ts`.
- Sendit shipment creation uses `lib/sendit.ts`; COD amount is centralized in `calculateCodAmount()`.
- Website order webhook sync is disabled at `/api/webhooks/orders` with HTTP 410 because both apps see the same `Order` table.

## Fixed In The 2026-06-08 Pass

- Hardened founder-only access on high-risk order/shipping routes and protected major app sections with authenticated layouts.
- Fixed Sendit COD handling so blank or missing payment methods default to collecting the order total.
- Removed the webhook secret bypass from BOS order creation.
- Disabled duplicate-prone website order webhook creation.
- Added `/api/ops/orders/sync-sendit` for manual Sendit status refresh.
- Fixed campaign/event create redirects by returning top-level IDs from the APIs.
- Whitelisted campaign/event sort columns to prevent unsafe SQL interpolation.
- Restored lint tooling for the current Next.js version.
- Made Orders search/status/date filters and pagination functional.
- Made Products pagination functional and connected row actions to cost editing.

## Still Missing / Improvement Plan

- Normalize every `/api/ops/*` route onto the shared `getOpsSession()` founder guard.
- Replace placeholder alerts in Content Hub, Work Hub, Inventory stock adjustment, and Customer creation with real flows.
- Add dashboard global search, notifications, and user menu behavior.
- Add proper product row action menus or product detail pages.
- Add tests for Sendit payloads, order creation, order updates, campaign/event creation, and dashboard data fallbacks.
- Reduce ESLint warnings by fixing legacy `any`, React hook purity/immutability, and unescaped text issues.
- Add production monitoring around dashboard stats and Sendit sync failures.

## Key Docs

- `docs/PROJECT_OVERVIEW.md` - system architecture and major lessons learned
- `docs/DEVELOPMENT.md` - local development workflow
- `docs/API.md` - API shape
- `docs/RECENT_BUGS.md` - critical bugs and prevention notes
- `BROKEN_BUTTONS_AUDIT.md` - current UI gap audit
