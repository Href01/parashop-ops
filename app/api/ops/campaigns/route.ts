import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'
import { emptyCampaignMetrics, slugify, tableExists } from '@/lib/ops-schema'

function mapCampaignStatus(status: string | null) {
  if (!status || status === 'All') return null
  return status === 'Active'
}

async function createUniqueSlug(name: string) {
  const baseSlug = slugify(name)
  let slug = baseSlug
  let suffix = 2

  while (true) {
    const result = await pool.query('SELECT 1 FROM "Campaign" WHERE slug = $1 LIMIT 1', [slug])
    if (result.rows.length === 0) return slug
    slug = `${baseSlug}-${suffix}`
    suffix++
  }
}

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
    const status = searchParams.get('status') // Active maps to storefront Campaign.active
    const sort = searchParams.get('sort') || 'createdAt'
    const order = searchParams.get('order') || 'DESC'
    const sortColumns: Record<string, string> = {
      createdAt: 'c."createdAt"',
      startDate: 'c."startsAt"',
      endDate: 'c."endsAt"',
      name: 'c."name"',
      status: 'c."active"',
    }
    const sortColumn = sortColumns[sort] || sortColumns.createdAt
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

    // Build WHERE clause
    const conditions: string[] = []
    const values: any[] = []
    let paramIndex = 1

    const activeFilter = mapCampaignStatus(status)
    if (activeFilter !== null) {
      conditions.push(`c.active = $${paramIndex}`)
      values.push(activeFilter)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const hasCampaignTable = await tableExists('Campaign')
    if (!hasCampaignTable) {
      return NextResponse.json({
        campaigns: [],
        total: 0,
        missingTables: ['Campaign'],
      })
    }

    // Real metrics: ad spend + platform-reported revenue come from "AdCampaign"
    // (one row per platform/ad line). Orders attributed via Order.campaignId.
    // CA total per campaign currently uses platform-reported revenue; event
    // time-window uplift is layered on later.
    const result = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.description,
        c.active,
        c."eventId",
        c."startsAt" as "startDate",
        c."endsAt" as "endDate",
        c."createdAt",
        CASE WHEN c.active THEN 'Active' ELSE 'Draft' END as status,
        COALESCE(ad.spend, 0)::float as "totalAdSpend",
        COALESCE(ad.revenue, 0)::float as "totalRevenue",
        COALESCE(ad.spend, 0)::float as "totalCosts",
        (COALESCE(ad.revenue, 0) - COALESCE(ad.spend, 0))::float as "netProfit",
        CASE WHEN COALESCE(ad.spend,0) > 0 THEN ((ad.revenue - ad.spend) / ad.spend * 100) ELSE 0 END::float as "roi",
        CASE WHEN COALESCE(ad.spend,0) > 0 THEN (ad.revenue / ad.spend) ELSE 0 END::float as "roas",
        CASE WHEN COALESCE(ad.revenue,0) > 0 THEN ((ad.revenue - ad.spend) / ad.revenue * 100) ELSE 0 END::float as "profitMargin",
        COALESCE(ord.orders, 0)::int as "totalOrders",
        (SELECT COUNT(*) FROM "CampaignProduct" cp WHERE cp."campaignId" = c.id) as "productsCount",
        COALESCE(ad.lines, 0)::int as "costsCount"
      FROM "Campaign" c
      LEFT JOIN (
        SELECT "campaignId", SUM(spend) AS spend, SUM(revenue) AS revenue, COUNT(*) AS lines
        FROM "AdCampaign" GROUP BY "campaignId"
      ) ad ON ad."campaignId" = c.id
      LEFT JOIN (
        SELECT "campaignId", COUNT(*) AS orders
        FROM "Order" WHERE "campaignId" IS NOT NULL GROUP BY "campaignId"
      ) ord ON ord."campaignId" = c.id
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
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
      budgetTotal,
    } = body

    if (!name) {
      return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 })
    }

    const hasCampaignTable = await tableExists('Campaign')
    if (!hasCampaignTable) {
      return NextResponse.json(
        { error: 'Campaign table is not installed', missingTables: ['Campaign'] },
        { status: 503 }
      )
    }

    const slug = await createUniqueSlug(name)
    const active = status === 'Active'
    const descriptionWithBudget = [description, budgetTotal ? `Budget: ${budgetTotal} MAD` : null]
      .filter(Boolean)
      .join('\n\n')

    const result = await pool.query(`
      INSERT INTO "Campaign" (
        "name",
        "slug",
        "description",
        "active",
        "startsAt",
        "endsAt",
        "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `, [
      name,
      slug,
      descriptionWithBudget || null,
      active,
      startDate,
      endDate,
    ])

    const campaign = {
      ...result.rows[0],
      status: result.rows[0].active ? 'Active' : 'Draft',
      startDate: result.rows[0].startsAt,
      endDate: result.rows[0].endsAt,
      ...emptyCampaignMetrics(),
      productsCount: 0,
      costsCount: 0,
    }

    return NextResponse.json({
      success: true,
      id: campaign.id,
      campaign,
    })

  } catch (error: any) {
    console.error('Create campaign error:', error)
    return NextResponse.json(
      { error: 'Failed to create campaign', details: error.message },
      { status: 500 }
    )
  }
}
