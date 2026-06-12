import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'
import { tableExists } from '@/lib/ops-schema'

/**
 * POST /api/ops/events/[id]/calculate
 * Calculate event impact metrics
 *
 * Analyzes:
 * - Total revenue, orders, units during event
 * - Performance by category
 * - Performance by product
 * - Comparison vs same duration before event (normal period)
 * - Revenue increase %
 * - Orders increase %
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

    if (!(await tableExists('Event'))) {
      return NextResponse.json(
        {
          error: 'Event tracking is not installed',
          missingTables: ['Event', 'EventMetrics', 'EventProduct', 'EventCategory'],
        },
        { status: 501 }
      )
    }

    const { id: eventId } = await params

    console.log(`📊 Calculating impact metrics for event ${eventId}...`)

    // Call PostgreSQL function to calculate overall metrics
    await pool.query('SELECT calculate_event_metrics($1)', [eventId])

    // Calculate category performance
    await calculateCategoryPerformance(parseInt(eventId))

    // Calculate product performance
    await calculateProductPerformance(parseInt(eventId))

    // Get updated metrics
    const result = await pool.query(`
      SELECT
        em.*,
        e."startDate",
        e."endDate"
      FROM "EventMetrics" em
      JOIN "Event" e ON e.id = em."eventId"
      WHERE em."eventId" = $1
    `, [eventId])

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Metrics not found' }, { status: 404 })
    }

    const metrics = result.rows[0]

    // Get category breakdown
    const categories = await pool.query(`
      SELECT * FROM "EventCategory"
      WHERE "eventId" = $1
      ORDER BY revenue DESC
    `, [eventId])

    // Get product breakdown
    const products = await pool.query(`
      SELECT
        ep.*,
        p.name as "productName",
        p.brand,
        p.category
      FROM "EventProduct" ep
      JOIN "Product" p ON p.id = ep."productId"
      WHERE ep."eventId" = $1
      ORDER BY ep.revenue DESC
      LIMIT 20
    `, [eventId])

    console.log(`✅ Event ${eventId} Impact:`)
    console.log(`   Revenue: ${metrics.totalRevenue} MAD (${metrics.revenueIncrease}% vs normal)`)
    console.log(`   Orders: ${metrics.totalOrders} (${metrics.ordersIncrease}% vs normal)`)
    console.log(`   Top Category: ${metrics.topCategory}`)
    console.log(`   Top Product: ${metrics.topProduct}`)

    return NextResponse.json({
      success: true,
      metrics,
      categories: categories.rows,
      products: products.rows,
    })

  } catch (error: any) {
    console.error('Calculate event metrics error:', error)
    return NextResponse.json(
      { error: 'Failed to calculate metrics', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * Calculate performance breakdown by category
 */
async function calculateCategoryPerformance(eventId: number) {
  // Get event dates
  const eventResult = await pool.query(
    'SELECT "startDate", "endDate" FROM "Event" WHERE id = $1',
    [eventId]
  )

  if (eventResult.rows.length === 0) return

  const { startDate, endDate } = eventResult.rows[0]

  // Get orders during event with category breakdown
  const result = await pool.query(`
    SELECT
      p.category,
      COUNT(DISTINCT o.id) as orders,
      SUM(oi.quantity) as units,
      SUM(oi.price * oi.quantity) as revenue
    FROM "Order" o
    JOIN "OrderItem" oi ON oi."orderId" = o.id
    JOIN "Product" p ON p.id = oi."productId"
    WHERE o.status IN ('CONFIRMED', 'DELIVERED')
      AND o."createdAt" BETWEEN $1 AND $2
    GROUP BY p.category
  `, [startDate, endDate])

  // Insert or update category performance
  for (const row of result.rows) {
    await pool.query(`
      INSERT INTO "EventCategory" (
        "eventId",
        "category",
        "orders",
        "revenue",
        "units"
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT ("eventId", "category") DO UPDATE SET
        "orders" = EXCLUDED."orders",
        "revenue" = EXCLUDED."revenue",
        "units" = EXCLUDED."units"
    `, [
      eventId,
      row.category,
      row.orders,
      row.revenue,
      row.units,
    ])
  }

  // Update top category in EventMetrics
  if (result.rows.length > 0) {
    const topCategory = result.rows[0]
    await pool.query(`
      UPDATE "EventMetrics"
      SET
        "topCategory" = $1,
        "topCategoryRevenue" = $2
      WHERE "eventId" = $3
    `, [topCategory.category, topCategory.revenue, eventId])
  }
}

/**
 * Calculate performance breakdown by product
 */
async function calculateProductPerformance(eventId: number) {
  // Get event dates
  const eventResult = await pool.query(
    'SELECT "startDate", "endDate" FROM "Event" WHERE id = $1',
    [eventId]
  )

  if (eventResult.rows.length === 0) return

  const { startDate, endDate } = eventResult.rows[0]

  // Get event products (if specified)
  const eventProductsResult = await pool.query(
    'SELECT "productId" FROM "EventProduct" WHERE "eventId" = $1',
    [eventId]
  )

  const eventProductIds = eventProductsResult.rows.map((r) => r.productId)

  // If no products specified, analyze ALL products sold during event
  let productCondition = ''
  let queryParams: any[] = [startDate, endDate]

  if (eventProductIds.length > 0) {
    productCondition = `AND p.id = ANY($3)`
    queryParams.push(eventProductIds)
  }

  // Get product performance during event
  const result = await pool.query(`
    SELECT
      p.id as "productId",
      p.name as "productName",
      COUNT(DISTINCT o.id) as orders,
      SUM(oi.quantity) as units,
      SUM(oi.price * oi.quantity) as revenue
    FROM "Order" o
    JOIN "OrderItem" oi ON oi."orderId" = o.id
    JOIN "Product" p ON p.id = oi."productId"
    WHERE o.status IN ('CONFIRMED', 'DELIVERED')
      AND o."createdAt" BETWEEN $1 AND $2
      ${productCondition}
    GROUP BY p.id, p.name
    ORDER BY revenue DESC
  `, queryParams)

  // Update EventProduct records with performance data
  for (const row of result.rows) {
    await pool.query(`
      INSERT INTO "EventProduct" (
        "eventId",
        "productId",
        "orders",
        "revenue",
        "units"
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT ("eventId", "productId") DO UPDATE SET
        "orders" = EXCLUDED."orders",
        "revenue" = EXCLUDED."revenue",
        "units" = EXCLUDED."units"
    `, [
      eventId,
      row.productId,
      row.orders,
      row.revenue,
      row.units,
    ])
  }

  // Update top product in EventMetrics
  if (result.rows.length > 0) {
    const topProduct = result.rows[0]
    await pool.query(`
      UPDATE "EventMetrics"
      SET
        "topProduct" = $1,
        "topProductRevenue" = $2
      WHERE "eventId" = $3
    `, [topProduct.productName, topProduct.revenue, eventId])
  }
}
