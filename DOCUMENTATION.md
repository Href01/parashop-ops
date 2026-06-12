# Shine Cosmetics BOS - Complete System Documentation

> Legacy planning document. For current setup, deployment, auth, webhook, and missing-work status, use `README.md`, `QUICK_START.md`, `DEPLOYMENT.md`, `docs/PROJECT_OVERVIEW.md`, and `BROKEN_BUTTONS_AUDIT.md`. Some examples below still describe earlier Phase 1/2 plans.

**Back Office System for E-commerce Beauty Products in Morocco**

Version: 1.0  
Last Updated: June 6, 2026  
Environment: https://ops.shinecosmetics.ma

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Modules](#modules)
5. [API Reference](#api-reference)
6. [User Workflows](#user-workflows)
7. [Integration Guide](#integration-guide)
8. [Calculations & Formulas](#calculations--formulas)
9. [Troubleshooting](#troubleshooting)

---

## System Overview

### What is BOS?

The **Back Office System (BOS)** is a comprehensive business management platform for Shine Cosmetics, providing:

- **Order Management** - Track, manage, and fulfill customer orders
- **Inventory Management** - Real-time stock tracking with auto-alerts
- **Customer CRM** - Phone-based customer segmentation with RFM scoring
- **Campaign ROI Tracking** - Real P&L after all costs (ads, influencer, content)
- **Event Impact Analysis** - Measure seasonal events vs normal periods
- **Product Management** - Catalog, pricing, margins, suppliers

### Key Features

✅ **Real-time Updates** - Order confirmation triggers automatic updates across all modules  
✅ **Phone-Based Tracking** - Guest orders count toward customer metrics  
✅ **Real P&L** - Calculate actual profit after COGS + ad spend + other costs  
✅ **Event Impact** - Compare event performance vs same duration before event  
✅ **Auto-Calculations** - PostgreSQL functions handle complex metrics  
✅ **Interconnected** - All modules work together automatically  

### Technology Stack

- **Frontend**: Next.js 15 (React), TypeScript
- **Backend**: Next.js API Routes (serverless)
- **Database**: PostgreSQL (via `pg` Pool, not Prisma client)
- **Authentication**: NextAuth.js (session-based)
- **Deployment**: Vercel
- **Delivery Integration**: Sendit API

---

## Architecture

### System Design

```
┌─────────────────────────────────────────────────────────────┐
│                    BOS Frontend (Next.js)                    │
│  /orders /products /inventory /customers /campaigns /events  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   API Layer (Next.js API Routes)             │
│  /api/ops/{orders,products,inventory,customers,campaigns}   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Integration Layer (Hooks & Calculators)         │
│  order-hooks.ts → rfm-calculator.ts → PostgreSQL Functions  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                       │
│  20+ tables, 5 auto-calc functions, 3 views, indexes        │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow on Order Confirmation

```
User clicks "Confirm Order" in BOS
        ↓
PUT /api/ops/orders/[id] { status: "CONFIRMED" }
        ↓
onOrderConfirmed(orderId) triggered
        ↓
┌───────────────────────────────────────────────────────────┐
│ PART 1: INVENTORY                                          │
│ • Query order items                                        │
│ • For each product:                                        │
│   - Reduce stock (stock = stock - quantity)               │
│   - Create InventoryMovement record (type: Sale)          │
│   - Update stockStatus (In stock / Low stock / Out)       │
│   - Create StockAlert if stock <= reorderPoint            │
└───────────────────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────────────────┐
│ PART 2: CUSTOMER (Phone-based)                            │
│ • Find user by order.deliveryPhone                        │
│ • Calculate metrics from ALL orders with that phone:      │
│   - ordersCount = COUNT(*)                                │
│   - lifetimeValue = SUM(total)                            │
│   - averageOrderValue = AVG(total)                        │
│   - lastOrderDate = MAX(createdAt)                        │
│   - daysSinceLastOrder = NOW() - lastOrderDate            │
│ • Update User table                                        │
│ • Log CustomerActivity                                     │
└───────────────────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────────────────┐
│ PART 3: CAMPAIGN (if order.campaignId exists)             │
│ • Call calculate_campaign_metrics(campaignId)             │
│ • PostgreSQL function calculates:                         │
│   - Total revenue from campaign orders                    │
│   - Total COGS (sum of product costs)                     │
│   - Total ad spend (from CampaignCost table)              │
│   - Total other costs (influencer, content, etc.)         │
│   - Gross profit = revenue - COGS                         │
│   - Net profit = gross - ad spend - other costs           │
│   - ROI = (net profit / total costs) × 100                │
│   - ROAS = revenue / ad spend                             │
│ • Update CampaignMetrics table                            │
└───────────────────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────────────────┐
│ PART 4: EVENT (if order.eventId exists)                   │
│ • Call calculate_event_metrics(eventId)                   │
│ • PostgreSQL function calculates:                         │
│   - Total revenue/orders during event period              │
│   - Normal period revenue (same duration BEFORE event)    │
│   - Revenue increase % = ((event - normal) / normal) × 100│
│   - Category performance (group by product.category)      │
│   - Product performance (top sellers)                     │
│ • Update EventMetrics, EventCategory, EventProduct        │
└───────────────────────────────────────────────────────────┘
        ↓
Order status = CONFIRMED, all metrics updated automatically
```

### Directory Structure

```
parashop-ops/
├── app/                          # Next.js app directory
│   ├── api/ops/                  # API routes
│   │   ├── orders/               # Order CRUD + update
│   │   ├── products/             # Product CRUD
│   │   ├── inventory/            # Stock, movements, alerts
│   │   ├── customers/            # Customer CRM, RFM
│   │   ├── campaigns/            # Campaign P&L tracking
│   │   ├── events/               # Event impact analysis
│   │   └── utils/                # RFM update, metrics calculation
│   ├── campaigns/                # Campaigns dashboard + detail
│   ├── events/                   # Events dashboard + detail
│   ├── customers/                # Customers list
│   ├── inventory/                # Inventory dashboard
│   ├── orders/                   # Orders list + detail
│   ├── products/                 # Products list + detail
│   └── work-hub/                 # Team task management
├── components/                   # React components
│   └── BosShell.tsx              # Main layout with navigation
├── lib/                          # Server-side utilities
│   ├── db.ts                     # PostgreSQL pool connection
│   ├── auth.ts                   # NextAuth configuration
│   ├── sendit.ts                 # Sendit delivery API
│   └── integrations/             # Integration logic
│       ├── order-hooks.ts        # Order confirmation handler
│       └── rfm-calculator.ts     # RFM segmentation logic
└── prisma/
    └── migrations/               # Database migrations
        ├── 001_initial.sql
        ├── 002_add_customers_inventory.sql
        └── 003_add_campaigns_events.sql
```

---

## Database Schema

### Core Tables (20 total)

#### Orders Module

**Order**
```sql
id                   SERIAL PRIMARY KEY
orderNumber          TEXT UNIQUE
userId               INTEGER (nullable - guest orders allowed)
deliveryName         TEXT NOT NULL
deliveryPhone        TEXT NOT NULL  -- KEY for customer tracking
deliveryCity         TEXT NOT NULL
deliveryAddress      TEXT
deliveryNotes        TEXT
total                DECIMAL(10,2)
discountTotal        DECIMAL(10,2)
deliveryFeeCharged   DECIMAL(10,2)
paymentMethod        TEXT
status               TEXT  -- PENDING, CONFIRMED, DELIVERED, CANCELLED
notes                TEXT
campaignId           INTEGER → Campaign  -- Attribution
eventId              INTEGER → Event     -- Attribution
utmSource            TEXT  -- instagram, facebook, google
utmMedium            TEXT  -- social, cpc, email
utmCampaign          TEXT
utmContent           TEXT
senditTrackingId     TEXT
senditStatus         TEXT
createdAt            TIMESTAMP
```

**OrderItem**
```sql
id          SERIAL PRIMARY KEY
orderId     INTEGER → Order
productId   INTEGER → Product
quantity    INTEGER
price       DECIMAL(10,2)
unitCost    DECIMAL(10,2)  -- For COGS calculation
```

**OrderStatusHistory**
```sql
id         SERIAL PRIMARY KEY
orderId    INTEGER → Order
oldStatus  TEXT
newStatus  TEXT
source     TEXT  -- manual, auto, webhook
note       TEXT
createdAt  TIMESTAMP
```

#### Products Module

**Product**
```sql
id                  SERIAL PRIMARY KEY
name                TEXT NOT NULL
brand               TEXT
category            TEXT
price               DECIMAL(10,2)
costPrice           DECIMAL(10,2)  -- For margin calculation
profitMargin        DECIMAL(5,2)   -- AUTO-CALCULATED
image               TEXT
sku                 TEXT
stock               INTEGER
reorderPoint        INTEGER DEFAULT 10
reorderQuantity     INTEGER DEFAULT 20
stockStatus         TEXT  -- In stock, Low stock, Out of stock
supplier            TEXT
supplierSKU         TEXT
lastRestockDate     TIMESTAMP
weeklySales         INTEGER  -- AUTO-CALCULATED
daysOfStockLeft     INTEGER  -- AUTO-CALCULATED
trackInventory      BOOLEAN DEFAULT true
createdAt           TIMESTAMP
```

#### Inventory Module

**InventoryMovement**
```sql
id              SERIAL PRIMARY KEY
productId       INTEGER → Product
type            TEXT  -- Purchase, Sale, Adjustment, Return, Damage, Transfer
quantity        INTEGER  -- Negative for sales/damage
stockBefore     INTEGER
stockAfter      INTEGER
reason          TEXT
orderId         INTEGER → Order (nullable)
performedBy     TEXT
createdAt       TIMESTAMP
```

**StockAlert**
```sql
id                SERIAL PRIMARY KEY
productId         INTEGER → Product
type              TEXT  -- Low stock, Out of stock, Overstock
currentStock      INTEGER
threshold         INTEGER
message           TEXT
severity          TEXT  -- critical, warning, info
acknowledged      BOOLEAN DEFAULT false
acknowledgedBy    TEXT
acknowledgedAt    TIMESTAMP
resolvedAt        TIMESTAMP
createdAt         TIMESTAMP
```

**Supplier**
```sql
id            SERIAL PRIMARY KEY
name          TEXT NOT NULL
contactName   TEXT
phone         TEXT
email         TEXT
address       TEXT
notes         TEXT
createdAt     TIMESTAMP
```

**SupplierProduct**
```sql
id              SERIAL PRIMARY KEY
supplierId      INTEGER → Supplier
productId       INTEGER → Product
supplierSKU     TEXT
costPrice       DECIMAL(10,2)
leadTimeDays    INTEGER
minOrderQty     INTEGER
```

**PurchaseOrder**
```sql
id                SERIAL PRIMARY KEY
poNumber          TEXT UNIQUE  -- AUTO-GENERATED
supplierId        INTEGER → Supplier
status            TEXT  -- Draft, Sent, Confirmed, Received, Cancelled
totalAmount       DECIMAL(10,2)
notes             TEXT
orderDate         TIMESTAMP
expectedDate      TIMESTAMP
receivedDate      TIMESTAMP
createdBy         TEXT
createdAt         TIMESTAMP
```

**PurchaseOrderItem**
```sql
id              SERIAL PRIMARY KEY
poId            INTEGER → PurchaseOrder
productId       INTEGER → Product
quantity        INTEGER
unitCost        DECIMAL(10,2)
totalCost       DECIMAL(10,2)
receivedQty     INTEGER DEFAULT 0
```

#### Customer CRM Module

**User** (extended for CRM)
```sql
id                    SERIAL PRIMARY KEY
name                  TEXT
email                 TEXT UNIQUE
phone                 TEXT  -- KEY for guest order tracking
role                  TEXT
-- CRM fields:
segment               TEXT  -- VIP, Regular, At Risk, New, Churned
tags                  TEXT[]
ordersCount           INTEGER DEFAULT 0
lifetimeValue         DECIMAL(10,2) DEFAULT 0
averageOrderValue     DECIMAL(10,2) DEFAULT 0
lastOrderDate         TIMESTAMP
daysSinceLastOrder    INTEGER
recencyScore          INTEGER  -- 1-5
frequencyScore        INTEGER  -- 1-5
monetaryScore         INTEGER  -- 1-5
rfmScore              TEXT     -- e.g., "555"
churnRisk             DECIMAL(5,2)  -- 0-100%
tier                  TEXT  -- Platinum, Gold, Silver, Bronze
emailOptIn            BOOLEAN DEFAULT true
smsOptIn              BOOLEAN DEFAULT true
whatsappOptIn         BOOLEAN DEFAULT true
notes                 TEXT
createdAt             TIMESTAMP
```

**CustomerActivity**
```sql
id            SERIAL PRIMARY KEY
userId        INTEGER → User
type          TEXT  -- Order, Note, Email, SMS, WhatsApp
action        TEXT  -- Created, Confirmed, Delivered, Cancelled
description   TEXT
metadata      JSONB
createdAt     TIMESTAMP
```

**CustomerSegment**
```sql
id             SERIAL PRIMARY KEY
name           TEXT UNIQUE  -- VIP, Regular, At Risk, New, Churned
description    TEXT
criteria       JSONB
createdAt      TIMESTAMP
```

**CustomerSegmentMember**
```sql
id           SERIAL PRIMARY KEY
segmentId    INTEGER → CustomerSegment
userId       INTEGER → User
addedAt      TIMESTAMP
UNIQUE(segmentId, userId)
```

#### Campaigns Module

**Campaign**
```sql
id                SERIAL PRIMARY KEY
name              TEXT NOT NULL
description       TEXT
status            TEXT  -- Draft, Active, Completed, Paused
startDate         TIMESTAMP
endDate           TIMESTAMP
targetRevenue     DECIMAL(10,2)
targetOrders      INTEGER
budgetTotal       DECIMAL(10,2)
budgetAdSpend     DECIMAL(10,2)
budgetOther       DECIMAL(10,2)
createdBy         TEXT
assignedTo        TEXT[]
createdAt         TIMESTAMP
updatedAt         TIMESTAMP
```

**CampaignProduct**
```sql
id                SERIAL PRIMARY KEY
campaignId        INTEGER → Campaign
productId         INTEGER → Product
targetSales       INTEGER
targetRevenue     DECIMAL(10,2)
discountPercent   DECIMAL(5,2)
specialPrice      DECIMAL(10,2)
actualSales       INTEGER DEFAULT 0
actualRevenue     DECIMAL(10,2) DEFAULT 0
UNIQUE(campaignId, productId)
```

**CampaignCost**
```sql
id            SERIAL PRIMARY KEY
campaignId    INTEGER → Campaign
type          TEXT  -- Meta Ads, Google Ads, TikTok Ads, Snapchat Ads,
                    -- Influencer, Content Creation, Photography, Other
platform      TEXT  -- Instagram, Facebook, Google, TikTok, etc.
description   TEXT
amount        DECIMAL(10,2) NOT NULL
currency      TEXT DEFAULT 'MAD'
date          TIMESTAMP DEFAULT NOW()
addedBy       TEXT
receiptUrl    TEXT
notes         TEXT
createdAt     TIMESTAMP
```

**CampaignPost**
```sql
id            SERIAL PRIMARY KEY
campaignId    INTEGER → Campaign
platform      TEXT  -- Instagram, Facebook, TikTok, Snapchat
type          TEXT  -- Story, Reel, Post, Ad, Video
url           TEXT
caption       TEXT
reach         INTEGER
impressions   INTEGER
engagement    INTEGER
clicks        INTEGER
conversions   INTEGER
publishedAt   TIMESTAMP
createdAt     TIMESTAMP
```

**CampaignMetrics** (AUTO-CALCULATED)
```sql
id                SERIAL PRIMARY KEY
campaignId        INTEGER UNIQUE → Campaign
totalOrders       INTEGER DEFAULT 0
totalRevenue      DECIMAL(10,2) DEFAULT 0
totalUnits        INTEGER DEFAULT 0
avgOrderValue     DECIMAL(10,2) DEFAULT 0
totalCOGS         DECIMAL(10,2) DEFAULT 0
totalAdSpend      DECIMAL(10,2) DEFAULT 0
totalOtherCosts   DECIMAL(10,2) DEFAULT 0
totalCosts        DECIMAL(10,2) DEFAULT 0
grossProfit       DECIMAL(10,2) DEFAULT 0
netProfit         DECIMAL(10,2) DEFAULT 0
roi               DECIMAL(10,2)  -- (netProfit / totalCosts) × 100
roas              DECIMAL(10,2)  -- revenue / adSpend
profitMargin      DECIMAL(5,2)   -- (netProfit / revenue) × 100
calculatedAt      TIMESTAMP
```

#### Events Module

**Event**
```sql
id                SERIAL PRIMARY KEY
name              TEXT NOT NULL
description       TEXT
type              TEXT NOT NULL  -- Ramadan, Black Friday, Mother's Day,
                                 -- Summer Sale, Flash Sale, Custom
status            TEXT  -- Upcoming, Active, Completed
startDate         TIMESTAMP NOT NULL
endDate           TIMESTAMP NOT NULL
discountType      TEXT  -- Percentage, Fixed Amount, Buy X Get Y
discountValue     DECIMAL(10,2)
minOrderAmount    DECIMAL(10,2)
targetRevenue     DECIMAL(10,2)
targetOrders      INTEGER
createdBy         TEXT
createdAt         TIMESTAMP
updatedAt         TIMESTAMP
```

**EventCategory**
```sql
id         SERIAL PRIMARY KEY
eventId    INTEGER → Event
category   TEXT NOT NULL
orders     INTEGER DEFAULT 0
revenue    DECIMAL(10,2) DEFAULT 0
units      INTEGER DEFAULT 0
UNIQUE(eventId, category)
```

**EventProduct**
```sql
id                SERIAL PRIMARY KEY
eventId           INTEGER → Event
productId         INTEGER → Product
specialPrice      DECIMAL(10,2)
discountPercent   DECIMAL(5,2)
isFeatured        BOOLEAN DEFAULT false
displayOrder      INTEGER
orders            INTEGER DEFAULT 0
revenue           DECIMAL(10,2) DEFAULT 0
units             INTEGER DEFAULT 0
UNIQUE(eventId, productId)
```

**EventMetrics** (AUTO-CALCULATED)
```sql
id                      SERIAL PRIMARY KEY
eventId                 INTEGER UNIQUE → Event
totalOrders             INTEGER DEFAULT 0
totalRevenue            DECIMAL(10,2) DEFAULT 0
totalUnits              INTEGER DEFAULT 0
avgOrderValue           DECIMAL(10,2) DEFAULT 0
topCategory             TEXT
topCategoryRevenue      DECIMAL(10,2)
topProduct              TEXT
topProductRevenue       DECIMAL(10,2)
normalPeriodRevenue     DECIMAL(10,2)
normalPeriodOrders      INTEGER
revenueIncrease         DECIMAL(10,2)  -- % increase
ordersIncrease          DECIMAL(10,2)  -- % increase
calculatedAt            TIMESTAMP
```

### Database Views

**LowStockProducts**
```sql
CREATE VIEW "LowStockProducts" AS
SELECT * FROM "Product"
WHERE stock <= "reorderPoint"
  AND "trackInventory" = true
ORDER BY stock ASC;
```

**VIPCustomers**
```sql
CREATE VIEW "VIPCustomers" AS
SELECT * FROM "User"
WHERE segment = 'VIP'
ORDER BY "lifetimeValue" DESC;
```

**AtRiskCustomers**
```sql
CREATE VIEW "AtRiskCustomers" AS
SELECT * FROM "User"
WHERE segment = 'At Risk'
  OR "churnRisk" >= 70
ORDER BY "churnRisk" DESC;
```

### PostgreSQL Functions

#### 1. calculate_campaign_metrics(campaignId)

**Purpose**: Calculate complete P&L for a campaign

**Logic**:
```sql
1. Get all orders WHERE campaignId = $1 AND status IN ('CONFIRMED', 'DELIVERED')
2. Sum revenue: SUM(order.total)
3. Sum COGS: SUM(orderItem.quantity × product.costPrice)
4. Sum ad spend: SUM(amount) WHERE type IN (ad platforms)
5. Sum other costs: SUM(amount) WHERE type NOT IN (ad platforms)
6. Calculate:
   - grossProfit = revenue - COGS
   - netProfit = grossProfit - adSpend - otherCosts
   - roi = (netProfit / (COGS + adSpend + otherCosts)) × 100
   - roas = revenue / adSpend
   - profitMargin = (netProfit / revenue) × 100
7. UPDATE CampaignMetrics table
```

#### 2. calculate_event_metrics(eventId)

**Purpose**: Calculate event impact vs normal period

**Logic**:
```sql
1. Get event.startDate and event.endDate
2. Calculate event period performance:
   - Count orders during event period
   - Sum revenue during event period
3. Calculate normal period performance:
   - Period: (startDate - duration) to startDate
   - Count orders during normal period
   - Sum revenue during normal period
4. Calculate increase:
   - revenueIncrease = ((eventRevenue - normalRevenue) / normalRevenue) × 100
   - ordersIncrease = ((eventOrders - normalOrders) / normalOrders) × 100
5. UPDATE EventMetrics table
```

#### 3. calculateCategoryPerformance(eventId)

**Purpose**: Break down event performance by category

**Logic**:
```sql
1. Get event dates
2. Query orders during event, group by product.category
3. Calculate per category:
   - COUNT(DISTINCT orders)
   - SUM(quantity) as units
   - SUM(price × quantity) as revenue
4. INSERT/UPDATE EventCategory table
5. Update EventMetrics.topCategory
```

#### 4. calculateProductPerformance(eventId)

**Purpose**: Rank products by performance during event

**Logic**:
```sql
1. Get event dates
2. Query orders during event, group by product
3. Calculate per product:
   - COUNT(DISTINCT orders)
   - SUM(quantity) as units
   - SUM(price × quantity) as revenue
4. INSERT/UPDATE EventProduct table
5. Update EventMetrics.topProduct
```

#### 5. generate_po_number()

**Purpose**: Auto-generate purchase order numbers

**Logic**:
```sql
FORMAT: PO-YYYYMMDD-XXX
Example: PO-20260606-001
```

---

## Modules

### 1. Orders Module

**Purpose**: Order management and fulfillment

**Pages**:
- `/orders` - List all orders with filters
- `/orders/new` - Create new order
- `/orders/[id]` - Order detail with status management

**Key Features**:
- ✅ Create orders (with or without user account)
- ✅ Update order status (PENDING → CONFIRMED → DELIVERED)
- ✅ Auto-create Sendit shipment on confirmation
- ✅ Track delivery status
- ✅ Link orders to campaigns (campaignId)
- ✅ Link orders to events (eventId or auto by date range)
- ✅ Capture UTM parameters for attribution

**Statuses**:
- `PENDING` - Order created, awaiting confirmation
- `CONFIRMED` - Order confirmed, triggers all integrations
- `DELIVERED` - Order delivered to customer
- `CANCELLED` - Order cancelled
- `RETURNED` - Order returned by customer

**When Order Confirmed** (status → CONFIRMED):
1. Create Sendit shipment (auto)
2. Reduce inventory stock (auto)
3. Update customer metrics (auto)
4. Update campaign P&L if campaignId (auto)
5. Update event metrics if eventId (auto)

### 2. Products Module

**Purpose**: Product catalog and pricing management

**Pages**:
- `/products` - List all products with search
- `/products/[id]` - Product detail with edit

**Key Features**:
- ✅ CRUD products
- ✅ Set cost price for margin calculation
- ✅ Track stock levels
- ✅ Set reorder points
- ✅ Link to suppliers
- ✅ Upload images
- ✅ Categorize products

**Auto-Calculated Fields**:
- `profitMargin` = ((price - costPrice) / price) × 100
- `weeklySales` = Sum of sales last 7 days
- `daysOfStockLeft` = stock / (weeklySales / 7)

### 3. Inventory Module

**Purpose**: Stock management and alerts

**Pages**:
- `/inventory` - Stock levels dashboard with alerts

**Key Features**:
- ✅ Real-time stock levels
- ✅ Stock movement history
- ✅ Auto-generate alerts (low stock, out of stock)
- ✅ Acknowledge/resolve alerts
- ✅ Track weekly sales
- ✅ Calculate days of stock left
- ✅ Reorder point management

**Stock Statuses**:
- `In stock` - stock > reorderPoint
- `Low stock` - stock ≤ reorderPoint AND stock > 0
- `Out of stock` - stock = 0

**Movement Types**:
- `Purchase` - Restock from supplier
- `Sale` - Order confirmed (auto)
- `Adjustment` - Manual correction
- `Return` - Customer return
- `Damage` - Damaged goods
- `Transfer` - Between warehouses

### 4. Customers Module (CRM)

**Purpose**: Customer relationship management with RFM segmentation

**Pages**:
- `/customers` - Customer list with segments
- `/customers/[id]` - Customer detail (pending)

**Key Features**:
- ✅ **Phone-based tracking** - Guest orders count!
- ✅ RFM segmentation (Recency, Frequency, Monetary)
- ✅ Auto-assign segments (VIP, Regular, At Risk, New, Churned)
- ✅ Auto-assign tiers (Platinum, Gold, Silver, Bronze)
- ✅ Churn risk prediction (0-100%)
- ✅ Lifetime value tracking
- ✅ Order history timeline
- ✅ Customer activity log

**RFM Scoring** (Adjusted for new business):

**Recency (1-5)**: How recently did they order?
- 5 = Last 30 days
- 4 = Last 60 days
- 3 = Last 90 days
- 2 = Last 180 days
- 1 = 180+ days

**Frequency (1-5)**: How often do they order?
- 5 = 10+ orders (VIP!)
- 4 = 5-9 orders (excellent)
- 3 = 3-4 orders (good)
- 2 = 2 orders (regular) ← Normal for new business
- 1 = 1 order (new customer)

**Monetary (1-5)**: How much have they spent? (MAD)
- 5 = 3000+ MAD
- 4 = 1500-2999 MAD
- 3 = 800-1499 MAD
- 2 = 400-799 MAD
- 1 = < 400 MAD

**Auto-Segments**:
- `VIP` - Recent + High value (R≥4, M≥4)
- `Regular` - 2+ orders, active (R≥3, F≥2)
- `At Risk` - Haven't ordered recently (R≤2)
- `New` - First order, recent (1 order, R≥4)
- `Churned` - 180+ days since last order

**Tiers** (by Lifetime Value):
- `Platinum` - 5000+ MAD
- `Gold` - 2000-4999 MAD
- `Silver` - 1000-1999 MAD
- `Bronze` - < 1000 MAD

**Churn Risk**:
- Single-order customers: Based on days since order
  - 90+ days = 80% risk
  - 60-89 days = 60% risk
  - 30-59 days = 40% risk
  - < 30 days = 20% risk
- Repeat customers: Lower risk due to loyalty
  - 180+ days = 90% risk
  - 120-179 days = 70% risk
  - 90-119 days = 50% risk
  - 60-89 days = 30% risk
  - < 60 days = 10% risk

### 5. Campaigns Module

**Purpose**: Track campaign ROI and real P&L after all costs

**Pages**:
- `/campaigns` - Campaign dashboard with metrics
- `/campaigns/[id]` - Campaign detail with P&L breakdown

**Key Features**:
- ✅ Create campaigns with date ranges
- ✅ Link products to campaigns
- ✅ Track ad spend (Meta, Google, TikTok, Snapchat)
- ✅ Track influencer costs
- ✅ Track content creation costs
- ✅ **Calculate REAL P&L**:
  - Revenue from orders
  - MINUS COGS (product costs)
  - MINUS Ad Spend
  - MINUS Other Costs
  - **= NET PROFIT**
- ✅ ROI calculation
- ✅ ROAS calculation
- ✅ Profit margin %
- ✅ Auto-updates when orders confirmed

**Cost Types**:
- `Meta Ads` - Facebook/Instagram advertising
- `Google Ads` - Google Search/Display
- `TikTok Ads` - TikTok advertising
- `Snapchat Ads` - Snapchat advertising
- `Influencer` - Influencer collaboration fees
- `Content Creation` - Photography, videography
- `Photography` - Product photoshoots
- `Other` - Miscellaneous costs

**Metrics**:
- **Total Revenue** - Sum of all order totals
- **Total COGS** - Sum of (quantity × costPrice)
- **Total Ad Spend** - Sum of ad platform costs
- **Total Other Costs** - Sum of non-ad costs
- **Gross Profit** - Revenue - COGS
- **Net Profit** - Gross Profit - Ad Spend - Other Costs
- **ROI** - (Net Profit / Total Costs) × 100
- **ROAS** - Revenue / Ad Spend
- **Profit Margin** - (Net Profit / Revenue) × 100

**Example P&L**:
```
Revenue:           45,000 MAD
COGS:             -25,000 MAD
─────────────────────────
Gross Profit:      20,000 MAD

Ad Spend:          -8,000 MAD
Other Costs:       -2,000 MAD
─────────────────────────
NET PROFIT:        10,000 MAD

ROI:               33.3%
ROAS:              5.6x
Profit Margin:     22.2%
```

### 6. Events Module

**Purpose**: Measure seasonal event impact vs normal periods

**Pages**:
- `/events` - Events dashboard with impact metrics
- `/events/[id]` - Event detail with category/product breakdown

**Key Features**:
- ✅ Create events (Ramadan, Black Friday, Mother's Day, etc.)
- ✅ Link categories to events
- ✅ Link products to events
- ✅ **Compare vs normal period**:
  - Same duration BEFORE event
  - Revenue increase %
  - Orders increase %
- ✅ **Category performance breakdown**
- ✅ **Top products ranking**
- ✅ Auto-updates when orders confirmed

**Event Types**:
- `Ramadan` - Ramadan season
- `Black Friday` - Black Friday sales
- `Mother's Day` - Mother's Day promotion
- `Summer Sale` - Summer clearance
- `Flash Sale` - Limited-time offers
- `Custom` - Custom events

**Metrics**:
- **Total Revenue** - Sum during event period
- **Total Orders** - Count during event period
- **Normal Period Revenue** - Same duration before event
- **Normal Period Orders** - Same duration before event
- **Revenue Increase** - ((Event - Normal) / Normal) × 100
- **Orders Increase** - ((Event - Normal) / Normal) × 100
- **Top Category** - Category with most revenue
- **Top Product** - Product with most revenue

**Example Impact Analysis**:
```
Event: Ramadan 2027
Period: March 1-30, 2027 (30 days)

Event Performance:
  Revenue:     120,000 MAD
  Orders:      450
  Avg Order:   267 MAD

Normal Period (Feb 1-28, same 30 days):
  Revenue:     80,000 MAD
  Orders:      300
  Avg Order:   267 MAD

Impact:
  Revenue Increase:  +50%
  Orders Increase:   +50%

Category Breakdown:
  Hair Care:   75,000 MAD (62.5%)
  Skin Care:   30,000 MAD (25%)
  Makeup:      15,000 MAD (12.5%)

Top Product: Salerm 21 Shampooing (25,000 MAD)
```

---

## API Reference

### Authentication

All API endpoints require authentication via NextAuth session.

**Auth Check**:
```typescript
const session = await getServerSession(authOptions)
if (!session?.user?.email) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

### Base URL

**Production**: `https://ops.shinecosmetics.ma/api/ops`  
**Local**: `http://localhost:3000/api/ops`

---

### Orders API

#### List Orders
```http
GET /api/ops/orders?status=CONFIRMED&search=john&sort=createdAt&order=DESC&limit=50
```

**Query Parameters**:
- `status` - Filter by status (PENDING, CONFIRMED, DELIVERED, CANCELLED)
- `search` - Search by order number, customer name, phone
- `sort` - Sort field (createdAt, total, orderNumber)
- `order` - Sort order (ASC, DESC)
- `limit` - Number of results (default: 50)
- `offset` - Pagination offset

**Response**:
```json
{
  "orders": [...],
  "total": 123,
  "summary": {
    "totalOrders": 123,
    "totalRevenue": 45000,
    "pendingCount": 12,
    "confirmedCount": 98,
    "deliveredCount": 13
  }
}
```

#### Get Order
```http
GET /api/ops/orders/123
```

**Response**:
```json
{
  "id": 123,
  "orderNumber": "ORD-20260606-123",
  "userId": 5,
  "deliveryName": "John Doe",
  "deliveryPhone": "0612345678",
  "total": 450,
  "status": "CONFIRMED",
  "campaignId": 1,
  "eventId": 2,
  "items": [
    {
      "productId": 15,
      "productName": "Olaplex No.3",
      "quantity": 2,
      "price": 225,
      "totalPrice": 450
    }
  ],
  "statusHistory": [...],
  "senditShipment": {...}
}
```

#### Create Order
```http
POST /api/ops/orders
```

**Request Body**:
```json
{
  "userId": 5,  // Optional - omit for guest orders
  "deliveryName": "John Doe",
  "deliveryPhone": "0612345678",
  "deliveryCity": "Casablanca",
  "deliveryAddress": "123 Rue Example",
  "paymentMethod": "COD",
  "campaignId": 1,  // Optional - for attribution
  "eventId": 2,     // Optional - for attribution
  "items": [
    {
      "productId": 15,
      "quantity": 2,
      "price": 225
    }
  ]
}
```

#### Update Order
```http
PUT /api/ops/orders/123
```

**Request Body** (all fields optional):
```json
{
  "status": "CONFIRMED",
  "deliveryName": "John Doe",
  "deliveryPhone": "0612345678",
  "deliveryCity": "Casablanca",
  "deliveryAddress": "123 Rue Example",
  "notes": "Leave at door"
}
```

**⚠️ IMPORTANT**: When `status` changes to `CONFIRMED`, the system automatically:
1. Creates Sendit shipment
2. Reduces inventory stock
3. Updates customer metrics
4. Updates campaign P&L (if campaignId)
5. Updates event metrics (if eventId)

#### Delete Order
```http
DELETE /api/ops/orders/123
```

**Note**: Deletes order and moves to OrderAuditLog for record-keeping.

---

### Products API

#### List Products
```http
GET /api/ops/products?category=Hair+Care&search=olaplex&inStock=true
```

**Query Parameters**:
- `category` - Filter by category
- `brand` - Filter by brand
- `search` - Search by name, SKU
- `inStock` - Filter in-stock only (true/false)

#### Get Product
```http
GET /api/ops/products/15
```

#### Create Product
```http
POST /api/ops/products
```

**Request Body**:
```json
{
  "name": "Olaplex No.3",
  "brand": "Olaplex",
  "category": "Hair Care",
  "price": 225,
  "costPrice": 140,
  "stock": 50,
  "reorderPoint": 10,
  "supplier": "Beauty Wholesale MA",
  "image": "/uploads/olaplex-no3.jpg"
}
```

#### Update Product
```http
PUT /api/ops/products/15
```

#### Delete Product
```http
DELETE /api/ops/products/15
```

---

### Inventory API

#### List Inventory
```http
GET /api/ops/inventory?status=Low+stock&supplier=Beauty+Wholesale
```

**Query Parameters**:
- `status` - Filter by stock status (In stock, Low stock, Out of stock)
- `supplier` - Filter by supplier
- `search` - Search by product name

**Response**:
```json
{
  "products": [
    {
      "id": 15,
      "name": "Olaplex No.3",
      "stock": 8,
      "reorderPoint": 10,
      "stockStatus": "Low stock",
      "weeklySales": 12,
      "daysOfStockLeft": 4,
      "activeAlerts": 1
    }
  ],
  "summary": {
    "total": 150,
    "lowStock": 12,
    "outOfStock": 3,
    "inStock": 135
  }
}
```

#### Record Stock Movement
```http
POST /api/ops/inventory/movement
```

**Request Body**:
```json
{
  "productId": 15,
  "type": "Purchase",  // Purchase, Sale, Adjustment, Return, Damage
  "quantity": 20,
  "reason": "Restock from supplier"
}
```

**Note**: `Sale` movements are created automatically on order confirmation.

#### Get Movement History
```http
GET /api/ops/inventory/movement?productId=15&type=Sale
```

#### Get Stock Alerts
```http
GET /api/ops/inventory/alerts?acknowledged=false&severity=critical
```

**Query Parameters**:
- `acknowledged` - Filter by acknowledged status (true/false)
- `severity` - Filter by severity (critical, warning, info)

#### Acknowledge Alert
```http
POST /api/ops/inventory/alerts/123
```

#### Resolve Alert
```http
DELETE /api/ops/inventory/alerts/123
```

---

### Customers API

#### List Customers
```http
GET /api/ops/customers?segment=VIP&tier=Platinum&search=john&churnRisk=high
```

**Query Parameters**:
- `segment` - Filter by segment (VIP, Regular, At Risk, New, Churned)
- `tier` - Filter by tier (Platinum, Gold, Silver, Bronze)
- `search` - Search by name, email, phone
- `churnRisk` - Filter by churn risk (high ≥70%, medium 40-69%, low <40%)
- `sort` - Sort field (lifetimeValue, ordersCount, lastOrderDate)
- `order` - Sort order (ASC, DESC)

**Response**:
```json
{
  "customers": [
    {
      "id": 5,
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "0612345678",
      "segment": "VIP",
      "tier": "Platinum",
      "ordersCount": 12,
      "lifetimeValue": 5400,
      "averageOrderValue": 450,
      "lastOrderDate": "2026-06-01",
      "daysSinceLastOrder": 5,
      "rfmScore": "545",
      "churnRisk": 10
    }
  ],
  "total": 234
}
```

#### Get Customer
```http
GET /api/ops/customers/5
```

**Response** includes:
- Customer data
- Order history
- Activity timeline
- RFM scores and metrics

#### Update Customer
```http
PUT /api/ops/customers/5
```

**Request Body**:
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "0612345678",
  "segment": "VIP",
  "tier": "Platinum",
  "tags": ["high-value", "repeat-buyer"],
  "notes": "Prefers WhatsApp communication",
  "emailOptIn": true,
  "smsOptIn": false,
  "whatsappOptIn": true
}
```

#### Calculate RFM for Customer
```http
POST /api/ops/customers/5/calculate-rfm
```

**Response**:
```json
{
  "recencyScore": 5,
  "frequencyScore": 4,
  "monetaryScore": 5,
  "rfmScore": "545",
  "segment": "VIP",
  "tier": "Platinum",
  "churnRisk": 10
}
```

#### Get Segment Statistics
```http
GET /api/ops/customers/segments
```

**Response**:
```json
{
  "segments": [
    {
      "segment": "VIP",
      "count": 23,
      "avgLifetimeValue": 4200,
      "avgChurnRisk": 15
    },
    {
      "segment": "Regular",
      "count": 156,
      "avgLifetimeValue": 1200,
      "avgChurnRisk": 35
    },
    {
      "segment": "At Risk",
      "count": 45,
      "avgLifetimeValue": 800,
      "avgChurnRisk": 75
    }
  ],
  "tiers": {
    "Platinum": 12,
    "Gold": 45,
    "Silver": 89,
    "Bronze": 88
  }
}
```

---

### Campaigns API

#### List Campaigns
```http
GET /api/ops/campaigns?status=Active&sort=roi&order=DESC
```

**Query Parameters**:
- `status` - Filter by status (Draft, Active, Completed, Paused)
- `sort` - Sort field (roi, roas, netProfit, totalRevenue)
- `order` - Sort order (ASC, DESC)

**Response**:
```json
{
  "campaigns": [
    {
      "id": 1,
      "name": "Black Friday 2026",
      "status": "Active",
      "startDate": "2026-11-27",
      "endDate": "2026-11-29",
      "totalRevenue": 45000,
      "totalCosts": 35000,
      "netProfit": 10000,
      "roi": 28.57,
      "roas": 5.6,
      "totalOrders": 150,
      "productsCount": 5,
      "costsCount": 8
    }
  ],
  "total": 12
}
```

#### Get Campaign
```http
GET /api/ops/campaigns/1
```

**Response** includes:
- Campaign data
- P&L metrics (CampaignMetrics)
- Products list
- Costs list
- Costs grouped by type
- Posts list
- Orders list

#### Create Campaign
```http
POST /api/ops/campaigns
```

**Request Body**:
```json
{
  "name": "Black Friday 2026",
  "description": "Annual Black Friday sale",
  "status": "Active",
  "startDate": "2026-11-27",
  "endDate": "2026-11-29",
  "targetRevenue": 50000,
  "targetOrders": 200,
  "budgetTotal": 15000,
  "budgetAdSpend": 10000,
  "budgetOther": 5000,
  "assignedTo": ["achraf@example.com", "marjan@example.com"]
}
```

#### Update Campaign
```http
PUT /api/ops/campaigns/1
```

#### Delete Campaign
```http
DELETE /api/ops/campaigns/1
```

#### Add Cost to Campaign
```http
POST /api/ops/campaigns/1/costs
```

**Request Body**:
```json
{
  "type": "Meta Ads",
  "platform": "Instagram",
  "description": "Instagram Stories + Reels campaign",
  "amount": 5000,
  "date": "2026-11-25",
  "receiptUrl": "https://example.com/receipt.pdf"
}
```

**Auto-triggers**: Recalculates campaign P&L metrics

#### Get Campaign Costs
```http
GET /api/ops/campaigns/1/costs
```

**Response**:
```json
{
  "costs": [
    {
      "id": 1,
      "type": "Meta Ads",
      "platform": "Instagram",
      "amount": 5000,
      "description": "Instagram Stories campaign",
      "date": "2026-11-25"
    }
  ],
  "totals": [
    {
      "type": "Meta Ads",
      "count": 3,
      "total": 8000
    },
    {
      "type": "Influencer",
      "count": 2,
      "total": 3000
    }
  ]
}
```

#### Add Products to Campaign
```http
POST /api/ops/campaigns/1/products
```

**Request Body**:
```json
{
  "productId": 15,
  "targetSales": 100,
  "targetRevenue": 22500,
  "discountPercent": 30,
  "specialPrice": 157.5
}
```

#### Get Campaign Products
```http
GET /api/ops/campaigns/1/products
```

#### Remove Product from Campaign
```http
DELETE /api/ops/campaigns/1/products?productId=15
```

#### Recalculate Campaign Metrics
```http
POST /api/ops/campaigns/1/calculate
```

**Returns**:
```json
{
  "success": true,
  "metrics": {
    "totalRevenue": 45000,
    "totalCOGS": 25000,
    "totalAdSpend": 8000,
    "totalOtherCosts": 2000,
    "grossProfit": 20000,
    "netProfit": 10000,
    "roi": 28.57,
    "roas": 5.6,
    "profitMargin": 22.2
  }
}
```

---

### Events API

#### List Events
```http
GET /api/ops/events?status=Active&type=Ramadan&sort=startDate&order=DESC
```

**Query Parameters**:
- `status` - Filter by status (Upcoming, Active, Completed)
- `type` - Filter by type (Ramadan, Black Friday, etc.)
- `sort` - Sort field (startDate, totalRevenue, revenueIncrease)
- `order` - Sort order (ASC, DESC)

**Response**:
```json
{
  "events": [
    {
      "id": 1,
      "name": "Ramadan 2027",
      "type": "Ramadan",
      "status": "Active",
      "startDate": "2027-03-01",
      "endDate": "2027-03-30",
      "totalRevenue": 120000,
      "totalOrders": 450,
      "revenueIncrease": 50,
      "ordersIncrease": 50,
      "topCategory": "Hair Care"
    }
  ],
  "total": 8
}
```

#### Get Event
```http
GET /api/ops/events/1
```

**Response** includes:
- Event data
- Impact metrics (EventMetrics)
- Category performance breakdown
- Product performance breakdown
- Orders during event

#### Create Event
```http
POST /api/ops/events
```

**Request Body**:
```json
{
  "name": "Ramadan 2027",
  "description": "Annual Ramadan promotion",
  "type": "Ramadan",
  "status": "Upcoming",
  "startDate": "2027-03-01",
  "endDate": "2027-03-30",
  "discountType": "Percentage",
  "discountValue": 20,
  "minOrderAmount": 200,
  "targetRevenue": 150000,
  "targetOrders": 500
}
```

#### Update Event
```http
PUT /api/ops/events/1
```

#### Delete Event
```http
DELETE /api/ops/events/1
```

#### Recalculate Event Impact
```http
POST /api/ops/events/1/calculate
```

**Returns**:
```json
{
  "success": true,
  "metrics": {
    "totalRevenue": 120000,
    "totalOrders": 450,
    "normalPeriodRevenue": 80000,
    "normalPeriodOrders": 300,
    "revenueIncrease": 50,
    "ordersIncrease": 50,
    "topCategory": "Hair Care",
    "topProduct": "Salerm 21 Shampooing"
  },
  "categories": [
    {
      "category": "Hair Care",
      "revenue": 75000,
      "orders": 280,
      "units": 520
    }
  ],
  "products": [
    {
      "productId": 1,
      "productName": "Salerm 21 Shampooing",
      "revenue": 25000,
      "orders": 95,
      "units": 95
    }
  ]
}
```

---

### Utility API

#### Batch Update RFM Scores
```http
POST /api/ops/utils/update-rfm
```

**Purpose**: Recalculate RFM scores for ALL customers

**Response**:
```json
{
  "success": true,
  "message": "RFM scores updated: 234 success, 0 failed",
  "result": {
    "success": 234,
    "failed": 0
  },
  "segments": [
    {
      "segment": "VIP",
      "count": 23,
      "avgLTV": 4200
    }
  ]
}
```

#### Update Single Customer RFM
```http
GET /api/ops/utils/update-rfm?userId=5
```

#### Batch Update Product Metrics
```http
POST /api/ops/utils/update-metrics?type=all
```

**Query Parameters**:
- `type` - Type of metrics to update (margins, stock, all)

**Purpose**:
- `margins` - Recalculate profitMargin for all products
- `stock` - Recalculate weeklySales and daysOfStockLeft
- `all` - Both

**Response**:
```json
{
  "success": true,
  "message": "Metrics updated: 150 margins, 150 stock metrics",
  "marginsUpdated": 150,
  "stockMetricsUpdated": 150,
  "totalProducts": 150
}
```

#### Update Single Product Metrics
```http
GET /api/ops/utils/update-metrics?productId=15&type=margins
```

---

## User Workflows

### Workflow 1: Process New Order

**Steps**:
1. Customer places order on website (Parashop.ma)
2. Order created in BOS via API (status: PENDING)
3. BOS operator reviews order at `/orders`
4. Click order to open `/orders/[id]`
5. Verify details (customer info, products, total)
6. Click "Confirm Order"
7. System automatically:
   - Status changes to CONFIRMED
   - Creates Sendit shipment
   - Reduces product stock
   - Updates customer LTV and order count
   - Updates campaign P&L if linked
   - Updates event metrics if during event
8. View Sendit tracking info
9. When delivered, update status to DELIVERED

**Result**: Stock reduced, customer upgraded to "Regular" segment, campaign ROI updated

---

### Workflow 2: Track Campaign ROI

**Steps**:
1. Create campaign:
   ```bash
   POST /api/ops/campaigns
   {
     "name": "Instagram December Push",
     "status": "Active",
     "startDate": "2026-12-01",
     "endDate": "2026-12-31"
   }
   ```

2. Navigate to `/campaigns/1` (campaign detail page)

3. Add costs as they occur:
   - Click "Add cost"
   - Type: Meta Ads
   - Platform: Instagram
   - Amount: 5000 MAD
   - Description: "Instagram Stories campaign"
   - Submit

4. Repeat for all costs:
   - Influencer collaboration: 3000 MAD
   - Product photography: 1500 MAD
   - Content creation: 1000 MAD

5. Link orders to campaign:
   - When creating orders, set `campaignId: 1`
   - OR capture UTM parameters from website
   - System auto-links orders with `utm_campaign=instagram-december`

6. Orders confirmed → P&L auto-updates

7. View real-time P&L on `/campaigns/1`:
   ```
   Revenue:        45,000 MAD
   COGS:          -25,000 MAD
   Gross Profit:   20,000 MAD
   Ad Spend:       -5,000 MAD
   Other Costs:    -5,500 MAD
   NET PROFIT:      9,500 MAD
   
   ROI:            27.1%
   ROAS:           9x
   Profit Margin:  21.1%
   ```

**Result**: Know exact profit after all costs, make data-driven decisions

---

### Workflow 3: Measure Event Impact

**Steps**:
1. Create event:
   ```bash
   POST /api/ops/events
   {
     "name": "Ramadan 2027",
     "type": "Ramadan",
     "startDate": "2027-03-01",
     "endDate": "2027-03-30",
     "discountValue": 20
   }
   ```

2. Orders come in during event period
   - System auto-links orders to event by date range
   - OR manually set `eventId: 1` on orders

3. During or after event, click "Recalculate impact" on `/events/1`

4. System calculates:
   - Event period performance (March 1-30)
   - Normal period performance (Feb 1-28, same 30 days)
   - Revenue increase %
   - Orders increase %
   - Category breakdown
   - Top products

5. View results on `/events/1`:
   ```
   Event Revenue:    120,000 MAD (+50% vs normal)
   Event Orders:     450 (+50% vs normal)
   Normal Revenue:   80,000 MAD
   Normal Orders:    300
   
   Top Category: Hair Care (75,000 MAD)
   Top Product:  Salerm 21 Shampooing (25,000 MAD)
   
   Category Breakdown:
   - Hair Care:  75,000 MAD (62%)
   - Skin Care:  30,000 MAD (25%)
   - Makeup:     15,000 MAD (13%)
   ```

**Result**: Understand which events drive revenue, which categories/products perform best

---

### Workflow 4: Manage Inventory

**Steps**:
1. Navigate to `/inventory`

2. View dashboard:
   - Total products tracked
   - Low stock count (stock ≤ reorderPoint)
   - Out of stock count
   - Active alerts

3. Check alerts panel at top:
   - Critical alerts (out of stock) in red
   - Warning alerts (low stock) in amber
   - Info alerts in blue

4. When stock is low:
   - Click alert to view product
   - Contact supplier
   - Create purchase order (manual or via API)
   - Receive stock
   - Record movement:
     ```bash
     POST /api/ops/inventory/movement
     {
       "productId": 15,
       "type": "Purchase",
       "quantity": 50,
       "reason": "Restock from Beauty Wholesale"
     }
     ```

5. System automatically:
   - Updates stock level
   - Updates stockStatus
   - Resolves alert if stock > reorderPoint
   - Recalculates daysOfStockLeft

6. Acknowledge alert to remove from dashboard

**Result**: Never run out of stock, automated reorder alerts, full stock history

---

### Workflow 5: Segment Customers

**Steps**:
1. Orders come in and get confirmed

2. System automatically:
   - Tracks customer by phone number
   - Updates order count, LTV
   - (Manual trigger needed for RFM initially)

3. Run RFM batch update:
   ```bash
   POST /api/ops/utils/update-rfm
   ```

4. System calculates for each customer:
   - Recency score (days since last order)
   - Frequency score (total orders)
   - Monetary score (lifetime spend)
   - Auto-assigns segment (VIP, Regular, At Risk, New, Churned)
   - Auto-assigns tier (Platinum, Gold, Silver, Bronze)
   - Calculates churn risk %

5. Navigate to `/customers`

6. Filter by segment:
   - Click "VIP" to see high-value customers
   - Click "At Risk" to see customers who need attention
   - Click "Churned" to see lost customers

7. Export VIP list for special offers

8. Contact "At Risk" customers with personalized discounts

**Result**: Data-driven customer engagement, reduce churn, reward VIPs

---

## Integration Guide

### Integrating with E-commerce Website

**Scenario**: Link website orders (Parashop.ma) to BOS

#### 1. Order Creation Webhook

When customer completes checkout on website:

```typescript
// On your e-commerce backend
async function onCheckoutComplete(order) {
  // Create order in BOS
  const response = await fetch('https://ops.shinecosmetics.ma/api/ops/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BOS_API_KEY}`, // Setup needed
    },
    body: JSON.stringify({
      userId: order.userId, // null for guest
      deliveryName: order.shipping.name,
      deliveryPhone: order.shipping.phone,
      deliveryCity: order.shipping.city,
      deliveryAddress: order.shipping.address,
      paymentMethod: order.paymentMethod,
      campaignId: getCampaignId(order.utmCampaign),
      eventId: getEventId(new Date()),
      utmSource: order.utmSource,
      utmMedium: order.utmMedium,
      utmCampaign: order.utmCampaign,
      utmContent: order.utmContent,
      items: order.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
      })),
    }),
  })
  
  const bosOrder = await response.json()
  
  // Save BOS order ID in your database
  await db.orders.update(order.id, {
    bosOrderId: bosOrder.id,
  })
}
```

#### 2. UTM Parameter Capture

Capture UTM parameters on website to enable campaign attribution:

```typescript
// On your e-commerce frontend
function captureUTM() {
  const params = new URLSearchParams(window.location.search)
  
  const utm = {
    source: params.get('utm_source'),
    medium: params.get('utm_medium'),
    campaign: params.get('utm_campaign'),
    content: params.get('utm_content'),
  }
  
  // Save to session/cookie for checkout
  sessionStorage.setItem('utm', JSON.stringify(utm))
  
  return utm
}

// Include in order
const utm = JSON.parse(sessionStorage.getItem('utm') || '{}')
order.utmSource = utm.source
order.utmMedium = utm.medium
order.utmCampaign = utm.campaign
order.utmContent = utm.content
```

#### 3. Campaign URL Format

Create trackable URLs for campaigns:

```
Instagram Story:
https://parashop.ma/products/olaplex-no3?utm_source=instagram&utm_medium=story&utm_campaign=black-friday-2026&utm_content=story-1

Google Ads:
https://parashop.ma?utm_source=google&utm_medium=cpc&utm_campaign=hair-care-search&utm_content=ad-variant-a

Influencer Link:
https://parashop.ma?utm_source=instagram&utm_medium=influencer&utm_campaign=nour-beauty-collab&utm_content=bio-link
```

#### 4. Event Date-Based Attribution

Auto-link orders to events by date range:

```typescript
function getEventId(orderDate: Date): number | null {
  // Query active events that include this date
  const events = await db.query(`
    SELECT id FROM "Event"
    WHERE $1 BETWEEN "startDate" AND "endDate"
      AND status = 'Active'
    LIMIT 1
  `, [orderDate])
  
  return events.rows[0]?.id || null
}
```

---

### Integrating with WhatsApp Business

**Scenario**: Take orders via WhatsApp, create in BOS

```typescript
// WhatsApp webhook handler
async function onWhatsAppMessage(message) {
  if (message.type === 'order') {
    // Parse order from WhatsApp message
    const order = parseWhatsAppOrder(message.text)
    
    // Create in BOS
    const response = await fetch('https://ops.shinecosmetics.ma/api/ops/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deliveryName: order.customerName,
        deliveryPhone: message.from, // WhatsApp number
        deliveryCity: order.city,
        deliveryAddress: order.address,
        paymentMethod: 'COD',
        items: order.items,
        utmSource: 'whatsapp',
        utmMedium: 'direct',
      }),
    })
    
    const bosOrder = await response.json()
    
    // Send confirmation via WhatsApp
    await sendWhatsAppMessage(message.from, `
      ✅ Order confirmed! #${bosOrder.orderNumber}
      Total: ${bosOrder.total} MAD
      Delivery: ${order.city}
      Track: https://ops.shinecosmetics.ma/orders/${bosOrder.id}
    `)
  }
}
```

---

### Sendit Delivery Integration

**Already integrated** - auto-creates shipment on order confirmation.

**Configuration**:
```typescript
// lib/sendit.ts
export async function createSenditShipment(data) {
  const response = await fetch('https://api.sendit.ma/v1/shipments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SENDIT_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reference: data.reference,
      recipient_name: data.recipient_name,
      recipient_phone: data.recipient_phone,
      recipient_city: data.recipient_city,
      recipient_address: data.recipient_address,
      cod_amount: data.cod_amount,
      package_weight: data.package_weight,
      package_description: data.package_description,
    }),
  })
  
  return await response.json()
}
```

**Webhook for Status Updates**:
```typescript
// app/api/webhooks/sendit/route.ts
export async function POST(request: NextRequest) {
  const body = await request.json()
  
  // Update order status based on Sendit status
  if (body.status === 'delivered') {
    await pool.query(
      'UPDATE "Order" SET status = $1, "senditStatus" = $2 WHERE "senditTrackingId" = $3',
      ['DELIVERED', body.status, body.tracking_id]
    )
  }
  
  return NextResponse.json({ success: true })
}
```

---

## Calculations & Formulas

### Product Margin Calculation

```typescript
profitMargin = ((price - costPrice) / price) × 100

Example:
  Price:      299 MAD
  Cost:       180 MAD
  Margin:     ((299 - 180) / 299) × 100 = 39.8%
```

### Stock Metrics Calculation

```typescript
// Weekly sales (last 7 days)
weeklySales = COUNT(OrderItem.quantity)
              WHERE Order.status IN ('CONFIRMED', 'DELIVERED')
                AND Order.createdAt >= NOW() - INTERVAL '7 days'
                AND OrderItem.productId = productId

// Daily sales rate
dailySales = weeklySales / 7

// Days of stock left
daysOfStockLeft = FLOOR(currentStock / dailySales)

Example:
  Current stock:  50 units
  Weekly sales:   14 units
  Daily sales:    2 units/day
  Days left:      50 / 2 = 25 days
```

### RFM Score Calculation

```typescript
// 1. Calculate Recency Score
daysSinceLastOrder = FLOOR((NOW() - lastOrderDate) / 86400000)

if (daysSinceLastOrder <= 30) recencyScore = 5
else if (daysSinceLastOrder <= 60) recencyScore = 4
else if (daysSinceLastOrder <= 90) recencyScore = 3
else if (daysSinceLastOrder <= 180) recencyScore = 2
else recencyScore = 1

// 2. Calculate Frequency Score
if (ordersCount >= 10) frequencyScore = 5
else if (ordersCount >= 5) frequencyScore = 4
else if (ordersCount >= 3) frequencyScore = 3
else if (ordersCount >= 2) frequencyScore = 2
else frequencyScore = 1

// 3. Calculate Monetary Score (MAD)
if (lifetimeValue >= 3000) monetaryScore = 5
else if (lifetimeValue >= 1500) monetaryScore = 4
else if (lifetimeValue >= 800) monetaryScore = 3
else if (lifetimeValue >= 400) monetaryScore = 2
else monetaryScore = 1

// 4. Concatenate RFM Score
rfmScore = `${recencyScore}${frequencyScore}${monetaryScore}`

Example:
  Last order: 20 days ago → R = 5
  Total orders: 8 → F = 4
  Lifetime value: 2400 MAD → M = 4
  RFM Score: "544"
```

### Customer Segment Assignment

```typescript
if (ordersCount === 1) {
  if (daysSinceLastOrder <= 60) segment = 'New'
  else segment = 'At Risk'
} else if (ordersCount >= 2) {
  if (recencyScore >= 4 && monetaryScore >= 4) segment = 'VIP'
  else if (recencyScore >= 3 && frequencyScore >= 2) segment = 'Regular'
  else if (recencyScore <= 2) segment = 'At Risk'
  else segment = 'Regular'
}

if (daysSinceLastOrder >= 180) segment = 'Churned'

Example:
  Orders: 8, Last order: 20 days ago, LTV: 2400 MAD
  → recencyScore = 5, monetaryScore = 4
  → Segment = "VIP"
```

### Churn Risk Calculation

```typescript
if (ordersCount === 1) {
  // Single-order customers
  if (daysSinceLastOrder >= 90) churnRisk = 80
  else if (daysSinceLastOrder >= 60) churnRisk = 60
  else if (daysSinceLastOrder >= 30) churnRisk = 40
  else churnRisk = 20
} else {
  // Repeat customers
  if (daysSinceLastOrder >= 180) churnRisk = 90
  else if (daysSinceLastOrder >= 120) churnRisk = 70
  else if (daysSinceLastOrder >= 90) churnRisk = 50
  else if (daysSinceLastOrder >= 60) churnRisk = 30
  else churnRisk = 10
}

Example:
  Orders: 1, Days since: 75
  → Churn Risk = 60%
```

### Campaign P&L Calculation

```typescript
// 1. Calculate Revenue
totalRevenue = SUM(Order.total)
               WHERE Order.campaignId = campaignId
                 AND Order.status IN ('CONFIRMED', 'DELIVERED')

// 2. Calculate COGS (Cost of Goods Sold)
totalCOGS = SUM(OrderItem.quantity × Product.costPrice)
            WHERE Order.campaignId = campaignId

// 3. Calculate Ad Spend
totalAdSpend = SUM(CampaignCost.amount)
               WHERE CampaignCost.campaignId = campaignId
                 AND CampaignCost.type IN (
                   'Meta Ads', 'Google Ads', 'TikTok Ads', 'Snapchat Ads'
                 )

// 4. Calculate Other Costs
totalOtherCosts = SUM(CampaignCost.amount)
                  WHERE CampaignCost.campaignId = campaignId
                    AND CampaignCost.type NOT IN (
                      'Meta Ads', 'Google Ads', 'TikTok Ads', 'Snapchat Ads'
                    )

// 5. Calculate Profits
grossProfit = totalRevenue - totalCOGS
netProfit = grossProfit - totalAdSpend - totalOtherCosts

// 6. Calculate ROI
totalCosts = totalCOGS + totalAdSpend + totalOtherCosts
roi = (netProfit / totalCosts) × 100

// 7. Calculate ROAS
roas = totalRevenue / totalAdSpend

// 8. Calculate Profit Margin
profitMargin = (netProfit / totalRevenue) × 100

Example:
  Revenue:        45,000 MAD
  COGS:           25,000 MAD
  Ad Spend:        8,000 MAD
  Other Costs:     2,000 MAD
  
  Gross Profit:   20,000 MAD
  Net Profit:     10,000 MAD
  Total Costs:    35,000 MAD
  
  ROI:           (10,000 / 35,000) × 100 = 28.6%
  ROAS:           45,000 / 8,000 = 5.6x
  Profit Margin: (10,000 / 45,000) × 100 = 22.2%
```

### Event Impact Calculation

```typescript
// 1. Define Event Period
eventStart = event.startDate
eventEnd = event.endDate
duration = eventEnd - eventStart

// 2. Calculate Event Performance
eventRevenue = SUM(Order.total)
               WHERE Order.createdAt BETWEEN eventStart AND eventEnd
                 AND Order.status IN ('CONFIRMED', 'DELIVERED')

eventOrders = COUNT(Order.id)
              WHERE Order.createdAt BETWEEN eventStart AND eventEnd
                AND Order.status IN ('CONFIRMED', 'DELIVERED')

// 3. Define Normal Period (same duration BEFORE event)
normalStart = eventStart - duration
normalEnd = eventStart

// 4. Calculate Normal Performance
normalRevenue = SUM(Order.total)
                WHERE Order.createdAt BETWEEN normalStart AND normalEnd
                  AND Order.status IN ('CONFIRMED', 'DELIVERED')

normalOrders = COUNT(Order.id)
               WHERE Order.createdAt BETWEEN normalStart AND normalEnd
                 AND Order.status IN ('CONFIRMED', 'DELIVERED')

// 5. Calculate Increase %
revenueIncrease = ((eventRevenue - normalRevenue) / normalRevenue) × 100
ordersIncrease = ((eventOrders - normalOrders) / normalOrders) × 100

Example:
  Event: March 1-30 (30 days)
  Normal: Feb 1-28 (30 days)
  
  Event Revenue:     120,000 MAD
  Event Orders:      450
  
  Normal Revenue:    80,000 MAD
  Normal Orders:     300
  
  Revenue Increase: ((120,000 - 80,000) / 80,000) × 100 = +50%
  Orders Increase:  ((450 - 300) / 300) × 100 = +50%
```

---

## Troubleshooting

### Common Issues

#### 1. Order Confirmation Not Updating Metrics

**Symptom**: Order status changed to CONFIRMED but stock didn't reduce, customer metrics didn't update, campaign P&L didn't change.

**Diagnosis**:
```bash
# Check server logs
# Look for "Order integrations" messages
```

**Possible Causes**:
- Database connection error
- PostgreSQL function error
- Transaction rolled back due to error

**Solution**:
```bash
# Manually trigger integration
POST /api/ops/orders/123/integrate  # (Not implemented - manual workaround)

# Or update stock manually
POST /api/ops/inventory/movement
{
  "productId": 15,
  "type": "Sale",
  "quantity": -2,
  "reason": "Manual correction for order #123"
}

# Update customer manually
POST /api/ops/utils/update-rfm?userId=5

# Recalculate campaign
POST /api/ops/campaigns/1/calculate
```

---

#### 2. RFM Scores Not Calculating

**Symptom**: Customer segment shows null or scores are 0-0-0.

**Diagnosis**:
```bash
# Check if customer has orders
GET /api/ops/customers/5

# Check if orders have status CONFIRMED or DELIVERED
```

**Possible Causes**:
- No confirmed orders for customer
- Phone number doesn't match
- RFM calculation not triggered

**Solution**:
```bash
# Manually trigger RFM calculation
POST /api/ops/utils/update-rfm

# For single customer
GET /api/ops/utils/update-rfm?userId=5
```

---

#### 3. Campaign P&L Shows $0

**Symptom**: Campaign metrics are all zero despite having orders.

**Diagnosis**:
```bash
# Check if orders have campaignId
GET /api/ops/campaigns/1

# Check if CampaignMetrics record exists
# Check if orders have status CONFIRMED or DELIVERED
```

**Possible Causes**:
- Orders not linked to campaign (campaignId is null)
- Orders still in PENDING status
- CampaignMetrics not calculated

**Solution**:
```bash
# Link orders to campaign (if missing)
PUT /api/ops/orders/123
{
  "campaignId": 1
}

# Recalculate metrics
POST /api/ops/campaigns/1/calculate
```

---

#### 4. Stock Alerts Not Appearing

**Symptom**: Product is low on stock but no alert shows on dashboard.

**Diagnosis**:
```bash
# Check product reorder point
GET /api/ops/products/15

# Check if trackInventory is enabled
# Check current stock level
```

**Possible Causes**:
- Stock > reorderPoint (not actually low)
- trackInventory = false
- Alert was acknowledged or resolved
- Stock movement didn't trigger alert generation

**Solution**:
```bash
# Lower reorder point
PUT /api/ops/products/15
{
  "reorderPoint": 20
}

# Enable inventory tracking
PUT /api/ops/products/15
{
  "trackInventory": true
}

# Manually create alert
# (Not exposed via API - use database)
INSERT INTO "StockAlert" (...)
```

---

#### 5. Sendit Shipment Creation Failed

**Symptom**: Order confirmed but no Sendit tracking ID.

**Diagnosis**:
```bash
# Check order detail
GET /api/ops/orders/123

# Look for _senditWarning in response
```

**Possible Causes**:
- Missing delivery info (name, phone, city)
- Sendit API error
- Invalid district ID

**Solution**:
```bash
# Update delivery info
PUT /api/ops/orders/123
{
  "deliveryName": "John Doe",
  "deliveryPhone": "0612345678",
  "deliveryCity": "Casablanca"
}

# Manually create shipment
# (Requires Sendit integration update)
```

---

#### 6. Guest Orders Not Tracking Customer

**Symptom**: Order confirmed but customer metrics not updated.

**Diagnosis**:
```bash
# Check if order has deliveryPhone
GET /api/ops/orders/123

# Check if User exists with that phone
# Search customers by phone
```

**Possible Causes**:
- deliveryPhone is empty or invalid
- No User record with that phone
- Phone number format mismatch

**Solution**:
```bash
# Create user with phone
# (Auto-created on first order with that phone)

# Or ensure order has phone
PUT /api/ops/orders/123
{
  "deliveryPhone": "0612345678"
}

# Recalculate customer metrics
POST /api/ops/utils/update-rfm
```

---

### Performance Issues

#### Slow Dashboard Loading

**Causes**:
- Large number of orders
- Complex aggregation queries
- Missing database indexes

**Solutions**:
```sql
-- Add indexes (already in migrations)
CREATE INDEX IF NOT EXISTS idx_order_status ON "Order"(status);
CREATE INDEX IF NOT EXISTS idx_order_created ON "Order"("createdAt");
CREATE INDEX IF NOT EXISTS idx_order_campaign ON "Order"("campaignId");

-- Use pagination
GET /api/ops/orders?limit=50&offset=0

-- Use date filters
GET /api/ops/orders?startDate=2026-06-01&endDate=2026-06-30
```

---

#### Database Connection Pool Exhausted

**Symptom**: "Too many connections" error.

**Cause**: Connection pool max reached.

**Solution**:
```typescript
// lib/db.ts
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Increase pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})
```

---

### Data Integrity Issues

#### Duplicate Orders

**Prevention**:
```sql
-- Add unique constraint to orderNumber
ALTER TABLE "Order" ADD CONSTRAINT unique_order_number UNIQUE ("orderNumber");
```

---

#### Negative Stock

**Prevention**:
```sql
-- Add check constraint
ALTER TABLE "Product" ADD CONSTRAINT check_stock_positive CHECK (stock >= 0);
```

**Recovery**:
```bash
# Find products with negative stock
SELECT * FROM "Product" WHERE stock < 0;

# Correct stock
UPDATE "Product" SET stock = 0 WHERE stock < 0;
```

---

## Maintenance

### Daily Tasks

- ✅ Review pending orders (`/orders?status=PENDING`)
- ✅ Check stock alerts (`/inventory`)
- ✅ Monitor campaign performance (`/campaigns`)

### Weekly Tasks

- ✅ Batch update RFM scores: `POST /api/ops/utils/update-rfm`
- ✅ Review at-risk customers: `/customers?segment=At+Risk`
- ✅ Check low stock products: `/inventory?status=Low+stock`
- ✅ Review campaign costs and ROI

### Monthly Tasks

- ✅ Archive completed campaigns
- ✅ Export customer data for analysis
- ✅ Review event impact reports
- ✅ Update reorder points based on sales trends
- ✅ Clean up resolved alerts

---

## Support & Resources

**Documentation**: This file  
**GitHub**: Private repository  
**Production**: https://ops.shinecosmetics.ma  
**Database**: PostgreSQL (Vercel Postgres)

**Team**:
- Achraf Mekouar (AM) - Founder
- Marjan (MH) - Co-Founder

---

## Changelog

### Version 1.0 - June 6, 2026

**Initial Release**
- ✅ Complete Order management with Sendit integration
- ✅ Product catalog with margin tracking
- ✅ Inventory management with auto-alerts
- ✅ Customer CRM with RFM segmentation
- ✅ Campaign ROI tracking with real P&L
- ✅ Event impact analysis
- ✅ Complete interconnection between all modules
- ✅ Phone-based customer tracking
- ✅ Auto-calculations via PostgreSQL functions

---

*End of Documentation*
