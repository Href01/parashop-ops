# Project Overview - Shine Cosmetics BOS

**Last Updated:** 2026-06-05  
**Purpose:** Complete mental model of the system

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Customer Journey                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  www.shinecosmetics.ma (Main E-commerce Site)         │
│  ├─ Customer browses products                          │
│  ├─ Adds to cart                                       │
│  ├─ Checkout (order creation)                          │
│  └─ Order created in main database                     │
│         │                                               │
│         │ WEBHOOK (if enabled)                         │
│         ↓                                               │
│  ops.shinecosmetics.ma (BOS - Back Office System)     │
│  ├─ Receives order data via webhook                    │
│  ├─ Admin reviews order                                │
│  ├─ Confirms order                                     │
│  └─ Auto-creates Sendit shipment                       │
│         │                                               │
│         ↓                                               │
│  app.sendit.ma (Delivery Partner API)                 │
│  ├─ Receives shipment request                          │
│  ├─ Creates delivery                                   │
│  ├─ Driver picks up                                    │
│  └─ Delivers to customer                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Two Separate Systems

### Main Site (parashop)
- **URL:** https://www.shinecosmetics.ma
- **Purpose:** Customer-facing e-commerce
- **Database:** PostgreSQL (Vercel/Supabase)
- **Users:** Customers (public)
- **Features:**
  - Product catalog
  - Shopping cart
  - Checkout flow
  - Customer accounts
  - Loyalty points
  - Order history

### BOS (parashop-ops)
- **URL:** https://ops.shinecosmetics.ma
- **Purpose:** Internal operations management
- **Database:** PostgreSQL (SEPARATE from main site)
- **Users:** Admin team
- **Features:**
  - Order management
  - Sendit integration
  - Manual order creation
  - Analytics dashboard
  - Product management

**CRITICAL:** These are TWO DIFFERENT DATABASES. Orders created in main site do NOT automatically appear in BOS unless webhook is working.

---

## Data Flow

### 1. Customer Order (Main Site)

```typescript
POST /api/orders
├─ Validates customer input
├─ Creates User if guest (auto-account)
├─ Calculates total server-side (security)
├─ Creates Order in main database
├─ Creates OrderItems
├─ Handles loyalty points
├─ Sends confirmation email
└─ Triggers webhook to BOS (if configured)
```

**Database Tables:**
- `Order` - Order header
- `OrderItem` - Products in order
- `User` - Customer account
- `LoyaltyTransaction` - Points history

### 2. Webhook Sync (Main Site → BOS)

```typescript
POST https://ops.shinecosmetics.ma/api/ops/orders
Headers: x-webhook-secret: SHARED_SECRET
Body: {
  orderNumber: "WEB-123",
  deliveryName, deliveryPhone, deliveryCity,
  items: [...],
  total: 349,
  confirmImmediately: false
}
```

**Authentication:** Shared secret in env vars (`WEBHOOK_SECRET`)

**When It Runs:** After successful order creation in main site

**What It Does:** Creates matching order in BOS database with `WEB-` prefix

### 3. Manual Order (BOS)

```typescript
POST /api/ops/orders
├─ Admin fills order form
├─ Validates with Zod schema
├─ Calculates total server-side
├─ Creates Order in BOS database
├─ Creates OrderItems
├─ Creates OrderStatusHistory
└─ Optionally creates Sendit shipment immediately
```

**Source:** Admin panel at `/orders/new`

**Order Number:** `ORD-YYMMDD-XXXX` format

### 4. Order Confirmation (BOS)

```typescript
PUT /api/ops/orders/[id]
Body: { status: "CONFIRMED" }
├─ Updates order status
├─ Creates OrderStatusHistory entry
├─ Auto-triggers Sendit shipment creation
│   └─ Fetches order + items
│   └─ Validates phone, amount, district
│   └─ Calls Sendit API
│   └─ Updates order with tracking ID
└─ Returns updated order
```

**Auto-Trigger:** When status changes to CONFIRMED

**Validation:** Phone format, amount ≤ 5000 DH

### 5. Sendit Shipment Creation

```typescript
POST https://app.sendit.ma/api/v1/deliveries
Headers: Authorization: Bearer TOKEN
Body: {
  pickup_district_id: 1,  // Your warehouse
  district_id: 42,        // Customer district
  name: "Customer Name",
  phone: "0612345678",    // MUST be this format
  address: "Full address",
  amount: 349,            // Integer, max 5000
  reference: "ORD-123",
  products: "Product list",
  comment: "Notes",
  allow_open: 1,
  allow_try: 1
}
```

**Authentication:** Bearer token (cached 1 hour)

**Critical Fields:**
- `phone` - MUST be `06XXXXXXXX` or `07XXXXXXXX`
- `amount` - Integer (no decimals), max 5000 DH
- `district_id` - From `/districts` API

**Response:** Tracking code (e.g., "SD-123456")

---

## Database Schema

### Order Table
```sql
"Order" {
  id: SERIAL PRIMARY KEY
  orderNumber: TEXT
  sourceChannel: TEXT (Website/WhatsApp/Manual/etc)
  
  -- Customer delivery
  deliveryName: TEXT
  deliveryPhone: TEXT (06XXXXXXXX)
  deliveryCity: TEXT
  deliveryAddress: TEXT
  deliveryNotes: TEXT
  
  -- Pricing
  productsTotal: DECIMAL
  discountTotal: DECIMAL
  revenue: DECIMAL (productsTotal - discountTotal)
  deliveryFeeCharged: DECIMAL
  total: DECIMAL (revenue + deliveryFeeCharged)
  
  -- Status
  status: OrderStatus (PENDING/CONFIRMED/DELIVERED/CANCELLED)
  
  -- Sendit integration
  senditTrackingId: TEXT
  senditBarcode: TEXT
  senditStatus: TEXT
  actualDeliveryCost: DECIMAL
  
  -- Metadata
  paymentMethod: TEXT
  notes: TEXT
  createdAt: TIMESTAMP
}
```

### OrderItem Table
```sql
"OrderItem" {
  id: SERIAL PRIMARY KEY
  orderId: INTEGER FK
  productId: INTEGER FK
  quantity: INTEGER
  price: DECIMAL (unit price at time of order)
  unitCost: DECIMAL (cost price for profit calc)
  pointsEarned: INTEGER
}
```

### OrderStatusHistory Table
```sql
"OrderStatusHistory" {
  id: SERIAL PRIMARY KEY
  orderId: INTEGER FK
  oldStatus: TEXT
  newStatus: TEXT
  source: TEXT (manual/auto/system)
  note: TEXT
  createdAt: TIMESTAMP
}
```

### OrderAuditLog Table
```sql
"OrderAuditLog" {
  id: SERIAL PRIMARY KEY
  orderId: INTEGER (ID that was deleted)
  orderData: JSONB (complete order snapshot)
  deletedBy: TEXT (admin email)
  deletedAt: TIMESTAMP
  source: TEXT (main_site/bos)
  ipAddress: TEXT
  userAgent: TEXT
}
```

---

## External Integrations

### Sendit API

**Base URL:** `https://app.sendit.ma/api/v1`

**Authentication:**
```typescript
POST /login
Body: { public_key: "...", secret_key: "..." }
Response: { token: "..." }  // Cache for 1 hour
```

**Create Delivery:**
```typescript
POST /deliveries
Headers: Authorization: Bearer TOKEN
Body: SenditDelivery object
Response: { success: true, data: { code, status, fee, ... } }
```

**List Districts:**
```typescript
GET /districts?page=1
Response: { data: [{ id, name, price, delais, ... }], last_page }
```

**CRITICAL RULES:**
- Phone: Exactly 10 digits, starts with 06 or 07
- Amount: Integer only, maximum 5000 DH
- District ID: Must exist in Sendit's list
- Token: Expires after 1 hour, must refresh

**Common Errors:**
- 422 "phone format invalid" → Use `formatPhoneForSendit()`
- 422 "amount > 5000" → Split order or reject
- 401 Unauthorized → Token expired, re-login

---

## Key Files

### Backend API
- `app/api/ops/orders/route.ts` - List & create orders
- `app/api/ops/orders/[id]/route.ts` - Get, update, delete order
- `app/api/ops/orders/[id]/sendit/route.ts` - Manual Sendit creation
- `app/api/ops/orders/[id]/recalculate/route.ts` - Fix string concat bug
- `app/api/ops/districts/route.ts` - List Sendit districts
- `app/api/ops/audit/deleted-orders/route.ts` - View deleted orders

### Libraries
- `lib/sendit.ts` - Sendit API integration
- `lib/db.ts` - PostgreSQL connection pool
- `lib/order-utils.ts` - Order number generation
- `lib/validation/order.ts` - Zod schemas
- `lib/utils/phone.ts` - Phone formatting
- `lib/utils/numbers.ts` - Safe number operations

### Frontend
- `app/orders/page.tsx` - Orders list
- `app/orders/[id]/page.tsx` - Order detail
- `app/orders/new/page.tsx` - New order form
- `components/BosShell.tsx` - Layout wrapper

---

## Environment Variables

### Required (Both Systems)
```bash
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://...
```

### BOS Specific
```bash
SENDIT_PUBLIC_KEY=...
SENDIT_PRIVATE_KEY=...
SENDIT_PICKUP_DISTRICT_ID=1  # Your warehouse district
WEBHOOK_SECRET=...  # Shared with main site
```

### Main Site Specific
```bash
WEBHOOK_SECRET=...  # Shared with BOS
# (Same secret in both systems for webhook auth)
```

---

## Common Operations

### Create Order (Manual)
1. Go to `/orders/new`
2. Fill customer info
3. Select district (sets delivery fee)
4. Add products
5. Add discount if needed
6. Check "Auto-confirm" to create Sendit immediately
7. Submit

### Confirm Order (Triggers Sendit)
1. Go to order detail
2. Change status to "Confirmed"
3. System auto-creates Sendit shipment
4. Order gets tracking ID

### Manual Sendit Creation
1. Order must be CONFIRMED
2. Must have: name, phone, city, address
3. Click "Create Sendit Shipment"
4. System validates and creates

### Fix String Concat Bug
1. Find order with wrong total (e.g., 33019 instead of 349)
2. POST `/api/ops/orders/[id]/recalculate`
3. System recalculates from components
4. Updates total in database

### View Deleted Orders
1. GET `/api/ops/audit/deleted-orders`
2. See complete order data before deletion
3. Can filter by orderId

---

## Known Issues & Workarounds

### Issue: Webhook Duplicates
**Symptom:** 2 orders in main site → 2 in BOS  
**Cause:** Webhook calling itself (fixed 2026-06-05)  
**Solution:** Webhook now calls BOS directly, not recursive

### Issue: String Concatenation (33019)
**Symptom:** Total shows 33019 instead of 349  
**Cause:** "330" + "19" = "33019" (string concat)  
**Prevention:** Zod validation enforces numbers  
**Fix:** Use `/recalculate` endpoint

### Issue: Phone Format Error
**Symptom:** Sendit rejects with "phone format invalid"  
**Cause:** Phone has spaces or wrong format  
**Prevention:** `formatPhoneForSendit()` before API call  
**Status:** Fixed 2026-06-05

### Issue: Amount > 5000 DH
**Symptom:** Sendit rejects order  
**Cause:** Sendit has 5000 DH limit  
**Solution:** Split order or use alternative delivery  
**Prevention:** Validation at order creation

### Issue: Missing Customer Order
**Symptom:** Customer placed order, not in BOS  
**Cause:** Webhook not configured or failed  
**Debug:** Check email confirmation (if sent, order was created)  
**Solution:** Manually recreate in BOS from email details

---

## Testing Checklist

### Before Deploying Changes

1. **Type Check:** `npx tsc --noEmit`
2. **Build:** `npm run build`
3. **Test in Dev:** 
   - Create order
   - Confirm order
   - Create Sendit shipment
   - Check totals are correct
   - Test phone formatting
   - Test validation errors

### After Deployment

1. Create test order with:
   - Phone with spaces: "06 12 34 56 78"
   - Amount under 300 (triggers delivery fee)
   - Discount
2. Confirm order
3. Check Sendit created with:
   - Correct phone format
   - Correct total (products + delivery - discount)
   - Products in "Produit" section
   - Notes in "Note" section
4. Delete test order
5. Check audit log has deletion record

---

## Decision Log

### Why Two Separate Databases?
- **Main site:** Customer data, high traffic
- **BOS:** Internal ops, different access patterns
- **Trade-off:** Need webhook for sync
- **Future:** Consider shared database or better sync

### Why Auto-Sendit on Confirm?
- **Reason:** Reduces manual steps
- **Risk:** Can't undo after Sendit created
- **Mitigation:** Validation before creation

### Why Not Sync Deletions?
- **Risk:** Delete test order in BOS → deletes real customer order
- **Decision:** Keep independent, manual sync if needed
- **Trade-off:** Data inconsistency possible

### Why Validation at API Boundary?
- **Prevent bad data entering database**
- **Clear errors before external API calls**
- **Type safety throughout**
- **Single source of truth for rules**

---

## Maintenance

### Adding New Field to Orders
1. Update database schema (migration)
2. Update TypeScript types
3. Update Zod validation schema
4. Update API endpoints
5. Update frontend forms
6. Test end-to-end

### Changing Phone Format
1. Update `lib/utils/phone.ts`
2. Update validation regex
3. Test with Sendit API
4. Update documentation

### Adding New Status
1. Update `OrderStatus` enum in database
2. Update TypeScript types
3. Update status dropdowns in UI
4. Update status badges styling
5. Consider auto-actions on status change

---

## Emergency Procedures

### Sendit API Down
1. Orders can still be created (don't auto-create Sendit)
2. Mark orders as "needs shipment"
3. Create shipments manually when API recovers

### Database Connection Lost
1. Check DATABASE_URL env var
2. Check database service status
3. Restart Next.js if needed

### Orders Not Syncing
1. Check WEBHOOK_SECRET matches both systems
2. Check main site logs for webhook errors
3. Manually recreate important orders in BOS

---

## Future Improvements

1. **Real-time sync** - WebSockets for instant updates
2. **Shared database** - Eliminate webhook complexity
3. **Automated testing** - Contract tests for Sendit
4. **Monitoring** - Track validation failures
5. **Bulk operations** - Import orders, bulk Sendit creation

---

**This document is the COMPLETE SYSTEM.** Read it BEFORE making changes.
