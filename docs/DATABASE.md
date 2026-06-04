# Database Documentation

Complete schema reference for Shine Cosmetics BOS.

**Last Updated**: June 4, 2026

---

## Connection

```typescript
// lib/db.ts
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
})

export default pool
```

**Database**: Neon PostgreSQL (Serverless)
**Shared with**: shinecosmetics.ma (main website)

---

## Shared Tables

These tables are used by BOTH the website and BOS:

### `Order`
Main orders table - created by website OR manually in BOS.

```sql
CREATE TABLE "Order" (
  id SERIAL PRIMARY KEY,
  "orderNumber" VARCHAR(50) UNIQUE,
  status VARCHAR(50) DEFAULT 'PENDING',
  total DECIMAL(10,2),
  "subtotal" DECIMAL(10,2),
  "discountTotal" DECIMAL(10,2) DEFAULT 0,
  
  -- Customer/Delivery Info
  "deliveryName" VARCHAR(255),
  "deliveryPhone" VARCHAR(50),
  "deliveryCity" VARCHAR(255),
  "deliveryAddress" TEXT,
  "deliveryNotes" TEXT,
  
  -- Payment
  "paymentMethod" VARCHAR(50) DEFAULT 'COD',
  "paymentStatus" VARCHAR(50) DEFAULT 'UNPAID',
  
  -- Delivery Fees
  "deliveryFeeCharged" DECIMAL(10,2) DEFAULT 0,     -- What customer paid
  "estimatedDeliveryCost" DECIMAL(10,2) DEFAULT 30, -- What we estimate
  "actualDeliveryCost" DECIMAL(10,2),               -- What Sendit charged (after delivery)
  
  -- BOS-Specific Fields
  "sourceChannel" VARCHAR(50),                       -- 'Website', 'WhatsApp', 'Instagram', 'TikTok'
  "estimatedProfit" DECIMAL(10,2),                   -- Calculated profit (estimated)
  "finalProfit" DECIMAL(10,2),                       -- Actual profit (after delivery)
  "marginPercent" DECIMAL(5,2),                      -- Profit margin %
  "revenue" DECIMAL(10,2),                           -- Same as total (for analytics)
  notes TEXT,                                        -- Internal notes
  
  -- Sendit Integration
  "senditShipmentId" VARCHAR(100),
  "senditTrackingUrl" TEXT,
  
  -- Timestamps
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_order_status ON "Order"(status);
CREATE INDEX idx_order_source ON "Order"("sourceChannel");
CREATE INDEX idx_order_created ON "Order"("createdAt");
```

**Status values**:
- `PENDING` - Just created, not confirmed
- `CONFIRMED` - Confirmed, ready to ship
- `SHIPPED` - With delivery partner
- `DELIVERED` - Successfully delivered
- `CANCELLED` - Cancelled by customer/founder

**Source channels**:
- `Website` - From shinecosmetics.ma
- `WhatsApp` - Manual order from WhatsApp
- `Instagram` - Manual order from Instagram DM
- `TikTok` - Manual order from TikTok
- `Manual` - Phone call or in-person

### `OrderItem`
Order line items (products + quantities).

```sql
CREATE TABLE "OrderItem" (
  id SERIAL PRIMARY KEY,
  "orderId" INTEGER NOT NULL REFERENCES "Order"(id) ON DELETE CASCADE,
  "productId" INTEGER NOT NULL REFERENCES "Product"(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  price DECIMAL(10,2) NOT NULL,           -- Selling price per unit
  "unitCost" DECIMAL(10,2),               -- Cost price per unit (from Product)
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_order_item_order ON "OrderItem"("orderId");
CREATE INDEX idx_order_item_product ON "OrderItem"("productId");
```

### `Product`
Product catalog - shared between website and BOS.

```sql
CREATE TABLE "Product" (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  brand VARCHAR(255),
  category VARCHAR(255),
  price DECIMAL(10,2) NOT NULL,              -- Retail price (shown on website)
  "costPrice" DECIMAL(10,2),                 -- Cost price (BOS only, used for profit calc)
  sku VARCHAR(100) UNIQUE,
  image TEXT,
  description TEXT,
  stock INTEGER DEFAULT 0,
  "lowStockThreshold" INTEGER DEFAULT 5,
  "pointsMultiplier" DECIMAL(3,2) DEFAULT 1,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_product_category ON "Product"(category);
CREATE INDEX idx_product_brand ON "Product"(brand);
```

**Cost price**: Only visible in BOS, never exposed on website.

---

## BOS-Specific Tables

These tables only exist in BOS:

### `SenditShipment`
Delivery shipments created via Sendit API.

```sql
CREATE TABLE "SenditShipment" (
  id SERIAL PRIMARY KEY,
  "orderId" INTEGER NOT NULL REFERENCES "Order"(id) ON DELETE CASCADE,
  "senditShipmentId" VARCHAR(100) UNIQUE NOT NULL,
  "senditTrackingId" VARCHAR(100),
  status VARCHAR(50) DEFAULT 'PENDING',
  "trackingUrl" TEXT,
  "estimatedDeliveryDate" DATE,
  "actualDeliveryDate" DATE,
  "deliveryCost" DECIMAL(10,2),
  "senditWebhookData" JSONB,                -- Raw webhook payloads
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sendit_order ON "SenditShipment"("orderId");
CREATE INDEX idx_sendit_status ON "SenditShipment"(status);
```

### `OrderStatusHistory`
Tracks status changes for audit trail.

```sql
CREATE TABLE "OrderStatusHistory" (
  id SERIAL PRIMARY KEY,
  "orderId" INTEGER NOT NULL REFERENCES "Order"(id) ON DELETE CASCADE,
  "oldStatus" VARCHAR(50),
  "newStatus" VARCHAR(50) NOT NULL,
  source VARCHAR(50),                        -- 'manual', 'webhook', 'sendit'
  note TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_status_history_order ON "OrderStatusHistory"("orderId");
```

### `Campaign`
Marketing campaigns (Ramadan, sales, launches).

```sql
CREATE TABLE "Campaign" (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50),                          -- 'seasonal', 'product_launch', 'sale'
  "startDate" DATE,
  "endDate" DATE,
  budget DECIMAL(10,2),
  "adSpend" DECIMAL(10,2) DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  "roas" DECIMAL(5,2),                       -- Return on Ad Spend
  status VARCHAR(50) DEFAULT 'DRAFT',        -- 'DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'
  notes TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);
```

### `ContentItem`
Content planning (TikTok, Instagram posts).

```sql
CREATE TABLE "ContentItem" (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  platform VARCHAR(50),                      -- 'TikTok', 'Instagram', 'Facebook'
  "contentType" VARCHAR(50),                 -- 'Reel', 'Post', 'Story', 'Video'
  status VARCHAR(50) DEFAULT 'IDEA',         -- 'IDEA', 'SCRIPTED', 'FILMED', 'EDITED', 'SCHEDULED', 'PUBLISHED'
  "scheduledDate" TIMESTAMP,
  "publishedDate" TIMESTAMP,
  "mediaUrl" TEXT,
  caption TEXT,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_content_platform ON "ContentItem"(platform);
CREATE INDEX idx_content_status ON "ContentItem"(status);
```

### `AdCampaign`
Individual ad campaigns on Meta/TikTok/Google.

```sql
CREATE TABLE "AdCampaign" (
  id SERIAL PRIMARY KEY,
  "campaignId" INTEGER REFERENCES "Campaign"(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  platform VARCHAR(50) NOT NULL,             -- 'Meta', 'TikTok', 'Google'
  "adSetId" VARCHAR(100),                    -- Platform's ad set ID
  budget DECIMAL(10,2),
  spend DECIMAL(10,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  "ctr" DECIMAL(5,2),                        -- Click-through rate
  "cpc" DECIMAL(10,2),                       -- Cost per click
  "roas" DECIMAL(5,2),                       -- Return on ad spend
  status VARCHAR(50) DEFAULT 'ACTIVE',
  "startDate" DATE,
  "endDate" DATE,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ad_campaign ON "AdCampaign"("campaignId");
CREATE INDEX idx_ad_platform ON "AdCampaign"(platform);
```

### `Task`
Founder tasks (TODO list).

```sql
CREATE TABLE "Task" (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  priority VARCHAR(20) DEFAULT 'MEDIUM',     -- 'LOW', 'MEDIUM', 'HIGH', 'URGENT'
  status VARCHAR(50) DEFAULT 'TODO',         -- 'TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'
  "assignedTo" VARCHAR(255),                 -- Founder email
  "dueDate" DATE,
  "completedAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_task_status ON "Task"(status);
CREATE INDEX idx_task_assigned ON "Task"("assignedTo");
```

### Other BOS Tables
```sql
-- Support tickets
CREATE TABLE "SupportTicket" (...);

-- Weekly priorities
CREATE TABLE "WeeklyPriority" (...);

-- Ideas & experiments
CREATE TABLE "Idea" (...);
CREATE TABLE "GrowthExperiment" (...);

-- Decision log
CREATE TABLE "DecisionLog" (...);

-- Webhook events log
CREATE TABLE "WebhookEvent" (...);

-- Backup snapshots
CREATE TABLE "BackupSnapshot" (...);
```

---

## Query Patterns

### Get orders with items and products

```typescript
const result = await pool.query(`
  SELECT
    o.*,
    json_agg(
      json_build_object(
        'id', oi.id,
        'productId', oi."productId",
        'productName', p.name,
        'quantity', oi.quantity,
        'price', oi.price,
        'unitCost', oi."unitCost",
        'totalPrice', oi.price * oi.quantity,
        'totalCost', COALESCE(oi."unitCost", 0) * oi.quantity
      ) ORDER BY oi.id
    ) as items
  FROM "Order" o
  LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
  LEFT JOIN "Product" p ON p.id = oi."productId"
  WHERE o.id = $1
  GROUP BY o.id
`, [orderId])
```

### Calculate order profit

```typescript
// In app/api/ops/orders/route.ts (POST)
const estimatedProfit = 
  subtotal -                                    // Revenue
  items.reduce((sum, item) => sum + (item.unitCost * item.quantity), 0) -  // Product costs
  estimatedDeliveryCost                         // Delivery fee

const marginPercent = (estimatedProfit / subtotal) * 100
```

### Check data completeness

```typescript
// lib/order-utils.ts
export function checkOrderCompleteness(order, items, products) {
  const missing: string[] = []
  
  if (!order.deliveryName) missing.push('Customer name')
  if (!order.deliveryPhone) missing.push('Phone number')
  if (!order.deliveryCity) missing.push('City')
  if (!order.deliveryAddress) missing.push('Address')
  if (items.length === 0) missing.push('Order items')
  // ...check all required fields
  
  const score = ((10 - missing.length) / 10) * 100
  return { isComplete: missing.length === 0, score, missing }
}
```

---

## Migrations

### Running Migrations

```bash
# 1. Connect to database
psql $DATABASE_URL

# 2. Run migration file
\i migrations/001_add_bos_tables.sql

# 3. Verify
\dt  # List tables
\d "Order"  # Describe Order table
```

### Creating New Migration

```bash
# 1. Create file
touch migrations/002_add_campaign_fields.sql

# 2. Write SQL
-- Example: Add new field to Campaign
ALTER TABLE "Campaign" ADD COLUMN "targetAudience" TEXT;

# 3. Test locally
psql $DATABASE_LOCAL -f migrations/002_add_campaign_fields.sql

# 4. Apply to production
psql $DATABASE_URL -f migrations/002_add_campaign_fields.sql
```

---

## Data Types

### Common PostgreSQL Types
- `SERIAL` - Auto-incrementing integer (ID)
- `VARCHAR(n)` - Variable-length string (max n chars)
- `TEXT` - Unlimited length string
- `INTEGER` - 32-bit integer
- `DECIMAL(p,s)` - Fixed-point decimal (p digits, s after decimal)
- `TIMESTAMP` - Date and time
- `DATE` - Date only
- `JSONB` - JSON with binary storage (efficient)

### JSONB Operations

```sql
-- Extract as text
SELECT props->>'name' FROM "Product"

-- Extract as integer
SELECT (props->>'age')::int FROM "Order"

-- Contains check
SELECT * FROM "Order" WHERE props @> '{"status":"active"}'

-- Update JSONB field
UPDATE "Order"
SET props = jsonb_set(props, '{status}', '"confirmed"')
WHERE id = 1
```

---

## Backup & Restore

### Manual Backup

```bash
# Backup entire database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Backup specific tables
pg_dump $DATABASE_URL -t "Order" -t "OrderItem" > orders_backup.sql
```

### Restore

```bash
psql $DATABASE_URL < backup_20260604.sql
```

### Neon Backups

Neon provides automatic backups:
- Point-in-time restore (last 7 days)
- Manual snapshots in dashboard

---

## Performance Tips

1. **Always use indexes** on foreign keys and frequently queried columns
2. **Use EXPLAIN ANALYZE** to debug slow queries
3. **Parameterized queries** prevent SQL injection AND improve perf (query plan caching)
4. **Batch inserts** when creating multiple records
5. **Connection pooling** (already configured in `lib/db.ts`)

---

**Last Updated**: June 4, 2026
