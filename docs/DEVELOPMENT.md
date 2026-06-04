# Development Guide

Local setup, common tasks, and troubleshooting for BOS development.

**Last Updated**: June 4, 2026

---

## Local Setup

### 1. Prerequisites

```bash
# Check versions
node --version    # Should be 18.x or higher
npm --version     # Should be 9.x or higher
git --version

# Install if missing
# Windows: https://nodejs.org/
# Mac: brew install node
```

### 2. Clone Repository

```bash
git clone https://github.com/Href01/parashop-ops.git
cd parashop-ops
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Environment Variables

Create `.env.local` in project root:

```env
# Database (Neon PostgreSQL)
DATABASE_URL="postgresql://shinecosmetics_owner:YOUR_PASSWORD@ep-name.region.aws.neon.tech/shinecosmetics?sslmode=require"

# NextAuth (generate secret with: openssl rand -base64 32)
NEXTAUTH_SECRET="your-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"

# Google OAuth (get from Google Cloud Console)
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"

# Sendit API
SENDIT_PUBLIC_KEY="e6ef89a1a8a2c9f8cf95cc6cf10e3e3b"
SENDIT_PRIVATE_KEY="gNKoj1BQIdFF9YxvNUytq1UQ0TZtyluX"
```

**Get DATABASE_URL**:
1. Go to [Neon Dashboard](https://console.neon.tech)
2. Select `shinecosmetics` project
3. Copy connection string

**Get Google OAuth credentials**:
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect: `http://localhost:3000/api/auth/callback/google`

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Common Tasks

### Type Check

**ALWAYS run before committing:**

```bash
npx tsc --noEmit
```

If errors, **DO NOT commit**. Fix them first.

### Build for Production

```bash
npm run build
```

Tests if code will build on Vercel.

### Database Migration

```bash
# Connect to database
psql $DATABASE_URL

# Run migration
\i migrations/001_add_bos_tables.sql

# Check tables
\dt

# Describe table
\d "Order"

# Exit
\q
```

### Create New Page

```bash
# 1. Create page file
mkdir -p app/campaigns
touch app/campaigns/page.tsx

# 2. Add to navigation (app/orders/layout.tsx)
<NavLink href="/campaigns">📢 Campaigns</NavLink>

# 3. Create client component
'use client'

export default function CampaignsPage() {
  return <div>Campaigns</div>
}
```

### Create New API Endpoint

```bash
# 1. Create route file
mkdir -p app/api/ops/campaigns
touch app/api/ops/campaigns/route.ts

# 2. Add GET handler
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await pool.query('SELECT * FROM "Campaign"')
  return NextResponse.json(result.rows)
}

# 3. Test
curl http://localhost:3000/api/ops/campaigns
```

### Update Shared Component

If changing navigation or layout:

```bash
# Files to update:
app/page.tsx                    # Homepage navigation
app/orders/layout.tsx           # Orders module navigation
app/products/layout.tsx         # Products module (when created)
# ... etc.
```

**TODO**: Extract navigation to shared component.

---

## Development Workflow

### Daily Workflow

```bash
# 1. Pull latest
git pull origin main

# 2. Create feature branch (optional, for big changes)
git checkout -b feature/campaign-module

# 3. Make changes
# ... code ...

# 4. Type check
npx tsc --noEmit

# 5. Test locally
npm run dev
# Visit http://localhost:3000 and test feature

# 6. Commit
git add .
git commit -m "feat: add campaign list page"

# 7. Push
git push origin main
# (or: git push origin feature/campaign-module)

# 8. Vercel auto-deploys
# Wait 2 minutes, test on ops.shinecosmetics.ma
```

### When Vercel Build Fails

1. **Check build logs**: https://vercel.com/href01s-projects/parashop-ops/deployments
2. **Common causes**:
   - TypeScript errors → Run `npx tsc --noEmit` locally
   - Missing env vars → Check Vercel dashboard
   - Import errors → Check file paths (case-sensitive!)
3. **Fix and push again**

### Git Commit Message Format

```bash
<type>: <description>

[optional body]

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Types**:
- `feat` - New feature
- `fix` - Bug fix
- `refactor` - Code refactor (no behavior change)
- `docs` - Documentation only
- `perf` - Performance improvement
- `test` - Adding tests
- `chore` - Maintenance (deps, config, etc.)

**Examples**:
```bash
git commit -m "feat: add campaign creation form"
git commit -m "fix: order detail page 404 error"
git commit -m "refactor: extract navigation to shared component"
```

---

## Troubleshooting

### Database Connection Issues

**Error**: `connection timeout`

**Solution**:
1. Check DATABASE_URL is correct in `.env.local`
2. Check internet connection
3. Check Neon dashboard - database might be sleeping
4. Restart dev server: `Ctrl+C` then `npm run dev`

---

### NextAuth Session Issues

**Error**: `Session callback is not configured`

**Solution**:
```typescript
// app/api/auth/[...nextauth]/route.ts
export const authOptions: NextAuthOptions = {
  providers: [...],
  callbacks: {
    async session({ session, token }) {
      if (session?.user) {
        session.user.email = token.email
      }
      return session
    },
  },
}
```

---

### TypeScript Errors

**Error**: `Property 'X' does not exist on type 'Y'`

**Solution**: Define proper types

```typescript
// Before (bad)
const order: any = await fetch(...)

// After (good)
interface Order {
  id: number
  orderNumber: string
  // ... other fields
}
const order: Order = await fetch(...)
```

---

### Next.js 16 Async Params

**Error**: `Property 'id' is missing in type 'Promise<{ id: string }>'`

**Solution**: Await params in dynamic routes

```typescript
// ❌ Wrong (Next.js 15)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const orderId = params.id
}

// ✅ Correct (Next.js 16)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params
}
```

---

### Hydration Errors

**Error**: `Hydration failed because the initial UI does not match`

**Cause**: Server-rendered HTML doesn't match client-side React

**Common culprits**:
- Using `Date.now()` or `Math.random()` in component
- Conditional rendering based on browser-only state

**Solution**: Use `mounted` pattern

```typescript
const [mounted, setMounted] = useState(false)
useEffect(() => setMounted(true), [])

if (!mounted) return null  // or <LoadingSpinner />

return <div>{/* client-only content */}</div>
```

---

### CSS Not Loading

**Error**: Tailwind classes not applying

**Solution**:
1. Check `tailwind.config.ts` includes correct paths
2. Restart dev server
3. Clear `.next` cache: `rm -rf .next && npm run dev`

---

### Port Already in Use

**Error**: `Port 3000 is already in use`

**Solution**:
```bash
# Find process
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# Kill process
kill -9 <PID>  # Mac/Linux
taskkill /PID <PID> /F  # Windows

# Or use different port
npm run dev -- -p 3001
```

---

## Testing

### Manual Testing Checklist

Before pushing:

- [ ] Type check passes (`npx tsc --noEmit`)
- [ ] Dev server runs without errors
- [ ] Feature works as expected in browser
- [ ] Test on different screen sizes (mobile, tablet, desktop)
- [ ] Test with real data (not just empty states)
- [ ] No console errors or warnings

### Testing API Endpoints

```bash
# Get session cookie from browser DevTools
# Copy next-auth.session-token value

# Test GET
curl -X GET 'http://localhost:3000/api/ops/orders' \
  -H 'Cookie: next-auth.session-token=YOUR_TOKEN'

# Test POST
curl -X POST 'http://localhost:3000/api/ops/orders' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: next-auth.session-token=YOUR_TOKEN' \
  -d '{
    "sourceChannel": "WhatsApp",
    "deliveryName": "Test User",
    "deliveryPhone": "0612345678",
    "deliveryCity": "Test City",
    "items": []
  }'
```

### Database Testing

```bash
# Connect to database
psql $DATABASE_URL

# Test query
SELECT * FROM "Order" WHERE status = 'PENDING' LIMIT 5;

# Check order completeness
SELECT
  id,
  "orderNumber",
  "deliveryName",
  "deliveryPhone",
  "deliveryCity"
FROM "Order"
WHERE "deliveryName" IS NULL OR "deliveryPhone" IS NULL;
```

---

## Code Style

### TypeScript

```typescript
// ✅ Good
interface Order {
  id: number
  orderNumber: string
}

const order: Order = await fetchOrder(id)

// ❌ Bad
const order: any = await fetchOrder(id)
const order = await fetchOrder(id) as any
```

### React

```typescript
// ✅ Good - explicit types
export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
}

// ❌ Bad - implicit any
export default function OrdersPage() {
  const [orders, setOrders] = useState([])
}
```

### SQL Queries

```typescript
// ✅ Good - parameterized
await pool.query('SELECT * FROM "Order" WHERE id = $1', [orderId])

// ❌ Bad - SQL injection risk
await pool.query(`SELECT * FROM "Order" WHERE id = '${orderId}'`)
```

### Imports

```typescript
// ✅ Good - organized
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import pool from '@/lib/db'
import type { Order } from '@/types'

// ❌ Bad - messy
import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getServerSession } from 'next-auth'
import type { Order } from '@/types'
```

---

## Useful Commands

```bash
# Package management
npm install <package>        # Install new package
npm uninstall <package>      # Remove package
npm update                   # Update all packages
npm outdated                 # Check for updates

# Git
git status                   # Check changes
git log --oneline -10        # Recent commits
git diff                     # See changes
git stash                    # Stash changes temporarily
git stash pop                # Restore stashed changes

# Database
psql $DATABASE_URL           # Connect to database
\dt                          # List tables
\d "Order"                   # Describe table
\q                           # Quit

# Process management
ps aux | grep node           # Find Node processes
kill -9 <PID>                # Kill process

# File search
find . -name "*.tsx"         # Find TypeScript files
grep -r "OrdersPage" app/    # Search in files
```

---

## Resources

### Documentation
- [Next.js App Router](https://nextjs.org/docs/app)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [NextAuth.js](https://next-auth.js.org/)
- [PostgreSQL](https://www.postgresql.org/docs/)

### Tools
- [Neon Dashboard](https://console.neon.tech)
- [Vercel Dashboard](https://vercel.com/dashboard)
- [Google Cloud Console](https://console.cloud.google.com)

---

## Getting Help

1. **Check documentation** (this folder)
2. **Search codebase** for similar patterns
3. **Check git history** (`git log` for context)
4. **Google the error** (include "Next.js" or "TypeScript")
5. **Ask Claude** (via Claude Code or chat)

---

**Last Updated**: June 4, 2026
**Maintained By**: Shine Cosmetics Founders + Claude Code
