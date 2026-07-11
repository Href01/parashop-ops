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
 * GET /api/ops/ads?days=30 — ad lines with spend/revenue/impressions/clicks scoped
 * to the selected PERIOD (summed from AdSpendDaily), so the page always says what
 * window it shows instead of a period-less all-time total. Engagement (likes/saves…)
 * and the event mapping stay from AdCampaign. `days=3650` ⇒ tout.
 */
export async function GET(req: NextRequest) {
  const g = await guard()
  if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })
  try {
    const dp = parseInt(new URL(req.url).searchParams.get('days') || '30', 10)
    const days = Number.isFinite(dp) && dp > 0 ? Math.min(dp, 3650) : 30
    const from = new Date(); from.setUTCDate(from.getUTCDate() - (days - 1))
    const fromStr = from.toISOString().slice(0, 10)

    const r = await pool.query(`
      SELECT a.id, a.name, a.platform,
             COALESCE(d.spend, 0)::float AS spend,
             COALESCE(d.revenue, 0)::float AS revenue,
             (CASE WHEN COALESCE(d.spend,0) > 0 THEN d.revenue / d.spend ELSE 0 END)::float AS roas,
             a.spend::float AS "spendAllTime",
             a.status, a."externalId", a."eventId", e.name AS "eventName",
             COALESCE(a."productIds", '{}') AS "productIds",
             COALESCE(d.impressions, 0)::int AS impressions,
             COALESCE(d.clicks, 0)::int AS clicks,
             a.likes, a.saves, a.comments, a.shares,
             a."lastSyncedAt", a."campaignId"
      FROM "AdCampaign" a
      LEFT JOIN "Event" e ON e.id = a."eventId"
      LEFT JOIN (
        SELECT "externalId",
               SUM(spend) AS spend, SUM(revenue) AS revenue,
               SUM(impressions) AS impressions, SUM(clicks) AS clicks
        FROM "AdSpendDaily"
        WHERE date >= $1::date
        GROUP BY "externalId"
      ) d ON d."externalId" = a."externalId"
      WHERE a.platform = 'Meta'
      ORDER BY spend DESC NULLS LAST, a."lastSyncedAt" DESC NULLS LAST
    `, [fromStr])

    const totals = r.rows.reduce(
      (acc, x) => { acc.spend += Number(x.spend) || 0; acc.revenue += Number(x.revenue) || 0; return acc },
      { spend: 0, revenue: 0 }
    )
    // Freshness: last synced ad-spend day.
    const through = await pool.query(`SELECT MAX(date)::text AS d FROM "AdSpendDaily"`)
    return NextResponse.json({
      ads: r.rows,
      totals: { ...totals, roas: totals.spend > 0 ? totals.revenue / totals.spend : 0 },
      range: { days, from: fromStr, to: new Date().toISOString().slice(0, 10) },
      dataThrough: through.rows[0]?.d || null,
    })
  } catch (e) {
    console.error('[Ads] GET', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
