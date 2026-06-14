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

    void churnRiskMin; void churnRiskMax // churn not computed yet — filters dropped

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Valid sort columns (all live-computed below)
    const validSorts = ['lifetimeValue', 'ordersCount', 'lastOrderDate', 'createdAt', 'name']
    const sortColumn = validSorts.includes(sort) ? `"${sort}"` : '"createdAt"'
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC'

    // Real customer metrics computed live from confirmed/delivered orders.
    // (The stored User columns ordersCount/lifetimeValue/segment were never
    // populated — every customer showed 0/New/Bronze.)
    const CTE = `
      WITH agg AS (
        SELECT "userId",
               COUNT(*)::int AS orders,
               COALESCE(SUM(total), 0)::float AS ca,
               MAX("createdAt") AS last_order
        FROM "Order"
        WHERE status IN ('CONFIRMED', 'DELIVERED') AND "userId" IS NOT NULL
        GROUP BY "userId"
      ),
      c AS (
        SELECT u.id, u.name, u.email, u.phone, u.points, u."pendingPoints",
               u."preferredCity", u."createdAt",
               COALESCE(a.orders, 0) AS "ordersCount",
               COALESCE(a.ca, 0) AS "lifetimeValue",
               CASE WHEN COALESCE(a.orders, 0) > 0 THEN a.ca / a.orders ELSE 0 END AS "averageOrderValue",
               a.last_order AS "lastOrderDate",
               CASE WHEN a.last_order IS NOT NULL THEN EXTRACT(DAY FROM (now() - a.last_order))::int END AS "daysSinceLastOrder",
               CASE
                 WHEN COALESCE(a.orders, 0) = 0 THEN 'New'
                 WHEN a.ca >= 1500 OR a.orders >= 3 THEN 'VIP'
                 WHEN a.last_order < now() - INTERVAL '90 days' THEN 'At Risk'
                 ELSE 'Regular'
               END AS segment,
               CASE
                 WHEN COALESCE(a.ca, 0) >= 2000 THEN 'Gold'
                 WHEN COALESCE(a.ca, 0) >= 500 THEN 'Silver'
                 ELSE 'Bronze'
               END AS tier
        FROM "User" u
        LEFT JOIN agg a ON a."userId" = u.id
        WHERE u.role IS DISTINCT FROM 'ADMIN'
      )
    `

    const result = await pool.query(
      `${CTE} SELECT * FROM c ${whereClause} ORDER BY ${sortColumn} ${sortOrder} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    )

    const countResult = await pool.query(
      `${CTE} SELECT COUNT(*)::int AS total FROM c ${whereClause}`,
      params
    )

    return NextResponse.json({
      customers: result.rows,
      total: countResult.rows[0].total,
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
