import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

// GET /api/ops/products/[id] - Get product details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: productId } = await params

    const result = await pool.query(
      `SELECT
        id,
        name,
        brand,
        category,
        price,
        "costPrice",
        sku,
        image,
        description,
        stock,
        "lowStockThreshold"
      FROM "Product"
      WHERE id = $1`,
      [productId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Recent orders containing this product (connectivity → who bought it)
    const recent = await pool.query(
      `SELECT o.id, o.status, o."createdAt", o."deliveryCity", o."sourceChannel",
              oi.quantity, oi.price
       FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
       WHERE oi."productId" = $1
       ORDER BY o."createdAt" DESC LIMIT 15`,
      [productId]
    )
    const sold = await pool.query(
      `SELECT COALESCE(SUM(oi.quantity),0)::int AS units,
              COALESCE(SUM(oi.quantity * oi.price) FILTER (WHERE o.status = 'DELIVERED'),0)::float AS revenue
       FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
       WHERE oi."productId" = $1 AND o.status <> 'CANCELLED'`,
      [productId]
    )

    // Content that promotes this product (connectivity → Content Hub)
    let content: any[] = []
    try {
      const c = await pool.query(
        `SELECT id, title, platform, type, status, to_char("dueDate", 'YYYY-MM-DD') AS "dueDate"
         FROM "ContentItem"
         WHERE "productId" = $1 OR $1 = ANY("productIds")
         ORDER BY "dueDate" NULLS LAST, "createdAt" DESC LIMIT 20`,
        [productId]
      )
      content = c.rows
    } catch {
      content = [] // ContentItem table may not exist in some envs
    }

    return NextResponse.json({
      ...result.rows[0],
      recentOrders: recent.rows,
      sold: sold.rows[0],
      content,
    })
  } catch (error) {
    console.error('Get product error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch product' },
      { status: 500 }
    )
  }
}

// PUT /api/ops/products/[id] - Update product (mainly cost price)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: productId } = await params
    const body = await request.json()

    const { costPrice, lowStockThreshold } = body

    // Build update query dynamically
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (costPrice !== undefined) {
      updates.push(`"costPrice" = $${paramIndex}`)
      values.push(costPrice)
      paramIndex++
    }

    if (lowStockThreshold !== undefined) {
      updates.push(`"lowStockThreshold" = $${paramIndex}`)
      values.push(lowStockThreshold)
      paramIndex++
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    updates.push(`"updatedAt" = NOW()`)
    values.push(productId)

    const query = `
      UPDATE "Product"
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `

    const result = await pool.query(query, values)

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Update product error:', error)
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    )
  }
}
