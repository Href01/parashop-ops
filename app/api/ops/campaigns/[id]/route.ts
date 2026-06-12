import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'
import { columnExists, emptyCampaignMetrics, slugify, tableExists } from '@/lib/ops-schema'

async function createUniqueSlug(name: string, campaignId: string) {
  const baseSlug = slugify(name)
  let slug = baseSlug
  let suffix = 2

  while (true) {
    const result = await pool.query(
      'SELECT 1 FROM "Campaign" WHERE slug = $1 AND id <> $2 LIMIT 1',
      [slug, campaignId]
    )
    if (result.rows.length === 0) return slug
    slug = `${baseSlug}-${suffix}`
    suffix++
  }
}

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

    const campaignResult = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.description,
        c.active,
        c."startsAt" as "startDate",
        c."endsAt" as "endDate",
        c."createdAt",
        CASE WHEN c.active THEN 'Active' ELSE 'Draft' END as status
      FROM "Campaign" c
      WHERE c.id = $1
    `, [campaignId])

    if (campaignResult.rows.length === 0) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const campaign = {
      ...campaignResult.rows[0],
      ...emptyCampaignMetrics(),
    }

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

    campaign.costsByType = []
    campaign.costs = []
    campaign.posts = []
    campaign.orders = []

    if (await tableExists('CampaignCost')) {
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

      const costsDetailResult = await pool.query(`
        SELECT * FROM "CampaignCost"
        WHERE "campaignId" = $1
        ORDER BY date DESC
      `, [campaignId])

      campaign.costsByType = costsResult.rows
      campaign.costs = costsDetailResult.rows
    }

    if (await tableExists('CampaignPost')) {
      const postsResult = await pool.query(`
        SELECT * FROM "CampaignPost"
        WHERE "campaignId" = $1
        ORDER BY "publishedAt" DESC NULLS LAST
      `, [campaignId])

      campaign.posts = postsResult.rows
    }

    if (await columnExists('Order', 'campaignId')) {
      const ordersResult = await pool.query(`
        SELECT
          o.id,
          o."orderNumber",
          o.total,
          o."createdAt",
          o.status,
          o."deliveryName"
        FROM "Order" o
        WHERE o."campaignId" = $1
        ORDER BY o."createdAt" DESC
      `, [campaignId])

      campaign.orders = ordersResult.rows
    }

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
      budgetTotal,
    } = body

    // Build update query
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (name !== undefined) {
      updates.push(`"name" = $${paramIndex}`)
      values.push(name)
      paramIndex++

      updates.push(`"slug" = $${paramIndex}`)
      values.push(await createUniqueSlug(name, campaignId))
      paramIndex++
    }

    if (description !== undefined) {
      updates.push(`"description" = $${paramIndex}`)
      values.push(description)
      paramIndex++
    }

    if (status !== undefined) {
      updates.push(`"active" = $${paramIndex}`)
      values.push(status === 'Active')
      paramIndex++
    }

    if (startDate !== undefined) {
      updates.push(`"startsAt" = $${paramIndex}`)
      values.push(startDate)
      paramIndex++
    }

    if (endDate !== undefined) {
      updates.push(`"endsAt" = $${paramIndex}`)
      values.push(endDate)
      paramIndex++
    }

    if (budgetTotal !== undefined) {
      updates.push(`"description" = COALESCE("description", '') || $${paramIndex}`)
      values.push(`\n\nBudget: ${budgetTotal} MAD`)
      paramIndex++
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

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
