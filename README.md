# Shine Cosmetics - Business Operating System

Internal operations dashboard for Shine Cosmetics founders.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3001](http://localhost:3001)

## 📦 What This Is

**Internal SaaS-style admin system** that replaces WhatsApp chaos, spreadsheets, and fragmented tracking.

**For:** 2 founders only
**Access:** ops.shinecosmetics.ma (production)

## 🎯 Core Features

- **Orders Management** - Website + WhatsApp + Instagram + TikTok orders
- **Sendit Integration** - Create shipments, track delivery status
- **Profit Tracking** - Real-time profit/margin calculations
- **Content Planning** - TikTok, Instagram content pipeline
- **Campaigns** - Ramadan, sales, product launches
- **Ads Tracking** - Meta, TikTok, Google spend/ROAS
- **Work Hub** - Weekly priorities, experiments, decisions
- **Tasks** - Founder task management
- **Support** - Customer issue tracking

## 🗄️ Database

**Shared PostgreSQL** with main website (Neon)

```
Same DATABASE_URL as parashop website
```

## 🔐 Access Control

Only 2 founders can access:
- mekouar01@gmail.com
- marjanhajar20@gmail.com

## 📁 Project Structure

```
parashop-ops/
├── app/
│   ├── page.tsx                    # Dashboard
│   ├── layout.tsx                  # Root layout
│   ├── orders/                     # Orders module
│   ├── products/                   # Products module
│   ├── campaigns/                  # Campaigns module
│   ├── content/                    # Content planning
│   ├── ads/                        # Ads tracking
│   ├── work-hub/                   # Work Hub
│   ├── tasks/                      # Tasks
│   ├── support/                    # Support tickets
│   └── api/
│       ├── orders/                 # Orders API
│       ├── integrations/
│       │   ├── website/            # Website webhook
│       │   └── sendit/             # Sendit webhook
│       └── sendit/                 # Sendit actions
├── lib/
│   ├── db.ts                       # Database connection
│   ├── auth.ts                     # Auth helpers
│   ├── sendit/                     # Sendit API client
│   └── types.ts                    # Shared types
├── components/
│   └── ui/                         # Reusable UI components
└── migrations/
    └── *.sql                       # Database migrations
```

## 🌐 Deployment

**Platform:** Vercel
**Domain:** ops.shinecosmetics.ma
**Separate from:** shinecosmetics.ma (website)

### Environment Variables (Production)

```bash
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=<generate-new>
NEXTAUTH_URL=https://ops.shinecosmetics.ma
SENDIT_API_BASE_URL=https://api.sendit.ma
SENDIT_PUBLIC_KEY=e6ef89a1a8a2c9f8cf95cc6cf10e3e3b
SENDIT_PRIVATE_KEY=gNKoj1BQIdFF9YxvNUytq1UQ0TZtyluX
```

## 🔗 Integrations

### Sendit (Delivery)
- Create shipments
- Track delivery status
- Webhook for status updates

### Website (Order Ingestion)
```bash
POST https://ops.shinecosmetics.ma/api/integrations/website/orders
```

## 📝 Development

```bash
# Type check
npm run type-check

# Build
npm run build

# Production
npm start
```

## 🏗️ Build Phases

- [x] Phase 1: Foundation & Setup
- [ ] Phase 2: Orders Module
- [ ] Phase 3: Dashboard
- [ ] Phase 4: Operational Modules
- [ ] Phase 5: Sendit Integration
- [ ] Phase 6: Backup & Polish

---

Built with ❤️ for Shine Cosmetics founders
