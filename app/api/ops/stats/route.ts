import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

/**
 * GET /api/ops/stats?period=7d|30d
 *
 * Review-campaign analytics. The funnel is built from a single consistent
 * cohort — the ReviewToken table — filtered by the selected period, so the
 * numbers are period-accurate and the funnel can never exceed 100%.
 *   sent      = tokens created in the period
 *   clicked   = those tokens whose link was opened (clickedAt)
 *   completed = those tokens that earned the 50 DH reward (rewardGranted)
 * Review-quality metrics (avg rating, distribution, moderation) come from the
 * Review table.
 */
export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get('period') === '30d' ? '30d' : '7d'
  const days = period === '30d' ? 30 : 7

  try {
    // ---- Funnel cohort: ReviewToken created within the period ----
    const funnelRes = await pool.query(
      `SELECT
         COUNT(*)::int AS sent,
         COUNT(*) FILTER (WHERE "clickedAt" IS NOT NULL)::int AS clicked,
         COUNT(*) FILTER (WHERE "rewardGranted" = true)::int AS completed
       FROM "ReviewToken"
       WHERE "createdAt" >= NOW() - INTERVAL '${days} days'`
    )
    const sent = funnelRes.rows[0]?.sent ?? 0
    const clicked = funnelRes.rows[0]?.clicked ?? 0
    const completed = funnelRes.rows[0]?.completed ?? 0

    const clickRate = sent > 0 ? clicked / sent : 0
    const completionRate = sent > 0 ? completed / sent : 0

    // ---- Review quality: reviews created within the period ----
    const reviewRes = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COALESCE(AVG(rating), 0)::float AS "avgRating",
         COUNT(*) FILTER (WHERE rating = 1)::int AS r1,
         COUNT(*) FILTER (WHERE rating = 2)::int AS r2,
         COUNT(*) FILTER (WHERE rating = 3)::int AS r3,
         COUNT(*) FILTER (WHERE rating = 4)::int AS r4,
         COUNT(*) FILTER (WHERE rating = 5)::int AS r5
       FROM "Review"
       WHERE "createdAt" >= NOW() - INTERVAL '${days} days'`
    )
    const rv = reviewRes.rows[0] || {}
    const totalReviews = rv.total ?? 0
    const avgRating = rv.avgRating ?? 0
    const distribution = [rv.r1 ?? 0, rv.r2 ?? 0, rv.r3 ?? 0, rv.r4 ?? 0, rv.r5 ?? 0]

    // ---- Moderation (all-time, actionable) ----
    const modRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE approved = true)::int AS published,
         COUNT(*) FILTER (WHERE approved IS NOT TRUE)::int AS pending
       FROM "Review"`
    )
    const publishedReviews = modRes.rows[0]?.published ?? 0
    const pendingReviews = modRes.rows[0]?.pending ?? 0

    // ---- Daily timeline for the chart ----
    const timelineRes = await pool.query(
      `WITH days AS (
         SELECT generate_series(
           (NOW() - INTERVAL '${days - 1} days')::date,
           NOW()::date,
           INTERVAL '1 day'
         )::date AS day
       )
       SELECT
         d.day::text AS date,
         COALESCE(s.n, 0)::int AS sent,
         COALESCE(c.n, 0)::int AS clicked,
         COALESCE(r.n, 0)::int AS reviews
       FROM days d
       LEFT JOIN (
         SELECT "createdAt"::date AS day, COUNT(*) n FROM "ReviewToken"
         WHERE "createdAt" >= NOW() - INTERVAL '${days} days' GROUP BY 1
       ) s ON s.day = d.day
       LEFT JOIN (
         SELECT "clickedAt"::date AS day, COUNT(*) n FROM "ReviewToken"
         WHERE "clickedAt" >= NOW() - INTERVAL '${days} days' GROUP BY 1
       ) c ON c.day = d.day
       LEFT JOIN (
         SELECT "createdAt"::date AS day, COUNT(*) n FROM "Review"
         WHERE "createdAt" >= NOW() - INTERVAL '${days} days' GROUP BY 1
       ) r ON r.day = d.day
       ORDER BY d.day`
    )
    const timeline = timelineRes.rows

    // ---- Top products by review count (approved, all-time) ----
    const topRes = await pool.query(
      `SELECT
         r."productId",
         p.name AS "productName",
         COUNT(*)::int AS "reviewCount",
         AVG(r.rating)::float AS "avgRating"
       FROM "Review" r
       LEFT JOIN "Product" p ON p.id = r."productId"
       WHERE r.approved = true
       GROUP BY r."productId", p.name
       ORDER BY COUNT(*) DESC
       LIMIT 5`
    )
    const topProducts = topRes.rows.map((row) => ({
      productId: row.productId,
      productName: row.productName || `Produit #${row.productId}`,
      reviewCount: row.reviewCount,
      avgRating: Number.isFinite(row.avgRating) ? row.avgRating : 0,
    }))

    return NextResponse.json({
      period,
      sent,
      clicked,
      completed,
      clickRate,
      completionRate,
      totalReviews,
      avgRating,
      distribution,
      publishedReviews,
      pendingReviews,
      rewardsGranted: completed,
      timeline,
      topProducts,
    })
  } catch (error) {
    console.error('[stats] Query failed:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
