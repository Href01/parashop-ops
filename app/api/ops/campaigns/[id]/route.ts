import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * GET /api/ops/campaigns/[id]
 * Get campaign detail with full P&L breakdown
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

    // Get campaign with metrics
    const campaignResult = await pool.query(`
      SELECT
        c.*,
        cm.*
      FROM "Campaign" c
      LEFT JOIN "CampaignMetrics" cm ON cm."campaignId" = c.id
      WHERE c.id = $1
    `, [campaignId])

    if (campaignResult.rows.length === 0) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const campaign = campaignResult.rows[0]

    // Get products
    const productsResult = await pool.query(`
      SELECT
        cp.*,
        p.name as "productName",
        p.brand,
        p.image,
        p.price,
        p."costPrice"
      FROM "CampaignProduct" cp
      JOIN "Product" p ON p.id = cp."productId"
      WHERE cp."campaignId" = $1
      ORDER BY cp.id
    `, [campaignId])

    campaign.products = productsResult.rows

    // Get costs grouped by type
    const costsResult = await pool.query(`
      SELECT
        type,
        COUNT(*) as count,
        SUM(amount) as total
      FROM "CampaignCost"
      WHERE "campaignId" = $1
      GROUP BY type
      ORDER BY total DESC
    `, [campaignId])

    campaign.costsByType = costsResult.rows

    // Get all costs detailed
    const costsDetailResult = await pool.query(`
      SELECT * FROM "CampaignCost"
      WHERE "campaignId" = $1
      ORDER BY date DESC
    `, [campaignId])

    campaign.costs = costsDetailResult.rows

    // Get posts
    const postsResult = await pool.query(`
      SELECT * FROM "CampaignPost"
      WHERE "campaignId" = $1
      ORDER BY "publishedAt" DESC NULLS LAST
    `, [campaignId])

    campaign.posts = postsResult.rows

    // Get orders
    const ordersResult = await pool.query(`
      SELECT
        o.id,
        o."orderNumber",
        o.total,
        o."createdAt",
        o.status,
        o."deliveryName",
        o."utmSource",
        o."utmMedium"
      FROM "Order" o
      WHERE o."campaignId" = $1
      ORDER BY o."createdAt" DESC
    `, [campaignId])

    campaign.orders = ordersResult.rows

    return NextResponse.json(campaign)

  } catch (error: any) {
    console.error('Get campaign error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch campaign', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/ops/campaigns/[id]
 * Update campaign
 */
export async function PUT(
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
      assignedTo,
    } = body

    // Build update query
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (name !== undefined) {
      updates.push(`"name" = $${paramIndex}`)
      values.push(name)
      paramIndex++
    }

    if (description !== undefined) {
      updates.push(`"description" = $${paramIndex}`)
      values.push(description)
      paramIndex++
    }

    if (status !== undefined) {
      updates.push(`"status" = $${paramIndex}`)
      values.push(status)
      paramIndex++
    }

    if (startDate !== undefined) {
      updates.push(`"startDate" = $${paramIndex}`)
      values.push(startDate)
      paramIndex++
    }

    if (endDate !== undefined) {
      updates.push(`"endDate" = $${paramIndex}`)
      values.push(endDate)
      paramIndex++
    }

    if (targetRevenue !== undefined) {
      updates.push(`"targetRevenue" = $${paramIndex}`)
      values.push(targetRevenue)
      paramIndex++
    }

    if (targetOrders !== undefined) {
      updates.push(`"targetOrders" = $${paramIndex}`)
      values.push(targetOrders)
      paramIndex++
    }

    if (budgetTotal !== undefined) {
      updates.push(`"budgetTotal" = $${paramIndex}`)
      values.push(budgetTotal)
      paramIndex++
    }

    if (budgetAdSpend !== undefined) {
      updates.push(`"budgetAdSpend" = $${paramIndex}`)
      values.push(budgetAdSpend)
      paramIndex++
    }

    if (budgetOther !== undefined) {
      updates.push(`"budgetOther" = $${paramIndex}`)
      values.push(budgetOther)
      paramIndex++
    }

    if (assignedTo !== undefined) {
      updates.push(`"assignedTo" = $${paramIndex}`)
      values.push(assignedTo)
      paramIndex++
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    updates.push(`"updatedAt" = NOW()`)
    values.push(campaignId)

    const result = await pool.query(`
      UPDATE "Campaign"
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values)

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      campaign: result.rows[0],
    })

  } catch (error: any) {
    console.error('Update campaign error:', error)
    return NextResponse.json(
      { error: 'Failed to update campaign', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/ops/campaigns/[id]
 * Delete campaign
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: campaignId } = await params

    // Cascade delete will handle related tables
    await pool.query('DELETE FROM "Campaign" WHERE id = $1', [campaignId])

    return NextResponse.json({
      success: true,
      message: 'Campaign deleted successfully',
    })

  } catch (error: any) {
    console.error('Delete campaign error:', error)
    return NextResponse.json(
      { error: 'Failed to delete campaign', details: error.message },
      { status: 500 }
    )
  }
}
