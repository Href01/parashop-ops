import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * GET /api/ops/customers
 * List all customers with optional filters
 * Query params:
 *   - segment: Filter by segment (VIP, Regular, At Risk, New, Churned)
 *   - search: Search by name, email, phone
 *   - tier: Filter by tier (Bronze, Silver, Gold, Platinum)
 *   - churnRisk: min or max (e.g., ?churnRisk[min]=50)
 *   - sort: Sort by (lifetimeValue, ordersCount, lastOrderDate, createdAt)
 *   - order: asc or desc
 *   - limit: Number of results (default 50, max 200)
 *   - offset: Pagination offset
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const segment = searchParams.get('segment')
    const search = searchParams.get('search')
    const tier = searchParams.get('tier')
    const churnRiskMin = searchParams.get('churnRisk[min]')
    const churnRiskMax = searchParams.get('churnRisk[max]')
    const sort = searchParams.get('sort') || 'createdAt'
    const order = searchParams.get('order') || 'desc'
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build WHERE clauses
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (segment) {
      conditions.push(`"segment" = $${paramIndex}`)
      params.push(segment)
      paramIndex++
    }

    if (tier) {
      conditions.push(`"tier" = $${paramIndex}`)
      params.push(tier)
      paramIndex++
    }

    if (search) {
      conditions.push(`(
        LOWER("name") LIKE LOWER($${paramIndex})
        OR LOWER("email") LIKE LOWER($${paramIndex})
        OR "phone" LIKE $${paramIndex}
      )`)
      params.push(`%${search}%`)
      paramIndex++
    }

    if (churnRiskMin) {
      conditions.push(`"churnRisk" >= $${paramIndex}`)
      params.push(parseInt(churnRiskMin))
      paramIndex++
    }

    if (churnRiskMax) {
      conditions.push(`"churnRisk" <= $${paramIndex}`)
      params.push(parseInt(churnRiskMax))
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Valid sort columns
    const validSorts = ['lifetimeValue', 'ordersCount', 'lastOrderDate', 'createdAt', 'name', 'churnRisk']
    const sortColumn = validSorts.includes(sort) ? `"${sort}"` : '"createdAt"'
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC'

    // Get customers
    const result = await pool.query(`
      SELECT
        id,
        name,
        email,
        phone,
        "segment",
        "tier",
        "ordersCount",
        "lifetimeValue",
        "averageOrderValue",
        "lastOrderDate",
        "daysSinceLastOrder",
        points,
        "pendingPoints",
        "rfmScore",
        "recencyScore",
        "frequencyScore",
        "monetaryScore",
        "churnRisk",
        "preferredCity",
        "createdAt"
      FROM "User"
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset])

    // Get total count
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM "User"
      ${whereClause}
    `, params)

    return NextResponse.json({
      customers: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset,
    })

  } catch (error: any) {
    console.error('GET customers error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customers', details: error.message },
      { status: 500 }
    )
  }
}
