import pool from '@/lib/db'
import { creditOrderPoints } from '@/lib/loyalty'
import { fireDeliveredCapi } from '@/lib/meta-capi'
import { isPrepaidPaymentMethod } from '@/lib/order-utils'
import { getShipmentTracking } from '@/lib/sendit'

const SENDIT_TO_ORDER_STATUS: Record<string, string> = {
  DELIVERED: 'DELIVERED',
  CANCELED: 'CANCELLED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'CANCELLED',
  REFUSED: 'CANCELLED',
  RETURNED: 'CANCELLED',
  RETURN: 'CANCELLED',
}

export interface SenditSyncResult {
  checked: number
  updated: Array<{ id: number; senditStatus: string; status?: string; via: 'tracking' }>
  failed: Array<{ id: number; error: string }>
  matchedByPhone: number
}

/**
 * Refresh orders that already have an exact Sendit tracking code.
 *
 * Untracked orders are intentionally not auto-linked here. A phone number is a
 * customer identifier, not a shipment identifier; repeat purchases made the old
 * phone matcher overwrite tracking, products, delivery dates and financials.
 */
export async function syncSenditStatuses(limit = 100): Promise<SenditSyncResult> {
  const updated: SenditSyncResult['updated'] = []
  const failed: SenditSyncResult['failed'] = []

  const tracked = await pool.query(
    `SELECT id, status::text AS status, "senditTrackingId", "paymentMethod"
     FROM "Order"
     WHERE "senditTrackingId" IS NOT NULL
       AND status NOT IN ('DELIVERED', 'CANCELLED')
     ORDER BY "createdAt" DESC
     LIMIT $1`,
    [limit]
  )

  for (const order of tracked.rows) {
    try {
      const tracking = await getShipmentTracking(order.senditTrackingId)
      const senditStatus = String(tracking.status || '').toUpperCase()
      const newStatus = SENDIT_TO_ORDER_STATUS[senditStatus]
      const prepaid = isPrepaidPaymentMethod(order.paymentMethod)
      const amount = Number(tracking.amount) || 0
      const fee = Number(tracking.fee) || 0

      if (prepaid) {
        await pool.query(
          `UPDATE "Order"
           SET "senditStatus" = $1::text,
               "deliveryStatus" = $1::varchar,
               status = COALESCE($2::"OrderStatus", status),
               "actualDeliveryCost" = $3,
               "codAmount" = NULL,
               "deliveredAt" = CASE
                 WHEN $2 = 'DELIVERED' AND NULLIF($4::text, '') IS NOT NULL
                   THEN ($4::timestamp AT TIME ZONE 'Africa/Casablanca')
                 ELSE "deliveredAt"
               END
           WHERE id = $5 AND "senditTrackingId" = $6`,
          [senditStatus, newStatus || null, fee, tracking.last_action_at || null, order.id, tracking.tracking_id]
        )
      } else {
        await pool.query(
          `UPDATE "Order"
           SET "senditStatus" = $1::text,
               "deliveryStatus" = $1::varchar,
               status = COALESCE($2::"OrderStatus", status),
               "actualDeliveryCost" = $3,
               total = CASE WHEN $4 > 0 THEN $4 ELSE total END,
               "codAmount" = CASE WHEN $4 > 0 THEN $4 ELSE "codAmount" END,
               "paidAmount" = CASE WHEN $2 = 'DELIVERED' AND $4 > 0 THEN $4 ELSE "paidAmount" END,
               "paidAt" = CASE
                 WHEN $2 = 'DELIVERED' AND NULLIF($5::text, '') IS NOT NULL
                   THEN ($5::timestamp AT TIME ZONE 'Africa/Casablanca')
                 ELSE "paidAt"
               END,
               "paymentReference" = CASE WHEN $2 = 'DELIVERED' THEN COALESCE("paymentReference", $7) ELSE "paymentReference" END,
               "paymentStatus" = CASE WHEN $2 = 'DELIVERED' AND $4 > 0 THEN 'PAID' ELSE "paymentStatus" END,
               "deliveredAt" = CASE
                 WHEN $2 = 'DELIVERED' AND NULLIF($5::text, '') IS NOT NULL
                   THEN ($5::timestamp AT TIME ZONE 'Africa/Casablanca')
                 ELSE "deliveredAt"
               END
           WHERE id = $6 AND "senditTrackingId" = $7`,
          [senditStatus, newStatus || null, fee, amount, tracking.last_action_at || null, order.id, tracking.tracking_id]
        )
      }

      if (newStatus && newStatus !== order.status) {
        await pool.query(
          `INSERT INTO "OrderStatusHistory" ("orderId", "oldStatus", "newStatus", "source", "note", "createdAt")
           VALUES ($1, $2, $3, 'sendit', $4, NOW())`,
          [order.id, order.status, newStatus, `Sendit status synced: ${senditStatus}`]
        )

        if (newStatus === 'DELIVERED') {
          try {
            await creditOrderPoints(pool, order.id)
          } catch (error) {
            console.error('[sendit-sync] loyalty', order.id, error)
          }
          await fireDeliveredCapi(order.id)
        }
      }

      updated.push({ id: order.id, senditStatus, status: newStatus, via: 'tracking' })
    } catch (error) {
      failed.push({ id: order.id, error: error instanceof Error ? error.message : 'Unknown sync error' })
    }
  }

  return { checked: tracked.rows.length, updated, failed, matchedByPhone: 0 }
}
