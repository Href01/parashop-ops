import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * POST /api/ops/inventory/movement
 * Record a stock movement (purchase, sale, adjustment, return, damage)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      productId,
      type, // Purchase, Sale, Adjustment, Return, Damage, Transfer
      quantity, // Positive for additions, negative for reductions
      reason,
      orderId,
      supplierId,
      costPerUnit,
      supplier, // free-text supplier name (products use a text supplier field)
      notes,
    } = body

    // Validation
    if (!productId || !type || !quantity) {
      return NextResponse.json(
        { error: 'Missing required fields: productId, type, quantity' },
        { status: 400 }
      )
    }

    const validTypes = ['Purchase', 'Sale', 'Adjustment', 'Return', 'Damage', 'Transfer']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 })
    }

    // Get current stock
    const productResult = await pool.query(
      'SELECT stock, name FROM "Product" WHERE id = $1',
      [productId]
    )

    if (productResult.rows.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const stockBefore = productResult.rows[0].stock || 0
    const productName = productResult.rows[0].name
    const stockAfter = stockBefore + parseInt(quantity)

    if (stockAfter < 0) {
      return NextResponse.json(
        { error: `Insufficient stock. Current: ${stockBefore}, Requested: ${Math.abs(quantity)}` },
        { status: 400 }
      )
    }

    // Calculate total cost
    const totalCost = costPerUnit ? parseFloat(costPerUnit) * Math.abs(parseInt(quantity)) : null

    // Create movement record
    const movementResult = await pool.query(`
      INSERT INTO "InventoryMovement" (
        "productId",
        "type",
        "quantity",
        "stockBefore",
        "stockAfter",
        "reason",
        "orderId",
        "supplierId",
        "costPerUnit",
        "totalCost",
        "performedBy",
        "notes",
        "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *
    `, [
      productId,
      type,
      quantity,
      stockBefore,
      stockAfter,
      reason || null,
      orderId || null,
      supplierId || null,
      costPerUnit || null,
      totalCost,
      session.user.email,
      notes || null,
    ])

    // Update product stock
    await pool.query(
      'UPDATE "Product" SET stock = $1 WHERE id = $2',
      [stockAfter, productId]
    )

    // A supplier purchase keeps the product's cost, supplier and restock date fresh.
    // Cost uses the WEIGHTED AVERAGE (CMP): blend the existing stock's cost with
    // the newly-purchased units, so margin reflects the real mixed cost of what's
    // on hand and doesn't jump when the purchase price changes. The InventoryMovement
    // above still stores the ACTUAL purchase cost (costPerUnit) for the spend report.
    if (type === 'Purchase') {
      let newCost: number | null = null
      if (costPerUnit) {
        const buyCost = parseFloat(costPerUnit)
        const buyQty = Math.abs(parseInt(quantity))
        const oldRes = await pool.query('SELECT "costPrice"::float AS c FROM "Product" WHERE id = $1', [productId])
        const oldCost = oldRes.rows[0]?.c
        // No prior cost or no prior stock → the purchase cost becomes the cost.
        if (oldCost == null || stockBefore <= 0) {
          newCost = buyCost
        } else {
          newCost = (stockBefore * oldCost + buyQty * buyCost) / (stockBefore + buyQty)
        }
        newCost = Math.round(newCost * 100) / 100
      }
      await pool.query(
        `UPDATE "Product" SET
           "costPrice" = COALESCE($1, "costPrice"),
           supplier = COALESCE(NULLIF($2, ''), supplier),
           "lastRestockDate" = NOW()
         WHERE id = $3`,
        [newCost, supplier ?? null, productId]
      )
    }

    // Update stock status
    const reorderPoint = await pool.query(
      'SELECT "reorderPoint" FROM "Product" WHERE id = $1',
      [productId]
    )
    const reorderThreshold = reorderPoint.rows[0]?.reorderPoint || 10

    let stockStatus = 'In stock'
    if (stockAfter === 0) {
      stockStatus = 'Out of stock'
    } else if (stockAfter <= reorderThreshold) {
      stockStatus = 'Low stock'
    }

    await pool.query(
      'UPDATE "Product" SET "stockStatus" = $1 WHERE id = $2',
      [stockStatus, productId]
    )

    // Create alert if low/out of stock
    if (stockStatus !== 'In stock') {
      const existingAlert = await pool.query(
        `SELECT id FROM "StockAlert"
         WHERE "productId" = $1
           AND "type" = $2
           AND acknowledged = false`,
        [productId, stockStatus]
      )

      if (existingAlert.rows.length === 0) {
        await pool.query(`
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
          productId,
          stockStatus,
          stockAfter,
          reorderThreshold,
          `${productName} is ${stockStatus.toLowerCase()} (${stockAfter} units)`,
          stockAfter === 0 ? 'critical' : 'warning',
        ])
      }
    }

    return NextResponse.json({
      success: true,
      movement: movementResult.rows[0],
      stockBefore,
      stockAfter,
      stockStatus,
    })

  } catch (error: any) {
    console.error('POST inventory movement error:', error)
    return NextResponse.json(
      { error: 'Failed to record movement', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/ops/inventory/movement
 * Get stock movement history
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId')
    const type = searchParams.get('type')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)

    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (productId) {
      conditions.push(`im."productId" = $${paramIndex}`)
      params.push(productId)
      paramIndex++
    }

    if (type) {
      conditions.push(`im."type" = $${paramIndex}`)
      params.push(type)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await pool.query(`
      SELECT
        im.*,
        p.name as "productName",
        p.brand as "productBrand"
      FROM "InventoryMovement" im
      LEFT JOIN "Product" p ON p.id = im."productId"
      ${whereClause}
      ORDER BY im."createdAt" DESC
      LIMIT $${paramIndex}
    `, [...params, limit])

    return NextResponse.json({
      movements: result.rows,
    })

  } catch (error: any) {
    console.error('GET movements error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch movements', details: error.message },
      { status: 500 }
    )
  }
}
