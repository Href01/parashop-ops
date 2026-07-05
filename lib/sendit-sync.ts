import pool from '@/lib/db'
import { getShipmentTracking, listAllSenditDeliveries } from '@/lib/sendit'
import { fireDeliveredCapi } from '@/lib/meta-capi'

// Sendit delivery status -> our OrderStatus. In-transit states (PICKEDUP, etc.)
// map to nothing here, so the order keeps its status but still gets its fresh
// senditStatus recorded.
const SENDIT_TO_ORDER_STATUS: Record<string, string> = {
  DELIVERED: 'DELIVERED',
  CANCELED: 'CANCELLED',
  REJECTED: 'CANCELLED',
}

export interface SenditSyncResult {
  checked: number
  updated: Array<{ id: number; senditStatus: string; status?: string; via?: 'tracking' | 'phone' }>
  failed: Array<{ id: number; error: string }>
  matchedByPhone: number
}

/** Normalize a Moroccan phone to its 9-digit core for matching. */
function phoneKey(p: string | null | undefined): string {
  let d = (p || '').replace(/\D/g, '')
  if (d.startsWith('212')) d = d.slice(3)
  if (d.startsWith('0')) d = d.slice(1)
  return d.slice(-9)
}

/**
 * Pull the latest Sendit status for every non-terminal order and update it.
 *
 * Phase 1 — orders that already carry a shipment: query their tracking id.
 * Phase 2 — orders shipped via Sendit but with NO tracking link in the BOS
 *   (e.g. the shipment was created directly in Sendit): match them to Sendit's
 *   live deliveries by phone + closest creation date, link the tracking, and
 *   update the status. Without this a delivered order stays stuck "confirmée".
 *
 * Shared by the manual "Sync Sendit" button and the Vercel cron.
 */
export async function syncSenditStatuses(limit = 100): Promise<SenditSyncResult> {
  const updated: SenditSyncResult['updated'] = []
  const failed: SenditSyncResult['failed'] = []

  // ---- Phase 1: tracked orders ----
  const tracked = await pool.query(
    `SELECT id, status, "senditTrackingId"
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
      const newStatus = SENDIT_TO_ORDER_STATUS[tracking.status]

      await pool.query(
        `UPDATE "Order"
         SET "senditStatus" = $1, "deliveryStatus" = $2, status = COALESCE($3::"OrderStatus", status)
         WHERE id = $4`,
        [tracking.status, tracking.status, newStatus || null, order.id]
      )

      if (newStatus && newStatus !== order.status) {
        await pool.query(
          `INSERT INTO "OrderStatusHistory" ("orderId", "oldStatus", "newStatus", "source", "note", "createdAt")
           VALUES ($1, $2, $3, 'sendit', $4, NOW())`,
          [order.id, order.status, newStatus, `Sendit status synced: ${tracking.status}`]
        )
        if (newStatus === 'DELIVERED') await fireDeliveredCapi(order.id)
      }

      updated.push({ id: order.id, senditStatus: tracking.status, status: newStatus, via: 'tracking' })
    } catch (error) {
      failed.push({ id: order.id, error: error instanceof Error ? error.message : 'Unknown sync error' })
    }
  }

  // ---- Phase 2: untracked orders, matched to Sendit by phone ----
  let matchedByPhone = 0
  const untracked = await pool.query(
    `SELECT id, status, "deliveryPhone", "paymentMethod", "createdAt"
     FROM "Order"
     WHERE "senditTrackingId" IS NULL
       AND status NOT IN ('DELIVERED', 'CANCELLED')
     ORDER BY "createdAt" DESC
     LIMIT $1`,
    [limit]
  )

  if (untracked.rows.length > 0) {
    try {
      const deliveries = await listAllSenditDeliveries()
      const byPhone = new Map<string, typeof deliveries>()
      for (const d of deliveries) {
        const k = phoneKey(d.phone)
        if (!k) continue
        const arr = byPhone.get(k)
        if (arr) arr.push(d)
        else byPhone.set(k, [d])
      }
      const parseDate = (s: string | null) => (s ? new Date(s.replace(' ', 'T')).getTime() : NaN)

      for (const order of untracked.rows) {
        try {
          const candidates = byPhone.get(phoneKey(order.deliveryPhone))
          if (!candidates || candidates.length === 0) continue

          // Tie the shipment to THIS order by creation-date proximity, so a repeat
          // customer's older delivery doesn't get linked to a new order.
          const orderTime = new Date(order.createdAt).getTime()
          let best: (typeof candidates)[number] | null = null
          let bestDelta = Infinity
          for (const d of candidates) {
            const dt = parseDate(d.createdAt)
            const delta = Number.isNaN(dt) ? Infinity : Math.abs(dt - orderTime)
            if (delta < bestDelta) { bestDelta = delta; best = d }
          }
          // Accept only a shipment created within ~30 days of the order.
          if (!best || bestDelta > 30 * 86400000) continue

          const newStatus = SENDIT_TO_ORDER_STATUS[best.status]
          const prepaid = ['VIREMENT', 'CARD'].includes(String(order.paymentMethod || '').toUpperCase())
          const amount = Number(best.amount) || 0
          const fee = Number(best.fee) || 0

          if (!prepaid && amount > 0) {
            // COD: the Sendit amount is the real cash collected -> total & codAmount.
            await pool.query(
              `UPDATE "Order"
               SET "senditTrackingId" = $1, "senditStatus" = $2, "deliveryStatus" = $2,
                   status = COALESCE($3::"OrderStatus", status),
                   "deliveryFeeCharged" = $4, total = $5, "codAmount" = $5
               WHERE id = $6`,
              [best.code, best.status, newStatus || null, fee, amount, order.id]
            )
          } else {
            // Prepaid (Sendit COD = 0): only link + status, never overwrite the money.
            await pool.query(
              `UPDATE "Order"
               SET "senditTrackingId" = $1, "senditStatus" = $2, "deliveryStatus" = $2,
                   status = COALESCE($3::"OrderStatus", status),
                   "deliveryFeeCharged" = COALESCE($4, "deliveryFeeCharged")
               WHERE id = $5`,
              [best.code, best.status, newStatus || null, fee || null, order.id]
            )
          }

          if (newStatus && newStatus !== order.status) {
            await pool.query(
              `INSERT INTO "OrderStatusHistory" ("orderId", "oldStatus", "newStatus", "source", "note", "createdAt")
               VALUES ($1, $2, $3, 'sendit', $4, NOW())`,
              [order.id, order.status, newStatus, `Sendit matched by phone: ${best.code} (${best.status})`]
            )
            if (newStatus === 'DELIVERED') await fireDeliveredCapi(order.id)
          }

          updated.push({ id: order.id, senditStatus: best.status, status: newStatus, via: 'phone' })
          matchedByPhone++
        } catch (error) {
          failed.push({ id: order.id, error: error instanceof Error ? error.message : 'phone-match error' })
        }
      }
    } catch (error) {
      // If listing Sendit deliveries fails, don't break the whole sync.
      console.error('[sendit-sync] phone-match phase failed:', error)
    }
  }

  return { checked: tracked.rows.length + untracked.rows.length, updated, failed, matchedByPhone }
}
