import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'
import { generateOrderNumber } from '@/lib/order-utils'

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
        COUNT(oi.id) as items_count
      FROM "Order" o
      LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
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
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      sourceChannel,
      deliveryName,
      deliveryPhone,
      deliveryCity,
      deliveryAddress,
      deliveryNotes,
      paymentMethod,
      items, // [{ productId, quantity, unitPrice }]
      discountTotal = 0,
      deliveryFeeCharged = 0,
      estimatedDeliveryCost = 0,
      promoCode,
      notes,
      confirmImmediately = false,
    } = body

    // Validation
    if (!sourceChannel) {
      return NextResponse.json(
        { error: 'Source channel is required' },
        { status: 400 }
      )
    }

    if (!deliveryName || !deliveryPhone || !deliveryCity) {
      return NextResponse.json(
        { error: 'Customer name, phone, and city are required' },
        { status: 400 }
      )
    }

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: 'At least one product is required' },
        { status: 400 }
      )
    }

    // Generate order number
    const orderNumber = generateOrderNumber()

    // Start transaction
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Calculate products total
      const productsTotal = items.reduce((sum: number, item: any) => {
        return sum + (item.unitPrice * item.quantity)
      }, 0)

      const revenue = productsTotal - discountTotal
      const total = revenue + deliveryFeeCharged

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
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW()
        ) RETURNING *`,
        [
          orderNumber,
          sourceChannel,
          deliveryName,
          deliveryPhone,
          deliveryCity,
          deliveryAddress,
          deliveryNotes,
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
        fullOrder: createdOrder
      })

      return NextResponse.json(createdOrder, { status: 201 })
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
