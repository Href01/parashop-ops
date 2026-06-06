import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * GET /api/ops/inventory/alerts
 * Get all stock alerts
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const acknowledged = searchParams.get('acknowledged')
    const severity = searchParams.get('severity')

    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (acknowledged !== null) {
      conditions.push(`sa.acknowledged = $${paramIndex}`)
      params.push(acknowledged === 'true')
      paramIndex++
    }

    if (severity) {
      conditions.push(`sa.severity = $${paramIndex}`)
      params.push(severity)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await pool.query(`
      SELECT
        sa.*,
        p.name as "productName",
        p.brand as "productBrand",
        p.image as "productImage",
        p.supplier,
        p."reorderQuantity"
      FROM "StockAlert" sa
      LEFT JOIN "Product" p ON p.id = sa."productId"
      ${whereClause}
      ORDER BY
        sa.acknowledged ASC,
        CASE sa.severity
          WHEN 'critical' THEN 1
          WHEN 'warning' THEN 2
          WHEN 'info' THEN 3
        END,
        sa."createdAt" DESC
    `, params)

    return NextResponse.json({
      alerts: result.rows,
      total: result.rows.length,
    })

  } catch (error: any) {
    console.error('GET alerts error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch alerts', details: error.message },
      { status: 500 }
    )
  }
}
