import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { createSenditShipment, getShipmentTracking } from '@/lib/sendit'

// Create Sendit shipment for an order
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params

    // Get order details
    const orderResult = await pool.query(
      `SELECT
        o.*,
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

    if (orderResult.rows.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const order = orderResult.rows[0]

    // Check if shipment already exists
    if (order.senditTrackingId) {
      return NextResponse.json({
        error: 'Shipment already created',
        trackingId: order.senditTrackingId,
      }, { status: 400 })
    }

    // Validate order has required delivery info
    if (!order.deliveryName || !order.deliveryPhone || !order.deliveryCity) {
      return NextResponse.json({
        error: 'Order missing required delivery information',
        missing: {
          name: !order.deliveryName,
          phone: !order.deliveryPhone,
          city: !order.deliveryCity,
        }
      }, { status: 400 })
    }

    // Parse request body for optional overrides
    const body = await request.json().catch(() => ({}))
    const { notes, packageWeight } = body

    // Create shipment with Sendit
    const shipment = await createSenditShipment({
      reference: order.orderNumber || `ORD-${order.id}`,
      recipient_name: order.deliveryName,
      recipient_phone: order.deliveryPhone,
      recipient_city: order.deliveryCity,
      recipient_address: order.deliveryAddress || '',
      cod_amount: order.paymentMethod === 'COD' ? order.revenue : 0,
      package_weight: packageWeight || 0.5,
      package_description: `Order ${order.orderNumber} - ${order.items?.length || 0} items`,
      notes: notes || order.notes || '',
    })

    // Update order with Sendit tracking info
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
        "orderId", "oldStatus", "newStatus", note, "createdAt"
      ) VALUES ($1, $2, $3, $4, NOW())`,
      [orderId, order.status, order.status, `Sendit shipment created: ${shipment.tracking_id}`]
    )

    console.log(`✅ Sendit shipment created for order ${orderId}: ${shipment.tracking_id}`)

    return NextResponse.json({
      success: true,
      trackingId: shipment.tracking_id,
      barcode: shipment.barcode,
      status: shipment.status,
      shippingCost: shipment.shipping_cost,
      estimatedDelivery: shipment.estimated_delivery_date,
    })

  } catch (error: any) {
    console.error('Create Sendit shipment error:', error)
    console.error('Error name:', error?.name)
    console.error('Error message:', error?.message)
    console.error('Error stack:', error?.stack)

    return NextResponse.json(
      {
        error: 'Failed to create shipment',
        details: error?.message || String(error),
        errorName: error?.name,
        stack: error?.stack,
      },
      { status: 500 }
    )
  }
}

// Get shipment tracking info
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params

    // Get order with tracking ID
    const orderResult = await pool.query(
      'SELECT "senditTrackingId" FROM "Order" WHERE id = $1',
      [orderId]
    )

    if (orderResult.rows.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const trackingId = orderResult.rows[0].senditTrackingId

    if (!trackingId) {
      return NextResponse.json({
        error: 'No shipment created for this order',
      }, { status: 404 })
    }

    // Get tracking info from Sendit
    const tracking = await getShipmentTracking(trackingId)

    // Update order status based on Sendit status
    const statusMap: Record<string, string> = {
      'DELIVERED': 'DELIVERED',
      'RETURNED': 'CANCELLED',
      'FAILED': 'CANCELLED',
    }

    const newStatus = statusMap[tracking.status]

    if (newStatus) {
      // Update order status
      await pool.query(
        `UPDATE "Order"
         SET status = $1, "senditStatus" = $2
         WHERE id = $3 AND status != $1`,
        [newStatus, tracking.status, orderId]
      )

      // Add status history if status changed
      const changed = await pool.query(
        `SELECT COUNT(*) as count FROM "OrderStatusHistory"
         WHERE "orderId" = $1 AND "newStatus" = $2`,
        [orderId, newStatus]
      )

      if (parseInt(changed.rows[0].count) === 0) {
        await pool.query(
          `INSERT INTO "OrderStatusHistory" (
            "orderId", "oldStatus", "newStatus", note, "createdAt"
          ) VALUES ($1, 'SHIPPED', $2, $3, NOW())`,
          [orderId, newStatus, `Sendit status: ${tracking.status}`]
        )
      }
    }

    return NextResponse.json({
      trackingId: tracking.tracking_id,
      status: tracking.status,
      history: tracking.status_history,
      estimatedDelivery: tracking.estimated_delivery,
      actualDelivery: tracking.actual_delivery,
    })

  } catch (error: any) {
    console.error('Get shipment tracking error:', error)
    return NextResponse.json(
      {
        error: 'Failed to get tracking info',
        details: error.message,
      },
      { status: 500 }
    )
  }
}
