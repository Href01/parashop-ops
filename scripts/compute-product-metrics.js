/**
 * Compute product metrics from actual order data
 * - weeklySales: units sold in last 7 days
 * - monthlyRevenue: revenue from last 30 days
 * - profitMargin: average margin %
 * - daysOfStockLeft: stock / (weeklySales / 7)
 *
 * Run: node scripts/compute-product-metrics.js
 */

require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function computeMetrics() {
  console.log('🔄 Computing product metrics from order data...\n')

  try {
    // Compute metrics for all products with trackInventory = true
    const result = await pool.query(`
      WITH product_sales AS (
        SELECT
          oi."productId",
          -- Weekly sales (units sold in last 7 days)
          COALESCE(SUM(oi.quantity) FILTER (
            WHERE o."createdAt" >= NOW() - INTERVAL '7 days'
              AND o.status IN ('CONFIRMED', 'DELIVERED')
          ), 0) AS units_7d,
          -- Monthly revenue (last 30 days)
          COALESCE(SUM(oi.price * oi.quantity) FILTER (
            WHERE o."createdAt" >= NOW() - INTERVAL '30 days'
              AND o.status IN ('CONFIRMED', 'DELIVERED')
          ), 0) AS revenue_30d,
          -- Average profit margin (all time, where we have cost data)
          AVG(
            CASE
              WHEN COALESCE(oi."unitCost", p."costPrice") IS NOT NULL
                AND COALESCE(oi."unitCost", p."costPrice") > 0
                AND oi.price > 0
              THEN ((oi.price - COALESCE(oi."unitCost", p."costPrice")) / oi.price) * 100
              ELSE NULL
            END
          ) AS avg_margin
        FROM "OrderItem" oi
        INNER JOIN "Order" o ON o.id = oi."orderId"
        LEFT JOIN "Product" p ON p.id = oi."productId"
        WHERE o.status IN ('CONFIRMED', 'DELIVERED')
        GROUP BY oi."productId"
      )
      UPDATE "Product" p
      SET
        "weeklySales" = ps.units_7d,
        "monthlyRevenue" = ps.revenue_30d,
        "profitMargin" = ROUND(ps.avg_margin::numeric, 1),
        "daysOfStockLeft" = CASE
          WHEN ps.units_7d > 0 THEN ROUND((p.stock::numeric / (ps.units_7d::numeric / 7))::numeric, 0)::int
          ELSE NULL
        END
      FROM product_sales ps
      WHERE p.id = ps."productId" AND p."trackInventory" = true
      RETURNING p.id, p.name, p.stock, p."weeklySales", p."daysOfStockLeft"
    `)

    console.log(`✅ Updated ${result.rowCount} products\n`)

    if (result.rows.length > 0) {
      console.log('Sample results:')
      result.rows.slice(0, 5).forEach(p => {
        console.log(`  ${p.name}:`)
        console.log(`    Stock: ${p.stock}, Weekly sales: ${p.weeklySales || 0}, Days left: ${p.daysOfStockLeft || '∞'}`)
      })
    }

    // Show summary stats
    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE "weeklySales" > 0) as products_with_sales,
        COUNT(*) FILTER (WHERE "daysOfStockLeft" IS NOT NULL AND "daysOfStockLeft" <= 14) as running_out_soon,
        COUNT(*) FILTER (WHERE "daysOfStockLeft" IS NOT NULL AND "daysOfStockLeft" <= 7) as critical,
        COUNT(*) as total
      FROM "Product"
      WHERE "trackInventory" = true
    `)

    console.log('\n📊 Summary:')
    const s = stats.rows[0]
    console.log(`  Total tracked: ${s.total}`)
    console.log(`  With recent sales: ${s.products_with_sales}`)
    console.log(`  Running out soon (≤14d): ${s.running_out_soon}`)
    console.log(`  Critical (≤7d): ${s.critical}`)

  } catch (error) {
    console.error('❌ Error:', error.message)
    throw error
  } finally {
    await pool.end()
  }
}

computeMetrics()
  .then(() => {
    console.log('\n✅ Done! Product metrics updated from real order data.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error)
    process.exit(1)
  })
