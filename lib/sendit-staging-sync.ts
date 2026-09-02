import pool from '@/lib/db'
import { phoneKey } from '@/lib/customer'
import { creditOrderPoints } from '@/lib/loyalty'
import { fireDeliveredCapi } from '@/lib/meta-capi'
import { isPrepaidPaymentMethod } from '@/lib/order-utils'
import { listSenditDeliveriesSnapshot } from '@/lib/sendit'
import { bustAnalyticsCache } from '@/lib/analytics-cache'

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

const SENDIT_IN_TRANSIT = new Set(['WAREHOUSE', 'PICKED_UP', 'IN_TRANSIT', 'DISTRIBUTION'])

function mapSenditOrderStatus(status: string): string | null {
  const value = String(status || '').toUpperCase()
  if (value === 'DELIVERED') return 'DELIVERED'
  if (['CANCELED', 'CANCELLED', 'REJECTED', 'REFUSED', 'RETURNED', 'RETURN'].includes(value)) return 'CANCELLED'
  if (SENDIT_IN_TRANSIT.has(value)) return 'CONFIRMED'
  // PENDING and unknown statuses must not undo a human cancellation.
  return null
}

export async function pullSenditStaging() {
  const snapshot = await listSenditDeliveriesSnapshot()
  const deliveries = snapshot.deliveries
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

  const incoming = deliveries.map((delivery) => {
    const refMatches = referenceCandidates.get(referenceKey(delivery.reference)) || []
    const matchedOrder = promotedOwnerByCode.get(delivery.code)
      || byTracking.get(delivery.code)
      || (refMatches.length === 1 ? refMatches[0] : null)
    const matchedUser = usersByPhone.get(phoneKey(delivery.phone)) || null
    const mapped = mapSenditOrderStatus(delivery.status)
    // PENDING/unknown carries no order decision, so it is not a mismatch by itself.
    const state = !matchedOrder ? 'sendit_only' : !mapped || mapped === matchedOrder.status ? 'matched' : 'mismatch'
    return {
      code: delivery.code,
      sendit_status: delivery.status,
      name: delivery.name,
      phone: delivery.phone,
      phone_key: phoneKey(delivery.phone),
      city: delivery.city,
      amount: delivery.amount,
      fee: delivery.fee,
      products_text: delivery.products,
      reference: delivery.reference,
      sendit_created_at: delivery.createdAt || null,
      last_action_at: delivery.lastActionAt || null,
      matched_order_id: matchedOrder?.id || null,
      matched_user_id: matchedUser?.id || null,
      matched_customer_name: matchedUser?.name || null,
      state,
    }
  })

  // One atomic upsert replaces hundreds of round trips to Neon. This is both
  // faster and cheaper than one INSERT per historical parcel.
  const upserted = await pool.query<{ inserted: boolean }>(
    `WITH incoming AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS d(
         code text, sendit_status text, name text, phone text, phone_key text,
         city text, amount numeric, fee numeric, products_text text, reference text,
         sendit_created_at text, last_action_at text, matched_order_id int,
         matched_user_id int, matched_customer_name text, state text
       )
     )
     INSERT INTO "SenditStaging"
       (code, "senditStatus", name, phone, "phoneKey", city, amount, fee, "productsText", reference,
        "senditCreatedAt", "lastActionAt", "matchedOrderId", "matchedUserId", "matchedCustomerName",
        state, "pulledAt", "updatedAt")
     SELECT code, sendit_status, name, phone, phone_key, city, amount, fee, products_text, reference,
       CASE WHEN NULLIF(sendit_created_at, '') IS NOT NULL
         THEN (sendit_created_at::timestamp AT TIME ZONE 'Africa/Casablanca') ELSE NULL END,
       CASE WHEN NULLIF(last_action_at, '') IS NOT NULL
         THEN (last_action_at::timestamp AT TIME ZONE 'Africa/Casablanca') ELSE NULL END,
       matched_order_id, matched_user_id, matched_customer_name, state, NOW(), NOW()
     FROM incoming
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
       state = CASE WHEN "SenditStaging".state = 'ignored' THEN 'ignored' ELSE EXCLUDED.state END,
       "pulledAt" = NOW(), "updatedAt" = NOW()
     RETURNING (xmax = 0) AS inserted`,
    [JSON.stringify(incoming)]
  )
  const inserted = upserted.rows.filter((row) => row.inserted).length
  const updated = upserted.rows.length - inserted

  return {
    ok: true,
    pulled: deliveries.length,
    inserted,
    updated,
    pages: snapshot.pages,
    apiCalls: snapshot.apiCalls,
    retries: snapshot.retries,
    authCalls: snapshot.authCalls,
  }
}

export interface SyncMatchedStagingResult {
  checked: number
  synced: number
  statusChanged: number
  skipped: number
  failed: Array<{ stagingId: number; code: string; error: string }>
  warnings: Array<{ orderId: number; service: 'loyalty' | 'meta-capi'; error: string }>
}

/**
 * Apply the freshly pulled staging snapshot to orders already linked by exact
 * tracking, unique reference, or explicit promotion. This performs no Sendit
 * API calls: list deliveries already contains status, COD, fee and last action.
 */
export async function syncMatchedSenditStaging(): Promise<SyncMatchedStagingResult> {
  const rows = await pool.query(
    `SELECT s.* FROM "SenditStaging" s
     INNER JOIN "Order" o ON o.id = s."matchedOrderId"
     WHERE s."matchedOrderId" IS NOT NULL
       AND s.state IN ('matched', 'mismatch')
       AND s.state IS DISTINCT FROM 'ignored'
       AND (o."senditTrackingId" IS NULL OR o."senditTrackingId" = s.code OR s."promotedOrderId" = o.id)
       AND (
         o."senditTrackingId" IS NULL
         OR UPPER(COALESCE(o."senditStatus", '')) IS DISTINCT FROM UPPER(COALESCE(s."senditStatus", ''))
         OR COALESCE(o."actualDeliveryCost", 0)::numeric IS DISTINCT FROM COALESCE(s.fee, 0)::numeric
         OR (UPPER(COALESCE(s."senditStatus", '')) = 'DELIVERED' AND (
           o.status::text <> 'DELIVERED'
           OR o."deliveredAt" IS NULL
           OR (UPPER(COALESCE(o."paymentMethod", '')) NOT IN ('VIREMENT','TRANSFER','BANK','BANK_TRANSFER','PREPAID','CARD','CARTE') AND (
             COALESCE(o."codAmount", 0)::numeric IS DISTINCT FROM COALESCE(s.amount, 0)::numeric
             OR COALESCE(o."paidAmount", 0)::numeric IS DISTINCT FROM COALESCE(s.amount, 0)::numeric
           OR COALESCE(o."paymentStatus", '') <> 'PAID'
           ))
         ))
         OR (UPPER(COALESCE(s."senditStatus", '')) IN ('CANCELED','CANCELLED','REJECTED','REFUSED','RETURNED','RETURN') AND o.status::text <> 'CANCELLED')
         OR (UPPER(COALESCE(s."senditStatus", '')) IN ('WAREHOUSE','PICKED_UP','IN_TRANSIT','DISTRIBUTION') AND o.status::text <> 'CONFIRMED')
       )
     ORDER BY s.id ASC`
  )
  const result: SyncMatchedStagingResult = {
    checked: rows.rows.length,
    synced: 0,
    statusChanged: 0,
    skipped: 0,
    failed: [],
    warnings: [],
  }
  const client = await pool.connect()

  try {
    for (const staging of rows.rows) {
      let deliveredOrderId: number | null = null
      try {
        await client.query('BEGIN')
        const currentResult = await client.query(
          `SELECT id, status::text AS status, "paymentMethod", "senditTrackingId", "orderNumber"
           FROM "Order" WHERE id = $1 FOR UPDATE`,
          [staging.matchedOrderId]
        )
        const current = currentResult.rows[0]
        if (!current) {
          await client.query('ROLLBACK')
          result.skipped++
          continue
        }

        const exactTracking = current.senditTrackingId === staging.code
        const exactReference = !current.senditTrackingId && [current.orderNumber, `ORD-${current.id}`]
          .map(referenceKey)
          .includes(referenceKey(staging.reference))
        const promotedOwner = staging.promotedOrderId === current.id
        if (!exactTracking && !exactReference && !promotedOwner) {
          await client.query(
            `UPDATE "SenditStaging" SET state = 'mismatch', "updatedAt" = NOW() WHERE id = $1`,
            [staging.id]
          )
          await client.query('COMMIT')
          result.skipped++
          continue
        }

        const oldStatus = current.status
        const senditStatus = String(staging.senditStatus || '').toUpperCase()
        const amount = Number(staging.amount) || 0
        const fee = Number(staging.fee) || 0
        const deliveredAt = staging.lastActionAt || null
        const mapped = mapSenditOrderStatus(senditStatus)
        const prepaid = isPrepaidPaymentMethod(current.paymentMethod)

        if (prepaid) {
          await client.query(
            `UPDATE "Order"
             SET "senditTrackingId" = COALESCE("senditTrackingId", $1),
                 "senditStatus" = $2::text,
                 "deliveryStatus" = $2::varchar,
                 status = COALESCE($3::"OrderStatus", status),
                 "actualDeliveryCost" = $4::numeric,
                 "codAmount" = NULL,
                 "deliveredAt" = CASE
                   WHEN $3 = 'DELIVERED' AND NULLIF($5::text, '') IS NOT NULL
                     THEN ($5::timestamp AT TIME ZONE 'Africa/Casablanca')
                   ELSE "deliveredAt"
                 END
             WHERE id = $6`,
            [staging.code, senditStatus, mapped, fee, deliveredAt, current.id]
          )
        } else {
          await client.query(
            `UPDATE "Order"
             SET "senditTrackingId" = COALESCE("senditTrackingId", $1),
                 "senditStatus" = $2::text,
                 "deliveryStatus" = $2::varchar,
                 status = COALESCE($3::"OrderStatus", status),
                 "actualDeliveryCost" = $4::numeric,
                 total = CASE WHEN $5::numeric > 0 THEN $5::numeric ELSE total END,
                 "codAmount" = CASE WHEN $5::numeric > 0 THEN $5::numeric ELSE "codAmount" END,
                 "paidAmount" = CASE WHEN $3 = 'DELIVERED' AND $5::numeric > 0 THEN $5::numeric ELSE "paidAmount" END,
                 "paidAt" = CASE
                   WHEN $3 = 'DELIVERED' AND NULLIF($6::text, '') IS NOT NULL
                     THEN ($6::timestamp AT TIME ZONE 'Africa/Casablanca')
                   ELSE "paidAt"
                 END,
                 "paymentReference" = CASE WHEN $3 = 'DELIVERED' THEN COALESCE("paymentReference", $1) ELSE "paymentReference" END,
                 "paymentStatus" = CASE WHEN $3 = 'DELIVERED' AND $5::numeric > 0 THEN 'PAID' ELSE "paymentStatus" END,
                 "deliveredAt" = CASE
                   WHEN $3 = 'DELIVERED' AND NULLIF($6::text, '') IS NOT NULL
                     THEN ($6::timestamp AT TIME ZONE 'Africa/Casablanca')
                   ELSE "deliveredAt"
                 END
             WHERE id = $7`,
            [staging.code, senditStatus, mapped, fee, amount, deliveredAt, current.id]
          )
        }

        if (mapped && mapped !== oldStatus) {
          await client.query(
            `INSERT INTO "OrderStatusHistory" ("orderId", "oldStatus", "newStatus", "source", "note", "createdAt")
             VALUES ($1, $2, $3, 'sendit', $4, NOW())`,
            [current.id, oldStatus, mapped, `Reconciliation Sendit: ${senditStatus}`]
          )
          result.statusChanged++
          if (mapped === 'DELIVERED') deliveredOrderId = current.id
        }

        await client.query(
          `UPDATE "SenditStaging"
           SET state = 'matched', "updatedAt" = NOW()
           WHERE id = $1`,
          [staging.id]
        )
        await client.query('COMMIT')
        result.synced++

        if (deliveredOrderId) {
          try {
            await creditOrderPoints(pool, deliveredOrderId)
          } catch (error) {
            result.warnings.push({ orderId: deliveredOrderId, service: 'loyalty', error: error instanceof Error ? error.message : 'unknown' })
          }
          try {
            await fireDeliveredCapi(deliveredOrderId)
          } catch (error) {
            result.warnings.push({ orderId: deliveredOrderId, service: 'meta-capi', error: error instanceof Error ? error.message : 'unknown' })
          }
        }
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        result.failed.push({
          stagingId: Number(staging.id),
          code: String(staging.code || ''),
          error: error instanceof Error ? error.message : 'unknown',
        })
      }
    }
  } finally {
    client.release()
  }

  if (result.synced > 0) await bustAnalyticsCache()
  return result
}
