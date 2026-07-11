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
