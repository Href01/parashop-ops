import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

// GET /api/ops/products - Search products
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''

    let query = `
      SELECT
        id,
        name,
        brand,
        category,
        price,
        "costPrice",
        sku,
        image,
        stock,
        "lowStockThreshold"
      FROM "Product"
      WHERE 1=1
    `

    const params: any[] = []

    // Search by name, brand, or SKU
    if (search) {
      query += ` AND (
        LOWER(name) LIKE LOWER($1)
        OR LOWER(brand) LIKE LOWER($1)
        OR LOWER(sku) LIKE LOWER($1)
      )`
      params.push(`%${search}%`)
    }

    query += ` ORDER BY name ASC LIMIT 50`

    const result = await pool.query(query, params)

    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Get products error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}
