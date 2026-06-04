# API Documentation

Complete reference for all BOS API endpoints.

**Base URL**: `https://ops.shinecosmetics.ma/api`

**Last Updated**: June 4, 2026

---

## Authentication

All API endpoints require authentication via NextAuth session.

**Headers**:
```
Cookie: next-auth.session-token=...
```

**Unauthorized Response**:
```json
{
  "error": "Unauthorized"
}
```
Status: `401`

---

## Orders API

### GET `/ops/orders`
List all orders with optional filters.

**Query Parameters**:
- `status` (optional) - Filter by status (`PENDING`, `CONFIRMED`, `DELIVERED`, `CANCELLED`)
- `sourceChannel` (optional) - Filter by source (`Website`, `WhatsApp`, `Instagram`, `TikTok`)
- `needsReview` (optional) - Boolean, filter orders with incomplete data

**Response**:
```json
[
  {
    "id": 1,
    "orderNumber": "ORD-260604-0001",
    "status": "CONFIRMED",
    "sourceChannel": "WhatsApp",
    "deliveryName": "Ahmed Ben Ali",
    "deliveryPhone": "0612345678",
    "deliveryCity": "Casablanca",
    "total": 450.00,
    "revenue": 450.00,
    "estimatedProfit": 180.00,
    "marginPercent": 40.00,
    "createdAt": "2026-06-04T10:30:00.000Z"
  }
]
```

**Example**:
```bash
curl -X GET 'https://ops.shinecosmetics.ma/api/ops/orders?status=PENDING' \
  -H 'Cookie: next-auth.session-token=...'
```

---

### POST `/ops/orders`
Create a new order (manual entry from WhatsApp, Instagram, etc.).

**Request Body**:
```json
{
  "sourceChannel": "WhatsApp",
  "deliveryName": "Sara El Amrani",
  "deliveryPhone": "0687654321",
  "deliveryCity": "Rabat",
  "deliveryAddress": "12 Rue Hassan II, Apt 5",
  "deliveryNotes": "Call before delivery",
  "paymentMethod": "COD",
  "deliveryFeeCharged": 35.00,
  "estimatedDeliveryCost": 30.00,
  "discountTotal": 0,
  "notes": "Customer wants gift wrap",
  "items": [
    {
      "productId": 15,
      "quantity": 2,
      "price": 180.00
    },
    {
      "productId": 23,
      "quantity": 1,
      "price": 95.00
    }
  ],
  "confirmImmediately": false
}
```

**Fields**:
- `sourceChannel` (required) - `WhatsApp`, `Instagram`, `TikTok`, `Manual`
- `deliveryName` (required) - Customer name
- `deliveryPhone` (required) - Phone number
- `deliveryCity` (required) - City name
- `deliveryAddress` (optional) - Full address
- `deliveryNotes` (optional) - Delivery instructions
- `paymentMethod` (optional, default: `COD`) - `COD`, `PREPAID`, `OTHER`
- `deliveryFeeCharged` (optional, default: 0) - What customer pays for delivery
- `estimatedDeliveryCost` (optional, default: 30) - Estimated cost to us
- `discountTotal` (optional, default: 0) - Discount amount
- `notes` (optional) - Internal notes
- `items` (required) - Array of order items
  - `productId` (required) - Product ID from Product table
  - `quantity` (required) - Quantity ordered
  - `price` (required) - Selling price per unit
- `confirmImmediately` (optional, default: false) - Set status to CONFIRMED

**Response**:
```json
{
  "id": 42,
  "orderNumber": "ORD-260604-0042",
  "status": "PENDING",
  "sourceChannel": "WhatsApp",
  "deliveryName": "Sara El Amrani",
  "deliveryPhone": "0687654321",
  "deliveryCity": "Rabat",
  "deliveryAddress": "12 Rue Hassan II, Apt 5",
  "total": 455.00,
  "subtotal": 455.00,
  "revenue": 455.00,
  "estimatedProfit": 195.00,
  "marginPercent": 42.86,
  "deliveryFeeCharged": 35.00,
  "estimatedDeliveryCost": 30.00,
  "paymentMethod": "COD",
  "createdAt": "2026-06-04T14:22:00.000Z"
}
```

**Status**: `201 Created`

**Error Responses**:
```json
{
  "error": "Missing required fields: deliveryName, deliveryPhone"
}
```
Status: `400 Bad Request`

**Example**:
```bash
curl -X POST 'https://ops.shinecosmetics.ma/api/ops/orders' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: next-auth.session-token=...' \
  -d '{
    "sourceChannel": "WhatsApp",
    "deliveryName": "Sara El Amrani",
    "deliveryPhone": "0687654321",
    "deliveryCity": "Rabat",
    "items": [
      {"productId": 15, "quantity": 2, "price": 180}
    ]
  }'
```

---

### GET `/ops/orders/:id`
Get order details with items, status history, and Sendit shipment info.

**Path Parameters**:
- `id` (required) - Order ID

**Response**:
```json
{
  "id": 42,
  "orderNumber": "ORD-260604-0042",
  "status": "DELIVERED",
  "sourceChannel": "WhatsApp",
  "deliveryName": "Sara El Amrani",
  "deliveryPhone": "0687654321",
  "deliveryCity": "Rabat",
  "deliveryAddress": "12 Rue Hassan II, Apt 5",
  "total": 455.00,
  "revenue": 455.00,
  "estimatedProfit": 195.00,
  "finalProfit": 188.00,
  "marginPercent": 41.32,
  "deliveryFeeCharged": 35.00,
  "estimatedDeliveryCost": 30.00,
  "actualDeliveryCost": 32.00,
  "createdAt": "2026-06-04T14:22:00.000Z",
  "items": [
    {
      "id": 101,
      "productId": 15,
      "productName": "Olaplex No.3",
      "quantity": 2,
      "price": 180.00,
      "unitCost": 120.00,
      "totalPrice": 360.00,
      "totalCost": 240.00,
      "sku": "OLAP-NO3",
      "image": "/products/olaplex-no3.jpg"
    },
    {
      "id": 102,
      "productId": 23,
      "productName": "Milk Shake Incredible Milk",
      "quantity": 1,
      "price": 95.00,
      "unitCost": 65.00,
      "totalPrice": 95.00,
      "totalCost": 65.00,
      "sku": "MILK-INC",
      "image": "/products/milk-shake.jpg"
    }
  ],
  "statusHistory": [
    {
      "id": 1,
      "oldStatus": null,
      "newStatus": "PENDING",
      "source": "manual",
      "note": "Order created",
      "createdAt": "2026-06-04T14:22:00.000Z"
    },
    {
      "id": 2,
      "oldStatus": "PENDING",
      "newStatus": "CONFIRMED",
      "source": "manual",
      "note": "Confirmed by founder",
      "createdAt": "2026-06-04T15:10:00.000Z"
    },
    {
      "id": 3,
      "oldStatus": "CONFIRMED",
      "newStatus": "SHIPPED",
      "source": "sendit",
      "note": "Shipment created with Sendit",
      "createdAt": "2026-06-04T16:00:00.000Z"
    },
    {
      "id": 4,
      "oldStatus": "SHIPPED",
      "newStatus": "DELIVERED",
      "source": "sendit",
      "note": "Delivered successfully",
      "createdAt": "2026-06-05T11:30:00.000Z"
    }
  ],
  "senditShipment": {
    "id": 12,
    "senditShipmentId": "SND-123456",
    "senditTrackingId": "TRK-789012",
    "status": "DELIVERED",
    "trackingUrl": "https://track.sendit.ma/TRK-789012",
    "actualDeliveryDate": "2026-06-05",
    "deliveryCost": 32.00,
    "createdAt": "2026-06-04T16:00:00.000Z"
  }
}
```

**Status**: `200 OK`

**Error Response**:
```json
{
  "error": "Order not found"
}
```
Status: `404 Not Found`

**Example**:
```bash
curl -X GET 'https://ops.shinecosmetics.ma/api/ops/orders/42' \
  -H 'Cookie: next-auth.session-token=...'
```

---

### PUT `/ops/orders/:id`
Update order details.

**Path Parameters**:
- `id` (required) - Order ID

**Request Body** (all fields optional):
```json
{
  "deliveryName": "Sara El Amrani",
  "deliveryPhone": "0687654321",
  "deliveryCity": "Rabat",
  "deliveryAddress": "12 Rue Hassan II, Apt 5",
  "deliveryNotes": "Call before delivery",
  "deliveryFeeCharged": 35.00,
  "estimatedDeliveryCost": 30.00,
  "discountTotal": 0,
  "notes": "Customer wants gift wrap",
  "status": "CONFIRMED"
}
```

**Response**:
```json
{
  "id": 42,
  "orderNumber": "ORD-260604-0042",
  "status": "CONFIRMED",
  ... (full order object)
}
```

**Status**: `200 OK`

**Notes**:
- Updating `status` creates an entry in OrderStatusHistory
- Only specified fields are updated (partial update)

**Example**:
```bash
curl -X PUT 'https://ops.shinecosmetics.ma/api/ops/orders/42' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: next-auth.session-token=...' \
  -d '{
    "status": "CONFIRMED",
    "notes": "Confirmed via WhatsApp"
  }'
```

---

## Products API (Coming Soon)

### GET `/ops/products`
List all products with filters.

### PUT `/ops/products/:id`
Update product (mainly for cost price updates).

### POST `/ops/products/bulk-update-costs`
Bulk update cost prices for profit calculation.

---

## Campaigns API (Coming Soon)

### GET `/ops/campaigns`
List campaigns.

### POST `/ops/campaigns`
Create new campaign.

### PUT `/ops/campaigns/:id`
Update campaign metrics.

---

## Webhooks

### POST `/webhooks/sendit`
Receive Sendit delivery status updates.

**Headers**:
```
X-Sendit-Signature: <hmac-signature>
Content-Type: application/json
```

**Request Body**:
```json
{
  "event": "shipment.delivered",
  "shipmentId": "SND-123456",
  "trackingId": "TRK-789012",
  "status": "DELIVERED",
  "deliveredAt": "2026-06-05T11:30:00Z",
  "deliveryCost": 32.00
}
```

**Response**:
```json
{
  "received": true
}
```

**Status**: `200 OK`

---

### POST `/webhooks/website-orders`
Sync orders created on website (Coming Soon).

**Request Body**:
```json
{
  "orderId": 42,
  "action": "created"
}
```

---

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 400 | Bad Request | Invalid request body or missing required fields |
| 401 | Unauthorized | Not authenticated (missing or invalid session) |
| 403 | Forbidden | Authenticated but not a founder (email not in whitelist) |
| 404 | Not Found | Resource doesn't exist |
| 500 | Internal Server Error | Server-side error (check logs) |

---

## Rate Limiting

Currently **no rate limiting** - internal use only by 2 founders.

If needed in future:
- 100 requests/minute per user
- 1000 requests/hour per user

---

## Testing with cURL

### Get session cookie

1. Sign in via browser: `https://ops.shinecosmetics.ma/api/auth/signin`
2. Open DevTools → Application → Cookies
3. Copy `next-auth.session-token` value
4. Use in cURL:

```bash
curl -X GET 'https://ops.shinecosmetics.ma/api/ops/orders' \
  -H 'Cookie: next-auth.session-token=YOUR_TOKEN_HERE'
```

---

## TypeScript Types

```typescript
// Order
interface Order {
  id: number
  orderNumber: string
  status: 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'
  sourceChannel?: 'Website' | 'WhatsApp' | 'Instagram' | 'TikTok' | 'Manual'
  deliveryName?: string
  deliveryPhone?: string
  deliveryCity?: string
  deliveryAddress?: string
  deliveryNotes?: string
  total: number
  revenue?: number
  estimatedProfit?: number
  finalProfit?: number
  marginPercent?: number
  paymentMethod: 'COD' | 'PREPAID' | 'OTHER'
  deliveryFeeCharged: number
  estimatedDeliveryCost: number
  actualDeliveryCost?: number
  notes?: string
  createdAt: string
  updatedAt?: string
}

// OrderItem
interface OrderItem {
  id: number
  orderId: number
  productId: number
  productName?: string
  quantity: number
  price: number
  unitCost?: number
  totalPrice?: number
  totalCost?: number
  sku?: string
  image?: string
}

// OrderStatusHistory
interface OrderStatusHistory {
  id: number
  orderId: number
  oldStatus: string | null
  newStatus: string
  source: 'manual' | 'webhook' | 'sendit'
  note?: string
  createdAt: string
}
```

---

**Last Updated**: June 4, 2026
