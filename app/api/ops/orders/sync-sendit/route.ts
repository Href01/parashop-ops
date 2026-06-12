import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getShipmentTracking } from '@/lib/sendit'
import { getOpsSession } from '@/lib/auth'

const SENDIT_TO_ORDER_STATUS: Record<string, string> = {
  DELIVERED: 'DELIVERED',
  CANCELED: 'CANCELLED',
  REJECTED: 'CANCELLED',
}

export async function POST() {
  try {
    const session = await getOpsSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ordersResult = await pool.query(
      `SELECT id, status, "senditTrackingId"
       FROM "Order"
       WHERE "senditTrackingId" IS NOT NULL
         AND status NOT IN ('DELIVERED', 'CANCELLED')
       ORDER BY "createdAt" DESC
       LIMIT 100`
    )

    const updated: Array<{ id: number; senditStatus: string; status?: string }> = []
    const failed: Array<{ id: number; error: string }> = []

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
        }

        updated.push({ id: order.id, senditStatus: tracking.status, status: newStatus })
      } catch (error: any) {
        failed.push({ id: order.id, error: error?.message || 'Unknown sync error' })
      }
    }

    return NextResponse.json({
      success: true,
      checked: ordersResult.rows.length,
      updated,
      failed,
    })
  } catch (error: any) {
    console.error('Sync Sendit error:', error)
    return NextResponse.json(
      { error: 'Failed to sync Sendit statuses', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
