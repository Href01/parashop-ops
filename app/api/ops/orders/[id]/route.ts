import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'
import { createSenditShipment } from '@/lib/sendit'

// GET /api/ops/orders/[id] - Get order detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orderId } = await params

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
  } catch (error: any) {
    console.error('Get order error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch order',
        details: error.message,
        orderId: await params.then(p => p.id)
      },
      { status: 500 }
    )
  }
}

// PUT /api/ops/orders/[id] - Update order
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orderId } = await params
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

      // Auto-create Sendit shipment when order is confirmed
      if (status === 'CONFIRMED') {
        try {
          // Get order details with delivery info
          const orderDetails = await pool.query(
            `SELECT * FROM "Order" WHERE id = $1`,
            [orderId]
          )

          const order = orderDetails.rows[0]

          // Check if shipment already exists
          if (!order.senditTrackingId) {
            // Validate order has required delivery info
            if (order.deliveryName && order.deliveryPhone && order.deliveryCity) {
              console.log(`🚀 Auto-creating Sendit shipment for order ${orderId}...`)

              // Create shipment with Sendit
              const shipment = await createSenditShipment({
                reference: order.orderNumber || `ORD-${order.id}`,
                recipient_name: order.deliveryName,
                recipient_phone: order.deliveryPhone,
                recipient_city: order.deliveryCity,
                recipient_address: order.deliveryAddress || '',
                cod_amount: order.paymentMethod === 'COD' ? order.revenue : 0,
                package_weight: 0.5,
                package_description: `Order ${order.orderNumber}`,
                notes: order.notes || '',
              })

              // Update order with Sendit tracking info and change status to SHIPPED
              await pool.query(
                `UPDATE "Order"
                 SET "senditTrackingId" = $1,
                     "senditBarcode" = $2,
                     "senditStatus" = $3,
                     "actualDeliveryCost" = $4,
                     "status" = 'SHIPPED',
                     "updatedAt" = NOW()
                 WHERE id = $5`,
                [
                  shipment.tracking_id,
                  shipment.barcode,
                  shipment.status,
                  shipment.shipping_cost,
                  orderId,
                ]
              )

              // Add status history for SHIPPED
              await pool.query(
                `INSERT INTO "OrderStatusHistory" (
                  "orderId", "oldStatus", "newStatus", "source", "note", "createdAt"
                ) VALUES ($1, $2, $3, 'auto', $4, NOW())`,
                [orderId, 'CONFIRMED', 'SHIPPED', `Auto-created Sendit shipment: ${shipment.tracking_id}`]
              )

              console.log(`✅ Sendit shipment created: ${shipment.tracking_id}`)
            } else {
              console.warn(`⚠️ Order ${orderId} missing delivery info, skipping auto Sendit creation`)
            }
          } else {
            console.log(`ℹ️ Order ${orderId} already has Sendit tracking: ${order.senditTrackingId}`)
          }
        } catch (senditError: any) {
          // Log error but don't fail the order confirmation
          console.error(`❌ Failed to auto-create Sendit shipment for order ${orderId}:`, senditError.message)
          // Order stays CONFIRMED, user can manually create shipment later
        }
      }
    }

    // Fetch updated order to return latest data (including Sendit info if created)
    const finalOrder = await pool.query(
      'SELECT * FROM "Order" WHERE id = $1',
      [orderId]
    )

    return NextResponse.json(finalOrder.rows[0])
  } catch (error) {
    console.error('Update order error:', error)
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    )
  }
}
