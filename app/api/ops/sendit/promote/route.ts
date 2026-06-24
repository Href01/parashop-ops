import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'
import { findOrCreateCustomer } from '@/lib/customer'

/**
 * POST /api/ops/sendit/promote  { ids: number[] }
 * Promotes validated 'sendit_only' staging rows into REAL Order + OrderItem.
 * This is the only place the lab writes to the live BOS — on explicit click.
 * Idempotent: skips rows already promoted or with no assigned products.
 */
function mapStatus(s: string): string {
  const u = (s || '').toUpperCase()
  if (u === 'DELIVERED') return 'DELIVERED'
  if (['CANCELED', 'CANCELLED', 'REJECTED', 'REFUSED', 'RETURNED', 'RETURN'].some((k) => u.includes(k))) return 'CANCELLED'
  return 'CONFIRMED'
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !isFounder(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const b = await req.json().catch(() => ({}))
  const ids = Array.isArray(b.ids) ? b.ids.filter((n: unknown) => Number.isInteger(n)) : []
  if (ids.length === 0) return NextResponse.json({ error: 'Aucun colis sélectionné' }, { status: 400 })

  const rows = await pool.query(
    `SELECT * FROM "SenditStaging" WHERE id = ANY($1) AND promoted = false AND state = 'sendit_only'`,
    [ids]
  )

  let promoted = 0
  const skipped: Array<{ id: number; reason: string }> = []

  for (const s of rows.rows) {
    const items: Array<{ productId: number; quantity: number; price: number }> = Array.isArray(s.assignedProducts) ? s.assignedProducts : []
    if (items.length === 0) { skipped.push({ id: s.id, reason: 'pas de produits affectés' }); continue }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Safety: never create a duplicate for an already-imported tracking code
      const dup = await client.query(`SELECT id FROM "Order" WHERE "senditTrackingId" = $1`, [s.code])
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK')
        await pool.query(`UPDATE "SenditStaging" SET promoted = true, "promotedOrderId" = $1, "updatedAt" = NOW() WHERE id = $2`, [dup.rows[0].id, s.id])
        skipped.push({ id: s.id, reason: 'commande déjà existante (liée)' })
        continue
      }

      const productsTotal = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0)
      const status = mapStatus(s.senditStatus)
      // Always attach a customer (find by phone, else create) — no ghost customers
      const customerId = s.matchedUserId || (await findOrCreateCustomer(client, s.name, s.phone))
      const fee = Number(s.fee) || 0
      const amount = Number(s.amount) || 0
      const delivered = status === 'DELIVERED'

      // Payment method: VIREMENT (prepaid by bank transfer) → Sendit COD is 0, but
      // the customer paid products + delivery by transfer. Write codAmount = NULL +
      // total = products + delivery so calculate_order_profit()'s
      // COALESCE(codAmount, total, revenue) uses the real cash received, not 0.
      const isVirement = (s.paymentMethod || 'COD') === 'VIREMENT'
      const paymentMethod = isVirement ? 'VIREMENT' : 'COD'
      const orderTotal = isVirement ? productsTotal + fee : amount
      const codAmount = isVirement ? null : amount

      // Cost prices for COGS (so profit/margin are correct)
      const costRes = await client.query(
        `SELECT id, COALESCE("costPrice", 0)::float AS cost FROM "Product" WHERE id = ANY($1)`,
        [items.map((it) => it.productId)]
      )
      const costOf = new Map<number, number>(costRes.rows.map((r: { id: number; cost: number }) => [r.id, r.cost]))

      const ord = await client.query(
        `INSERT INTO "Order"
           ("userId", total, "productsTotal", status, "paymentMethod", "sourceChannel",
            "deliveryName", "deliveryPhone", "deliveryCity", "deliveryFeeCharged",
            "estimatedDeliveryCost", "actualDeliveryCost", "codAmount",
            "senditTrackingId", "senditStatus", "deliveryStatus", "createdAt")
         VALUES ($1, $2, $3, $4::"OrderStatus", $16, 'Sendit', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15, NOW()))
         RETURNING id`,
        [
          customerId, orderTotal, productsTotal, status,
          s.name, s.phone, s.city, fee,
          fee, delivered ? fee : null, codAmount,
          s.code, s.senditStatus, s.senditStatus, s.senditCreatedAt,
          paymentMethod,
        ]
      )
      const orderId = ord.rows[0].id

      for (const it of items) {
        const unitCost = costOf.get(it.productId) || 0
        await client.query(
          `INSERT INTO "OrderItem" ("orderId", "productId", quantity, price, "unitCost", "totalCost", "pointsEarned")
           VALUES ($1, $2, $3, $4, $5, $6, 0)`,
          [orderId, it.productId, it.quantity, it.price, unitCost, unitCost * it.quantity]
        )
      }

      // Re-fire the profit trigger now that the items exist (it ran at INSERT
      // before any item, so productsTotal/revenue/profit were computed on zero items)
      await client.query(`UPDATE "Order" SET status = status WHERE id = $1`, [orderId])

      await client.query('COMMIT')
      await pool.query(`UPDATE "SenditStaging" SET promoted = true, "promotedOrderId" = $1, "updatedAt" = NOW() WHERE id = $2`, [orderId, s.id])
      promoted++
    } catch (e) {
      await client.query('ROLLBACK')
      console.error('[Sendit] promote row', s.id, e)
      skipped.push({ id: s.id, reason: e instanceof Error ? e.message : 'erreur' })
    } finally {
      client.release()
    }
  }

  return NextResponse.json({ ok: true, promoted, skipped })
}
