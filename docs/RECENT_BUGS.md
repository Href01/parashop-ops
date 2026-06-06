# Recent Bugs & Fixes (2026-06-05 to 2026-06-06)

**Purpose:** Document critical bugs found and fixed to prevent recurrence.

---

## Bug #1: Sendit Shipment with 0 MAD - NULL Payment Method (CRITICAL)

### Date
2026-06-06

### Symptom
Sendit shipment created with **COD amount: 0 MAD** instead of actual order total.

**Example:** Order #62
- Order total: 204 MAD
- Payment method: **NULL**
- Sendit tracking: DH1F77C5086
- **COD amount sent to Sendit: 0 MAD** ❌

**Impact:** Delivery person won't collect payment from customer! Customer gets free product worth 204 MAD.

### Root Cause #1: Website Never Sets Payment Method

**File:** `app/api/orders/route.ts` (main site)

Website order creation INSERT statement did NOT include `paymentMethod` column:

```typescript
// BEFORE (broken):
INSERT INTO "Order" (
  "userId", total, status, ...
)
VALUES ($1, $2, 'PENDING', ...)
// paymentMethod not specified → defaults to NULL in database
```

**Why Bad:**
- Database column allows NULL
- No default value in schema
- Website doesn't send paymentMethod in request
- Result: ALL website orders have paymentMethod: NULL

### Root Cause #2: BOS Doesn't Handle NULL

**File:** `app/api/ops/orders/[id]/sendit/route.ts` (BOS)

When creating Sendit shipment, code checks payment method:

```typescript
// BEFORE (broken):
cod_amount: order.paymentMethod === 'COD' ? order.total : 0

// When paymentMethod is NULL:
null === 'COD' → false → sends cod_amount: 0 to Sendit! ❌
```

**Why Bad:**
- Strict equality check doesn't handle NULL/undefined
- Assumes paymentMethod is always set
- Falls back to 0 instead of defaulting to COD

### Fix #1: Website Sets Payment Method

**File:** `app/api/orders/route.ts` (main site)  
**Commit:** c491cee

```typescript
// AFTER (fixed):
INSERT INTO "Order" (
  "userId", total, status, "paymentMethod", ...
)
VALUES ($1, $2, 'PENDING', 'COD', ...)
// Explicitly set paymentMethod to 'COD' for all website orders
```

**Why It Works:**
- Website doesn't have online payment yet
- All website orders are Cash On Delivery
- Explicitly set 'COD' instead of relying on NULL

### Fix #2: BOS Handles NULL Payment Method

**File:** `app/api/ops/orders/[id]/sendit/route.ts` (BOS)  
**Commit:** 87a468b

```typescript
// AFTER (fixed):
const isCOD = !order.paymentMethod || order.paymentMethod === 'COD'
const codAmount = isCOD ? order.total : 0

console.log('💰 Payment method check:', {
  paymentMethod: order.paymentMethod,
  isCOD,
  orderTotal: order.total,
  codAmount,
})
```

**Why It Works:**
- `!order.paymentMethod` handles NULL, undefined, empty string
- Defaults to COD (most common case)
- Only sets COD=0 when explicitly prepaid (credit card, etc.)
- Added logging to track payment method checks

### Prevention

1. **Always set paymentMethod when creating orders:**
   ```typescript
   INSERT INTO "Order" (..., "paymentMethod", ...)
   VALUES (..., 'COD', ...)  // or 'CARD', 'BANK', etc.
   ```

2. **Handle NULL/undefined in business logic:**
   ```typescript
   // Bad:
   if (value === 'EXPECTED') { ... }
   
   // Good:
   if (!value || value === 'EXPECTED') { ... }
   ```

3. **Validate before Sendit API call:**
   ```typescript
   if (!order.paymentMethod) {
     throw new Error('Payment method is required')
   }
   ```

4. **Add database constraint (optional):**
   ```sql
   ALTER TABLE "Order"
   ALTER COLUMN "paymentMethod"
   SET DEFAULT 'COD';
   
   -- Or make it NOT NULL:
   ALTER TABLE "Order"
   ALTER COLUMN "paymentMethod"
   SET NOT NULL;
   ```

### Files Changed

**Main Site (parashop):**
- `app/api/orders/route.ts` - Added paymentMethod: 'COD' to INSERT

**BOS (parashop-ops):**
- `app/api/ops/orders/[id]/sendit/route.ts` - Handle NULL paymentMethod

### Lessons Learned

1. **Database NULLs are dangerous** - Always set values explicitly
2. **Strict equality fails on NULL** - Use truthy/falsy checks for optional fields
3. **Log critical calculations** - Added logging for payment method checks
4. **Test with missing data** - NULL/undefined should be handled gracefully

---

## Bug #2: Duplicate Orders from Webhook (CRITICAL)

### Date
2026-06-06

### Symptom
Every customer order created TWO orders in the system:
- Order #61: Website channel, Confirmed, 79 MAD (correct)
- Order #60: Manual channel, Pending, 0 MAD (duplicate)

### Root Cause
**FALSE ASSUMPTION:** Believed main site and BOS had separate databases.

**REALITY:** Both systems use the SAME PostgreSQL database.

**What Happened:**
1. Customer places order on website
2. Order #61 created in database
3. Webhook fires to "sync" to BOS
4. BOS creates Order #62 (duplicate!) because webhook called `POST /api/ops/orders`
5. Both orders visible in both admins (same DB)

### Fix
**Removed webhook entirely** from `app/api/orders/route.ts`

```typescript
// REMOVED THIS CODE (lines 531-587):
// Webhook: Sync to BOS
// const webhookUrl = 'https://ops.shinecosmetics.ma/api/ops/orders'
// fetch(webhookUrl, {...}) // Was creating duplicates!
```

**Why It Works:**
- Both systems query same database
- Orders auto-sync without webhook
- No duplicates possible

### Prevention
1. **Always verify database architecture FIRST**
   ```bash
   # Check if same database:
   diff <(grep DATABASE_URL parashop/.env) <(grep DATABASE_URL parashop-ops/.env)
   ```

2. **Document in PROJECT_OVERVIEW.md:**
   - Database architecture
   - Whether systems share data or need sync

3. **Before building sync systems:**
   - Verify databases are actually separate
   - Check if data is already accessible

### Files Changed
- `app/api/orders/route.ts` (main site) - Removed webhook
- `docs/PROJECT_OVERVIEW.md` - Updated to reflect shared database

---

## Bug #3: District Picker Not Loading (CSP Block)

### Date
2026-06-06

### Symptom
District dropdown showed "Sélectionnez votre quartier..." but no districts loaded.

Browser console error:
```
Connecting to 'https://ops.shinecosmetics.ma/api/public/districts' violates CSP
```

### Root Cause
Content-Security-Policy (CSP) in `next.config.ts` didn't include `ops.shinecosmetics.ma` in `connect-src` directive.

**Blocked request:**
```javascript
fetch('https://ops.shinecosmetics.ma/api/public/districts') // ❌ CSP blocked!
```

### Fix
Added `https://ops.shinecosmetics.ma` to CSP connect-src:

```typescript
// next.config.ts
"connect-src 'self' https://ops.shinecosmetics.ma https://api.cloudinary.com ..."
```

### Prevention
1. **When fetching from different domain:**
   - Update CSP `connect-src` directive
   - Test in production (CSP not enforced in dev)

2. **Check browser console for CSP errors:**
   ```
   "violates the following Content Security Policy directive"
   ```

3. **Common CSP directives:**
   - `connect-src` - fetch/XHR requests
   - `script-src` - JavaScript sources
   - `img-src` - Image sources

### Files Changed
- `next.config.ts` (main site) - Added ops domain to CSP

---

## Bug #4: Double-Click Creating Duplicate Orders

### Date
2026-06-06

### Symptom
User clicks "Confirm order" button twice → two orders created.

### Root Cause
Button has `disabled={loading}` but React re-render isn't instant.

**Race condition:**
1. User clicks "Confirm" → `handleOrder()` starts
2. `setLoading(true)` called
3. React hasn't re-rendered yet (button still enabled)
4. User clicks again → second `handleOrder()` call
5. Two orders created

### Fix
Added early return guard:

```typescript
const handleOrder = async () => {
  // Prevent double submission
  if (loading) return  // ← Added this guard
  
  if (items.length === 0) { ... }
  setLoading(true)
  // ... rest of function
}
```

### Prevention
1. **For any async button handler:**
   ```typescript
   if (loading) return  // Add BEFORE setLoading(true)
   ```

2. **Pattern:**
   ```typescript
   const handleSubmit = async () => {
     if (isSubmitting) return  // Guard
     setIsSubmitting(true)     // Then set state
     try {
       // ... async work
     } finally {
       setIsSubmitting(false)
     }
   }
   ```

3. **Don't rely on `disabled={loading}` alone**
   - React re-render isn't instant
   - Users can double-click faster than re-render

### Files Changed
- `app/checkout/page.tsx` (main site) - Added guard to handleOrder

---

## Bug #5: Guest Orders Not Showing in Main Admin

### Date
2026-06-06

### Symptom
Order #61 visible in BOS but not in main site admin.

### Root Cause
Order has `userId: NULL` (guest order created in BOS without user).

**TypeScript type:**
```typescript
type Order = {
  clientName: string      // ❌ Rejects NULL from database
  clientEmail: string     // ❌ Rejects NULL from database
}
```

**Database query returns:**
```sql
SELECT u.name as "clientName", u.email as "clientEmail" ...
-- Returns NULL for orders without userId
```

### Fix
Changed TypeScript type to allow NULL:

```typescript
type Order = {
  clientName: string | null   // ✅ Allows NULL
  clientEmail: string | null  // ✅ Allows NULL
}
```

**Frontend already handled it:**
```typescript
{o.clientName || 'Invité'}  // Shows "Invité" for NULL
```

### Prevention
1. **Check database schema before typing:**
   ```sql
   SELECT column_name, is_nullable 
   FROM information_schema.columns 
   WHERE table_name = 'Order';
   ```

2. **For LEFT JOIN columns:**
   - Always use `Type | null` (JOIN can return NULL)

3. **Pattern:**
   ```typescript
   // Database can return NULL → type as nullable
   type User = {
     name: string | null
     email: string | null
   }
   
   // Use with fallback in UI
   {user.name || 'Guest'}
   ```

### Files Changed
- `app/admin/orders/page.tsx` (main site) - Updated Order type

---

## Bug #6: OrderAuditLog Table Doesn't Exist (500 on Delete)

### Date
2026-06-05 (created migration) → 2026-06-06 (ran it)

### Symptom
Deleting order from BOS returns 500 error:
```
Failed to load resource: the server responded with a status of 500
Delete error: Error: Delete failed
```

### Root Cause
DELETE endpoint tries to INSERT into `OrderAuditLog` table, but table doesn't exist:

```typescript
await pool.query(
  `INSERT INTO "OrderAuditLog" ...`  // ❌ Table doesn't exist!
)
```

**Mistake:** Created migration SQL file but **never ran it** on database.

### Fix
Ran migration SQL in Neon dashboard:

```sql
CREATE TABLE "OrderAuditLog" (
  "id" SERIAL PRIMARY KEY,
  "orderId" INTEGER NOT NULL,
  "orderData" JSONB NOT NULL,
  -- ...
);
```

### Prevention
1. **Creating migration file ≠ Running migration:**
   ```bash
   # Created file:
   prisma/migrations/add_order_audit_log.sql  ✅
   
   # Must ALSO run on database:
   psql $DATABASE_URL -f prisma/migrations/add_order_audit_log.sql  ✅
   ```

2. **Verify table exists:**
   ```sql
   SELECT * FROM "OrderAuditLog" LIMIT 1;
   ```

3. **Test the code that depends on new table:**
   - If adding audit logging, test delete endpoint
   - Catch errors early

### Files Changed
- `prisma/migrations/add_order_audit_log.sql` - Created
- Database - Ran migration via Neon SQL Editor

---

## Summary of Root Causes

| Bug | Root Cause Category | Prevention |
|-----|---------------------|------------|
| Sendit 0 MAD shipment | NULL payment method not handled | Always set values explicitly, handle NULL gracefully |
| Duplicate orders | False assumption (separate DBs) | Verify architecture first |
| Districts not loading | Missing CSP config | Update CSP for cross-origin |
| Double-click submit | React re-render delay | Add early return guard |
| Guest orders hidden | Type doesn't allow NULL | Match types to DB schema |
| Delete 500 error | Migration file not run | Run migrations, verify tables |

---

## Key Takeaways

### 1. Verify Assumptions
**Don't assume.** Check:
- Database configuration
- Environment variables
- External API requirements

### 2. Guard Against Race Conditions
**Don't rely on disabled state alone.** Add explicit guards:
```typescript
if (loading) return
```

### 3. Match Types to Database Reality
**Database can return NULL.** Use:
```typescript
type Field = Type | null
```

### 4. CSP for Production
**CSP only enforced in production.** Test:
- Cross-origin fetches
- External API calls
- Third-party scripts

### 5. Migrations Must Be Run
**Creating file ≠ Running migration.** Verify:
```sql
SELECT * FROM "NewTable" LIMIT 1;
```

---

**Last Updated:** 2026-06-06  
**Next Review:** When new critical bugs are found
