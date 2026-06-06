import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { updateProductMargin, updateStockMetrics } from '@/lib/integrations/order-hooks'
import pool from '@/lib/db'

/**
 * POST /api/ops/utils/update-metrics
 * Batch update product margins and stock metrics for all products
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'all' // 'margins', 'stock', or 'all'

    console.log(`🔄 Batch metrics update triggered by ${session.user.email} (type: ${type})`)

    // Get all products
    const productsResult = await pool.query(
      'SELECT id FROM "Product"'
    )

    const products = productsResult.rows
    let marginsUpdated = 0
    let stockMetricsUpdated = 0

    for (const product of products) {
      try {
        if (type === 'margins' || type === 'all') {
          await updateProductMargin(product.id)
          marginsUpdated++
        }

        if (type === 'stock' || type === 'all') {
          await updateStockMetrics(product.id)
          stockMetricsUpdated++
        }
      } catch (error) {
        console.error(`Failed to update product ${product.id}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Metrics updated: ${marginsUpdated} margins, ${stockMetricsUpdated} stock metrics`,
      marginsUpdated,
      stockMetricsUpdated,
      totalProducts: products.length,
    })

  } catch (error: any) {
    console.error('Batch metrics update error:', error)
    return NextResponse.json(
      { error: 'Failed to update metrics', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/ops/utils/update-metrics?productId=X&type=margins
 * Update metrics for a specific product
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId')
    const type = searchParams.get('type') || 'all' // 'margins', 'stock', or 'all'

    if (!productId) {
      return NextResponse.json({ error: 'productId required' }, { status: 400 })
    }

    const id = parseInt(productId)

    if (type === 'margins' || type === 'all') {
      await updateProductMargin(id)
    }

    if (type === 'stock' || type === 'all') {
      await updateStockMetrics(id)
    }

    // Get updated product data
    const productResult = await pool.query(
      `SELECT
        id, name, price, "costPrice", "profitMargin",
        stock, "weeklySales", "daysOfStockLeft"
      FROM "Product"
      WHERE id = $1`,
      [id]
    )

    if (productResult.rows.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      product: productResult.rows[0],
    })

  } catch (error: any) {
    console.error('Update metrics error:', error)
    return NextResponse.json(
      { error: 'Failed to update metrics', details: error.message },
      { status: 500 }
    )
  }
}
