import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'
import { revalidateWebsite } from '@/lib/revalidate-website'

/**
 * DELETE /api/ops/inventory/movement/[id]
 *
 * Undo a MANUAL stock movement (a purchase/adjustment entered by mistake or as a
 * test). It reverses the movement's stock effect and removes the row, in one
 * transaction, then busts the site's product cache.
 *
 * Auto movements from the order lifecycle (Sale/Return, written by the stock
 * trigger — see migration 024) are NOT deletable here: they belong to the order
 * flow and deleting them would desync stock against real shipments.
 *
 * Note: it does NOT recompute the weighted-average `costPrice` (we don't store the
 * pre-purchase cost to un-blend it). The stock is exact; adjust the cost with a new
 * purchase if the deleted one had skewed it.
 */
const DELETABLE = ['Purchase', 'Adjustment', 'Damage', 'Transfer']

/**
 * PATCH /api/ops/inventory/movement/[id]
 *
 * Correct a manual movement's quantity / cost (a typo like 295→395, or a wrong
 * count). Any change in quantity is applied to stock as a delta. Editing the money
 * updates the row so the "Dépenses" report is right; the product's blended costPrice
 * is not recomputed here (it would require replaying history).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params
    const movementId = parseInt(id)
    if (!Number.isFinite(movementId)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
    }

    const body = await req.json()
    const hasQty = body.quantity !== undefined && body.quantity !== null && body.quantity !== ''
    const hasCost = body.totalCost !== undefined && body.totalCost !== null && body.totalCost !== ''
    const newQty = hasQty ? parseInt(body.quantity) : null
    const newTotalCost = hasCost ? parseFloat(body.totalCost) : null
    if (hasQty && (!Number.isFinite(newQty) || newQty! <= 0)) {
      return NextResponse.json({ error: 'Quantité invalide' }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const mv = await client.query(
        'SELECT "productId", type, quantity FROM "InventoryMovement" WHERE id = $1 FOR UPDATE',
        [movementId]
      )
      const m = mv.rows[0]
      if (!m) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Mouvement introuvable' }, { status: 404 })
      }
      if (!DELETABLE.includes(m.type)) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { error: `Un mouvement "${m.type}" est automatique et ne peut pas être modifié ici.` },
          { status: 400 }
        )
      }

      const finalQty = hasQty ? newQty! : m.quantity
      // Apply the stock delta from a quantity change (floored at 0).
      if (hasQty && finalQty !== m.quantity) {
        await client.query(
          'UPDATE "Product" SET stock = GREATEST(0, stock - $1 + $2) WHERE id = $3',
          [m.quantity, finalQty, m.productId]
        )
      }
      const costPerUnit = newTotalCost != null && finalQty !== 0 ? newTotalCost / Math.abs(finalQty) : null
      await client.query(
        `UPDATE "InventoryMovement"
         SET quantity = $1,
             "totalCost" = COALESCE($2, "totalCost"),
             "costPerUnit" = COALESCE($3, "costPerUnit"),
             reason = COALESCE($4, reason)
         WHERE id = $5`,
        [finalQty, newTotalCost, costPerUnit, body.reason || null, movementId]
      )
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    await revalidateWebsite(['products'])
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('PATCH movement error:', error)
    return NextResponse.json({ error: 'Échec de la modification', details: message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const movementId = parseInt(id)
    if (!Number.isFinite(movementId)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
    }

    const client = await pool.connect()
    let reversed: { productId: number; quantity: number; type: string } | null = null
    try {
      await client.query('BEGIN')
      const mv = await client.query(
        'SELECT "productId", type, quantity FROM "InventoryMovement" WHERE id = $1 FOR UPDATE',
        [movementId]
      )
      const m = mv.rows[0]
      if (!m) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Mouvement introuvable' }, { status: 404 })
      }
      if (!DELETABLE.includes(m.type)) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { error: `Un mouvement "${m.type}" est généré automatiquement (commandes) et ne peut pas être supprimé ici.` },
          { status: 400 }
        )
      }
      // Reverse the stock delta this movement applied (stockAfter = stockBefore + quantity).
      await client.query(
        'UPDATE "Product" SET stock = GREATEST(0, stock - $1) WHERE id = $2',
        [m.quantity, m.productId]
      )
      await client.query('DELETE FROM "InventoryMovement" WHERE id = $1', [movementId])
      await client.query('COMMIT')
      reversed = { productId: m.productId, quantity: m.quantity, type: m.type }
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    // Stock changed — refresh the public site's product cache immediately.
    await revalidateWebsite(['products'])

    return NextResponse.json({ success: true, reversed })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('DELETE movement error:', error)
    return NextResponse.json({ error: 'Échec de la suppression', details: message }, { status: 500 })
  }
}
