import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * GET /api/ops/events
 * List all events with metrics
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // Upcoming, Active, Completed
    const type = searchParams.get('type') // Ramadan, Black Friday, etc.
    const sort = searchParams.get('sort') || 'startDate'
    const order = searchParams.get('order') || 'DESC'

    // Build WHERE clause
    const conditions: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (status) {
      conditions.push(`e.status = $${paramIndex}`)
      values.push(status)
      paramIndex++
    }

    if (type) {
      conditions.push(`e.type = $${paramIndex}`)
      values.push(type)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get events with metrics
    const result = await pool.query(`
      SELECT
        e.*,
        em."totalOrders",
        em."totalRevenue",
        em."totalUnits",
        em."avgOrderValue",
        em."revenueIncrease",
        em."ordersIncrease",
        em."topCategory",
        em."topProduct",
        (
          SELECT COUNT(*)
          FROM "EventProduct" ep
          WHERE ep."eventId" = e.id
        ) as "productsCount"
      FROM "Event" e
      LEFT JOIN "EventMetrics" em ON em."eventId" = e.id
      ${whereClause}
      ORDER BY e."${sort}" ${order}
    `, values)

    return NextResponse.json({
      events: result.rows,
      total: result.rows.length,
    })

  } catch (error: any) {
    console.error('Get events error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch events', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/ops/events
 * Create new event
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
      type, // Ramadan, Black Friday, Mother's Day, Summer Sale, Flash Sale, Custom
      status = 'Upcoming',
      startDate,
      endDate,
      discountType,
      discountValue,
      minOrderAmount,
      targetRevenue,
      targetOrders,
    } = body

    if (!name || !type || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Name, type, startDate, and endDate are required' },
        { status: 400 }
      )
    }

    const result = await pool.query(`
      INSERT INTO "Event" (
        "name",
        "description",
        "type",
        "status",
        "startDate",
        "endDate",
        "discountType",
        "discountValue",
        "minOrderAmount",
        "targetRevenue",
        "targetOrders",
        "createdBy",
        "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *
    `, [
      name,
      description,
      type,
      status,
      startDate,
      endDate,
      discountType,
      discountValue,
      minOrderAmount,
      targetRevenue,
      targetOrders,
      session.user.email,
    ])

    // Initialize metrics
    await pool.query(`
      INSERT INTO "EventMetrics" ("eventId")
      VALUES ($1)
    `, [result.rows[0].id])

    return NextResponse.json({
      success: true,
      event: result.rows[0],
    })

  } catch (error: any) {
    console.error('Create event error:', error)
    return NextResponse.json(
      { error: 'Failed to create event', details: error.message },
      { status: 500 }
    )
  }
}
