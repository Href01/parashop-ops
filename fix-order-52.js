const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function fixOrder52() {
  try {
    // Get order details
    const order = await pool.query(`
      SELECT
        o.id,
        o.total,
        o."productsTotal",
        o."discountTotal",
        o."deliveryFeeCharged"
      FROM "Order" o
      WHERE o.id = 52
    `)

    if (order.rows.length === 0) {
      console.log('❌ Order #52 not found')
      return
    }

    const current = order.rows[0]
    console.log('📦 Current order #52:', current)

    // Recalculate total (products - discount + delivery)
    const productsTotal = Number(current.productsTotal) || 0
    const discountTotal = Number(current.discountTotal) || 0
    const deliveryFee = Number(current.deliveryFeeCharged) || 0

    const correctTotal = productsTotal - discountTotal + deliveryFee

    console.log('\n💰 Calculation:')
    console.log(`  Products: ${productsTotal}`)
    console.log(`  Discount: -${discountTotal}`)
    console.log(`  Delivery: +${deliveryFee}`)
    console.log(`  ─────────────────`)
    console.log(`  Correct Total: ${correctTotal}`)
    console.log(`  Current Total: ${current.total}`)
    console.log(`  Difference: ${current.total - correctTotal}`)

    if (current.total === correctTotal) {
      console.log('\n✅ Total is already correct!')
      return
    }

    // Update order with correct total
    await pool.query(`
      UPDATE "Order"
      SET total = $1,
          revenue = $2
      WHERE id = 52
    `, [correctTotal, productsTotal - discountTotal])

    console.log(`\n✅ Order #52 fixed: ${current.total} → ${correctTotal} MAD`)
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await pool.end()
  }
}

fixOrder52()
