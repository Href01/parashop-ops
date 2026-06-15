import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * Vercel Cron: Compute product metrics from order data
 * Runs daily to update weeklySales, daysOfStockLeft, profitMargin
 *
 * Add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/compute-metrics",
 *     "schedule": "0 2 * * *"
 *   }]
 * }
 */
export async function GET(req: Request) {
  try {
    // Verify cron secret (Vercel sets this header)
    const authHeader = req.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Cron] Computing product metrics from order data...')

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
    `)

    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE "weeklySales" > 0) as products_with_sales,
        COUNT(*) FILTER (WHERE "daysOfStockLeft" IS NOT NULL AND "daysOfStockLeft" <= 14) as running_out_soon,
        COUNT(*) FILTER (WHERE "daysOfStockLeft" IS NOT NULL AND "daysOfStockLeft" <= 7) as critical
      FROM "Product"
      WHERE "trackInventory" = true
    `)

    console.log(`[Cron] Updated ${result.rowCount} products`)
    console.log(`[Cron] Stats:`, stats.rows[0])

    return NextResponse.json({
      ok: true,
      updated: result.rowCount,
      stats: stats.rows[0],
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[Cron] Error:', error)
    return NextResponse.json(
      { error: 'Failed to compute metrics', details: error.message },
      { status: 500 }
    )
  }
}
