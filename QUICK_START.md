# Quick Start

Current as of 2026-06-08.

## Local Run

```bash
cd C:\Users\AchrafMekouar\Desktop\parashop-ops
npm install
npm run dev
```

Open `http://localhost:3001`.

## Required Environment

Create `.env.local`:

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3001"
SENDIT_PUBLIC_KEY="..."
SENDIT_PRIVATE_KEY="..."
```

## Verify Before Deploy

```bash
npm run type-check
npm run lint
npm run build
```

## Current Notes

- BOS and the storefront share the same database; do not enable order-copy webhooks.
- `/api/webhooks/orders` is intentionally disabled with HTTP 410.
- Founder access is enforced through NextAuth credentials and `lib/auth.ts`.
- Dev server runs on port `3001`.
