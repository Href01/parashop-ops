import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'

/**
 * POST /api/ops/events/[id]/assign-orders
 * Attribute orders to an event (sets Order.eventId) to organize history.
 * Body actions:
 *  - { action: 'assign-period' } → link every non-cancelled order in the event
 *    window that isn't already linked elsewhere (future-friendly: same rule a
 *    scheduled auto-assign would use)
 *  - { action: 'assign', orderIds: number[] } → link specific orders
 *  - { action: 'unassign', orderId: number } → unlink one (only if it was this event)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !isFounder(session.user.email)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  const eventId = Number((await params).id)
  if (!Number.isInteger(eventId)) return NextResponse.json({ error: 'ID invalide' }, { status: 400 })

  try {
    const body = await req.json().catch(() => ({}))
    const action = body.action

    if (action === 'assign-period') {
      const ev = await pool.query(`SELECT "startDate", "endDate" FROM "Event" WHERE id = $1`, [eventId])
      if (ev.rows.length === 0) return NextResponse.json({ error: 'Event introuvable' }, { status: 404 })
      const { startDate, endDate } = ev.rows[0]
      const r = await pool.query(
        `UPDATE "Order"
         SET "eventId" = $1
         WHERE "createdAt" BETWEEN $2 AND $3
           AND status <> 'CANCELLED'
           AND "eventId" IS NULL`,
        [eventId, startDate, endDate]
      )
      return NextResponse.json({ ok: true, assigned: r.rowCount })
    }

    if (action === 'assign') {
      const ids = Array.isArray(body.orderIds) ? body.orderIds.filter((n: unknown) => Number.isInteger(n)) : []
      if (ids.length === 0) return NextResponse.json({ error: 'Aucune commande' }, { status: 400 })
      const r = await pool.query(`UPDATE "Order" SET "eventId" = $1 WHERE id = ANY($2)`, [eventId, ids])
      return NextResponse.json({ ok: true, assigned: r.rowCount })
    }

    if (action === 'unassign') {
      const orderId = Number(body.orderId)
      if (!Number.isInteger(orderId)) return NextResponse.json({ error: 'Commande invalide' }, { status: 400 })
      const r = await pool.query(`UPDATE "Order" SET "eventId" = NULL WHERE id = $1 AND "eventId" = $2`, [orderId, eventId])
      return NextResponse.json({ ok: true, unassigned: r.rowCount })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e) {
    console.error('[Events] assign-orders', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
