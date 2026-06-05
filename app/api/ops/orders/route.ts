import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'
import { generateOrderNumber } from '@/lib/order-utils'
import { createSenditShipment } from '@/lib/sendit'
import { CreateOrderSchema } from '@/lib/validation/order'

// GET /api/ops/orders - List all orders
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const sourceChannel = searchParams.get('sourceChannel')
    const needsReview = searchParams.get('needsReview')

    let query = `
      SELECT
        o.*,
        COUNT(oi.id) as items_count,
        STRING_AGG(DISTINCT p.name, ', ') as product_names
      FROM "Order" o
      LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
      LEFT JOIN "Product" p ON p.id = oi."productId"
      WHERE 1=1
    `
    const params: any[] = []
    let paramIndex = 1

    if (status) {
      query += ` AND o.status = $${paramIndex}`
      params.push(status)
      paramIndex++
    }

    if (sourceChannel) {
      query += ` AND o."sourceChannel" = $${paramIndex}`
      params.push(sourceChannel)
      paramIndex++
    }

    if (needsReview === 'true') {
      query += ` AND o."needsReview" = true`
    }

    query += `
      GROUP BY o.id
      ORDER BY o."createdAt" DESC
      LIMIT 100
    `

    const result = await pool.query(query, params)

    // Debug: Check first order
    if (result.rows.length > 0) {
      console.log('First order:', {
        id: result.rows[0].id,
        orderNumber: result.rows[0].orderNumber,
        hasId: 'id' in result.rows[0],
        keys: Object.keys(result.rows[0])
      })
    }

    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Orders list error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    )
  }
}

// POST /api/ops/orders - Create new order
export async function POST(request: NextRequest) {
  try {
    // Check auth: either logged-in user OR valid webhook secret
    const session = await getServerSession(authOptions)
    const webhookSecret = request.headers.get('x-webhook-secret')
    const isWebhook = webhookSecret && webhookSecret === process.env.WEBHOOK_SECRET

    if (!session?.user?.email && !isWebhook) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate with Zod schema (prevents ALL data quality bugs)
    const validation = CreateOrderSchema.safeParse(body)

    if (!validation.success) {
      console.error('❌ Order validation failed:', validation.error.flatten())
      return NextResponse.json({
        error: 'Validation failed',
        details: validation.error.flatten().fieldErrors,
      }, { status: 400 })
    }

    // All data is now validated and type-safe!
    const {
      sourceChannel,
      deliveryName,
      deliveryPhone,
      deliveryCity,
      deliveryAddress,
      deliveryNotes,
      senditDistrictId,
      paymentMethod,
      items,
      discountTotal,
      deliveryFeeCharged,
      estimatedDeliveryCost,
      promoCode,
      notes,
      confirmImmediately,
      productsTotal,
      revenue,
      total,
    } = validation.data

    // Generate order number
    const orderNumber = generateOrderNumber()

    // Start transaction
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Total is already calculated and validated by Zod schema
      console.log('💰 Order calculation (validated):', {
        productsTotal,
        discountTotal,
        revenue,
        deliveryFeeCharged,
        total,
        calculation: `${productsTotal} - ${discountTotal} + ${deliveryFeeCharged} = ${total}`
      })

      // Create order
      const orderResult = await client.query(
        `INSERT INTO "Order" (
          "orderNumber",
          "sourceChannel",
          "deliveryName",
          "deliveryPhone",
          "deliveryCity",
          "deliveryAddress",
          "deliveryNotes",
          "senditDistrictId",
          "paymentMethod",
          "productsTotal",
          "discountTotal",
          "revenue",
          "total",
          "deliveryFeeCharged",
          "estimatedDeliveryCost",
          "promoCode",
          "notes",
          "status",
          "confirmationStatus",
          "deliveryStatus",
          "createdAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW()
        ) RETURNING *`,
        [
          orderNumber,
          sourceChannel,
          deliveryName,
          deliveryPhone,
          deliveryCity,
          deliveryAddress,
          deliveryNotes,
          senditDistrictId || null,
          paymentMethod,
          productsTotal,
          discountTotal,
          revenue,
          total,
          deliveryFeeCharged,
          estimatedDeliveryCost,
          promoCode || null,
          notes || null,
          confirmImmediately ? 'CONFIRMED' : 'PENDING',
          confirmImmediately ? 'CONFIRMED' : 'NEEDS_CONFIRMATION',
          'NOT_CREATED',
        ]
      )

      const order = orderResult.rows[0]

      // Create order items (if any)
      if (items && items.length > 0) {
        // Get product cost prices
        const productIds = items.map((item: any) => item.productId)
        const productsResult = await client.query(
          `SELECT id, "costPrice" FROM "Product" WHERE id = ANY($1)`,
          [productIds]
        )

        const productCosts = new Map(
          productsResult.rows.map(p => [p.id, p.costPrice || 0])
        )

        // Create order items
        for (const item of items) {
        const unitCost = productCosts.get(item.productId) || 0
        const totalPrice = item.unitPrice * item.quantity
        const totalCost = unitCost * item.quantity

        await client.query(
          `INSERT INTO "OrderItem" (
            "orderId",
            "productId",
            "quantity",
            "price",
            "unitCost",
            "totalCost"
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, item.productId, item.quantity, item.unitPrice, unitCost, totalCost]
        )
        }
      }

      // Add status history
      await client.query(
        `INSERT INTO "OrderStatusHistory" (
          "orderId",
          "oldStatus",
          "newStatus",
          "source",
          "note",
          "createdAt"
        ) VALUES ($1, NULL, $2, 'manual', $3, NOW())`,
        [
          order.id,
          confirmImmediately ? 'CONFIRMED' : 'PENDING',
          isWebhook
            ? 'Order synced from website'
            : `Order created via BOS by ${session?.user?.email}`,
        ]
      )

      await client.query('COMMIT')

      // Auto-create Sendit shipment if order was confirmed immediately
      let senditWarning = null
      if (confirmImmediately) {
        try {
          console.log(`🚀 Auto-creating Sendit shipment for new order ${order.id}...`)
          console.log(`Order data:`, {
            orderNumber,
            deliveryName,
            deliveryPhone,
            deliveryCity,
            deliveryAddress,
            paymentMethod,
            total,
          })

          // Create shipment with Sendit
          const shipment = await createSenditShipment({
            reference: orderNumber,
            recipient_name: deliveryName,
            recipient_phone: deliveryPhone,
            recipient_city: deliveryCity,
            recipient_address: deliveryAddress || '',
            district_id: senditDistrictId,  // Use stored district if available
            cod_amount: paymentMethod === 'COD' ? total : 0,
            package_weight: 0.5,
            package_description: `Order ${orderNumber}`,
            notes: notes || deliveryNotes || '',
          })

          // Update order with Sendit tracking info (keep status as CONFIRMED)
          await pool.query(
            `UPDATE "Order"
             SET "senditTrackingId" = $1,
                 "senditBarcode" = $2,
                 "senditStatus" = $3,
                 "actualDeliveryCost" = $4,
                 "deliveryStatus" = 'SENDIT_CREATED'
             WHERE id = $5`,
            [
              shipment.tracking_id,
              shipment.barcode,
              shipment.status,
              shipment.shipping_cost,
              order.id,
            ]
          )

          // Add status history note (status stays CONFIRMED)
          await pool.query(
            `INSERT INTO "OrderStatusHistory" (
              "orderId", "oldStatus", "newStatus", "source", "note", "createdAt"
            ) VALUES ($1, $2, $3, 'auto', $4, NOW())`,
            [order.id, 'CONFIRMED', 'CONFIRMED', `Sendit shipment created: ${shipment.tracking_id}`]
          )

          console.log(`✅ Sendit shipment created: ${shipment.tracking_id}`)
        } catch (senditError: any) {
          // Log error but don't fail the order creation
          console.error(`❌ Failed to auto-create Sendit shipment for order ${order.id}:`, senditError)
          console.error(`Error details:`, {
            message: senditError.message,
            stack: senditError.stack,
            response: senditError.response,
          })
          senditWarning = `Order created but Sendit shipment failed: ${senditError.message}`
          // Order stays CONFIRMED, user can manually create shipment later
        }
      }

      // Fetch complete order with items
      const completeOrder = await pool.query(
        `SELECT o.*,
          json_agg(
            json_build_object(
              'id', oi.id,
              'productId', oi."productId",
              'quantity', oi.quantity,
              'price', oi.price,
              'unitCost', oi."unitCost"
            )
          ) as items
        FROM "Order" o
        LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
        WHERE o.id = $1
        GROUP BY o.id`,
        [order.id]
      )

      const createdOrder = completeOrder.rows[0]
      console.log('Created order:', {
        id: createdOrder?.id,
        orderNumber: createdOrder?.orderNumber,
        hasItems: createdOrder?.items?.length,
        status: createdOrder?.status,
        senditTrackingId: createdOrder?.senditTrackingId,
        senditWarning,
      })

      return NextResponse.json({
        ...createdOrder,
        _warning: senditWarning,
      }, { status: 201 })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error('Create order error:', error)
    return NextResponse.json(
      {
        error: 'Failed to create order',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}
