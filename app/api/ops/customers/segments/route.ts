import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * GET /api/ops/customers/segments
 * Get all customer segments with counts and metrics
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get segment counts
    const segmentCounts = await pool.query(`
      SELECT
        "segment",
        COUNT(*) as count,
        SUM("lifetimeValue") as "totalValue",
        AVG("lifetimeValue") as "avgValue",
        AVG("ordersCount") as "avgOrders"
      FROM "User"
      GROUP BY "segment"
      ORDER BY count DESC
    `)

    // Get tier counts
    const tierCounts = await pool.query(`
      SELECT
        "tier",
        COUNT(*) as count,
        SUM("lifetimeValue") as "totalValue"
      FROM "User"
      GROUP BY "tier"
      ORDER BY
        CASE "tier"
          WHEN 'Platinum' THEN 1
          WHEN 'Gold' THEN 2
          WHEN 'Silver' THEN 3
          WHEN 'Bronze' THEN 4
        END
    `)

    // Get RFM distribution
    const rfmDistribution = await pool.query(`
      SELECT
        "rfmScore",
        COUNT(*) as count
      FROM "User"
      WHERE "rfmScore" IS NOT NULL
      GROUP BY "rfmScore"
      ORDER BY count DESC
      LIMIT 10
    `)

    // Get churn risk distribution
    const churnDistribution = await pool.query(`
      SELECT
        CASE
          WHEN "churnRisk" >= 70 THEN 'High'
          WHEN "churnRisk" >= 40 THEN 'Medium'
          WHEN "churnRisk" >= 10 THEN 'Low'
          ELSE 'None'
        END as risk,
        COUNT(*) as count,
        SUM("lifetimeValue") as "totalValue"
      FROM "User"
      GROUP BY risk
      ORDER BY
        CASE risk
          WHEN 'High' THEN 1
          WHEN 'Medium' THEN 2
          WHEN 'Low' THEN 3
          WHEN 'None' THEN 4
        END
    `)

    // Get total stats
    const totalStats = await pool.query(`
      SELECT
        COUNT(*) as "totalCustomers",
        SUM("lifetimeValue") as "totalValue",
        AVG("lifetimeValue") as "avgValue",
        AVG("ordersCount") as "avgOrders",
        COUNT(*) FILTER (WHERE "lastOrderDate" >= NOW() - INTERVAL '30 days') as "active30d",
        COUNT(*) FILTER (WHERE "lastOrderDate" >= NOW() - INTERVAL '90 days') as "active90d"
      FROM "User"
    `)

    return NextResponse.json({
      segments: segmentCounts.rows,
      tiers: tierCounts.rows,
      rfmDistribution: rfmDistribution.rows,
      churnDistribution: churnDistribution.rows,
      stats: totalStats.rows[0],
    })

  } catch (error: any) {
    console.error('GET segments error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch segments', details: error.message },
      { status: 500 }
    )
  }
}
