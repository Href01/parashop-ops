import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * POST /api/ops/inventory/alerts/[id]/acknowledge
 * Acknowledge a stock alert
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: alertId } = await params

    const result = await pool.query(`
      UPDATE "StockAlert"
      SET
        acknowledged = true,
        "acknowledgedBy" = $1,
        "acknowledgedAt" = NOW()
      WHERE id = $2
      RETURNING *
    `, [session.user.email, alertId])

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      alert: result.rows[0],
    })

  } catch (error: any) {
    console.error('Acknowledge alert error:', error)
    return NextResponse.json(
      { error: 'Failed to acknowledge alert', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/ops/inventory/alerts/[id]
 * Delete/resolve a stock alert
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: alertId } = await params

    const result = await pool.query(`
      UPDATE "StockAlert"
      SET "resolvedAt" = NOW()
      WHERE id = $1
      RETURNING *
    `, [alertId])

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      alert: result.rows[0],
    })

  } catch (error: any) {
    console.error('Resolve alert error:', error)
    return NextResponse.json(
      { error: 'Failed to resolve alert', details: error.message },
      { status: 500 }
    )
  }
}
