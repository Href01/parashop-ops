import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

// GET /api/products - List all products
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const parsedLimit = Number.parseInt(searchParams.get('limit') || '100', 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(1000, Math.max(1, parsedLimit)) : 100
    const search = searchParams.get('search') || ''

    let query = `
      WITH demand AS (
        SELECT oi."productId" AS id,
               COALESCE(SUM(oi.quantity), 0)::int AS committed
        FROM "OrderItem" oi
        JOIN "Order" o ON o.id = oi."orderId"
        WHERE o.status IN ('PENDING', 'CONFIRMED')
          AND o."senditTrackingId" IS NULL
        GROUP BY oi."productId"
      )
      SELECT
        p.id,
        p.name,
        p.brand,
        p.price,
        p."costPrice",
        p.sku,
        p.image,
        p.stock,
        p."trackInventory",
        COALESCE(p."importUnavailable", false) AS "importUnavailable",
        CASE
          WHEN COALESCE(p."trackInventory", true) THEN p.stock - COALESCE(d.committed, 0)
          ELSE p.stock
        END::int AS available,
        p.active
      FROM "Product" p
      LEFT JOIN demand d ON d.id = p.id
      WHERE p.active = true
    `

    const params: unknown[] = []

    if (search) {
      query += ` AND (p.name ILIKE $1 OR p.brand ILIKE $1 OR p.sku ILIKE $1)`
      params.push(`%${search}%`)
    }

    params.push(limit)
    query += ` ORDER BY p.name ASC LIMIT $${params.length}`

    const result = await pool.query(query, params)

    return NextResponse.json(result.rows)
  } catch (error: unknown) {
    console.error('Products list error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
