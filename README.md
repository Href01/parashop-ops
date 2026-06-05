# Shine Cosmetics - Business Operating System (BOS)

Internal operations platform for Shine Cosmetics founders. Replaces WhatsApp chaos, spreadsheets, and manual tracking with a unified business management system.

## 🌐 Live URLs

- **Production**: [ops.shinecosmetics.ma](https://ops.shinecosmetics.ma)
- **Main Website**: [shinecosmetics.ma](https://shinecosmetics.ma)
- **GitHub**: [parashop-ops](https://github.com/Href01/parashop-ops)

## 🎯 What is BOS?

A custom-built internal platform to manage:
- **Orders**: Manual creation, website sync, Sendit integration
- **Products**: Inventory, cost prices, profit tracking
- **Analytics**: Revenue, profit, margins, ROAS
- **Campaigns**: Ads, influencers, performance tracking
- **Content**: Planning, scheduling, cross-platform management
- **Work Hub**: Tasks, priorities, decisions, experiments

**Built specifically for 2 founders** - no external users, no subscriptions, no bloat.

---

## 🚀 Quick Start

### Prerequisites
```bash
# Required
Node.js 18+
Git
PostgreSQL (Neon DB)

# Accounts needed
Vercel account
GitHub account
Neon DB account
```

### Installation

1. **Clone repository**
```bash
git clone https://github.com/Href01/parashop-ops.git
cd parashop-ops
npm install
```

2. **Environment variables**

Create `.env.local`:
```env
# Database (Neon PostgreSQL - shared with main website)
DATABASE_URL="postgresql://..."

# NextAuth
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# Sendit API (delivery partner)
SENDIT_PUBLIC_KEY="e6ef89a1a8a2c9f8cf95cc6cf10e3e3b"
SENDIT_PRIVATE_KEY="gNKoj1BQIdFF9YxvNUytq1UQ0TZtyluX"
```

3. **Run development server**
```bash
npm run dev
# Open http://localhost:3000
```

4. **Run database migrations**
```bash
npm run migrate
```

---

## 📁 Project Structure

```
parashop-ops/
├── app/
│   ├── page.tsx                  # Dashboard (root)
│   ├── layout.tsx                # Root layout (minimal)
│   ├── orders/
│   │   ├── layout.tsx            # Orders layout with nav
│   │   ├── page.tsx              # Orders list
│   │   ├── new/page.tsx          # Create order form
│   │   └── [id]/page.tsx         # Order detail
│   ├── api/
│   │   ├── auth/[...nextauth]/   # NextAuth endpoints
│   │   └── ops/
│   │       └── orders/           # Orders API
│   └── globals.css
├── lib/
│   ├── db.ts                     # PostgreSQL pool connection
│   ├── auth.ts                   # Founders-only authentication
│   └── order-utils.ts            # Order calculations, completeness check
├── migrations/                   # Database migrations
├── docs/                         # Documentation (this folder)
└── public/                       # Static assets
```

**Key principle**: Clean URLs without /ops prefix
- ✅ `ops.shinecosmetics.ma/orders`
- ❌ `ops.shinecosmetics.ma/ops/orders`

---

## 🔐 Authentication

**Founders-only access** - only 2 emails allowed:
- `mekouar01@gmail.com` (Founder 1)
- `marjanhajar20@gmail.com` (Founder 2)

Configured in `lib/auth.ts`:
```typescript
const ALLOWED_EMAILS = [
  'mekouar01@gmail.com',
  'marjanhajar20@gmail.com',
]
```

Uses **NextAuth.js** with Google OAuth provider.

---

## 🗄️ Database Architecture

**Database**: Neon PostgreSQL (shared with main website)
- **Same database** as shinecosmetics.ma
- **Separate tables** with "BOS" prefix or specific to operations
- **No Prisma Client** - uses raw SQL via `pg` Pool

**Why `schema.prisma` exists but client doesn't?**
- Prisma is used ONLY for migrations
- Never generates client code
- All queries use raw SQL: `pool.query(...)`

See [docs/DATABASE.md](docs/DATABASE.md) for full schema.

---

## 📡 API Endpoints

### Orders API
```
GET    /api/ops/orders           # List all orders
POST   /api/ops/orders           # Create new order
GET    /api/ops/orders/:id       # Get order details
PUT    /api/ops/orders/:id       # Update order
```

See [docs/API.md](docs/API.md) for full API documentation.

---

## 🧮 Key Features

### Order Completeness Scoring
Every order gets a **0-100% completeness score** based on:
- Customer info (name, phone, city, address)
- Product info (items, cost prices)
- Delivery info (fees, method, source channel)

**Missing data = ⚠️ Warning indicators** in UI

### Profit & Margin Calculation
```typescript
// Estimated profit (while order pending/confirmed)
estimatedProfit = revenue - estimatedCosts - deliveryFee

// Final profit (after delivery)
finalProfit = revenue - actualCosts - actualDeliveryFee

// Margin percentage
marginPercent = (profit / revenue) * 100
```

### Data Sync Strategy
1. **Website orders** → Auto-import via webhook (TODO)
2. **Manual orders** → Created directly in BOS
3. **All orders** → Store in shared database
4. **Sendit integration** → Create shipments, track status

---

## 🚢 Deployment

**Platform**: Vercel
**Domain**: ops.shinecosmetics.ma
**Git branch**: `main` (auto-deploy)

### Deploy Commands
```bash
# Push to trigger deployment
git push origin main

# Vercel handles:
# - Install dependencies
# - Run build
# - Deploy to ops.shinecosmetics.ma
```

### Environment Variables (Vercel)
Set in Vercel dashboard → Settings → Environment Variables:
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `SENDIT_PUBLIC_KEY`
- `SENDIT_PRIVATE_KEY`

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed guide.

---

## 🛠️ Development Workflow

### Before EVERY commit:
```bash
# 1. Type check (MANDATORY)
npx tsc --noEmit

# 2. Show clean output to user
# 3. Commit only if clean
git add .
git commit -m "feat: description"
git push
```

**Never push broken TypeScript!** Each Vercel build takes ~2 minutes.

### Common Tasks
```bash
# Run dev server
npm run dev

# Create database migration
npm run migrate:create

# Run migrations
npm run migrate

# Build for production (test locally)
npm run build
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for troubleshooting.

---

## 📚 Documentation Index

### 🧠 For Claude Code (Read Before Any Changes)

**Mandatory reading order:**

1. **[../parashop/CLAUDE.md](../parashop/CLAUDE.md)** - Project rules (TypeScript, Git, Build protocols)
2. **[PRE_CHANGE_CHECKLIST.md](docs/PRE_CHANGE_CHECKLIST.md)** - 10-step process before code changes
3. **[PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)** - Complete system architecture (800+ lines)
4. **[PREVENTION_SYSTEM.md](docs/PREVENTION_SYSTEM.md)** - Validation layer, bug prevention

**Why?** Prevents duplicate work, breaking changes, and bugs. 20-30 min reading saves hours of debugging.

---

### 📖 For Humans (Developers)

**I want to...**

| Goal | Read This |
|------|-----------|
| Understand the full system | [PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) |
| Set up dev environment | [DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| Deploy to production | [DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Use API endpoints | [API.md](docs/API.md) |
| Quick command reference | [QUICK_START.md](QUICK_START.md) |
| Understand validation/bug prevention | [PREVENTION_SYSTEM.md](docs/PREVENTION_SYSTEM.md) |

**Consolidated (2026-06-05):** Deleted 6 redundant docs (PROJECT_STATUS, ARCHITECTURE, DATABASE, SENDIT, WEBHOOKS, UI_DESIGN). All content merged into PROJECT_OVERVIEW.md.

---

## 🎯 Roadmap

### Phase 1: Foundation ✅ COMPLETE
- [x] Project setup
- [x] Database connection (shared with website)
- [x] Founders-only authentication
- [x] Custom domain (ops.shinecosmetics.ma)
- [x] Sendit API keys configured

### Phase 2: Orders Module ✅ COMPLETE
- [x] Orders API (create, list, detail, update)
- [x] Data completeness checker
- [x] Profit/margin calculator
- [x] Order creation UI
- [x] Order list UI
- [x] Order detail page
- [x] Product picker with search
- [x] Website order sync (webhook) ✅ Fixed 2026-06-05
- [x] Sendit shipment integration ✅ Hardened 2026-06-05
- [x] Bug prevention system (validation layer) ✅ 2026-06-05
- [x] Audit trail (deleted orders) ✅ 2026-06-05

### Phase 3: Products Module
- [ ] Product list with filters
- [ ] Cost price bulk editor
- [ ] Low stock alerts
- [ ] Product performance metrics

### Phase 4: Dashboard & Analytics
- [ ] Real-time KPIs (revenue, profit, margin)
- [ ] Charts (daily/weekly/monthly)
- [ ] Top products, top cities
- [ ] Funnel analysis

### Phase 5: Campaigns & Ads
- [ ] Campaign creation/tracking
- [ ] Ad spend vs revenue (ROAS)
- [ ] Influencer ROI tracking

### Phase 6: Content Hub
- [ ] Content calendar
- [ ] Cross-platform scheduling
- [ ] Performance by platform

### Phase 7: Work Hub
- [ ] Weekly priorities
- [ ] Task management
- [ ] Decision log
- [ ] Experiment tracking

---

## 🤝 Contributing

**Internal project** - Only Shine Cosmetics founders have access.

For feature requests or bugs:
1. Open issue in GitHub
2. Discuss in WhatsApp
3. Assign to Claude for implementation

---

## 📞 Support

**Founders**:
- Achraf Mekouar - mekouar01@gmail.com
- Marjan Hajar - marjanhajar20@gmail.com

**Development**: Built with Claude Code (Anthropic)

---

## 📄 License

Private - All Rights Reserved © 2026 Shine Cosmetics

---

## 🎯 System Status

- **Prevention System:** ✅ ACTIVE (phone/number validation, Sendit hardening)
- **Webhook Sync:** ✅ WORKING (main site → BOS)
- **Sendit Integration:** ✅ HARDENED (validated before API calls)
- **Audit Trail:** ✅ IMPLEMENTED (OrderAuditLog table)
- **Documentation:** ✅ CONSOLIDATED (6 redundant docs deleted)

**Common bugs PREVENTED:**
- ✅ Phone format error (Sendit 422) - formatPhoneForSendit()
- ✅ String concatenation (33019 bug) - Zod number validation
- ✅ Amount > 5000 DH - Validation at order creation
- ✅ Missing data in DB - Validation at API boundary

---

**Last Updated**: June 5, 2026
**Version**: 2.0.0 (Post-Prevention System)
**Status**: Phase 2 complete, Phase 3 ready
