import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * POST /api/ops/campaigns/[id]/costs
 * Add a cost to campaign (ad spend, influencer, content creation, etc.)
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
    const body = await request.json()

    const {
      type, // Meta Ads, Google Ads, TikTok Ads, Snapchat Ads, Influencer, Content Creation, Photography, Other
      platform,
      description,
      amount,
      currency = 'MAD',
      date = new Date(),
      receiptUrl,
      notes,
    } = body

    if (!type || !amount) {
      return NextResponse.json(
        { error: 'Type and amount are required' },
        { status: 400 }
      )
    }

    // Add cost
    const result = await pool.query(`
      INSERT INTO "CampaignCost" (
        "campaignId",
        "type",
        "platform",
        "description",
        "amount",
        "currency",
        "date",
        "addedBy",
        "receiptUrl",
        "notes",
        "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING *
    `, [
      campaignId,
      type,
      platform,
      description,
      amount,
      currency,
      date,
      session.user.email,
      receiptUrl,
      notes,
    ])

    // Recalculate campaign metrics
    await pool.query('SELECT calculate_campaign_metrics($1)', [campaignId])

    return NextResponse.json({
      success: true,
      cost: result.rows[0],
    })

  } catch (error: any) {
    console.error('Add campaign cost error:', error)
    return NextResponse.json(
      { error: 'Failed to add cost', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/ops/campaigns/[id]/costs
 * Get all costs for a campaign
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: campaignId } = await params

    const result = await pool.query(`
      SELECT * FROM "CampaignCost"
      WHERE "campaignId" = $1
      ORDER BY date DESC
    `, [campaignId])

    // Get totals by type
    const totalsResult = await pool.query(`
      SELECT
        type,
        COUNT(*) as count,
        SUM(amount) as total
      FROM "CampaignCost"
      WHERE "campaignId" = $1
      GROUP BY type
      ORDER BY total DESC
    `, [campaignId])

    return NextResponse.json({
      costs: result.rows,
      totals: totalsResult.rows,
    })

  } catch (error: any) {
    console.error('Get campaign costs error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch costs', details: error.message },
      { status: 500 }
    )
  }
}
