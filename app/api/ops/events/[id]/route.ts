import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'
import { tableExists } from '@/lib/ops-schema'

/**
 * GET /api/ops/events/[id]
 * Get event detail with category and product performance breakdown
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

    if (!(await tableExists('Event'))) {
      return NextResponse.json(
        {
          error: 'Event tracking is not installed',
          missingTables: ['Event', 'EventMetrics', 'EventProduct', 'EventCategory'],
        },
        { status: 404 }
      )
    }

    const { id: eventId } = await params

    // Get event with metrics and computed status
    const eventResult = await pool.query(`
      SELECT
        e.*,
        em.*,
        CASE
          WHEN CURRENT_DATE < e."startDate"::date THEN 'Upcoming'
          WHEN CURRENT_DATE > e."endDate"::date THEN 'Completed'
          ELSE 'Active'
        END as "computedStatus"
      FROM "Event" e
      LEFT JOIN "EventMetrics" em ON em."eventId" = e.id
      WHERE e.id = $1
    `, [eventId])

    if (eventResult.rows.length === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const event = eventResult.rows[0]
    // Use computed status instead of DB status
    event.status = event.computedStatus
    delete event.computedStatus

    // Get category performance
    const categoriesResult = await pool.query(`
      SELECT * FROM "EventCategory"
      WHERE "eventId" = $1
      ORDER BY revenue DESC
    `, [eventId])

    event.categories = categoriesResult.rows

    // Get product performance
    const productsResult = await pool.query(`
      SELECT
        ep.*,
        p.name as "productName",
        p.brand,
        p.image,
        p.price,
        p.category
      FROM "EventProduct" ep
      JOIN "Product" p ON p.id = ep."productId"
      WHERE ep."eventId" = $1
      ORDER BY ep.revenue DESC
    `, [eventId])

    event.products = productsResult.rows

    // Get orders during event (explicitly linked OR falling in the period)
    const ordersResult = await pool.query(`
      SELECT
        o.id,
        o."orderNumber",
        o.total,
        o."createdAt",
        o.status,
        o."deliveryName",
        o."eventId"
      FROM "Order" o
      WHERE o."eventId" = $1
        OR (o."createdAt" BETWEEN $2 AND $3)
      ORDER BY o."createdAt" DESC
    `, [eventId, event.startDate, event.endDate])

    event.orders = ordersResult.rows

    return NextResponse.json(event)

  } catch (error: any) {
    console.error('Get event error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch event', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/ops/events/[id]
 * Update event
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
    const body = await request.json()

    const {
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

    if (type !== undefined) {
      updates.push(`"type" = $${paramIndex}`)
      values.push(type)
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

    if (discountType !== undefined) {
      updates.push(`"discountType" = $${paramIndex}`)
      values.push(discountType)
      paramIndex++
    }

    if (discountValue !== undefined) {
      updates.push(`"discountValue" = $${paramIndex}`)
      values.push(discountValue)
      paramIndex++
    }

    if (minOrderAmount !== undefined) {
      updates.push(`"minOrderAmount" = $${paramIndex}`)
      values.push(minOrderAmount)
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

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    updates.push(`"updatedAt" = NOW()`)
    values.push(eventId)

    const result = await pool.query(`
      UPDATE "Event"
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values)

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      event: result.rows[0],
    })

  } catch (error: any) {
    console.error('Update event error:', error)
    return NextResponse.json(
      { error: 'Failed to update event', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/ops/events/[id]
 * Delete event
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

    await pool.query('DELETE FROM "Event" WHERE id = $1', [eventId])

    return NextResponse.json({
      success: true,
      message: 'Event deleted successfully',
    })

  } catch (error: any) {
    console.error('Delete event error:', error)
    return NextResponse.json(
      { error: 'Failed to delete event', details: error.message },
      { status: 500 }
    )
  }
}
