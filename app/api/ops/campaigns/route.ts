import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * GET /api/ops/campaigns
 * List all campaigns with metrics
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // Draft, Active, Completed, Paused
    const sort = searchParams.get('sort') || 'createdAt'
    const order = searchParams.get('order') || 'DESC'

    // Build WHERE clause
    const conditions: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (status) {
      conditions.push(`c.status = $${paramIndex}`)
      values.push(status)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get campaigns with metrics
    const result = await pool.query(`
      SELECT
        c.*,
        cm."totalOrders",
        cm."totalRevenue",
        cm."totalCosts",
        cm."netProfit",
        cm."roi",
        cm."roas",
        cm."profitMargin",
        (
          SELECT COUNT(*)
          FROM "CampaignProduct" cp
          WHERE cp."campaignId" = c.id
        ) as "productsCount",
        (
          SELECT COUNT(*)
          FROM "CampaignCost" cc
          WHERE cc."campaignId" = c.id
        ) as "costsCount"
      FROM "Campaign" c
      LEFT JOIN "CampaignMetrics" cm ON cm."campaignId" = c.id
      ${whereClause}
      ORDER BY c."${sort}" ${order}
    `, values)

    return NextResponse.json({
      campaigns: result.rows,
      total: result.rows.length,
    })

  } catch (error: any) {
    console.error('Get campaigns error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch campaigns', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/ops/campaigns
 * Create new campaign
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      description,
      status = 'Draft',
      startDate,
      endDate,
      targetRevenue,
      targetOrders,
      budgetTotal,
      budgetAdSpend,
      budgetOther,
      assignedTo = [],
    } = body

    if (!name) {
      return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 })
    }

    const result = await pool.query(`
      INSERT INTO "Campaign" (
        "name",
        "description",
        "status",
        "startDate",
        "endDate",
        "targetRevenue",
        "targetOrders",
        "budgetTotal",
        "budgetAdSpend",
        "budgetOther",
        "createdBy",
        "assignedTo",
        "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *
    `, [
      name,
      description,
      status,
      startDate,
      endDate,
      targetRevenue,
      targetOrders,
      budgetTotal,
      budgetAdSpend,
      budgetOther,
      session.user.email,
      assignedTo,
    ])

    // Initialize metrics
    await pool.query(`
      INSERT INTO "CampaignMetrics" ("campaignId")
      VALUES ($1)
    `, [result.rows[0].id])

    return NextResponse.json({
      success: true,
      campaign: result.rows[0],
    })

  } catch (error: any) {
    console.error('Create campaign error:', error)
    return NextResponse.json(
      { error: 'Failed to create campaign', details: error.message },
      { status: 500 }
    )
  }
}
