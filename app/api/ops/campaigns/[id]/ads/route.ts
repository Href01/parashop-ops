import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * Ad spend lines for a campaign — backed by "AdCampaign".
 * GET  /api/ops/campaigns/[id]/ads   → list ad lines (Meta/TikTok/…)
 * POST /api/ops/campaigns/[id]/ads   → create an ad line
 */

export const AD_PLATFORMS = ['Meta', 'TikTok', 'Google', 'Snapchat', 'Influence', 'Autre'] as const

const SELECT = `id, name, platform, spend, revenue, roas, status, "campaignId", "productId",
  to_char("startDate", 'YYYY-MM-DD') AS "startDate",
  to_char("endDate", 'YYYY-MM-DD') AS "endDate",
  notes, "createdAt", "updatedAt"`

async function guard() {
  const session = await getServerSession(authOptions)
  return !!session?.user?.email
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const campaignId = Number((await params).id)
    if (!Number.isInteger(campaignId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    const r = await pool.query(
      `SELECT ${SELECT} FROM "AdCampaign" WHERE "campaignId" = $1 ORDER BY "startDate" NULLS LAST, "createdAt" DESC`,
      [campaignId]
    )
    return NextResponse.json({ ads: r.rows })
  } catch (e) {
    console.error('[Ads] GET', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const campaignId = Number((await params).id)
    if (!Number.isInteger(campaignId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

    const b = await req.json().catch(() => ({}))
    const platform = typeof b.platform === 'string' && b.platform.trim() ? b.platform.trim().slice(0, 40) : 'Meta'
    const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 120) : platform
    const spend = Number.isFinite(Number(b.spend)) && Number(b.spend) >= 0 ? Number(b.spend) : 0
    const revenue = Number.isFinite(Number(b.revenue)) && Number(b.revenue) >= 0 ? Number(b.revenue) : 0
    const roas = spend > 0 ? revenue / spend : 0
    const status = typeof b.status === 'string' ? b.status.slice(0, 40) : 'Active'
    const productId = Number.isInteger(b.productId) ? b.productId : null
    const startDate = typeof b.startDate === 'string' && b.startDate ? b.startDate : null
    const endDate = typeof b.endDate === 'string' && b.endDate ? b.endDate : null
    const notes = typeof b.notes === 'string' ? b.notes.slice(0, 1000) : null

    const r = await pool.query(
      `INSERT INTO "AdCampaign" (name, platform, spend, revenue, roas, status, "campaignId", "productId", "startDate", "endDate", notes, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
       RETURNING ${SELECT}`,
      [name, platform, spend, revenue, roas, status, campaignId, productId, startDate, endDate, notes]
    )
    return NextResponse.json({ ad: r.rows[0] }, { status: 201 })
  } catch (e) {
    console.error('[Ads] POST', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
