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
  console.log('PUT /api/ops/orders/[id] - START')

  try {
    console.log('PUT /api/ops/orders/[id] - Getting session...')
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      console.error('PUT /api/ops/orders/[id] - Unauthorized: No session')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('PUT /api/ops/orders/[id] - Session OK, getting params...')
    const { id: orderId } = await params

    console.log('PUT /api/ops/orders/[id] - Params OK, parsing body...')
    const body = await request.json()

    console.log('PUT /api/ops/orders/[id] - Request:', {
      orderId,
      body,
      user: session.user.email,
    })

    if (!pool) {
      console.error('PUT /api/ops/orders/[id] - Database pool is undefined!')
      return NextResponse.json({ error: 'Database connection failed', details: 'Pool is undefined' }, { status: 500 })
    }

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

    // Get old status BEFORE updating (if status is being changed)
    let oldStatusValue = null
    if (status !== undefined) {
      const oldStatusResult = await pool.query(
        'SELECT status FROM "Order" WHERE id = $1',
        [orderId]
      )
      oldStatusValue = oldStatusResult.rows[0]?.status
    }

    // Note: updatedAt column doesn't exist in Order table
    // updates.push(`"updatedAt" = NOW()`)
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
    let senditWarning: string | null = null

    if (status !== undefined && oldStatusValue !== null) {

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
          oldStatusValue,
          status,
          `Status updated by ${session.user.email}`,
        ]
      )

      // Auto-create Sendit shipment when order is confirmed
      if (status === 'CONFIRMED') {
        try {
          // Get order details with items
          const orderDetails = await pool.query(
            `SELECT o.*,
              json_agg(
                json_build_object(
                  'productId', oi."productId",
                  'productName', p.name,
                  'quantity', oi.quantity,
                  'price', oi.price
                )
              ) as items
            FROM "Order" o
            LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
            LEFT JOIN "Product" p ON p.id = oi."productId"
            WHERE o.id = $1
            GROUP BY o.id`,
            [orderId]
          )

          const order = orderDetails.rows[0]

          // Check if shipment already exists
          if (!order.senditTrackingId) {
            // Validate order has required delivery info
            if (order.deliveryName && order.deliveryPhone && order.deliveryCity) {
              console.log(`🚀 Auto-creating Sendit shipment for order ${orderId}...`)

              // Build products description
              const productsDesc = order.items && order.items.length > 0 && order.items[0].productName
                ? order.items.map((item: any) => `${item.productName} x${item.quantity}`).join(', ')
                : 'Products'

              // Create shipment with Sendit
              const shipment = await createSenditShipment({
                reference: order.orderNumber || `ORD-${order.id}`,
                recipient_name: order.deliveryName,
                recipient_phone: order.deliveryPhone,
                recipient_city: order.deliveryCity,
                recipient_address: order.deliveryAddress || '',
                cod_amount: order.paymentMethod === 'COD' ? order.total : 0,
                package_weight: 0.5,
                package_description: productsDesc,
                notes: order.notes || '',
              })

              // Update order with Sendit tracking info (keep status as CONFIRMED)
              await pool.query(
                `UPDATE "Order"
                 SET "senditTrackingId" = $1,
                     "senditBarcode" = $2,
                     "senditStatus" = $3,
                     "actualDeliveryCost" = $4
                 WHERE id = $5`,
                [
                  shipment.tracking_id,
                  shipment.barcode,
                  shipment.status,
                  shipment.shipping_cost,
                  orderId,
                ]
              )

              // Add status history note (status stays CONFIRMED)
              await pool.query(
                `INSERT INTO "OrderStatusHistory" (
                  "orderId", "oldStatus", "newStatus", "source", "note", "createdAt"
                ) VALUES ($1, $2, $3, 'auto', $4, NOW())`,
                [orderId, 'CONFIRMED', 'CONFIRMED', `Sendit shipment created: ${shipment.tracking_id}`]
              )

              console.log(`✅ Sendit shipment created: ${shipment.tracking_id}`)
            } else {
              senditWarning = `Order confirmed but missing delivery info: ${!order.deliveryName ? 'name ' : ''}${!order.deliveryPhone ? 'phone ' : ''}${!order.deliveryCity ? 'city' : ''}`
              console.warn(`⚠️ ${senditWarning}`)
            }
          } else {
            console.log(`ℹ️ Order ${orderId} already has Sendit tracking: ${order.senditTrackingId}`)
          }
        } catch (senditError: any) {
          // Log error but don't fail the order confirmation
          senditWarning = `Order confirmed but Sendit shipment creation failed: ${senditError.message}`
          console.error(`❌ Failed to auto-create Sendit shipment for order ${orderId}:`, senditError)
          console.error('Sendit error details:', {
            message: senditError.message,
            stack: senditError.stack,
            name: senditError.name,
          })
          // Order stays CONFIRMED, user can manually create shipment later
        }
      }
    }

    // Fetch updated order to return latest data (including Sendit info if created)
    const finalOrder = await pool.query(
      'SELECT * FROM "Order" WHERE id = $1',
      [orderId]
    )

    return NextResponse.json({
      ...finalOrder.rows[0],
      _senditWarning: senditWarning,
    })
  } catch (error: any) {
    console.error('PUT /api/ops/orders/[id] - ERROR:', error)
    console.error('Error name:', error?.name)
    console.error('Error message:', error?.message)
    console.error('Error stack:', error?.stack)

    return NextResponse.json(
      {
        error: 'Failed to update order',
        details: error?.message || String(error),
        errorName: error?.name,
        stack: error?.stack
      },
      { status: 500 }
    )
  }
}

// DELETE /api/ops/orders/[id] - Delete order
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orderId } = await params

    // Delete order items first (foreign key constraint)
    await pool.query('DELETE FROM "OrderItem" WHERE "orderId" = $1', [orderId])

    // Delete status history
    await pool.query('DELETE FROM "OrderStatusHistory" WHERE "orderId" = $1', [orderId])

    // Delete order
    const result = await pool.query('DELETE FROM "Order" WHERE id = $1 RETURNING id', [orderId])

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: 'Order deleted successfully' })
  } catch (error: any) {
    console.error('DELETE order error:', error)
    return NextResponse.json(
      { error: 'Failed to delete order', details: error.message },
      { status: 500 }
    )
  }
}
