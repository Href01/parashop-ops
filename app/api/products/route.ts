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
    const limit = parseInt(searchParams.get('limit') || '100')
    const search = searchParams.get('search') || ''

    let query = `
      SELECT
        id,
        name,
        brand,
        price,
        "costPrice",
        sku,
        active
      FROM "Product"
      WHERE active = true
    `

    const params: any[] = []

    if (search) {
      query += ` AND (name ILIKE $1 OR brand ILIKE $1 OR sku ILIKE $1)`
      params.push(`%${search}%`)
    }

    query += ` ORDER BY name ASC LIMIT ${limit}`

    const result = await pool.query(query, params)

    return NextResponse.json(result.rows)
  } catch (error: any) {
    console.error('Products list error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products', details: error.message },
      { status: 500 }
    )
  }
}
