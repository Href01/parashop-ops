import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * GET /api/ops/customers/[id]
 * Get customer detail with full history
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

    const { id: customerId } = await params

    // Get customer data
    const customerResult = await pool.query(`
      SELECT * FROM "User"
      WHERE id = $1
    `, [customerId])

    if (customerResult.rows.length === 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const customer = customerResult.rows[0]

    // Get order history
    const ordersResult = await pool.query(`
      SELECT
        id,
        total,
        status,
        "createdAt",
        "deliveryCity",
        "paymentMethod"
      FROM "Order"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 20
    `, [customerId])

    // Get customer activity timeline
    const activityResult = await pool.query(`
      SELECT
        type,
        action,
        description,
        metadata,
        "createdAt"
      FROM "CustomerActivity"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 50
    `, [customerId])

    // Real metrics from confirmed/delivered orders (the stored User columns were
    // never populated — they showed 0/New/Bronze for everyone).
    const metricsResult = await pool.query(`
      SELECT
        COUNT(*)::int as "totalOrders",
        COALESCE(SUM(total), 0)::float as "totalSpent",
        COALESCE(AVG(total), 0)::float as "avgOrderValue",
        MAX("createdAt") as "lastOrderDate"
      FROM "Order"
      WHERE "userId" = $1 AND status IN ('CONFIRMED', 'DELIVERED')
    `, [customerId])
    const m = metricsResult.rows[0]
    const orders = Number(m.totalOrders) || 0
    const ca = Number(m.totalSpent) || 0
    const last = m.lastOrderDate ? new Date(m.lastOrderDate) : null
    const daysSince = last ? Math.floor((Date.now() - last.getTime()) / 86400000) : null
    const segment = orders === 0 ? 'New'
      : (ca >= 1500 || orders >= 3) ? 'VIP'
      : (daysSince != null && daysSince > 90) ? 'At Risk'
      : 'Regular'
    const tier = ca >= 2000 ? 'Gold' : ca >= 500 ? 'Silver' : 'Bronze'

    // Override the stale stored columns with live values
    Object.assign(customer, {
      ordersCount: orders,
      lifetimeValue: ca,
      averageOrderValue: orders > 0 ? ca / orders : 0,
      lastOrderDate: m.lastOrderDate,
      daysSinceLastOrder: daysSince,
      segment,
      tier,
    })

    // CRM: recent WhatsApp messages (sent + received)
    const messagesResult = await pool.query(`
      SELECT id, direction, type, body, status, "createdAt", "orderId"
      FROM "MessageLog"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 10
    `, [customerId]).catch(() => ({ rows: [] }))

    // CRM: reviews left by this customer
    const reviewsResult = await pool.query(`
      SELECT r.id, r.rating, r.comment, r.approved, r."createdAt", p.name as "productName"
      FROM "Review" r
      LEFT JOIN "Product" p ON p.id = r."productId"
      WHERE r."userId" = $1
      ORDER BY r."createdAt" DESC
      LIMIT 10
    `, [customerId]).catch(() => ({ rows: [] }))

    return NextResponse.json({
      customer,
      orders: ordersResult.rows,
      activity: activityResult.rows,
      metrics: m,
      messages: messagesResult.rows,
      reviews: reviewsResult.rows,
    })

  } catch (error: any) {
    console.error('GET customer detail error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customer', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/ops/customers/[id]
 * Update customer information
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

    const { id: customerId } = await params
    const body = await request.json()

    const {
      name,
      phone,
      email,
      address,
      segment,
      tier,
      tags,
      notes,
      emailOptIn,
      smsOptIn,
      whatsappOptIn,
    } = body

    // Build update query dynamically
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (name !== undefined) {
      updates.push(`"name" = $${paramIndex}`)
      values.push(name)
      paramIndex++
    }

    if (phone !== undefined) {
      updates.push(`"phone" = $${paramIndex}`)
      values.push(phone)
      paramIndex++
    }

    if (email !== undefined) {
      updates.push(`"email" = $${paramIndex}`)
      values.push(email)
      paramIndex++
    }

    if (address !== undefined) {
      updates.push(`"address" = $${paramIndex}`)
      values.push(address)
      paramIndex++
    }

    if (segment !== undefined) {
      updates.push(`"segment" = $${paramIndex}`)
      values.push(segment)
      paramIndex++
    }

    if (tier !== undefined) {
      updates.push(`"tier" = $${paramIndex}`)
      values.push(tier)
      paramIndex++
    }

    if (tags !== undefined) {
      updates.push(`"tags" = $${paramIndex}`)
      values.push(tags)
      paramIndex++
    }

    if (notes !== undefined) {
      updates.push(`"notes" = $${paramIndex}`)
      values.push(notes)
      paramIndex++
    }

    if (emailOptIn !== undefined) {
      updates.push(`"emailOptIn" = $${paramIndex}`)
      values.push(emailOptIn)
      paramIndex++
    }

    if (smsOptIn !== undefined) {
      updates.push(`"smsOptIn" = $${paramIndex}`)
      values.push(smsOptIn)
      paramIndex++
    }

    if (whatsappOptIn !== undefined) {
      updates.push(`"whatsappOptIn" = $${paramIndex}`)
      values.push(whatsappOptIn)
      paramIndex++
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Update customer
    const result = await pool.query(`
      UPDATE "User"
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, [...values, customerId])

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // Log activity
    await pool.query(`
      INSERT INTO "CustomerActivity" ("userId", "type", "action", "description", "createdAt")
      VALUES ($1, 'Profile', 'Updated', $2, NOW())
    `, [customerId, `Updated by ${session.user.email}`])

    return NextResponse.json({
      success: true,
      customer: result.rows[0],
    })

  } catch (error: any) {
    console.error('PUT customer error:', error)
    return NextResponse.json(
      { error: 'Failed to update customer', details: error.message },
      { status: 500 }
    )
  }
}
