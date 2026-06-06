/**
 * Order Lifecycle Hooks
 *
 * Integrates orders with:
 * - Inventory (reduce stock, create movements, alerts)
 * - Customers (update metrics, RFM scores)
 * - Margins (calculate profit)
 */

import pool from '@/lib/db'

/**
 * Called when order status changes to CONFIRMED
 * Reduces stock and updates customer metrics
 */
export async function onOrderConfirmed(orderId: number) {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Get order details with items
    const orderResult = await client.query(`
      SELECT
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
      GROUP BY o.id
    `, [orderId])

    if (orderResult.rows.length === 0) {
      throw new Error(`Order ${orderId} not found`)
    }

    const order = orderResult.rows[0]
    const items = order.items || []

    console.log(`📦 Order #${orderId} confirmed - updating stock and customer metrics`)

    // ================================================================
    // PART 1: REDUCE STOCK & CREATE INVENTORY MOVEMENTS
    // ================================================================

    for (const item of items) {
      if (!item.productId) continue

      // Get current stock
      const productResult = await client.query(
        'SELECT stock, name, "reorderPoint", "trackInventory" FROM "Product" WHERE id = $1',
        [item.productId]
      )

      if (productResult.rows.length === 0) continue

      const product = productResult.rows[0]

      // Skip if inventory tracking disabled
      if (!product.trackInventory) continue

      const stockBefore = product.stock || 0
      const quantity = item.quantity || 0
      const stockAfter = Math.max(0, stockBefore - quantity)

      // Update stock
      await client.query(
        'UPDATE "Product" SET stock = $1 WHERE id = $2',
        [stockAfter, item.productId]
      )

      // Create inventory movement record
      await client.query(`
        INSERT INTO "InventoryMovement" (
          "productId",
          "type",
          "quantity",
          "stockBefore",
          "stockAfter",
          "reason",
          "orderId",
          "performedBy",
          "createdAt"
        ) VALUES ($1, 'Sale', $2, $3, $4, $5, $6, 'system', NOW())
      `, [
        item.productId,
        -quantity, // Negative for sale
        stockBefore,
        stockAfter,
        `Order #${orderId} - ${item.productName}`,
        orderId,
      ])

      // Update stock status
      const reorderPoint = product.reorderPoint || 10
      let stockStatus = 'In stock'
      if (stockAfter === 0) {
        stockStatus = 'Out of stock'
      } else if (stockAfter <= reorderPoint) {
        stockStatus = 'Low stock'
      }

      await client.query(
        'UPDATE "Product" SET "stockStatus" = $1 WHERE id = $2',
        [stockStatus, item.productId]
      )

      // Create stock alert if needed
      if (stockStatus !== 'In stock') {
        // Check if alert already exists
        const existingAlert = await client.query(
          `SELECT id FROM "StockAlert"
           WHERE "productId" = $1
             AND "type" = $2
             AND acknowledged = false
             AND "resolvedAt" IS NULL`,
          [item.productId, stockStatus]
        )

        if (existingAlert.rows.length === 0) {
          const severity = stockAfter === 0 ? 'critical' : 'warning'

          await client.query(`
            INSERT INTO "StockAlert" (
              "productId",
              "type",
              "currentStock",
              "threshold",
              "message",
              "severity",
              "createdAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          `, [
            item.productId,
            stockStatus,
            stockAfter,
            reorderPoint,
            `${product.name} is ${stockStatus.toLowerCase()} (${stockAfter} units remaining)`,
            severity,
          ])

          console.log(`⚠️  Created ${severity} alert for ${product.name} (${stockAfter} units)`)
        }
      }

      console.log(`✅ ${item.productName}: ${stockBefore} → ${stockAfter} units`)
    }

    // ================================================================
    // PART 2: UPDATE CUSTOMER METRICS (PHONE-BASED)
    // ================================================================

    const phone = order.deliveryPhone

    if (phone) {
      // Find or create customer based on phone number
      // First, try to find existing user with this phone
      let customerResult = await client.query(
        'SELECT id FROM "User" WHERE phone = $1',
        [phone]
      )

      let customerId: number | null = null

      if (customerResult.rows.length > 0) {
        customerId = customerResult.rows[0].id
      } else if (order.userId) {
        // Use the userId from the order
        customerId = order.userId
      }

      if (customerId) {
        // Calculate customer metrics from ALL their orders
        const metricsResult = await client.query(`
          SELECT
            COUNT(*) FILTER (WHERE status IN ('CONFIRMED', 'DELIVERED')) as "ordersCount",
            SUM(total) FILTER (WHERE status IN ('CONFIRMED', 'DELIVERED')) as "lifetimeValue",
            AVG(total) FILTER (WHERE status IN ('CONFIRMED', 'DELIVERED')) as "avgOrderValue",
            MAX("createdAt") FILTER (WHERE status IN ('CONFIRMED', 'DELIVERED')) as "lastOrderDate"
          FROM "Order"
          WHERE "deliveryPhone" = $1
            OR "userId" = $2
        `, [phone, customerId])

        const metrics = metricsResult.rows[0]
        const ordersCount = parseInt(metrics.ordersCount) || 0
        const lifetimeValue = parseFloat(metrics.lifetimeValue) || 0
        const avgOrderValue = parseFloat(metrics.avgOrderValue) || 0
        const lastOrderDate = metrics.lastOrderDate

        // Calculate days since last order
        let daysSinceLastOrder = 0
        if (lastOrderDate) {
          const diffTime = Date.now() - new Date(lastOrderDate).getTime()
          daysSinceLastOrder = Math.floor(diffTime / (1000 * 60 * 60 * 24))
        }

        // Update customer metrics
        await client.query(`
          UPDATE "User"
          SET
            "ordersCount" = $1,
            "lifetimeValue" = $2,
            "averageOrderValue" = $3,
            "lastOrderDate" = $4,
            "daysSinceLastOrder" = $5
          WHERE id = $6
        `, [
          ordersCount,
          lifetimeValue,
          avgOrderValue,
          lastOrderDate,
          daysSinceLastOrder,
          customerId,
        ])

        // Log customer activity
        await client.query(`
          INSERT INTO "CustomerActivity" (
            "userId",
            "type",
            "action",
            "description",
            "metadata",
            "createdAt"
          ) VALUES ($1, 'Order', 'Confirmed', $2, $3, NOW())
        `, [
          customerId,
          `Order #${orderId} confirmed - ${order.total} MAD`,
          JSON.stringify({
            orderId,
            total: order.total,
            itemsCount: items.length,
          }),
        ])

        console.log(`👤 Updated customer metrics: ${ordersCount} orders, ${lifetimeValue.toFixed(0)} MAD LTV`)
      }
    }

    // ================================================================
    // PART 3: UPDATE CAMPAIGN METRICS (if order attributed to campaign)
    // ================================================================

    if (order.campaignId) {
      try {
        console.log(`📊 Order attributed to campaign ${order.campaignId}, recalculating metrics...`)
        await client.query('SELECT calculate_campaign_metrics($1)', [order.campaignId])
        console.log(`✅ Campaign ${order.campaignId} metrics updated`)
      } catch (error) {
        console.error(`❌ Failed to update campaign metrics:`, error)
        // Non-blocking - continue
      }
    }

    // ================================================================
    // PART 4: UPDATE EVENT METRICS (if order during event period)
    // ================================================================

    if (order.eventId) {
      try {
        console.log(`🎉 Order during event ${order.eventId}, recalculating impact...`)
        await client.query('SELECT calculate_event_metrics($1)', [order.eventId])
        console.log(`✅ Event ${order.eventId} metrics updated`)
      } catch (error) {
        console.error(`❌ Failed to update event metrics:`, error)
        // Non-blocking - continue
      }
    }

    await client.query('COMMIT')
    console.log(`✅ Order #${orderId} integration complete`)


  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`❌ Order integration failed:`, error)
    throw error
  } finally {
    client.release()
  }
}

/**
 * Calculate and update product margins
 * Called when product price or cost changes
 */
export async function updateProductMargin(productId: number) {
  try {
    const result = await pool.query(
      'SELECT price, "costPrice" FROM "Product" WHERE id = $1',
      [productId]
    )

    if (result.rows.length === 0) return

    const { price, costPrice } = result.rows[0]

    if (!price || !costPrice) return

    const sellingPrice = parseFloat(price)
    const cost = parseFloat(costPrice)

    // Margin = ((Selling - Cost) / Selling) * 100
    const marginPercent = ((sellingPrice - cost) / sellingPrice) * 100

    await pool.query(
      'UPDATE "Product" SET "profitMargin" = $1 WHERE id = $2',
      [marginPercent.toFixed(2), productId]
    )

    console.log(`💰 Product #${productId} margin: ${marginPercent.toFixed(1)}%`)

  } catch (error) {
    console.error('Failed to update margin:', error)
  }
}

/**
 * Calculate stock metrics for a product
 * - Weekly sales (last 7 days)
 * - Days of stock left
 */
export async function updateStockMetrics(productId: number) {
  try {
    // Calculate weekly sales from order items
    const salesResult = await pool.query(`
      SELECT
        COALESCE(SUM(oi.quantity), 0) as "weeklySales"
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      WHERE oi."productId" = $1
        AND o.status IN ('CONFIRMED', 'DELIVERED')
        AND o."createdAt" >= NOW() - INTERVAL '7 days'
    `, [productId])

    const weeklySales = parseInt(salesResult.rows[0]?.weeklySales) || 0
    const dailySales = weeklySales / 7

    // Get current stock
    const productResult = await pool.query(
      'SELECT stock FROM "Product" WHERE id = $1',
      [productId]
    )

    if (productResult.rows.length === 0) return

    const stock = productResult.rows[0].stock || 0

    // Calculate days of stock left
    let daysOfStockLeft = null
    if (dailySales > 0) {
      daysOfStockLeft = Math.floor(stock / dailySales)
    }

    // Update metrics
    await pool.query(
      `UPDATE "Product"
       SET "weeklySales" = $1, "daysOfStockLeft" = $2
       WHERE id = $3`,
      [weeklySales, daysOfStockLeft, productId]
    )

    console.log(`📊 Product #${productId}: ${weeklySales} weekly sales, ${daysOfStockLeft || '∞'} days left`)

  } catch (error) {
    console.error('Failed to update stock metrics:', error)
  }
}
