import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * GET /api/ops/inventory
 * Get all products with stock levels and alerts
 * Query params:
 *   - status: Filter by stockStatus (In stock, Low stock, Out of stock)
 *   - search: Search by product name or SKU
 *   - supplier: Filter by supplier
 *   - sort: Sort by (stock, daysOfStockLeft, weeklySales, name)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const supplier = searchParams.get('supplier')
    const sort = searchParams.get('sort') || 'stock'

    // Build WHERE clauses
    const conditions: string[] = ['p."trackInventory" = true']
    const params: any[] = []
    let paramIndex = 1

    if (status) {
      conditions.push(`p."stockStatus" = $${paramIndex}`)
      params.push(status)
      paramIndex++
    }

    if (search) {
      conditions.push(`(
        LOWER(p.name) LIKE LOWER($${paramIndex})
        OR LOWER(p.brand) LIKE LOWER($${paramIndex})
        OR p."supplierSKU" LIKE $${paramIndex}
      )`)
      params.push(`%${search}%`)
      paramIndex++
    }

    if (supplier) {
      conditions.push(`p.supplier = $${paramIndex}`)
      params.push(supplier)
      paramIndex++
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`

    // Valid sort columns
    const validSorts = ['stock', 'daysOfStockLeft', 'weeklySales', 'name', 'profitMargin']
    const sortColumn = validSorts.includes(sort) ? `p."${sort}"` : 'p.stock'

    // Get products with stock info
    const result = await pool.query(`
      SELECT
        p.id,
        p.name,
        p.brand,
        p.price,
        p.image,
        p.stock,
        p."reorderPoint",
        p."reorderQuantity",
        p."stockStatus",
        p.supplier,
        p."supplierSKU",
        p."lastRestockDate",
        p."costPrice",
        p."weeklySales",
        p."monthlyRevenue",
        p."profitMargin",
        p."daysOfStockLeft",
        (
          SELECT COUNT(*)
          FROM "StockAlert" sa
          WHERE sa."productId" = p.id
            AND sa.acknowledged = false
        ) as "activeAlerts"
      FROM "Product" p
      ${whereClause}
      ORDER BY ${sortColumn} ASC
      LIMIT 200
    `, params)

    // Get summary stats
    const stats = await pool.query(`
      SELECT
        COUNT(*) as "totalProducts",
        SUM(stock) as "totalStock",
        COUNT(*) FILTER (WHERE "stockStatus" = 'Low stock') as "lowStockCount",
        COUNT(*) FILTER (WHERE "stockStatus" = 'Out of stock') as "outOfStockCount",
        COUNT(*) FILTER (WHERE stock <= "reorderPoint") as "needReorderCount"
      FROM "Product"
      WHERE "trackInventory" = true
    `)

    return NextResponse.json({
      products: result.rows,
      stats: stats.rows[0],
    })

  } catch (error: any) {
    console.error('GET inventory error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inventory', details: error.message },
      { status: 500 }
    )
  }
}
