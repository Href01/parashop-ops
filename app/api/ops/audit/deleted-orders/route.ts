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
    const limit = parseInt(searchParams.get('limit') || '50')
    const orderId = searchParams.get('orderId')

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
    if (orderId) {
      query += ` WHERE "orderId" = $1`
      params.push(parseInt(orderId))
    }

    query += ` ORDER BY "deletedAt" DESC LIMIT ${limit}`

    const result = await pool.query(query, params)

    // Parse orderData JSON
    const logs = result.rows.map((row: any) => ({
      ...row,
      orderData: typeof row.orderData === 'string' ? JSON.parse(row.orderData) : row.orderData
    }))

    return NextResponse.json({
      count: logs.length,
      deletedOrders: logs
    })
  } catch (error: any) {
    console.error('Audit log error:', error)
    return NextResponse.json({ error: 'Failed to fetch audit logs', details: error.message }, { status: 500 })
  }
}
