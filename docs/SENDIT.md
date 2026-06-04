# Sendit Integration Guide

Sendit is the delivery partner for Shine Cosmetics. This integration handles shipment creation, tracking, and status updates.

## API Credentials

Already configured in `.env`:
```env
SENDIT_PUBLIC_KEY=e6ef89a1a8a2c9f8cf95cc6cf10e3e3b
SENDIT_PRIVATE_KEY=gNKoj1BQIdFF9YxvNUytq1UQ0TZtyluX
```

---

## Creating a Shipment

### Via API

**Endpoint:** `POST /api/ops/orders/:id/sendit`

**Request:**
```json
{
  "notes": "Fragile - Handle with care",
  "packageWeight": 0.8
}
```

**Response:**
```json
{
  "success": true,
  "trackingId": "SND-2026-123456",
  "barcode": "123456789012",
  "status": "PENDING_PICKUP",
  "shippingCost": 25,
  "estimatedDelivery": "2026-06-06"
}
```

### Via UI (Coming Soon)

Order detail page will have a **"Create Shipment"** button that:
1. Validates order has delivery info
2. Creates Sendit shipment
3. Updates order status to `SHIPPED`
4. Displays tracking info

---

## Shipment Statuses

Sendit provides these statuses (automatically synced to order):

| Sendit Status | BOS Order Status | Description |
|---------------|------------------|-------------|
| `PENDING_PICKUP` | `SHIPPED` | Waiting for Sendit to pick up |
| `PICKED_UP` | `SHIPPED` | Package collected by Sendit |
| `IN_TRANSIT` | `SHIPPED` | En route to customer |
| `OUT_FOR_DELIVERY` | `SHIPPED` | With delivery agent |
| `DELIVERED` | `DELIVERED` | Successfully delivered ✅ |
| `RETURNED` | `CANCELLED` | Customer refused/unreachable |
| `FAILED` | `CANCELLED` | Delivery failed |

---

## Tracking a Shipment

### Via API

**Endpoint:** `GET /api/ops/orders/:id/sendit`

**Response:**
```json
{
  "trackingId": "SND-2026-123456",
  "status": "IN_TRANSIT",
  "history": [
    {
      "status": "PICKED_UP",
      "location": "Casablanca Hub",
      "timestamp": "2026-06-04T10:30:00Z",
      "note": "Package collected"
    },
    {
      "status": "IN_TRANSIT",
      "location": "Rabat Hub",
      "timestamp": "2026-06-04T14:00:00Z",
      "note": "In transit to destination"
    }
  ],
  "estimatedDelivery": "2026-06-06",
  "actualDelivery": null
}
```

### Auto-Sync

The BOS automatically syncs Sendit status when:
- Tracking info is requested via API
- Order detail page is viewed (fetches latest status)

---

## Delivery Cost Calculation

### Automatic Estimation

When creating an order, delivery cost is estimated based on city:

```typescript
// Casablanca - cheapest
if (city.includes('casa')) return 25 MAD

// Major cities (Rabat, Marrakech, Tanger, etc.)
if (majorCities.includes(city)) return 35 MAD

// Remote cities
return 45 MAD
```

### Actual Cost

After Sendit shipment is created, `actualDeliveryCost` is updated with the real cost from Sendit API.

**Profit calculation** uses `actualDeliveryCost` if available, otherwise `estimatedDeliveryCost`.

---

## COD (Cash on Delivery)

For COD orders, Sendit collects payment from customer and transfers to Shine:

**When creating shipment:**
```json
{
  "cod_amount": 540
}
```

**Sendit will:**
1. Collect 540 MAD from customer
2. Deduct delivery fee (e.g., 25 MAD)
3. Transfer remaining (515 MAD) to Shine's account

---

## Workflow

### Happy Path

1. **Order Created** (status: `PENDING`)
   - Customer orders on website
   - Webhook syncs to BOS

2. **Order Confirmed** (status: `CONFIRMED`)
   - Founder reviews and confirms order

3. **Shipment Created** (status: `SHIPPED`)
   - Founder clicks "Create Shipment"
   - Sendit tracking ID generated

4. **Sendit Picks Up** (Sendit: `PICKED_UP`)
   - Sendit agent collects package

5. **In Transit** (Sendit: `IN_TRANSIT`)
   - Package moving to destination

6. **Delivered** (status: `DELIVERED`)
   - Customer receives package
   - For COD: Payment collected

### Failed Delivery

1. **Customer Unreachable** (Sendit: `FAILED`)
   - Multiple delivery attempts failed
   - BOS status: `CANCELLED`

2. **Customer Refused** (Sendit: `RETURNED`)
   - Customer rejected package
   - BOS status: `CANCELLED`
   - Package returned to sender

---

## Error Handling

### Missing Delivery Info

If order lacks required fields, shipment creation fails:

```json
{
  "error": "Order missing required delivery information",
  "missing": {
    "name": false,
    "phone": true,
    "city": false
  }
}
```

**Fix:** Update order with complete delivery info before creating shipment.

### Sendit API Down

If Sendit API is unavailable:
1. Error is logged
2. User sees clear error message
3. Can retry shipment creation later

### Duplicate Shipment

If shipment already exists for order:

```json
{
  "error": "Shipment already created",
  "trackingId": "SND-2026-123456"
}
```

**Action:** View existing tracking instead of creating new shipment.

---

## Testing

### Test Shipment Creation

```bash
# Create shipment for order ID 45
curl -X POST http://localhost:3000/api/ops/orders/45/sendit \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Test shipment",
    "packageWeight": 0.5
  }'
```

### Test Tracking

```bash
# Get tracking info for order ID 45
curl http://localhost:3000/api/ops/orders/45/sendit
```

---

## Database Schema

Sendit fields added to `Order` table:

```sql
ALTER TABLE "Order"
ADD COLUMN "senditTrackingId" TEXT,
ADD COLUMN "senditBarcode" TEXT,
ADD COLUMN "senditStatus" TEXT,
ADD COLUMN "actualDeliveryCost" DECIMAL(10,2);
```

Run migration:
```bash
npm run migrate
```

---

## Monitoring

### Check Sendit Status

```bash
# Get tracking for all shipped orders
SELECT 
  "orderNumber",
  "senditTrackingId",
  "senditStatus",
  "actualDeliveryCost"
FROM "Order"
WHERE "senditTrackingId" IS NOT NULL;
```

### Failed Deliveries

```bash
# Find orders with failed deliveries
SELECT 
  "orderNumber",
  "deliveryName",
  "deliveryPhone",
  "senditStatus"
FROM "Order"
WHERE "senditStatus" IN ('FAILED', 'RETURNED');
```

---

## Troubleshooting

**Problem:** Sendit API returns 401 Unauthorized
- **Fix:** Check `SENDIT_PUBLIC_KEY` and `SENDIT_PRIVATE_KEY` in `.env`

**Problem:** Shipment creation fails with "Invalid city"
- **Fix:** Sendit only delivers to Morocco. Verify city name is valid.

**Problem:** COD amount not collected
- **Fix:** Ensure `cod_amount` is set when `paymentMethod` is `COD`

**Problem:** Tracking shows stuck for 3+ days
- **Fix:** Contact Sendit support to investigate shipment

---

## Future Enhancements

- [ ] Automatic tracking sync (cron job every 6 hours)
- [ ] Webhook from Sendit for real-time status updates
- [ ] Bulk shipment creation (select multiple orders)
- [ ] Print shipping labels (barcode)
- [ ] Sendit dashboard iframe in BOS

---

**Documentation:** https://sendit.ma/api-docs  
**Support:** support@sendit.ma  
**Phone:** +212 5XX-XXXXXX

Last updated: June 4, 2026
