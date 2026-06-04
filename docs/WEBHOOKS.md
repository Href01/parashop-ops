# Webhooks Documentation

## Website Order Sync Webhook

Sync orders from the main e-commerce website (shinecosmetics.ma) to the BOS automatically.

### Endpoint

```
POST https://ops.shinecosmetics.ma/api/webhooks/orders
```

### Authentication

Use Bearer token with the webhook secret:

```bash
Authorization: Bearer {WEBHOOK_SECRET}
```

The `WEBHOOK_SECRET` must be set in environment variables on both sides.

### Request Format

```json
{
  "orderId": "website_order_123",
  "customerName": "Fatima Zahra",
  "customerPhone": "0612345678",
  "customerEmail": "fatima@example.com",
  "customerCity": "Casablanca",
  "customerAddress": "123 Rue Mohammed V, Maarif",
  "paymentMethod": "COD",
  "totalAmount": 540,
  "items": [
    {
      "productId": 15,
      "quantity": 2,
      "price": 270
    }
  ]
}
```

### Response

**Success (200):**
```json
{
  "success": true,
  "bosOrderId": 45,
  "orderNumber": "ORD-260604-4821",
  "message": "Order synced successfully"
}
```

**Already Exists (200):**
```json
{
  "success": true,
  "message": "Order already exists",
  "bosOrderId": 45
}
```

**Error (400/500):**
```json
{
  "error": "Failed to sync order",
  "details": "Product 999 not found"
}
```

---

## Implementing in Main Website

### 1. Set Environment Variable

Add to `.env` in main website:
```env
BOS_WEBHOOK_URL=https://ops.shinecosmetics.ma/api/webhooks/orders
WEBHOOK_SECRET=your-shared-secret-here
```

### 2. Add Webhook Call After Order Creation

```typescript
// app/api/checkout/route.ts (or wherever orders are created)

async function syncOrderToBOS(order: Order) {
  try {
    const response = await fetch(process.env.BOS_WEBHOOK_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({
        orderId: order.id,
        customerName: order.shippingAddress.fullName,
        customerPhone: order.shippingAddress.phone,
        customerEmail: order.email,
        customerCity: order.shippingAddress.city,
        customerAddress: order.shippingAddress.address,
        paymentMethod: order.paymentMethod,
        totalAmount: order.total,
        items: order.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        })),
      }),
    })

    if (!response.ok) {
      console.error('Failed to sync order to BOS:', await response.text())
    } else {
      console.log('✅ Order synced to BOS:', await response.json())
    }
  } catch (error) {
    console.error('BOS webhook error:', error)
    // Don't throw - webhook failure shouldn't block order creation
  }
}

// After creating order in database:
await syncOrderToBOS(newOrder)
```

### 3. Configure Webhook Secret in Vercel

**Main Website (shinecosmetics.ma):**
- Add `WEBHOOK_SECRET` environment variable
- Add `BOS_WEBHOOK_URL` environment variable

**BOS (ops.shinecosmetics.ma):**
- Add `WEBHOOK_SECRET` environment variable (same value)

---

## Testing the Webhook

### Using curl:

```bash
curl -X POST https://ops.shinecosmetics.ma/api/webhooks/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-webhook-secret" \
  -d '{
    "orderId": "test_123",
    "customerName": "Test Customer",
    "customerPhone": "0612345678",
    "customerEmail": "test@example.com",
    "customerCity": "Casablanca",
    "customerAddress": "123 Test Street",
    "paymentMethod": "COD",
    "totalAmount": 500,
    "items": [
      {
        "productId": 1,
        "quantity": 1,
        "price": 500
      }
    ]
  }'
```

### Expected Behavior:

1. ✅ Order created in BOS with status `PENDING`
2. ✅ Order number generated (e.g., `ORD-260604-4821`)
3. ✅ Items linked to order
4. ✅ Profit/margin calculated based on cost prices
5. ✅ Data completeness score calculated
6. ✅ Status history created

---

## Security Considerations

1. **Always validate the webhook secret** - prevent unauthorized order creation
2. **Check for duplicate orders** - use `websiteOrderId` to prevent duplicates
3. **Validate product IDs** - ensure products exist before creating order
4. **Log all webhook calls** - for debugging and audit trail
5. **Don't expose webhook URL publicly** - only the main website should know it

---

## Monitoring

Check webhook logs in Vercel:
```bash
vercel logs ops.shinecosmetics.ma --follow
```

Look for:
- ✅ `Order synced successfully`
- ⚠️ `Unauthorized webhook attempt` (investigate immediately)
- ❌ `Failed to sync order` (check error details)

---

## Troubleshooting

**Problem:** Webhook returns 401 Unauthorized
- **Fix:** Check that `WEBHOOK_SECRET` matches on both sides

**Problem:** Webhook returns 400 Missing required fields
- **Fix:** Ensure all required fields are sent: `orderId`, `items`

**Problem:** Webhook returns 500 Product not found
- **Fix:** Ensure product IDs in main website match BOS database

**Problem:** Order created twice
- **Fix:** Webhook already handles duplicates - check `websiteOrderId`

---

Last updated: June 4, 2026
