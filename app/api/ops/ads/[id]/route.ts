import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'

async function guard() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return { ok: false as const, status: 401 }
  if (!isFounder(session.user.email)) return { ok: false as const, status: 403 }
  return { ok: true as const }
}

/**
 * PATCH /api/ops/ads/[id] — map an ad line to an Event + tag products.
 * Used by the "Régie pub" screen. Also keeps the legacy single productId in
 * sync (first tagged product) for older views.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })
  const id = Number((await params).id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  try {
    const b = await req.json().catch(() => ({}))
    const sets: string[] = []
    const values: unknown[] = []
    const add = (col: string, val: unknown) => { values.push(val); sets.push(`"${col}" = $${values.length}`) }

    if ('eventId' in b) add('eventId', Number.isInteger(b.eventId) ? b.eventId : null)
    if ('campaignId' in b) add('campaignId', Number.isInteger(b.campaignId) ? b.campaignId : null)
    if ('productIds' in b) {
      const ids = Array.isArray(b.productIds)
        ? (Array.from(new Set(b.productIds.filter((n: unknown) => Number.isInteger(n)))) as number[])
        : []
      add('productIds', ids)
      add('productId', ids[0] ?? null) // keep legacy column in sync
    }

    if (sets.length === 0) return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
    values.push(id)
    const r = await pool.query(
      `UPDATE "AdCampaign" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${values.length}
       RETURNING id, "eventId", "campaignId", COALESCE("productIds", '{}') AS "productIds"`,
      values
    )
    if (r.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ad: r.rows[0] })
  } catch (e) {
    console.error('[Ads] PATCH', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE — remove a manual ad line (Meta-synced ones reappear on next sync). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })
  const id = Number((await params).id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  try {
    const r = await pool.query(`DELETE FROM "AdCampaign" WHERE id = $1 RETURNING id`, [id])
    if (r.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[Ads] DELETE', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
