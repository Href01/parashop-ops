/**
 * RFM Segmentation Calculator
 *
 * Phone-based customer tracking with realistic thresholds for new businesses
 *
 * IMPORTANT: Adjusted for low-frequency startup (1-2 orders is NORMAL)
 */

import pool from '@/lib/db'

interface RFMScores {
  recencyScore: number      // 1-5
  frequencyScore: number    // 1-5
  monetaryScore: number     // 1-5
  rfmScore: string          // e.g., "555"
  segment: string           // VIP, Regular, At Risk, New, Churned
  tier: string              // Platinum, Gold, Silver, Bronze
  churnRisk: number         // 0-100%
}

/**
 * Calculate RFM scores for a customer (phone-based)
 *
 * ADJUSTED THRESHOLDS FOR NEW BUSINESS:
 * - 1 order = "New" (not "bad")
 * - 2-3 orders = "Regular" (already good!)
 * - 4+ orders = "VIP" territory
 */
export async function calculateCustomerRFM(phone: string): Promise<RFMScores | null> {
  try {
    // Get all orders for this phone number
    const ordersResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('CONFIRMED', 'DELIVERED')) as "ordersCount",
        SUM(total) FILTER (WHERE status IN ('CONFIRMED', 'DELIVERED')) as "totalSpent",
        MAX("createdAt") FILTER (WHERE status IN ('CONFIRMED', 'DELIVERED')) as "lastOrderDate",
        MIN("createdAt") FILTER (WHERE status IN ('CONFIRMED', 'DELIVERED')) as "firstOrderDate"
      FROM "Order"
      WHERE "deliveryPhone" = $1
    `, [phone])

    if (ordersResult.rows.length === 0) return null

    const data = ordersResult.rows[0]
    const ordersCount = parseInt(data.ordersCount) || 0
    const totalSpent = parseFloat(data.totalSpent) || 0
    const lastOrderDate = data.lastOrderDate
    const firstOrderDate = data.firstOrderDate

    // No orders = can't calculate
    if (ordersCount === 0) return null

    // Calculate days since last order
    let daysSinceLastOrder = 0
    if (lastOrderDate) {
      const diffTime = Date.now() - new Date(lastOrderDate).getTime()
      daysSinceLastOrder = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    }

    // Calculate days since first order (customer lifetime)
    let customerLifetimeDays = 0
    if (firstOrderDate) {
      const diffTime = Date.now() - new Date(firstOrderDate).getTime()
      customerLifetimeDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    }

    // ================================================================
    // RECENCY SCORE (1-5) - How recently did they order?
    // ================================================================
    // ADJUSTED for new business: longer intervals are normal
    let recencyScore = 1
    if (daysSinceLastOrder <= 30) recencyScore = 5        // Last month = excellent
    else if (daysSinceLastOrder <= 60) recencyScore = 4   // Last 2 months = good
    else if (daysSinceLastOrder <= 90) recencyScore = 3   // Last 3 months = OK
    else if (daysSinceLastOrder <= 180) recencyScore = 2  // Last 6 months = at risk
    else recencyScore = 1                                 // 6+ months = churned

    // ================================================================
    // FREQUENCY SCORE (1-5) - How often do they order?
    // ================================================================
    // ADJUSTED for new business: 1 order = new customer (not bad!)
    let frequencyScore = 1
    if (ordersCount >= 10) frequencyScore = 5             // 10+ orders = VIP
    else if (ordersCount >= 5) frequencyScore = 4         // 5-9 orders = excellent
    else if (ordersCount >= 3) frequencyScore = 3         // 3-4 orders = good
    else if (ordersCount >= 2) frequencyScore = 2         // 2 orders = regular
    else frequencyScore = 1                               // 1 order = new

    // ================================================================
    // MONETARY SCORE (1-5) - How much have they spent?
    // ================================================================
    // ADJUSTED for Moroccan market: realistic MAD amounts
    let monetaryScore = 1
    if (totalSpent >= 3000) monetaryScore = 5             // 3000+ MAD = VIP
    else if (totalSpent >= 1500) monetaryScore = 4        // 1500-2999 MAD = excellent
    else if (totalSpent >= 800) monetaryScore = 3         // 800-1499 MAD = good
    else if (totalSpent >= 400) monetaryScore = 2         // 400-799 MAD = regular
    else monetaryScore = 1                                // < 400 MAD = new

    // RFM Score (concatenated string)
    const rfmScore = `${recencyScore}${frequencyScore}${monetaryScore}`

    // ================================================================
    // AUTO-SEGMENT ASSIGNMENT
    // ================================================================
    // ADJUSTED logic: 1 order doesn't mean "churned"
    let segment = 'New'

    if (ordersCount === 1) {
      // First-time customer
      if (daysSinceLastOrder <= 60) {
        segment = 'New'                                   // Recent first order
      } else {
        segment = 'At Risk'                               // Old first order, never came back
      }
    } else if (ordersCount >= 2) {
      // Repeat customer (2+ orders)
      if (recencyScore >= 4 && monetaryScore >= 4) {
        segment = 'VIP'                                   // High value + recent
      } else if (recencyScore >= 3 && frequencyScore >= 2) {
        segment = 'Regular'                               // Active and returning
      } else if (recencyScore <= 2) {
        segment = 'At Risk'                               // Haven't ordered recently
      } else {
        segment = 'Regular'                               // Default for 2+ orders
      }
    }

    // Override: If 180+ days since last order = Churned
    if (daysSinceLastOrder >= 180) {
      segment = 'Churned'
    }

    // ================================================================
    // TIER ASSIGNMENT (based on LTV)
    // ================================================================
    let tier = 'Bronze'
    if (totalSpent >= 5000) tier = 'Platinum'             // 5000+ MAD
    else if (totalSpent >= 2000) tier = 'Gold'            // 2000-4999 MAD
    else if (totalSpent >= 1000) tier = 'Silver'          // 1000-1999 MAD
    else tier = 'Bronze'                                  // < 1000 MAD

    // ================================================================
    // CHURN RISK CALCULATION (0-100%)
    // ================================================================
    // Higher risk = longer time since last order + low frequency
    let churnRisk = 0

    if (ordersCount === 1) {
      // Single-order customers
      if (daysSinceLastOrder >= 90) churnRisk = 80        // 90+ days, 1 order = high risk
      else if (daysSinceLastOrder >= 60) churnRisk = 60   // 60-89 days
      else if (daysSinceLastOrder >= 30) churnRisk = 40   // 30-59 days
      else churnRisk = 20                                 // < 30 days
    } else {
      // Repeat customers (2+ orders)
      if (daysSinceLastOrder >= 180) churnRisk = 90       // 6+ months = churned
      else if (daysSinceLastOrder >= 120) churnRisk = 70  // 4-6 months
      else if (daysSinceLastOrder >= 90) churnRisk = 50   // 3-4 months
      else if (daysSinceLastOrder >= 60) churnRisk = 30   // 2-3 months
      else churnRisk = 10                                 // < 2 months = low risk
    }

    return {
      recencyScore,
      frequencyScore,
      monetaryScore,
      rfmScore,
      segment,
      tier,
      churnRisk,
    }

  } catch (error) {
    console.error('RFM calculation error:', error)
    return null
  }
}

/**
 * Update RFM scores for a specific user by phone
 */
export async function updateUserRFM(userId: number, phone: string): Promise<boolean> {
  try {
    const rfm = await calculateCustomerRFM(phone)

    if (!rfm) {
      console.log(`❌ No RFM data for user ${userId} (phone: ${phone})`)
      return false
    }

    await pool.query(`
      UPDATE "User"
      SET
        "recencyScore" = $1,
        "frequencyScore" = $2,
        "monetaryScore" = $3,
        "rfmScore" = $4,
        segment = $5,
        tier = $6,
        "churnRisk" = $7,
        "updatedAt" = NOW()
      WHERE id = $8
    `, [
      rfm.recencyScore,
      rfm.frequencyScore,
      rfm.monetaryScore,
      rfm.rfmScore,
      rfm.segment,
      rfm.tier,
      rfm.churnRisk,
      userId,
    ])

    console.log(`✅ Updated RFM for user ${userId}: ${rfm.rfmScore} (${rfm.segment})`)
    return true

  } catch (error) {
    console.error('Update RFM error:', error)
    return false
  }
}

/**
 * Batch update RFM scores for all customers with phone numbers
 * Run this nightly or after bulk order updates
 */
export async function batchUpdateAllRFM(): Promise<{ success: number; failed: number }> {
  try {
    console.log('🔄 Starting batch RFM update for all customers...')

    // Get all users with phone numbers (potential customers)
    const usersResult = await pool.query(`
      SELECT id, phone
      FROM "User"
      WHERE phone IS NOT NULL
        AND phone != ''
    `)

    const users = usersResult.rows
    let success = 0
    let failed = 0

    for (const user of users) {
      const updated = await updateUserRFM(user.id, user.phone)
      if (updated) success++
      else failed++
    }

    console.log(`✅ Batch RFM update complete: ${success} success, ${failed} failed`)

    return { success, failed }

  } catch (error) {
    console.error('Batch RFM update error:', error)
    return { success: 0, failed: 0 }
  }
}

/**
 * Get segment statistics
 */
export async function getSegmentStats() {
  try {
    const result = await pool.query(`
      SELECT
        segment,
        COUNT(*) as count,
        AVG("lifetimeValue") as "avgLTV",
        AVG("churnRisk") as "avgChurnRisk"
      FROM "User"
      WHERE segment IS NOT NULL
      GROUP BY segment
      ORDER BY
        CASE segment
          WHEN 'VIP' THEN 1
          WHEN 'Regular' THEN 2
          WHEN 'New' THEN 3
          WHEN 'At Risk' THEN 4
          WHEN 'Churned' THEN 5
        END
    `)

    return result.rows
  } catch (error) {
    console.error('Segment stats error:', error)
    return []
  }
}
