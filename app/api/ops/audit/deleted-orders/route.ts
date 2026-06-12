import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

// GET /api/ops/audit/deleted-orders
// View all deleted orders with full data
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    // Validate + clamp limit; parameterize it (NaN/unbounded interpolation removed).
    const rawLimit = Number(searchParams.get('limit'))
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 50

    // Only filter by orderId when it parses to a valid integer.
    const rawOrderId = searchParams.get('orderId')
    const orderId = rawOrderId !== null ? Number(rawOrderId) : null
    const hasOrderId = orderId !== null && Number.isInteger(orderId)
    if (rawOrderId !== null && !hasOrderId) {
      return NextResponse.json({ error: 'orderId must be an integer' }, { status: 400 })
    }

    let query = `
      SELECT
        id,
        "orderId",
        "orderData",
        "deletedBy",
        "deletedAt",
        "reason",
        "source",
        "ipAddress"
      FROM "OrderAuditLog"
    `

    const params: any[] = []
    if (hasOrderId) {
      params.push(orderId)
      query += ` WHERE "orderId" = $${params.length}`
    }

    params.push(limit)
    query += ` ORDER BY "deletedAt" DESC LIMIT $${params.length}`

    const result = await pool.query(query, params)

    // Parse orderData JSON defensively — a malformed row must not 500 the whole list.
    const logs = result.rows.map((row: any) => {
      let orderData = row.orderData
      if (typeof orderData === 'string') {
        try { orderData = JSON.parse(orderData) } catch { /* keep raw string */ }
      }
      return { ...row, orderData }
    })

    return NextResponse.json({
      count: logs.length,
      deletedOrders: logs
    })
  } catch (error: any) {
    console.error('Audit log error:', error)
    return NextResponse.json({ error: 'Failed to fetch audit logs', details: error.message }, { status: 500 })
  }
}
