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

/** GET /api/ops/ads — all ad lines (Meta synced + manual), with their event link. */
export async function GET(_req: NextRequest) {
  const g = await guard()
  if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })
  try {
    const r = await pool.query(`
      SELECT a.id, a.name, a.platform, a.spend::float AS spend, a.revenue::float AS revenue,
             a.roas::float AS roas, a.status, a."externalId", a."eventId", e.name AS "eventName",
             COALESCE(a."productIds", '{}') AS "productIds", a.impressions, a.clicks,
             a.likes, a.saves, a.comments, a.shares,
             a."lastSyncedAt", a."campaignId"
      FROM "AdCampaign" a
      LEFT JOIN "Event" e ON e.id = a."eventId"
      ORDER BY a."lastSyncedAt" DESC NULLS LAST, a.spend DESC NULLS LAST
    `)
    // Totals for the header
    const totals = r.rows.reduce(
      (acc, x) => {
        acc.spend += Number(x.spend) || 0
        acc.revenue += Number(x.revenue) || 0
        return acc
      },
      { spend: 0, revenue: 0 }
    )
    return NextResponse.json({
      ads: r.rows,
      totals: { ...totals, roas: totals.spend > 0 ? totals.revenue / totals.spend : 0 },
    })
  } catch (e) {
    console.error('[Ads] GET', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
