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
    const missingCost = searchParams.get('missingCost') === 'true'
    const category = searchParams.get('category')

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
    let paramIndex = 1

    // Filter: Missing cost price
    if (missingCost) {
      query += ` AND ("costPrice" IS NULL OR "costPrice" = 0)`
    }

    // Filter: Category
    if (category) {
      query += ` AND category = $${paramIndex}`
      params.push(category)
      paramIndex++
    }

    // Search by name, brand, or SKU
    if (search) {
      query += ` AND (
        LOWER(name) LIKE LOWER($${paramIndex})
        OR LOWER(brand) LIKE LOWER($${paramIndex})
        OR LOWER(sku) LIKE LOWER($${paramIndex})
      )`
      params.push(`%${search}%`)
      paramIndex++
    }

    query += ` ORDER BY name ASC LIMIT 100`

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
