import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { generateOrderNumber, estimateDeliveryCost, calculateOrderTotals, checkOrderCompleteness } from '@/lib/order-utils'

// Webhook to sync orders from main website (shinecosmetics.ma) to BOS
export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret
    const authHeader = request.headers.get('authorization')
    const expectedSecret = process.env.WEBHOOK_SECRET

    if (!expectedSecret) {
      console.error('WEBHOOK_SECRET not configured')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }

    if (authHeader !== `Bearer ${expectedSecret}`) {
      console.error('Unauthorized webhook attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await request.json()

    // Validate required fields
    const { orderId, customerName, customerPhone, customerEmail, customerCity, customerAddress, items, paymentMethod, totalAmount } = payload

    if (!orderId || !items || items.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check if order already exists (prevent duplicates)
    const existing = await pool.query(
      'SELECT id FROM "Order" WHERE "websiteOrderId" = $1',
      [orderId]
    )

    if (existing.rows.length > 0) {
      console.log(`Order ${orderId} already synced, skipping`)
      return NextResponse.json({
        success: true,
        message: 'Order already exists',
        bosOrderId: existing.rows[0].id
      })
    }

    // Map website order items to BOS format and get products
    const orderItemsWithProducts = await Promise.all(
      items.map(async (item: any) => {
        // Get product details including cost price
        const productResult = await pool.query(
          'SELECT id, "costPrice" FROM "Product" WHERE id = $1',
          [item.productId]
        )

        if (productResult.rows.length === 0) {
          throw new Error(`Product ${item.productId} not found`)
        }

        const product = productResult.rows[0]

        return {
          productId: item.productId,
          quantity: item.quantity,
          price: item.price, // Use 'price' for calculateOrderTotals
          unitPrice: item.price,
          costPrice: product.costPrice || null,
          product: product,
        }
      })
    )

    // Generate order number
    const orderNumber = generateOrderNumber()

    // Estimate delivery cost based on city
    const estimatedDeliveryCost = estimateDeliveryCost(customerCity || '')

    // Calculate totals (items, deliveryFee, discount)
    const totals = calculateOrderTotals(orderItemsWithProducts, estimatedDeliveryCost, 0)

    // Prepare order object for completeness check
    const orderForCheck = {
      deliveryName: customerName,
      deliveryPhone: customerPhone,
      deliveryCity: customerCity,
      deliveryAddress: customerAddress,
      deliveryFeeCharged: 0,
      estimatedDeliveryCost: estimatedDeliveryCost,
      paymentMethod: paymentMethod || 'COD',
      sourceChannel: 'Website',
    }

    // Check data completeness (order, items, products)
    const completeness = checkOrderCompleteness(
      orderForCheck,
      orderItemsWithProducts,
      orderItemsWithProducts.map(i => i.product)
    )

    // Create order in BOS database
    const orderResult = await pool.query(
      `INSERT INTO "Order" (
        "orderNumber",
        "websiteOrderId",
        status,
        "sourceChannel",
        "deliveryName",
        "deliveryPhone",
        "deliveryCity",
        "deliveryAddress",
        "customerEmail",
        "paymentMethod",
        revenue,
        "totalCost",
        "estimatedProfit",
        "marginPercent",
        "deliveryFeeCharged",
        "estimatedDeliveryCost",
        "dataCompleteness",
        "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
      RETURNING id`,
      [
        orderNumber,
        orderId,
        'PENDING', // New website orders start as PENDING
        'Website',
        customerName,
        customerPhone,
        customerCity,
        customerAddress,
        customerEmail,
        paymentMethod || 'COD',
        totals.revenue,
        totals.estimatedCost,
        totals.estimatedProfit,
        totals.marginPercent,
        0, // Website orders have free delivery for customer
        estimatedDeliveryCost,
        completeness.score,
      ]
    )

    const bosOrderId = orderResult.rows[0].id

    // Insert order items
    for (const item of orderItemsWithProducts) {
      await pool.query(
        `INSERT INTO "OrderItem" (
          "orderId",
          "productId",
          quantity,
          "unitPrice",
          "costPrice"
        ) VALUES ($1, $2, $3, $4, $5)`,
        [bosOrderId, item.productId, item.quantity, item.unitPrice, item.costPrice]
      )
    }

    // Create initial status history
    await pool.query(
      `INSERT INTO "OrderStatusHistory" (
        "orderId",
        "oldStatus",
        "newStatus",
        note,
        "createdAt"
      ) VALUES ($1, $2, $3, $4, NOW())`,
      [bosOrderId, null, 'PENDING', 'Order synced from website']
    )

    console.log(`✅ Website order ${orderId} synced to BOS as order ${bosOrderId}`)

    return NextResponse.json({
      success: true,
      bosOrderId,
      orderNumber,
      message: 'Order synced successfully',
    })

  } catch (error: any) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      {
        error: 'Failed to sync order',
        details: error.message,
      },
      { status: 500 }
    )
  }
}
