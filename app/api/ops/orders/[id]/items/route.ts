import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getOpsSession } from '@/lib/auth'

/**
 * Order line-item editor for the BOS. Manual orders (Instagram/WhatsApp) are often
 * created without linking a real product → "Product #null", cost 0, fake margin.
 * Adding the real product pulls in its costPrice so the margin becomes real.
 *
 * The order's `total` (cash paid) is NEVER overwritten — only `productsTotal` (the
 * cost/margin basis) is recomputed. The page P&L reads item costs directly.
 */
async function recomputeProductsTotal(orderId: number) {
  // Updating the Order fires the profit trigger, which re-reads the items' costs.
  await pool.query(
    `UPDATE "Order" SET
       "productsTotal" = COALESCE((SELECT SUM(oi.price * oi.quantity) FROM "OrderItem" oi WHERE oi."orderId" = $1), 0)
     WHERE id = $1`,
    [orderId]
  )
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOpsSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const orderId = parseInt(id)
  const body = await request.json().catch(() => ({}))
  const productId = parseInt(body.productId)
  const quantity = Math.max(1, parseInt(body.quantity) || 1)
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: 'Produit requis' }, { status: 400 })
  }

  const p = await pool.query(
    `SELECT id, name, price, COALESCE("costPrice", 0)::float AS cost FROM "Product" WHERE id = $1`,
    [productId]
  )
  if (p.rows.length === 0) return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })
  const prod = p.rows[0]
  const unitPrice = body.price != null && String(body.price) !== '' ? Number(body.price) : Number(prod.price)
  const unitCost = Number(prod.cost)

  await pool.query(
    `INSERT INTO "OrderItem" ("orderId", "productId", quantity, price, "unitCost", "totalCost", "pointsEarned")
     VALUES ($1, $2, $3, $4, $5, $6, 0)`,
    [orderId, productId, quantity, unitPrice, unitCost, unitCost * quantity]
  )
  await recomputeProductsTotal(orderId)
  return NextResponse.json({ ok: true, unitCost, costMissing: unitCost <= 0 })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOpsSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const orderId = parseInt(id)
  const itemId = parseInt(request.nextUrl.searchParams.get('itemId') || '')
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: 'itemId requis' }, { status: 400 })
  }
  await pool.query(`DELETE FROM "OrderItem" WHERE id = $1 AND "orderId" = $2`, [itemId, orderId])
  await recomputeProductsTotal(orderId)
  return NextResponse.json({ ok: true })
}
