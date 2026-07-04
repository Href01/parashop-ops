import pool from '@/lib/db'
import { getShipmentTracking } from '@/lib/sendit'
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
  updated: Array<{ id: number; senditStatus: string; status?: string }>
  failed: Array<{ id: number; error: string }>
}

/**
 * Pull the latest Sendit tracking status for every non-terminal order that has a
 * shipment, and update it. Shared by the manual button (session-guarded route)
 * and the Vercel cron so statuses stay fresh without anyone clicking.
 */
export async function syncSenditStatuses(limit = 100): Promise<SenditSyncResult> {
  const ordersResult = await pool.query(
    `SELECT id, status, "senditTrackingId"
     FROM "Order"
     WHERE "senditTrackingId" IS NOT NULL
       AND status NOT IN ('DELIVERED', 'CANCELLED')
     ORDER BY "createdAt" DESC
     LIMIT $1`,
    [limit]
  )

  const updated: SenditSyncResult['updated'] = []
  const failed: SenditSyncResult['failed'] = []

  for (const order of ordersResult.rows) {
    try {
      const tracking = await getShipmentTracking(order.senditTrackingId)
      const newStatus = SENDIT_TO_ORDER_STATUS[tracking.status]

      await pool.query(
        `UPDATE "Order"
         SET "senditStatus" = $1,
             "deliveryStatus" = $2,
             status = COALESCE($3::"OrderStatus", status)
         WHERE id = $4`,
        [tracking.status, tracking.status, newStatus || null, order.id]
      )

      if (newStatus && newStatus !== order.status) {
        await pool.query(
          `INSERT INTO "OrderStatusHistory" (
            "orderId", "oldStatus", "newStatus", "source", "note", "createdAt"
          ) VALUES ($1, $2, $3, 'sendit', $4, NOW())`,
          [order.id, order.status, newStatus, `Sendit status synced: ${tracking.status}`]
        )
        // Real-world "paid" signal to Meta — once, when the order is delivered.
        if (newStatus === 'DELIVERED') await fireDeliveredCapi(order.id)
      }

      updated.push({ id: order.id, senditStatus: tracking.status, status: newStatus })
    } catch (error) {
      failed.push({ id: order.id, error: error instanceof Error ? error.message : 'Unknown sync error' })
    }
  }

  return { checked: ordersResult.rows.length, updated, failed }
}
