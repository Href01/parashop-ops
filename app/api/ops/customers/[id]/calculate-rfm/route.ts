import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * POST /api/ops/customers/[id]/calculate-rfm
 * Calculate and update RFM scores for a customer
 *
 * RFM Analysis:
 * - Recency: How recently did they order? (1-5, 5 = most recent)
 * - Frequency: How often do they order? (1-5, 5 = most frequent)
 * - Monetary: How much do they spend? (1-5, 5 = highest value)
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

    const { id: customerId } = await params

    // Get customer's order data
    const result = await pool.query(`
      SELECT
        u.id,
        u.name,
        COUNT(o.id) FILTER (WHERE o.status != 'CANCELLED') as "ordersCount",
        SUM(o.total) FILTER (WHERE o.status != 'CANCELLED') as "lifetimeValue",
        AVG(o.total) FILTER (WHERE o.status != 'CANCELLED') as "averageOrderValue",
        MAX(o."createdAt") as "lastOrderDate",
        EXTRACT(DAY FROM NOW() - MAX(o."createdAt")) as "daysSinceLastOrder"
      FROM "User" u
      LEFT JOIN "Order" o ON o."userId" = u.id
      WHERE u.id = $1
      GROUP BY u.id, u.name
    `, [customerId])

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const customer = result.rows[0]
    const ordersCount = parseInt(customer.ordersCount) || 0
    const lifetimeValue = parseFloat(customer.lifetimeValue) || 0
    const daysSinceLastOrder = parseInt(customer.daysSinceLastOrder) || 9999

    // Calculate Recency Score (1-5)
    // 5 = ordered in last 30 days
    // 4 = ordered in last 60 days
    // 3 = ordered in last 90 days
    // 2 = ordered in last 180 days
    // 1 = ordered 180+ days ago
    let recencyScore = 1
    if (daysSinceLastOrder <= 30) recencyScore = 5
    else if (daysSinceLastOrder <= 60) recencyScore = 4
    else if (daysSinceLastOrder <= 90) recencyScore = 3
    else if (daysSinceLastOrder <= 180) recencyScore = 2

    // Calculate Frequency Score (1-5)
    // 5 = 10+ orders
    // 4 = 5-9 orders
    // 3 = 3-4 orders
    // 2 = 2 orders
    // 1 = 1 order
    let frequencyScore = 1
    if (ordersCount >= 10) frequencyScore = 5
    else if (ordersCount >= 5) frequencyScore = 4
    else if (ordersCount >= 3) frequencyScore = 3
    else if (ordersCount >= 2) frequencyScore = 2

    // Calculate Monetary Score (1-5)
    // 5 = 5000+ MAD
    // 4 = 2000-4999 MAD
    // 3 = 1000-1999 MAD
    // 2 = 500-999 MAD
    // 1 = < 500 MAD
    let monetaryScore = 1
    if (lifetimeValue >= 5000) monetaryScore = 5
    else if (lifetimeValue >= 2000) monetaryScore = 4
    else if (lifetimeValue >= 1000) monetaryScore = 3
    else if (lifetimeValue >= 500) monetaryScore = 2

    // Combined RFM Score (e.g., "555" = best customer)
    const rfmScore = `${recencyScore}${frequencyScore}${monetaryScore}`

    // Determine segment based on RFM
    let segment = 'New'
    if (recencyScore >= 4 && frequencyScore >= 4 && monetaryScore >= 4) {
      segment = 'VIP'
    } else if (recencyScore <= 2 && frequencyScore >= 2) {
      segment = 'At Risk'
    } else if (recencyScore <= 1 && daysSinceLastOrder >= 180) {
      segment = 'Churned'
    } else if (ordersCount >= 2) {
      segment = 'Regular'
    }

    // Determine tier based on LTV
    let tier = 'Bronze'
    if (lifetimeValue >= 5000) tier = 'Platinum'
    else if (lifetimeValue >= 2000) tier = 'Gold'
    else if (lifetimeValue >= 1000) tier = 'Silver'

    // Calculate churn risk (0-100%)
    // Higher risk if: haven't ordered recently, used to order frequently
    let churnRisk = 0
    if (ordersCount >= 2) {
      if (daysSinceLastOrder >= 180) churnRisk = 90
      else if (daysSinceLastOrder >= 120) churnRisk = 70
      else if (daysSinceLastOrder >= 90) churnRisk = 50
      else if (daysSinceLastOrder >= 60) churnRisk = 30
      else if (daysSinceLastOrder >= 30) churnRisk = 10
    }

    // Update customer with calculated scores
    const updateResult = await pool.query(`
      UPDATE "User"
      SET
        "ordersCount" = $1,
        "lifetimeValue" = $2,
        "averageOrderValue" = $3,
        "lastOrderDate" = $4,
        "daysSinceLastOrder" = $5,
        "recencyScore" = $6,
        "frequencyScore" = $7,
        "monetaryScore" = $8,
        "rfmScore" = $9,
        "segment" = $10,
        "tier" = $11,
        "churnRisk" = $12,
        "lastRfmUpdate" = NOW()
      WHERE id = $13
      RETURNING
        "recencyScore",
        "frequencyScore",
        "monetaryScore",
        "rfmScore",
        "segment",
        "tier",
        "churnRisk"
    `, [
      ordersCount,
      lifetimeValue,
      customer.averageOrderValue,
      customer.lastOrderDate,
      daysSinceLastOrder,
      recencyScore,
      frequencyScore,
      monetaryScore,
      rfmScore,
      segment,
      tier,
      churnRisk,
      customerId,
    ])

    // Log activity
    await pool.query(`
      INSERT INTO "CustomerActivity" ("userId", "type", "action", "description", "createdAt")
      VALUES ($1, 'RFM', 'Calculated', $2, NOW())
    `, [customerId, `RFM Score: ${rfmScore}, Segment: ${segment}`])

    return NextResponse.json({
      success: true,
      customerId: parseInt(customerId),
      scores: updateResult.rows[0],
      metrics: {
        ordersCount,
        lifetimeValue,
        daysSinceLastOrder,
      },
    })

  } catch (error: any) {
    console.error('Calculate RFM error:', error)
    return NextResponse.json(
      { error: 'Failed to calculate RFM', details: error.message },
      { status: 500 }
    )
  }
}
