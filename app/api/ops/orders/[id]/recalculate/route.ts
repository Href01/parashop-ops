import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

// POST /api/ops/orders/[id]/recalculate - Recalculate order total
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orderId } = await params

    // Get order
    const orderResult = await pool.query(
      `SELECT
        id,
        "productsTotal",
        "discountTotal",
        "deliveryFeeCharged",
        total,
        revenue
      FROM "Order"
      WHERE id = $1`,
      [orderId]
    )

    if (orderResult.rows.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const order = orderResult.rows[0]

    // Convert to numbers (prevent string concatenation)
    const productsTotal = Number(order.productsTotal) || 0
    const discountTotal = Number(order.discountTotal) || 0
    const deliveryFee = Number(order.deliveryFeeCharged) || 0

    // Recalculate
    const correctRevenue = productsTotal - discountTotal
    const correctTotal = correctRevenue + deliveryFee

    console.log('💰 Recalculating order', orderId, {
      productsTotal,
      discountTotal,
      deliveryFee,
      oldRevenue: order.revenue,
      oldTotal: order.total,
      newRevenue: correctRevenue,
      newTotal: correctTotal,
      fixed: order.total !== correctTotal
    })

    if (order.total === correctTotal) {
      return NextResponse.json({
        message: 'Total already correct',
        calculation: {
          productsTotal,
          discountTotal,
          deliveryFee,
          revenue: correctRevenue,
          total: correctTotal
        }
      })
    }

    // Update order
    await pool.query(
      `UPDATE "Order"
       SET revenue = $1,
           total = $2
       WHERE id = $3`,
      [correctRevenue, correctTotal, orderId]
    )

    // Add history note
    await pool.query(
      `INSERT INTO "OrderStatusHistory" (
        "orderId", "oldStatus", "newStatus", "source", "note", "createdAt"
      ) VALUES ($1, (SELECT status FROM "Order" WHERE id = $1), (SELECT status FROM "Order" WHERE id = $1), 'system', $2, NOW())`,
      [orderId, `Total recalculated: ${order.total} → ${correctTotal} MAD (fixed string concatenation bug)`]
    )

    return NextResponse.json({
      message: 'Total recalculated successfully',
      before: {
        revenue: order.revenue,
        total: order.total
      },
      after: {
        revenue: correctRevenue,
        total: correctTotal
      },
      calculation: {
        productsTotal,
        discountTotal,
        deliveryFee
      }
    })
  } catch (error: any) {
    console.error('Recalculate total error:', error)
    return NextResponse.json(
      { error: 'Failed to recalculate total', details: error.message },
      { status: 500 }
    )
  }
}
