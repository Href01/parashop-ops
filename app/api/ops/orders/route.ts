import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { buildSenditProductsDescription, calculateCodAmount, generateOrderNumber } from '@/lib/order-utils'
import { createSenditShipment } from '@/lib/sendit'
import { CreateOrderSchema } from '@/lib/validation/order'
import { getOpsSession } from '@/lib/auth'

// GET /api/ops/orders - List all orders
export async function GET(request: NextRequest) {
  try {
    const session = await getOpsSession()
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

    // The orders page paginates client-side over the full set, and the status
    // cards count the loaded rows — so a low LIMIT silently truncated the list
    // (showed "86 livrées" while the DB had 101). Load the whole (small) table.
    query += `
      GROUP BY o.id
      ORDER BY o."createdAt" DESC
      LIMIT 5000
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
    const session = await getOpsSession()

    if (!session?.user?.email) {
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
      paidAmount,
      paidAt,
      paymentReference,
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
          "paidAmount",
          "paidAt",
          "paymentReference",
          "paymentStatus",
          "createdAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22::timestamptz, $23, $24, NOW()
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
          paymentMethod === 'VIREMENT' ? paidAmount : null,
          paymentMethod === 'VIREMENT' ? paidAt : null,
          paymentMethod === 'VIREMENT' ? paymentReference || null : null,
          paymentMethod === 'VIREMENT'
            ? Math.abs(Number(paidAmount) - total) <= 0.01 ? 'PAID' : 'PARTIAL'
            : 'PENDING',
        ]
      )

      const order = orderResult.rows[0]
      let senditProductsDescription = buildSenditProductsDescription(items, `Order ${orderNumber}`)

      // Create order items (if any)
      if (items && items.length > 0) {
        // Get product cost prices
        const productIds = items.map((item: any) => item.productId)
        const productsResult = await client.query(
          `SELECT id, name, "costPrice" FROM "Product" WHERE id = ANY($1)`,
          [productIds]
        )

        const productsById = new Map(
          productsResult.rows.map(p => [p.id, { name: p.name, costPrice: p.costPrice || 0 }])
        )
        senditProductsDescription = buildSenditProductsDescription(
          items.map((item: any) => ({
            productId: item.productId,
            productName: productsById.get(item.productId)?.name,
            quantity: item.quantity,
          })),
          `Order ${orderNumber}`
        )

        // Create order items
        for (const item of items) {
        const unitCost = productsById.get(item.productId)?.costPrice || 0
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

      // Re-run the profit trigger now that OrderItem rows exist.
      await client.query(
        `UPDATE "Order"
         SET "deliveryStatus" = "deliveryStatus"
         WHERE id = $1`,
        [order.id]
      )

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
          `Order created via BOS by ${session.user.email}`,
        ]
      )

      await client.query('COMMIT')

      // Auto-create Sendit shipment if order was confirmed immediately
      let senditWarning = null
      if (confirmImmediately) {
        if (!senditDistrictId) {
          senditWarning = 'Order created but Sendit shipment was not created: exact Sendit district is required.'
          console.warn(senditWarning)
        } else {
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
            district_id: senditDistrictId,
            cod_amount: calculateCodAmount(paymentMethod, total),
            package_weight: 0.5,
            package_description: senditProductsDescription,
            notes: notes || deliveryNotes || '',
          })
          const districtMismatch = shipment.destination_district_id != null
            && shipment.destination_district_id !== senditDistrictId

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
            [
              order.id,
              'CONFIRMED',
              'CONFIRMED',
              districtMismatch
                ? `Sendit shipment created: ${shipment.tracking_id}; district mismatch requested=${senditDistrictId} received=${shipment.destination_district_id}`
                : `Sendit shipment created: ${shipment.tracking_id}`,
            ]
          )

          if (districtMismatch) {
            senditWarning = `Sendit created the shipment in ${shipment.destination_district_name || `district #${shipment.destination_district_id}`} instead of district #${senditDistrictId}. Verify the destination before pickup.`
          }

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
