import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getOpsSession } from '@/lib/auth'
import { revalidateWebsite } from '@/lib/revalidate-website'

/**
 * Return / exchange tagging for an order.
 *
 * POST { deliveryFee, returned?, restockReturned?, sent? } — mark the order as a return/exchange:
 *  - deliveryFee: the (manually entered) Sendit return delivery fee — 0 if the customer
 *    repaid. Feeds the P&L "Retours / échanges" line (both panels).
 *  - returned: [{ productId, qty }] — the SPECIFIC items coming back that are resellable
 *    (partial return supported: only the products actually returned). They restock.
 *  - restockReturned (back-compat, no `returned`): restock ALL order items, or none.
 *  - sent: [{ productId, qty }] — the replacement product(s) shipped in exchange, which
 *    LEAVE stock. Empty for a plain return or when a separate order ships the replacement.
 *
 * The exact signed stock moves are stored in Order.returnMoves so re-tagging and DELETE
 * (undo) reverse them precisely. Idempotent: re-posting reverses the previous moves first.
 *
 * Back-compat: `restock` is accepted as an alias for `restockReturned`.
 */

type Move = { productId: number; qty: number }

async function applyMoves(moves: Move[], orderId: number, email: string, label: string) {
  for (const m of moves) {
    if (!m.productId || !m.qty) continue
    const cur = await pool.query(`SELECT stock FROM "Product" WHERE id = $1`, [m.productId])
    if (cur.rows.length === 0) continue
    const before = Number(cur.rows[0].stock) || 0
    const after = before + m.qty
    await pool.query(
      `INSERT INTO "InventoryMovement"
         ("productId", "type", "quantity", "stockBefore", "stockAfter", "reason", "orderId", "performedBy", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [m.productId, m.qty > 0 ? 'Return' : 'Adjustment', m.qty, before, after, label, orderId, email]
    )
    await pool.query(`UPDATE "Product" SET stock = $1 WHERE id = $2`, [after, m.productId])
  }
}

const reverse = (moves: Move[]): Move[] => moves.map((m) => ({ productId: m.productId, qty: -m.qty }))

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOpsSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const orderId = Number(id)
  try {
    const body = await request.json().catch(() => ({}))
    const fee = Math.max(0, Math.round(Number(body.deliveryFee) || 0))
    const sent: Move[] = Array.isArray(body.sent)
      ? body.sent.map((s: { productId: number; qty: number }) => ({ productId: Number(s.productId), qty: -Math.abs(Number(s.qty) || 0) })).filter((m: Move) => m.productId && m.qty)
      : []
    // Explicit list of returned items (partial return), else back-compat "restock all".
    const explicitReturned: Move[] | null = Array.isArray(body.returned)
      ? body.returned.map((r: { productId: number; qty: number }) => ({ productId: Number(r.productId), qty: Math.abs(Number(r.qty) || 0) })).filter((m: Move) => m.productId && m.qty)
      : null
    const restockAll = !explicitReturned && (body.restockReturned ?? body.restock ?? false)

    const cur = await pool.query(`SELECT "returnMoves" FROM "Order" WHERE id = $1`, [orderId])
    if (cur.rows.length === 0) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // Undo any previously-applied moves so re-tagging is clean.
    const prev: Move[] = Array.isArray(cur.rows[0].returnMoves) ? cur.rows[0].returnMoves : []
    if (prev.length) await applyMoves(reverse(prev), orderId, session.user.email, `Ré-tag retour #${orderId}`)

    // Returned items restock (positive qty): the chosen items, or all order items.
    let returned: Move[] = explicitReturned ?? []
    if (restockAll) {
      const items = await pool.query(
        `SELECT "productId", SUM(quantity)::int AS qty FROM "OrderItem" WHERE "orderId" = $1 GROUP BY "productId"`,
        [orderId]
      )
      returned = items.rows.filter((it) => it.productId).map((it) => ({ productId: it.productId, qty: Number(it.qty) }))
    }
    const moves = [...returned, ...sent]
    if (moves.length) await applyMoves(moves, orderId, session.user.email, `Retour/échange commande #${orderId}`)

    await pool.query(
      `UPDATE "Order"
       SET "returnedAt" = COALESCE("returnedAt", NOW()),
           "returnDeliveryFee" = $2,
           "returnRestocked" = $3,
           "returnMoves" = $4::jsonb
       WHERE id = $1`,
      [orderId, fee, returned.length > 0, JSON.stringify(moves)]
    )
    if (moves.length || prev.length) await revalidateWebsite(['products'])
    return NextResponse.json({ ok: true, deliveryFee: fee, moves })
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
    const cur = await pool.query(`SELECT "returnMoves" FROM "Order" WHERE id = $1`, [orderId])
    if (cur.rows.length === 0) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    const prev: Move[] = Array.isArray(cur.rows[0].returnMoves) ? cur.rows[0].returnMoves : []
    if (prev.length) {
      await applyMoves(reverse(prev), orderId, session.user.email, `Annulation retour #${orderId}`)
      await revalidateWebsite(['products'])
    }
    await pool.query(
      `UPDATE "Order" SET "returnedAt" = NULL, "returnDeliveryFee" = NULL, "returnRestocked" = false, "returnMoves" = NULL WHERE id = $1`,
      [orderId]
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error'
    return NextResponse.json({ error: 'Failed', details: message }, { status: 500 })
  }
}
