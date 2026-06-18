import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

/**
 * GET /api/ops/stats?period=7d|30d
 *
 * Review campaign analytics: sends, clicks, reviews, conversion rates.
 */
export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get('period') || '7d'
  const days = period === '30d' ? 30 : 7

  try {
    // Total review requests sent (from ReviewToken or Order.reviewRequestSentAt)
    const sentResult = await pool.query(`
      SELECT COUNT(DISTINCT "userId") as total
      FROM "Order"
      WHERE "reviewRequestSentAt" IS NOT NULL
    `)
    const totalSent = parseInt(sentResult.rows[0]?.total || '0')

    // Recent sends (last N days)
    const recentSentResult = await pool.query(
      `SELECT COUNT(DISTINCT "userId") as total
       FROM "Order"
       WHERE "reviewRequestSentAt" >= NOW() - INTERVAL '${days} days'`
    )
    const recentSent = parseInt(recentSentResult.rows[0]?.total || '0')

    // Total clicks (ReviewToken.clickedAt)
    const clickedResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM "ReviewToken"
      WHERE "clickedAt" IS NOT NULL
    `)
    const totalClicked = parseInt(clickedResult.rows[0]?.total || '0')

    // Recent clicks
    const recentClickedResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM "ReviewToken"
       WHERE "clickedAt" >= NOW() - INTERVAL '${days} days'`
    )
    const recentClicked = parseInt(recentClickedResult.rows[0]?.total || '0')

    // Total reviews
    const reviewsResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM "Review"
    `)
    const totalReviews = parseInt(reviewsResult.rows[0]?.total || '0')

    // Recent reviews
    const recentReviewsResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM "Review"
       WHERE "createdAt" >= NOW() - INTERVAL '${days} days'`
    )
    const recentReviews = parseInt(recentReviewsResult.rows[0]?.total || '0')

    // Top products by review count
    const topProductsResult = await pool.query(`
      SELECT
        r."productId",
        p.name as "productName",
        COUNT(*) as "reviewCount",
        AVG(r.rating) as "avgRating"
      FROM "Review" r
      LEFT JOIN "Product" p ON p.id = r."productId"
      WHERE r.approved = true
      GROUP BY r."productId", p.name
      ORDER BY COUNT(*) DESC
      LIMIT 5
    `)

    const topProducts = topProductsResult.rows.map(row => ({
      productId: row.productId,
      productName: row.productName || `Produit #${row.productId}`,
      reviewCount: parseInt(row.reviewCount),
      avgRating: parseFloat(row.avgRating),
    }))

    // Rates
    const clickRate = totalSent > 0 ? totalClicked / totalSent : 0
    const reviewRate = totalSent > 0 ? totalReviews / totalSent : 0
    const conversionRate = reviewRate

    const stats = {
      totalSent,
      totalClicked,
      totalReviews,
      totalCustomers: totalSent, // Approximation: one request per customer
      clickRate,
      reviewRate,
      conversionRate,
      recentSent,
      recentClicked,
      recentReviews,
      topProducts,
      timeline: [], // TODO: add daily breakdown if needed
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('[stats] Query failed:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
