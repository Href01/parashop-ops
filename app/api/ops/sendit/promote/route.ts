import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import { findOrCreateCustomer } from '@/lib/customer'
import pool from '@/lib/db'
import { creditOrderPoints } from '@/lib/loyalty'
import { fireDeliveredCapi } from '@/lib/meta-capi'
import { isPrepaidPaymentMethod, normalizePaymentMethod } from '@/lib/order-utils'
import { getShipmentTracking } from '@/lib/sendit'

function mapStatus(status: string): string {
  const value = String(status || '').toUpperCase()
  if (value === 'DELIVERED') return 'DELIVERED'
  if (['CANCELED', 'CANCELLED', 'REJECTED', 'REFUSED', 'RETURNED', 'RETURN'].includes(value)) return 'CANCELLED'
  return 'CONFIRMED'
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !isFounder(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown) => Number.isInteger(id)) : []
  if (ids.length === 0) return NextResponse.json({ error: 'Aucun colis selectionne' }, { status: 400 })

  const rows = await pool.query(
    `SELECT * FROM "SenditStaging"
     WHERE id = ANY($1) AND promoted = false AND state = 'sendit_only'`,
    [ids]
  )

  let promoted = 0
  const skipped: Array<{ id: number; reason: string }> = []

  for (const staging of rows.rows) {
    const items: Array<{ productId: number; quantity: number; price: number }> = Array.isArray(staging.assignedProducts)
      ? staging.assignedProducts
      : []
    if (items.length === 0) {
      skipped.push({ id: staging.id, reason: 'pas de produits affectes' })
      continue
    }

    const productsTotal = items.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
      0
    )
    const status = mapStatus(staging.senditStatus)
    const paymentMethod = normalizePaymentMethod(staging.paymentMethod)
    const prepaid = isPrepaidPaymentMethod(paymentMethod)
    const bankPaidAmount = Number(staging.paidAmount) || 0
    if (prepaid && (bankPaidAmount <= 0 || !staging.paidAt)) {
      skipped.push({ id: staging.id, reason: 'montant et date du virement requis' })
      continue
    }
    let fee = Number(staging.fee) || 0
    let amount = Number(staging.amount) || 0
    let deliveredAt: string | null = null

    if (status === 'DELIVERED') {
      try {
        const live = await getShipmentTracking(staging.code)
        fee = Number(live.fee) || fee
        amount = Number(live.amount) || amount
        deliveredAt = live.last_action_at || null
      } catch (error) {
        skipped.push({ id: staging.id, reason: error instanceof Error ? error.message : 'tracking Sendit indisponible' })
        continue
      }
    }

    // The courier fee is a cost. The customer delivery charge is inferred from
    // the assigned product prices and must not reuse the courier-fee column.
    const orderTotal = prepaid ? bankPaidAmount : amount
    const deliveryFeeCharged = Math.max(orderTotal - productsTotal, 0)
    const codAmount = prepaid ? null : amount
    const verifiedPaidAmount = prepaid ? bankPaidAmount : status === 'DELIVERED' ? amount : null
    const verifiedPaidAt = prepaid ? staging.paidAt : status === 'DELIVERED' ? deliveredAt : null
    const paymentReference = prepaid ? staging.paymentReference : staging.code
    const paymentStatus = verifiedPaidAmount != null ? 'PAID' : 'PENDING'

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const duplicate = await client.query(
        `SELECT id FROM "Order" WHERE "senditTrackingId" = $1`,
        [staging.code]
      )
      if (duplicate.rows.length > 0) {
        await client.query('ROLLBACK')
        await pool.query(
          `UPDATE "SenditStaging"
           SET promoted = true, "promotedOrderId" = $1, "matchedOrderId" = $1,
               state = 'matched', "updatedAt" = NOW()
           WHERE id = $2`,
          [duplicate.rows[0].id, staging.id]
        )
        skipped.push({ id: staging.id, reason: 'commande deja existante (liee)' })
        continue
      }

      const customerId = staging.matchedUserId
        || await findOrCreateCustomer(client, staging.name, staging.phone)
      const delivered = status === 'DELIVERED'

      const costResult = await client.query(
        `SELECT id, COALESCE("costPrice", 0)::float AS cost
         FROM "Product" WHERE id = ANY($1)`,
        [items.map((item) => item.productId)]
      )
      const costByProduct = new Map<number, number>(
        costResult.rows.map((row: { id: number; cost: number }) => [row.id, row.cost])
      )

      const orderResult = await client.query(
        `INSERT INTO "Order"
           ("userId", total, "productsTotal", status, "paymentMethod", "sourceChannel",
            "deliveryName", "deliveryPhone", "deliveryCity", "deliveryFeeCharged",
            "estimatedDeliveryCost", "actualDeliveryCost", "codAmount",
            "senditTrackingId", "senditStatus", "deliveryStatus", "createdAt", "deliveredAt",
            "paidAmount", "paidAt", "paymentReference", "paymentStatus")
         VALUES
           ($1, $2, $3, $4::"OrderStatus", $16, 'Sendit',
            $5, $6, $7, $8, $9, $10, $11,
            $12, $13, $14, COALESCE($15, NOW()),
            CASE WHEN NULLIF($17::text, '') IS NOT NULL
              THEN ($17::timestamp AT TIME ZONE 'Africa/Casablanca') ELSE NULL END,
            $18, $19::timestamptz, $20, $21)
         RETURNING id`,
        [
          customerId, orderTotal, productsTotal, status,
          staging.name, staging.phone, staging.city, deliveryFeeCharged,
          fee, delivered ? fee : null, codAmount,
          staging.code, staging.senditStatus, staging.senditStatus, staging.senditCreatedAt,
          paymentMethod, deliveredAt,
          verifiedPaidAmount, verifiedPaidAt, paymentReference, paymentStatus,
        ]
      )
      const orderId = orderResult.rows[0].id

      for (const item of items) {
        const unitCost = costByProduct.get(item.productId) || 0
        await client.query(
          `INSERT INTO "OrderItem"
             ("orderId", "productId", quantity, price, "unitCost", "totalCost", "pointsEarned")
           VALUES ($1, $2, $3, $4, $5, $6, 0)`,
          [orderId, item.productId, item.quantity, item.price, unitCost, unitCost * item.quantity]
        )
      }

      await client.query(`UPDATE "Order" SET status = status WHERE id = $1`, [orderId])
      await client.query('COMMIT')

      await pool.query(
        `UPDATE "SenditStaging"
         SET promoted = true, "promotedOrderId" = $1, "matchedOrderId" = $1,
             state = 'matched', fee = $2, amount = $3, "updatedAt" = NOW()
         WHERE id = $4`,
        [orderId, fee, amount, staging.id]
      )

      if (delivered) {
        try {
          await creditOrderPoints(pool, orderId)
        } catch (error) {
          console.error('[Sendit] loyalty after promotion', orderId, error)
        }
        await fireDeliveredCapi(orderId)
      }
      promoted++
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('[Sendit] promote row', staging.id, error)
      skipped.push({ id: staging.id, reason: error instanceof Error ? error.message : 'erreur' })
    } finally {
      client.release()
    }
  }

  return NextResponse.json({ ok: true, promoted, skipped })
}
