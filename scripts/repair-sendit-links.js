/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config()
const { Pool } = require('pg')

const APPLY = process.argv.includes('--apply')
const API = 'https://app.sendit.ma/api/v1'

function mapStatus(status) {
  const value = String(status || '').toUpperCase()
  if (value === 'DELIVERED') return 'DELIVERED'
  if (['CANCELED', 'CANCELLED', 'REJECTED', 'REFUSED', 'RETURNED', 'RETURN'].includes(value)) return 'CANCELLED'
  return 'CONFIRMED'
}

function isPrepaid(method) {
  return ['VIREMENT', 'TRANSFER', 'CARD'].includes(String(method || '').toUpperCase())
}

async function login() {
  const response = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      public_key: process.env.SENDIT_PUBLIC_KEY,
      secret_key: process.env.SENDIT_PRIVATE_KEY,
    }),
  })
  if (!response.ok) throw new Error(`Sendit login failed: ${response.status}`)
  const body = await response.json()
  if (!body?.data?.token) throw new Error('Sendit token missing')
  return body.data.token
}

async function getDelivery(token, code) {
  const response = await fetch(`${API}/deliveries/${code}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`Sendit ${code}: ${response.status}`)
  const body = await response.json()
  if (!body?.data) throw new Error(`Sendit ${code}: invalid response`)
  return body.data
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const candidates = await pool.query(`
      SELECT o.id, o.status::text AS status, o."paymentMethod", o."productsTotal"::float,
             o."senditTrackingId" AS current_code,
             official.id AS staging_id, official.code AS official_code,
             official."paymentMethod" AS staging_payment_method,
             official."assignedProducts"
      FROM "Order" o
      JOIN "SenditStaging" official ON official."promotedOrderId" = o.id
      WHERE o."senditTrackingId" IS DISTINCT FROM official.code
      ORDER BY o.id
    `)

    if (candidates.rows.length === 0) {
      console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', repairs: [] }, null, 2))
      return
    }

    const token = await login()
    const repairs = []
    for (const row of candidates.rows) {
      const live = await getDelivery(token, row.official_code)
      const paymentMethod = row.staging_payment_method || row.paymentMethod || 'COD'
      const prepaid = isPrepaid(paymentMethod)
      const amount = Number(live.amount) || 0
      const fee = Number(live.fee) || 0
      const productsTotal = Number(row.productsTotal) || 0
      const orderTotal = prepaid ? productsTotal + fee : amount
      const status = mapStatus(live.status)

      repairs.push({
        orderId: row.id,
        oldStatus: row.status,
        currentCode: row.current_code,
        officialCode: row.official_code,
        status,
        senditStatus: String(live.status || '').toUpperCase(),
        amount,
        fee,
        paymentMethod: prepaid ? 'VIREMENT' : 'COD',
        orderTotal,
        customerDeliveryFee: Math.max(orderTotal - productsTotal, 0),
        deliveredAt: status === 'DELIVERED' ? live.last_action_at || null : null,
        paidAmount: !prepaid && status === 'DELIVERED' ? amount : null,
        paidAt: !prepaid && status === 'DELIVERED' ? live.last_action_at || null : null,
        paymentStatus: !prepaid && status === 'DELIVERED' ? 'PAID' : prepaid ? 'UNVERIFIED' : 'PENDING',
      })
    }

    console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', repairs }, null, 2))
    if (!APPLY) return

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const repair of repairs) {
        await client.query(
          `UPDATE "Order"
           SET "senditTrackingId" = $1,
               "senditBarcode" = $1,
               "senditStatus" = $2,
               "deliveryStatus" = $2,
               status = $3::"OrderStatus",
               "paymentMethod" = $4,
               total = $5,
               "codAmount" = $6,
               "deliveryFeeCharged" = $7,
               "estimatedDeliveryCost" = $8,
               "actualDeliveryCost" = $8,
               "deliveredAt" = CASE
                 WHEN NULLIF($9::text, '') IS NOT NULL
                   THEN ($9::timestamp AT TIME ZONE 'Africa/Casablanca')
                 ELSE NULL
               END,
               "paidAmount" = $10,
               "paidAt" = CASE
                 WHEN NULLIF($11::text, '') IS NOT NULL
                   THEN ($11::timestamp AT TIME ZONE 'Africa/Casablanca')
                 ELSE NULL
               END,
               "paymentReference" = CASE WHEN $10 IS NOT NULL THEN $1 ELSE NULL END,
               "paymentStatus" = $12
           WHERE id = $13`,
          [
            repair.officialCode, repair.senditStatus, repair.status, repair.paymentMethod,
            repair.orderTotal, repair.paymentMethod === 'COD' ? repair.amount : null,
            repair.customerDeliveryFee, repair.fee, repair.deliveredAt,
            repair.paidAmount, repair.paidAt, repair.paymentStatus, repair.orderId,
          ]
        )

        await client.query(
          `UPDATE "SenditStaging"
           SET "matchedOrderId" = NULL, state = 'sendit_only', "updatedAt" = NOW()
           WHERE "matchedOrderId" = $1 AND code <> $2 AND promoted = false`,
          [repair.orderId, repair.officialCode]
        )
        await client.query(
          `UPDATE "SenditStaging"
           SET "matchedOrderId" = $1, state = 'matched', "updatedAt" = NOW()
           WHERE code = $2 AND "promotedOrderId" = $1`,
          [repair.orderId, repair.officialCode]
        )
        await client.query(
          `INSERT INTO "OrderStatusHistory"
             ("orderId", "oldStatus", "newStatus", "source", note, "createdAt")
           VALUES ($1, $2, $3, 'repair', $4, NOW())`,
          [repair.orderId, repair.oldStatus, repair.status, `Tracking officiel Sendit restaure: ${repair.officialCode}`]
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    console.log(`Applied ${repairs.length} Sendit link repairs`)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
