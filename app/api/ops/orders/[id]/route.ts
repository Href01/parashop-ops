import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

// GET /api/ops/orders/[id] - Get order detail
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orderId = params.id

    // Get order with items and products
    const result = await pool.query(
      `SELECT
        o.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'productId', oi."productId",
            'productName', p.name,
            'quantity', oi.quantity,
            'price', oi.price,
            'unitCost', oi."unitCost",
            'totalPrice', oi.price * oi.quantity,
            'totalCost', COALESCE(oi."unitCost", 0) * oi.quantity,
            'sku', p.sku,
            'image', p.image
          ) ORDER BY oi.id
        ) as items
      FROM "Order" o
      LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
      LEFT JOIN "Product" p ON p.id = oi."productId"
      WHERE o.id = $1
      GROUP BY o.id`,
      [orderId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const order = result.rows[0]

    // Get status history
    const historyResult = await pool.query(
      `SELECT * FROM "OrderStatusHistory"
       WHERE "orderId" = $1
       ORDER BY "createdAt" DESC`,
      [orderId]
    )

    order.statusHistory = historyResult.rows

    // Get Sendit shipment if exists
    const senditResult = await pool.query(
      `SELECT * FROM "SenditShipment"
       WHERE "orderId" = $1
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      [orderId]
    )

    order.senditShipment = senditResult.rows[0] || null

    return NextResponse.json(order)
  } catch (error) {
    console.error('Get order error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch order' },
      { status: 500 }
    )
  }
}

// PUT /api/ops/orders/[id] - Update order
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orderId = params.id
    const body = await request.json()

    const {
      deliveryName,
      deliveryPhone,
      deliveryCity,
      deliveryAddress,
      deliveryNotes,
      deliveryFeeCharged,
      estimatedDeliveryCost,
      discountTotal,
      notes,
      status,
    } = body

    // Build update query dynamically
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (deliveryName !== undefined) {
      updates.push(`"deliveryName" = $${paramIndex}`)
      values.push(deliveryName)
      paramIndex++
    }

    if (deliveryPhone !== undefined) {
      updates.push(`"deliveryPhone" = $${paramIndex}`)
      values.push(deliveryPhone)
      paramIndex++
    }

    if (deliveryCity !== undefined) {
      updates.push(`"deliveryCity" = $${paramIndex}`)
      values.push(deliveryCity)
      paramIndex++
    }

    if (deliveryAddress !== undefined) {
      updates.push(`"deliveryAddress" = $${paramIndex}`)
      values.push(deliveryAddress)
      paramIndex++
    }

    if (deliveryNotes !== undefined) {
      updates.push(`"deliveryNotes" = $${paramIndex}`)
      values.push(deliveryNotes)
      paramIndex++
    }

    if (deliveryFeeCharged !== undefined) {
      updates.push(`"deliveryFeeCharged" = $${paramIndex}`)
      values.push(deliveryFeeCharged)
      paramIndex++
    }

    if (estimatedDeliveryCost !== undefined) {
      updates.push(`"estimatedDeliveryCost" = $${paramIndex}`)
      values.push(estimatedDeliveryCost)
      paramIndex++
    }

    if (discountTotal !== undefined) {
      updates.push(`"discountTotal" = $${paramIndex}`)
      values.push(discountTotal)
      paramIndex++
    }

    if (notes !== undefined) {
      updates.push(`"notes" = $${paramIndex}`)
      values.push(notes)
      paramIndex++
    }

    if (status !== undefined) {
      updates.push(`"status" = $${paramIndex}`)
      values.push(status)
      paramIndex++
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    updates.push(`"updatedAt" = NOW()`)
    values.push(orderId)

    const query = `
      UPDATE "Order"
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `

    const result = await pool.query(query, values)

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Add status history if status changed
    if (status !== undefined) {
      const oldStatus = await pool.query(
        'SELECT status FROM "Order" WHERE id = $1',
        [orderId]
      )

      await pool.query(
        `INSERT INTO "OrderStatusHistory" (
          "orderId",
          "oldStatus",
          "newStatus",
          "source",
          "note",
          "createdAt"
        ) VALUES ($1, $2, $3, 'manual', $4, NOW())`,
        [
          orderId,
          oldStatus.rows[0]?.status,
          status,
          `Status updated by ${session.user.email}`,
        ]
      )
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Update order error:', error)
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    )
  }
}
