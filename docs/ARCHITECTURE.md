# BOS Architecture Documentation

**Last Updated**: June 4, 2026

---

## Table of Contents
1. [Tech Stack](#tech-stack)
2. [Design Principles](#design-principles)
3. [Folder Structure](#folder-structure)
4. [Routing & Navigation](#routing--navigation)
5. [Data Flow](#data-flow)
6. [Authentication](#authentication)
7. [Database Strategy](#database-strategy)

---

## Tech Stack

### Frontend
- **Framework**: Next.js 16.2.1 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS
- **State**: React hooks (useState, useEffect)
- **Forms**: Native HTML forms with FormData API

### Backend
- **Runtime**: Node.js 18+
- **API Routes**: Next.js App Router API routes
- **Database**: PostgreSQL (Neon)
- **Database Client**: `pg` (raw SQL - NO ORM)
- **Auth**: NextAuth.js v4

### Deployment
- **Platform**: Vercel
- **Domain**: ops.shinecosmetics.ma
- **CI/CD**: GitHub → Vercel (auto-deploy on push to `main`)

### External Services
- **Database**: Neon PostgreSQL (serverless)
- **Auth Provider**: Google OAuth
- **Delivery API**: Sendit (Morocco)

---

## Design Principles

### 1. **Founders-First**
Built specifically for 2 founders - no multi-tenancy, no roles, no permissions complexity. Just: authenticated vs not authenticated.

### 2. **Shared Database**
BOS and main website (shinecosmetics.ma) share the SAME PostgreSQL database:
- **Orders** table is shared → website creates orders, BOS reads/updates them
- **Products** table is shared → BOS updates cost prices, website shows retail prices
- **Analytics** tables are BOS-specific → tracking, campaigns, content

**Why?** Single source of truth. Website order = BOS order. No sync issues.

### 3. **Raw SQL over ORM**
We use `pg` Pool with raw SQL queries, NOT Prisma Client:

```typescript
// ✅ CORRECT
import { pool } from '@/lib/db'
const result = await pool.query('SELECT * FROM "Order" WHERE id = $1', [orderId])

// ❌ WRONG - Prisma client doesn't exist
import { prisma } from '@/lib/prisma'
await prisma.order.findUnique(...)
```

**Why?**
- Full control over queries
- No ORM overhead
- Easier debugging
- Shared schema with website (which also uses raw SQL)

**`schema.prisma` exists only for migrations** - never generates client code.

### 4. **Clean URLs**
No `/ops` prefix needed since domain is dedicated to BOS:

```
✅ ops.shinecosmetics.ma/orders
✅ ops.shinecosmetics.ma/products
✅ ops.shinecosmetics.ma/campaigns

❌ ops.shinecosmetics.ma/ops/orders (old, removed)
```

### 5. **Type Safety First**
- Never use `any` - use `unknown` + type guards
- All API responses typed
- Strict TypeScript mode enabled
- Type check before EVERY commit: `npx tsc --noEmit`

### 6. **Data Completeness**
Every order/product/campaign has a **completeness score**:
- 0-100% based on required fields
- ⚠️ indicators in UI for missing data
- Helps founders spot data quality issues

---

## Folder Structure

```
parashop-ops/
├── app/                                # Next.js App Router
│   ├── layout.tsx                      # Root HTML wrapper (minimal)
│   ├── page.tsx                        # Dashboard (homepage)
│   │
│   ├── orders/                         # Orders Module
│   │   ├── layout.tsx                  # Orders layout + nav
│   │   ├── page.tsx                    # Orders list
│   │   ├── new/
│   │   │   └── page.tsx                # Create order form
│   │   └── [id]/
│   │       └── page.tsx                # Order detail
│   │
│   ├── products/                       # Products Module (TODO)
│   ├── campaigns/                      # Campaigns Module (TODO)
│   ├── content/                        # Content Hub (TODO)
│   ├── work-hub/                       # Work Hub (TODO)
│   │
│   ├── api/                            # API Routes
│   │   ├── auth/[...nextauth]/         # NextAuth endpoints
│   │   │   └── route.ts
│   │   └── ops/
│   │       └── orders/
│   │           ├── route.ts            # GET /api/ops/orders, POST /api/ops/orders
│   │           └── [id]/
│   │               └── route.ts        # GET/PUT /api/ops/orders/:id
│   │
│   └── globals.css                     # Global styles
│
├── lib/                                # Shared utilities
│   ├── db.ts                           # PostgreSQL Pool connection
│   ├── auth.ts                         # Authentication helpers
│   └── order-utils.ts                  # Order calculations & completeness
│
├── migrations/                         # Database migrations
│   └── 001_add_bos_tables.sql          # Initial BOS tables
│
├── docs/                               # Documentation
│   ├── ARCHITECTURE.md                 # This file
│   ├── DATABASE.md                     # Schema documentation
│   ├── API.md                          # API reference
│   └── DEVELOPMENT.md                  # Dev guide
│
├── public/                             # Static assets
├── .env.local                          # Local environment (gitignored)
├── tsconfig.json                       # TypeScript config
├── tailwind.config.ts                  # Tailwind config
├── next.config.ts                      # Next.js config
└── package.json                        # Dependencies
```

---

## Routing & Navigation

### App Router Structure

```
URL                          File                         Page
─────────────────────────────────────────────────────────────────
/                            app/page.tsx                 Dashboard
/orders                      app/orders/page.tsx          Orders list
/orders/new                  app/orders/new/page.tsx      Create order
/orders/123                  app/orders/[id]/page.tsx     Order detail

/api/ops/orders              app/api/ops/orders/route.ts  Orders API
/api/ops/orders/123          app/api/ops/orders/[id]/route.ts  Order API
```

### Navigation Component

Each module has a **layout.tsx** with shared navigation:

```typescript
// app/orders/layout.tsx
<nav className="flex gap-2">
  <NavLink href="/">📊 Dashboard</NavLink>
  <NavLink href="/orders">📦 Orders</NavLink>
  <NavLink href="/products">🛍️ Products</NavLink>
  <NavLink href="/campaigns">📢 Campaigns</NavLink>
  ...
</nav>
```

**Why emoji icons?** Faster visual recognition, founders love them!

---

## Data Flow

### Order Creation Flow

```
┌─────────────────┐
│ User fills form │
│ /orders/new     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ POST /api/ops/  │
│ orders          │◄──┐
└────────┬────────┘   │
         │            │
         ▼            │
┌─────────────────┐   │
│ 1. Validate     │   │
│ 2. Calculate    │   │
│    delivery fee │   │
│ 3. Generate     │   │
│    order number │   │
└────────┬────────┘   │
         │            │
         ▼            │
┌─────────────────┐   │
│ INSERT into     │   │
│ "Order" table   │   │
└────────┬────────┘   │
         │            │
         ▼            │
┌─────────────────┐   │
│ Create status   │   │
│ history entry   │   │
└────────┬────────┘   │
         │            │
         ▼            │
┌─────────────────┐   │
│ Return order    │───┘
│ with ID         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Redirect to     │
│ /orders/:id     │
└─────────────────┘
```

### Website Order Sync (TODO)

```
┌─────────────────┐
│ Customer orders │
│ on website      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Order created   │
│ in "Order"      │
│ table           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Webhook triggers│
│ POST /api/ops/  │
│ webhooks/orders │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ BOS reads order │
│ Shows in list   │
└─────────────────┘
```

**No webhook yet** - orders created on website already appear in BOS (shared database).

---

## Authentication

### Strategy: Founders-Only Whitelist

```typescript
// lib/auth.ts
const ALLOWED_EMAILS = [
  'mekouar01@gmail.com',
  'marjanhajar20@gmail.com',
]

export async function requireOpsAccess() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.email) {
    redirect('/api/auth/signin?callbackUrl=/')
  }
  
  if (!ALLOWED_EMAILS.includes(session.user.email)) {
    return new Response('Unauthorized - Founders only', { status: 403 })
  }
  
  return session
}
```

### Usage in Pages

```typescript
// app/orders/layout.tsx (Server Component)
export default async function OrdersLayout({ children }) {
  await requireOpsAccess() // Throws redirect if not authenticated
  
  return <div>{children}</div>
}
```

### Usage in API Routes

```typescript
// app/api/ops/orders/route.ts
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // ... handle request
}
```

### OAuth Flow

1. User visits `ops.shinecosmetics.ma`
2. No session → redirect to `/api/auth/signin`
3. User clicks "Sign in with Google"
4. Google OAuth flow
5. Callback to `/api/auth/callback/google`
6. Check email against whitelist
7. If allowed → create session, redirect to `/`
8. If not → show 403 error

---

## Database Strategy

### Connection Management

```typescript
// lib/db.ts
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

export default pool
```

**Serverless-friendly**: Pool connections are reused across requests in Vercel's Node.js runtime.

### Query Pattern

```typescript
// Parameterized queries (prevent SQL injection)
const result = await pool.query(
  'SELECT * FROM "Order" WHERE id = $1 AND status = $2',
  [orderId, 'PENDING']
)

// Table names are case-sensitive and PascalCase
"Order"       // ✅ Correct
"order"       // ❌ Wrong (table doesn't exist)

// JSONB access
props->>'key'                // Extract as text
(props->>'age')::int         // Cast to integer
props @> '{"status":"active"}'  // Contains check
```

### Transactions

```typescript
const client = await pool.connect()
try {
  await client.query('BEGIN')
  
  // Multiple operations
  await client.query('INSERT INTO "Order" ...')
  await client.query('INSERT INTO "OrderStatusHistory" ...')
  
  await client.query('COMMIT')
} catch (e) {
  await client.query('ROLLBACK')
  throw e
} finally {
  client.release()
}
```

### Migration Strategy

```bash
# 1. Write SQL migration
migrations/002_add_product_fields.sql

# 2. Test locally
psql $DATABASE_URL -f migrations/002_add_product_fields.sql

# 3. Apply to production
# (Manual for now - TODO: automated migration runner)
```

---

## Performance Considerations

### 1. **Database Connection Pooling**
- Max 20 connections per instance
- Reused across requests
- Idle timeout: 30s

### 2. **Client-Side Fetching**
Most pages use `'use client'` + `useEffect` to fetch data:
- Shows loading spinner immediately
- Fetches data after authentication check
- Better UX for slow queries

### 3. **No API Caching (Yet)**
All API routes return fresh data:
- Orders list: Always current
- Order detail: Always current

**TODO**: Add caching for:
- Dashboard KPIs (5-minute cache)
- Product list (1-minute cache)

### 4. **Minimal Bundle Size**
- No heavy libraries (Chart.js, Moment.js, etc.)
- Native browser APIs when possible
- Tailwind CSS (purged in production)

---

## Security

### 1. **Authentication Required**
ALL pages and API routes check authentication:
- Pages use `requireOpsAccess()` in layout
- API routes check session manually

### 2. **Parameterized Queries**
Always use `$1, $2, $3` placeholders - never string interpolation:

```typescript
// ✅ Safe
await pool.query('SELECT * FROM "Order" WHERE id = $1', [orderId])

// ❌ Vulnerable to SQL injection
await pool.query(`SELECT * FROM "Order" WHERE id = '${orderId}'`)
```

### 3. **HTTPS Only**
Vercel automatically enforces HTTPS on custom domains.

### 4. **Environment Variables**
Secrets stored in Vercel environment variables:
- Never committed to GitHub
- Injected at build/runtime

---

## Future Architecture Improvements

### 1. **API Middleware**
Extract authentication check into middleware:
```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  // Check auth for all /api/ops/* routes
}
```

### 2. **Shared Components Library**
Extract common UI to `components/`:
- Button, Input, Card, Badge, etc.
- Consistent styling across modules

### 3. **Real-Time Updates**
WebSocket or Server-Sent Events for:
- New orders notification
- Delivery status changes
- Live dashboard KPIs

### 4. **Optimistic UI**
Update UI immediately, sync with server later:
- Faster perceived performance
- Better UX for slow networks

---

## Questions & Answers

**Q: Why Next.js App Router instead of Pages Router?**
A: App Router is the future of Next.js. Better TypeScript support, server components, and routing.

**Q: Why raw SQL instead of Prisma?**
A: Shared database with website (which uses raw SQL). Consistency is key. Also, full query control.

**Q: Why not use tRPC for type-safe APIs?**
A: Small team, simple APIs. Native fetch + TypeScript types are enough. tRPC adds complexity.

**Q: Why Google OAuth only?**
A: Founders already use Google Workspace. No need for email/password or other providers.

**Q: Why no tests?**
A: Early stage. Tests will be added once features stabilize. Focus on shipping fast.

---

**Last Updated**: June 4, 2026
**Maintained By**: Claude Code + Shine Cosmetics Founders
