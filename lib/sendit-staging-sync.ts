import pool from '@/lib/db'
import { phoneKey } from '@/lib/customer'
import { listAllSenditDeliveries } from '@/lib/sendit'

interface OrderMatch {
  id: number
  orderNumber: string | null
  senditTrackingId: string | null
  status: string
}

interface UserMatch {
  id: number
  name: string | null
  phone: string | null
}

function referenceKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function mapSenditStatus(status: string): string {
  const value = String(status || '').toUpperCase()
  if (value === 'DELIVERED') return 'DELIVERED'
  if (['CANCELED', 'CANCELLED', 'REJECTED', 'REFUSED', 'RETURNED', 'RETURN'].includes(value)) return 'CANCELLED'
  return 'CONFIRMED'
}

export async function pullSenditStaging() {
  const deliveries = await listAllSenditDeliveries()
  const [ordersResult, promotedResult, usersResult] = await Promise.all([
    pool.query<OrderMatch>(
      `SELECT id, "orderNumber", "senditTrackingId", status::text AS status FROM "Order"`
    ),
    pool.query<{ code: string; promotedOrderId: number }>(
      `SELECT code, "promotedOrderId" FROM "SenditStaging"
       WHERE promoted = true AND "promotedOrderId" IS NOT NULL`
    ),
    pool.query<UserMatch>(
      `SELECT id, name, phone FROM "User" WHERE role IS DISTINCT FROM 'ADMIN' AND phone IS NOT NULL`
    ),
  ])

  const orderById = new Map<number, OrderMatch>()
  const byTracking = new Map<string, OrderMatch>()
  const referenceCandidates = new Map<string, OrderMatch[]>()
  for (const order of ordersResult.rows) {
    orderById.set(order.id, order)
    if (order.senditTrackingId) byTracking.set(order.senditTrackingId, order)
    for (const key of [referenceKey(order.orderNumber), referenceKey(`ORD-${order.id}`)]) {
      if (!key) continue
      const candidates = referenceCandidates.get(key) || []
      candidates.push(order)
      referenceCandidates.set(key, candidates)
    }
  }

  const promotedOwnerByCode = new Map<string, OrderMatch>()
  for (const row of promotedResult.rows) {
    const owner = orderById.get(row.promotedOrderId)
    if (owner) promotedOwnerByCode.set(row.code, owner)
  }

  const usersByPhone = new Map<string, UserMatch>()
  for (const user of usersResult.rows) {
    const key = phoneKey(user.phone)
    if (key && !usersByPhone.has(key)) usersByPhone.set(key, user)
  }

  let inserted = 0
  let updated = 0
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const delivery of deliveries) {
      const refMatches = referenceCandidates.get(referenceKey(delivery.reference)) || []
      const matchedOrder = promotedOwnerByCode.get(delivery.code)
        || byTracking.get(delivery.code)
        || (refMatches.length === 1 ? refMatches[0] : null)
      const matchedUser = usersByPhone.get(phoneKey(delivery.phone)) || null
      const mapped = mapSenditStatus(delivery.status)
      const state = !matchedOrder ? 'sendit_only' : mapped === matchedOrder.status ? 'matched' : 'mismatch'

      const result = await client.query(
        `INSERT INTO "SenditStaging"
           (code, "senditStatus", name, phone, "phoneKey", city, amount, fee, "productsText", reference,
            "senditCreatedAt", "lastActionAt", "matchedOrderId", "matchedUserId", "matchedCustomerName",
            state, "pulledAt", "updatedAt")
         VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
           CASE WHEN NULLIF($12::text, '') IS NOT NULL
             THEN ($12::timestamp AT TIME ZONE 'Africa/Casablanca') ELSE NULL END,
           $13,$14,$15,$16,NOW(),NOW()
         )
         ON CONFLICT (code) DO UPDATE SET
           "senditStatus" = EXCLUDED."senditStatus", name = EXCLUDED.name, phone = EXCLUDED.phone,
           "phoneKey" = EXCLUDED."phoneKey", city = EXCLUDED.city, amount = EXCLUDED.amount, fee = EXCLUDED.fee,
           "productsText" = EXCLUDED."productsText", reference = EXCLUDED.reference,
           "senditCreatedAt" = EXCLUDED."senditCreatedAt", "lastActionAt" = EXCLUDED."lastActionAt",
           "matchedOrderId" = CASE
             WHEN "SenditStaging".promoted AND "SenditStaging"."promotedOrderId" IS NOT NULL
               THEN "SenditStaging"."promotedOrderId"
             ELSE EXCLUDED."matchedOrderId"
           END,
           "matchedUserId" = EXCLUDED."matchedUserId",
           "matchedCustomerName" = EXCLUDED."matchedCustomerName",
           state = EXCLUDED.state,
           "pulledAt" = NOW(), "updatedAt" = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [
          delivery.code, delivery.status, delivery.name, delivery.phone, phoneKey(delivery.phone), delivery.city,
          delivery.amount, delivery.fee, delivery.products, delivery.reference, delivery.createdAt || null,
          delivery.lastActionAt || null, matchedOrder?.id || null, matchedUser?.id || null,
          matchedUser?.name || null, state,
        ]
      )
      if (result.rows[0]?.inserted) inserted++
      else updated++
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  return { ok: true, pulled: deliveries.length, inserted, updated }
}
