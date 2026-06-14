import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'
import { CONTENT_STATUSES } from '../route'

async function guard() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return { ok: false as const, status: 401 }
  if (!isFounder(session.user.email)) return { ok: false as const, status: 403 }
  return { ok: true as const }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await guard()
    if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })
    const id = Number((await params).id)
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

    const b = await req.json().catch(() => ({}))
    const sets: string[] = []
    const values: unknown[] = []
    const add = (col: string, val: unknown) => { values.push(val); sets.push(`"${col}" = $${values.length}`) }

    if (typeof b.status === 'string') {
      const s = b.status.trim().toUpperCase().replace(/[\s-]+/g, '_')
      if (!(CONTENT_STATUSES as readonly string[]).includes(s)) return NextResponse.json({ error: 'invalid status' }, { status: 400 })
      add('status', s)
      if (s === 'PUBLISHED') sets.push(`"publishedAt" = NOW()`)
    }
    if (typeof b.title === 'string' && b.title.trim()) add('title', b.title.trim())
    if ('platform' in b) add('platform', typeof b.platform === 'string' ? b.platform.slice(0, 40) : null)
    if ('type' in b) add('type', typeof b.type === 'string' ? b.type.slice(0, 40) : null)
    if ('owner' in b) add('owner', typeof b.owner === 'string' ? b.owner.slice(0, 60) : null)
    if ('dueDate' in b) add('dueDate', typeof b.dueDate === 'string' && b.dueDate ? b.dueDate : null)
    if ('hook' in b) add('hook', typeof b.hook === 'string' ? b.hook.slice(0, 2000) : null)
    if ('caption' in b) add('caption', typeof b.caption === 'string' ? b.caption.slice(0, 4000) : null)
    if ('assetLink' in b) add('assetLink', typeof b.assetLink === 'string' ? b.assetLink.slice(0, 500) : null)
    if ('productId' in b) add('productId', Number.isInteger(b.productId) ? b.productId : null)
    if ('campaignId' in b) add('campaignId', Number.isInteger(b.campaignId) ? b.campaignId : null)
    if ('productIds' in b) {
      const ids = Array.isArray(b.productIds)
        ? Array.from(new Set(b.productIds.filter((n: unknown) => Number.isInteger(n)))) as number[]
        : []
      add('productIds', ids)
    }
    // Organic post link + manual performance metrics
    if ('permalink' in b) add('permalink', typeof b.permalink === 'string' && b.permalink.trim() ? b.permalink.trim().slice(0, 500) : null)
    if ('externalId' in b) add('externalId', typeof b.externalId === 'string' && b.externalId.trim() ? b.externalId.trim().slice(0, 100) : null)
    const intMetric = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : null }
    for (const m of ['reach', 'views', 'clicks', 'likes', 'saves', 'comments', 'shares'] as const) {
      if (m in b) add(m, intMetric(b[m]))
    }

    if (sets.length === 0) return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
    values.push(id)
    const r = await pool.query(
      `UPDATE "ContentItem" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${values.length}
       RETURNING id, title, type, platform, owner, status, "productId", COALESCE("productIds", '{}') AS "productIds", "campaignId", hook, caption, "assetLink", to_char("dueDate", 'YYYY-MM-DD') AS "dueDate", "scheduledAt", "publishedAt", permalink, "externalId", reach, views, clicks, likes, saves, comments, shares, "metricsSyncedAt", "attributedOrders", "salesImpact", notes, "createdAt", "updatedAt"`,
      values
    )
    if (r.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ item: r.rows[0] })
  } catch (e) {
    console.error('[Content] PATCH', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await guard()
    if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })
    const id = Number((await params).id)
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    const r = await pool.query(`DELETE FROM "ContentItem" WHERE id = $1 RETURNING id`, [id])
    if (r.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[Content] DELETE', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
