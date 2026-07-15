import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'
import { revalidateWebsite } from '@/lib/revalidate-website'

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
        COALESCE("virtualStock", 0) AS "virtualStock",
        "lowStockThreshold",
        supplier,
        COALESCE("importUnavailable", false) AS "importUnavailable",
        "importEtaWeeks"
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

    // Tasks linked to this product (connectivity → Work Hub)
    let tasks: any[] = []
    try {
      const t = await pool.query(
        `SELECT id, title, status, priority, owner, to_char("dueDate", 'YYYY-MM-DD') AS "dueDate"
         FROM "Task"
         WHERE "linkedType" = 'product' AND "linkedId" = $1
         ORDER BY CASE priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, "dueDate" NULLS LAST LIMIT 10`,
        [productId]
      )
      tasks = t.rows
    } catch {
      tasks = []
    }

    // Decisions linked to this product
    let decisions: any[] = []
    try {
      const d = await pool.query(
        `SELECT id, title, decision, owner, to_char("decisionDate", 'YYYY-MM-DD') AS "decisionDate"
         FROM "DecisionLog"
         WHERE "linkedType" = 'product' AND "linkedId" = $1
         ORDER BY "decisionDate" DESC NULLS LAST LIMIT 10`,
        [productId]
      )
      decisions = d.rows
    } catch {
      decisions = []
    }

    // Experiments linked to this product
    let experiments: any[] = []
    try {
      const e = await pool.query(
        `SELECT id, name, status, channel, "successMetric"
         FROM "GrowthExperiment"
         WHERE "productId" = $1
         ORDER BY CASE status WHEN 'RUNNING' THEN 0 WHEN 'PLANNED' THEN 1 ELSE 2 END LIMIT 10`,
        [productId]
      )
      experiments = e.rows
    } catch {
      experiments = []
    }

    return NextResponse.json({
      ...result.rows[0],
      recentOrders: recent.rows,
      sold: sold.rows[0],
      content,
      tasks,
      decisions,
      experiments,
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

    const { costPrice, lowStockThreshold, supplier, virtualStock, importUnavailable, importEtaWeeks } = body

    // Build update query dynamically
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1
    // Import-unavailable tag changes what the storefront shows → revalidate the site.
    let siteAffected = false

    if (costPrice !== undefined) {
      updates.push(`"costPrice" = $${paramIndex}`)
      values.push(costPrice)
      paramIndex++
    }

    // Supplier-backed sellable buffer. Never affects inventory valuation; does change
    // what the storefront lets customers order → revalidate the site below.
    let virtualStockChanged = false
    if (virtualStock !== undefined) {
      const v = Math.max(0, Math.trunc(Number(virtualStock)) || 0)
      updates.push(`"virtualStock" = $${paramIndex}`)
      values.push(v)
      paramIndex++
      virtualStockChanged = true
    }

    if (lowStockThreshold !== undefined) {
      updates.push(`"lowStockThreshold" = $${paramIndex}`)
      values.push(lowStockThreshold)
      paramIndex++
    }

    if (supplier !== undefined) {
      updates.push(`supplier = $${paramIndex}`)
      values.push(supplier)
      paramIndex++
    }

    // Temporarily-unavailable-due-to-import tag (drives the storefront notify block).
    if (importUnavailable !== undefined) {
      updates.push(`"importUnavailable" = $${paramIndex}`)
      values.push(importUnavailable === true)
      paramIndex++
      siteAffected = true
    }
    if (importEtaWeeks !== undefined) {
      const w = importEtaWeeks === null || importEtaWeeks === '' ? null : Math.max(1, Math.trunc(Number(importEtaWeeks)) || 0) || null
      updates.push(`"importEtaWeeks" = $${paramIndex}`)
      values.push(w)
      paramIndex++
      siteAffected = true
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

    // Changing the sellable buffer or the import tag must refresh the public site.
    if (virtualStockChanged || siteAffected) revalidateWebsite(['products']).catch(() => {})

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Update product error:', error)
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    )
  }
}
