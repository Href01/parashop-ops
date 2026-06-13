import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'

/** Content Hub — GET (list) / POST (create). Backed by "ContentItem". */

export const CONTENT_STATUSES = ['IDEA', 'TO_PRODUCE', 'SCHEDULED', 'PUBLISHED'] as const

export function normStatus(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().toUpperCase().replace(/[\s-]+/g, '_') : ''
  return (CONTENT_STATUSES as readonly string[]).includes(s) ? s : 'IDEA'
}

async function guard() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return { ok: false as const, status: 401 }
  if (!isFounder(session.user.email)) return { ok: false as const, status: 403 }
  return { ok: true as const }
}

export async function GET() {
  try {
    const g = await guard()
    if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })
    const r = await pool.query(
      `SELECT id, title, type, platform, owner, status, "productId", "campaignId",
              hook, caption, "assetLink", "dueDate", "scheduledAt", "publishedAt",
              reach, views, clicks, "attributedOrders", "salesImpact", notes, "createdAt", "updatedAt"
       FROM "ContentItem"
       ORDER BY "dueDate" NULLS LAST, "createdAt" DESC LIMIT 200`
    )
    return NextResponse.json({ items: r.rows })
  } catch (e) {
    console.error('[Content] GET', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await guard()
    if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })
    const b = await req.json().catch(() => ({}))
    const title = typeof b.title === 'string' ? b.title.trim() : ''
    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })
    const type = typeof b.type === 'string' && b.type.trim() ? b.type.trim().slice(0, 40) : null
    const platform = typeof b.platform === 'string' && b.platform.trim() ? b.platform.trim().slice(0, 40) : null
    const owner = typeof b.owner === 'string' && b.owner.trim() ? b.owner.trim().slice(0, 60) : null
    const status = normStatus(b.status)
    const dueDate = typeof b.dueDate === 'string' && b.dueDate ? b.dueDate : null
    const productId = Number.isInteger(b.productId) ? b.productId : null
    const r = await pool.query(
      `INSERT INTO "ContentItem" (title, type, platform, owner, status, "dueDate", "productId", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
       RETURNING id, title, type, platform, owner, status, "productId", "campaignId", hook, caption, "assetLink", "dueDate", "scheduledAt", "publishedAt", reach, views, clicks, "attributedOrders", "salesImpact", notes, "createdAt", "updatedAt"`,
      [title, type, platform, owner, status, dueDate, productId]
    )
    return NextResponse.json({ item: r.rows[0] }, { status: 201 })
  } catch (e) {
    console.error('[Content] POST', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
