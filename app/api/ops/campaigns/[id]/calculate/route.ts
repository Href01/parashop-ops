import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * POST /api/ops/campaigns/[id]/calculate
 * Recalculate campaign P&L metrics
 *
 * Calculates:
 * - Total revenue from orders
 * - Total COGS (cost of goods sold)
 * - Total ad spend
 * - Total other costs
 * - Gross profit (revenue - COGS)
 * - Net profit (gross profit - ad spend - other costs)
 * - ROI ((net profit / total costs) * 100)
 * - ROAS (revenue / ad spend)
 * - Profit margin ((net profit / revenue) * 100)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: campaignId } = await params

    console.log(`📊 Calculating P&L metrics for campaign ${campaignId}...`)

    // Call PostgreSQL function to calculate metrics
    await pool.query('SELECT calculate_campaign_metrics($1)', [campaignId])

    // Get updated metrics
    const result = await pool.query(`
      SELECT * FROM "CampaignMetrics"
      WHERE "campaignId" = $1
    `, [campaignId])

    if (result.rows.length === 0) {
      // Initialize if doesn't exist
      await pool.query(
        'INSERT INTO "CampaignMetrics" ("campaignId") VALUES ($1)',
        [campaignId]
      )

      // Try calculating again
      await pool.query('SELECT calculate_campaign_metrics($1)', [campaignId])

      const retryResult = await pool.query(
        'SELECT * FROM "CampaignMetrics" WHERE "campaignId" = $1',
        [campaignId]
      )

      return NextResponse.json({
        success: true,
        metrics: retryResult.rows[0],
      })
    }

    const metrics = result.rows[0]

    console.log(`✅ Campaign ${campaignId} P&L:`)
    console.log(`   Revenue: ${metrics.totalRevenue} MAD`)
    console.log(`   COGS: ${metrics.totalCOGS} MAD`)
    console.log(`   Ad Spend: ${metrics.totalAdSpend} MAD`)
    console.log(`   Net Profit: ${metrics.netProfit} MAD`)
    console.log(`   ROI: ${metrics.roi}%`)
    console.log(`   ROAS: ${metrics.roas}x`)

    return NextResponse.json({
      success: true,
      metrics,
    })

  } catch (error: any) {
    console.error('Calculate campaign metrics error:', error)
    return NextResponse.json(
      { error: 'Failed to calculate metrics', details: error.message },
      { status: 500 }
    )
  }
}
