import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getOpsSession } from '@/lib/auth'
import { revalidateWebsite } from '@/lib/revalidate-website'

/**
 * Return / exchange tagging for an order.
 *
 * POST { deliveryFee, restock, note? } — mark the order as a return/exchange, store the
 * (manually entered) Sendit return delivery fee (0 if the customer repaid), and optionally
 * put the returned products back into sellable stock (once — idempotent via returnRestocked).
 *
 * DELETE — undo the tag: clear the fee and, if products were restocked, reverse the stock.
 */

async function restockOrderItems(orderId: number, email: string, reverse = false) {
  const items = await pool.query(
    `SELECT "productId", SUM(quantity)::int AS qty FROM "OrderItem" WHERE "orderId" = $1 GROUP BY "productId"`,
    [orderId]
  )
  for (const it of items.rows) {
    if (!it.productId) continue
    const delta = (reverse ? -1 : 1) * Number(it.qty)
    const cur = await pool.query(`SELECT stock, name FROM "Product" WHERE id = $1`, [it.productId])
    if (cur.rows.length === 0) continue
    const before = Number(cur.rows[0].stock) || 0
    const after = before + delta
    await pool.query(
      `INSERT INTO "InventoryMovement"
         ("productId", "type", "quantity", "stockBefore", "stockAfter", "reason", "orderId", "performedBy", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [it.productId, reverse ? 'Adjustment' : 'Return', delta, before, after,
       reverse ? `Annulation retour #${orderId}` : `Retour/échange commande #${orderId}`, orderId, email]
    )
    await pool.query(`UPDATE "Product" SET stock = $1 WHERE id = $2`, [after, it.productId])
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOpsSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const orderId = Number(id)
  try {
    const body = await request.json().catch(() => ({}))
    const fee = Math.max(0, Math.round(Number(body.deliveryFee) || 0))
    const restock = body.restock !== false // default true

    const cur = await pool.query(`SELECT "returnRestocked" FROM "Order" WHERE id = $1`, [orderId])
    if (cur.rows.length === 0) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    const alreadyRestocked = cur.rows[0].returnRestocked === true

    // Restock once, only if requested and not done before.
    if (restock && !alreadyRestocked) await restockOrderItems(orderId, session.user.email)

    await pool.query(
      `UPDATE "Order"
       SET "returnedAt" = COALESCE("returnedAt", NOW()),
           "returnDeliveryFee" = $2,
           "returnRestocked" = "returnRestocked" OR $3
       WHERE id = $1`,
      [orderId, fee, restock]
    )
    if (restock && !alreadyRestocked) await revalidateWebsite(['products'])
    return NextResponse.json({ ok: true, deliveryFee: fee, restocked: restock })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error'
    return NextResponse.json({ error: 'Failed', details: message }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOpsSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const orderId = Number(id)
  try {
    const cur = await pool.query(`SELECT "returnRestocked" FROM "Order" WHERE id = $1`, [orderId])
    if (cur.rows.length === 0) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    // Reverse the restock if it happened, so stock returns to its pre-return value.
    if (cur.rows[0].returnRestocked === true) {
      await restockOrderItems(orderId, session.user.email, true)
      await revalidateWebsite(['products'])
    }
    await pool.query(
      `UPDATE "Order" SET "returnedAt" = NULL, "returnDeliveryFee" = NULL, "returnRestocked" = false WHERE id = $1`,
      [orderId]
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error'
    return NextResponse.json({ error: 'Failed', details: message }, { status: 500 })
  }
}
