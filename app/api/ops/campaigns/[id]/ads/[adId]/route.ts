import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * PATCH /api/ops/campaigns/[id]/ads/[adId]  — edit an ad line
 * DELETE /api/ops/campaigns/[id]/ads/[adId] — remove an ad line
 * Backed by "AdCampaign". roas is recomputed from spend/revenue.
 */

const SELECT = `id, name, platform, spend, revenue, roas, status, "campaignId", "productId",
  to_char("startDate", 'YYYY-MM-DD') AS "startDate",
  to_char("endDate", 'YYYY-MM-DD') AS "endDate",
  notes, "createdAt", "updatedAt"`

async function guard() {
  const session = await getServerSession(authOptions)
  return !!session?.user?.email
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; adId: string }> }) {
  try {
    if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { adId } = await params
    const id = Number(adId)
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

    const b = await req.json().catch(() => ({}))
    const sets: string[] = []
    const values: unknown[] = []
    const add = (col: string, val: unknown) => { values.push(val); sets.push(`"${col}" = $${values.length}`) }

    if (typeof b.name === 'string' && b.name.trim()) add('name', b.name.trim().slice(0, 120))
    if ('platform' in b) add('platform', typeof b.platform === 'string' && b.platform.trim() ? b.platform.trim().slice(0, 40) : 'Meta')
    if ('status' in b) add('status', typeof b.status === 'string' ? b.status.slice(0, 40) : 'Active')
    if ('productId' in b) add('productId', Number.isInteger(b.productId) ? b.productId : null)
    if ('startDate' in b) add('startDate', typeof b.startDate === 'string' && b.startDate ? b.startDate : null)
    if ('endDate' in b) add('endDate', typeof b.endDate === 'string' && b.endDate ? b.endDate : null)
    if ('notes' in b) add('notes', typeof b.notes === 'string' ? b.notes.slice(0, 1000) : null)

    // spend/revenue drive roas — handle together when either is present
    const hasSpend = 'spend' in b
    const hasRevenue = 'revenue' in b
    if (hasSpend || hasRevenue) {
      const cur = await pool.query(`SELECT spend, revenue FROM "AdCampaign" WHERE id = $1`, [id])
      if (cur.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
      const spend = hasSpend && Number.isFinite(Number(b.spend)) && Number(b.spend) >= 0 ? Number(b.spend) : Number(cur.rows[0].spend) || 0
      const revenue = hasRevenue && Number.isFinite(Number(b.revenue)) && Number(b.revenue) >= 0 ? Number(b.revenue) : Number(cur.rows[0].revenue) || 0
      add('spend', spend)
      add('revenue', revenue)
      add('roas', spend > 0 ? revenue / spend : 0)
    }

    if (sets.length === 0) return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
    values.push(id)
    const r = await pool.query(
      `UPDATE "AdCampaign" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${values.length} RETURNING ${SELECT}`,
      values
    )
    if (r.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ad: r.rows[0] })
  } catch (e) {
    console.error('[Ads] PATCH', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; adId: string }> }) {
  try {
    if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const id = Number((await params).adId)
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    const r = await pool.query(`DELETE FROM "AdCampaign" WHERE id = $1 RETURNING id`, [id])
    if (r.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[Ads] DELETE', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
