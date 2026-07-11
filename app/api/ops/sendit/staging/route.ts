import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'
import { creditOrderPoints } from '@/lib/loyalty'
import { fireDeliveredCapi } from '@/lib/meta-capi'
import { isPrepaidPaymentMethod } from '@/lib/order-utils'
import { getShipmentTracking, listAllSenditDeliveries } from '@/lib/sendit'

async function guard() {
  const session = await getServerSession(authOptions)
  return !!session?.user?.email && isFounder(session.user.email)
}

function phoneKey(p: string | null | undefined): string {
  let d = (p || '').replace(/\D/g, '')
  if (d.startsWith('212')) d = d.slice(3)
  if (d.startsWith('0')) d = d.slice(1)
  return d.slice(-9)
}

function referenceKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function mapSenditStatus(status: string): string {
  const value = String(status || '').toUpperCase()
  if (value === 'DELIVERED') return 'DELIVERED'
  if (['CANCELED', 'CANCELLED', 'REJECTED', 'REFUSED', 'RETURNED', 'RETURN'].includes(value)) return 'CANCELLED'
  return 'CONFIRMED'
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await pool.query(`
    SELECT id, code, "senditStatus", name, phone, city, amount::float AS amount, fee::float AS fee,
           "productsText", reference, "senditCreatedAt", "matchedOrderId", "matchedUserId",
           "matchedCustomerName", "assignedProducts", "paymentMethod",
           "paidAmount"::float AS "paidAmount", "paidAt", "paymentReference", state, promoted,
           "promotedOrderId", "pulledAt"
    FROM "SenditStaging"
    ORDER BY promoted ASC, "senditCreatedAt" DESC NULLS LAST
  `)
  const counts = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE state = 'sendit_only' AND NOT promoted)::int AS sendit_only,
      COUNT(*) FILTER (WHERE state = 'matched')::int AS matched,
      COUNT(*) FILTER (WHERE state = 'mismatch')::int AS mismatch,
      COUNT(*) FILTER (WHERE promoted)::int AS promoted,
      COUNT(*) FILTER (
        WHERE "assignedProducts" IS NOT NULL
          AND jsonb_array_length("assignedProducts") > 0
          AND NOT promoted
      )::int AS ready
    FROM "SenditStaging"
  `)

  return NextResponse.json({ rows: rows.rows, counts: counts.rows[0] })
}

export async function POST(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))

  if (body.action === 'sync-matched') {
    try {
      const rows = await pool.query(
        `SELECT * FROM "SenditStaging"
         WHERE "matchedOrderId" IS NOT NULL
           AND state IN ('matched', 'mismatch')`
      )

      let synced = 0
      let statusChanged = 0
      let skipped = 0

      for (const staging of rows.rows) {
        const currentResult = await pool.query(
          `SELECT id, status::text AS status, "paymentMethod", "senditTrackingId", "orderNumber"
           FROM "Order" WHERE id = $1`,
          [staging.matchedOrderId]
        )
        const current = currentResult.rows[0]
        if (!current) { skipped++; continue }

        const exactTracking = current.senditTrackingId === staging.code
        const exactReference = !current.senditTrackingId && [current.orderNumber, `ORD-${current.id}`]
          .map(referenceKey)
          .includes(referenceKey(staging.reference))
        const promotedOwner = staging.promotedOrderId === current.id

        // Never replace an existing tracking from a phone-only or ambiguous match.
        if (!exactTracking && !exactReference && !promotedOwner) {
          skipped++
          await pool.query(
            `UPDATE "SenditStaging" SET state = 'mismatch', "updatedAt" = NOW() WHERE id = $1`,
            [staging.id]
          )
          continue
        }

        const oldStatus = current.status
        let senditStatus = String(staging.senditStatus || '').toUpperCase()
        let amount = Number(staging.amount) || 0
        let fee = Number(staging.fee) || 0
        let deliveredAt: string | null = null

        if (senditStatus === 'DELIVERED' && oldStatus !== 'DELIVERED') {
          const live = await getShipmentTracking(staging.code)
          senditStatus = String(live.status || '').toUpperCase()
          amount = Number(live.amount) || amount
          fee = Number(live.fee) || fee
          deliveredAt = live.last_action_at || null
        }

        const mapped = mapSenditStatus(senditStatus)
        const prepaid = isPrepaidPaymentMethod(current.paymentMethod)

        if (prepaid) {
          await pool.query(
            `UPDATE "Order"
             SET "senditTrackingId" = COALESCE("senditTrackingId", $1),
                 "senditStatus" = $2,
                 "deliveryStatus" = $2,
                 status = $3::"OrderStatus",
                 "actualDeliveryCost" = $4,
                 "codAmount" = NULL,
                 "deliveredAt" = CASE
                   WHEN $3 = 'DELIVERED' AND NULLIF($5::text, '') IS NOT NULL
                     THEN ($5::timestamp AT TIME ZONE 'Africa/Casablanca')
                   ELSE "deliveredAt"
                 END
             WHERE id = $6`,
            [staging.code, senditStatus, mapped, fee, deliveredAt, current.id]
          )
        } else {
          await pool.query(
            `UPDATE "Order"
             SET "senditTrackingId" = COALESCE("senditTrackingId", $1),
                 "senditStatus" = $2,
                 "deliveryStatus" = $2,
                 status = $3::"OrderStatus",
                 "actualDeliveryCost" = $4,
                 total = CASE WHEN $5 > 0 THEN $5 ELSE total END,
                 "codAmount" = CASE WHEN $5 > 0 THEN $5 ELSE "codAmount" END,
                 "paidAmount" = CASE WHEN $3 = 'DELIVERED' AND $5 > 0 THEN $5 ELSE "paidAmount" END,
                 "paidAt" = CASE
                   WHEN $3 = 'DELIVERED' AND NULLIF($6::text, '') IS NOT NULL
                     THEN ($6::timestamp AT TIME ZONE 'Africa/Casablanca')
                   ELSE "paidAt"
                 END,
                 "paymentReference" = CASE WHEN $3 = 'DELIVERED' THEN COALESCE("paymentReference", $1) ELSE "paymentReference" END,
                 "paymentStatus" = CASE WHEN $3 = 'DELIVERED' AND $5 > 0 THEN 'PAID' ELSE "paymentStatus" END,
                 "deliveredAt" = CASE
                   WHEN $3 = 'DELIVERED' AND NULLIF($6::text, '') IS NOT NULL
                     THEN ($6::timestamp AT TIME ZONE 'Africa/Casablanca')
                   ELSE "deliveredAt"
                 END
             WHERE id = $7`,
            [staging.code, senditStatus, mapped, fee, amount, deliveredAt, current.id]
          )
        }

        if (mapped !== oldStatus) {
          await pool.query(
            `INSERT INTO "OrderStatusHistory" ("orderId", "oldStatus", "newStatus", "source", "note", "createdAt")
             VALUES ($1, $2, $3, 'sendit', $4, NOW())`,
            [current.id, oldStatus, mapped, `Reconciliation Sendit: ${senditStatus}`]
          )
          statusChanged++

          if (mapped === 'DELIVERED') {
            try {
              await creditOrderPoints(pool, current.id)
            } catch (error) {
              console.error('[Sendit] loyalty', current.id, error)
            }
            await fireDeliveredCapi(current.id)
          }
        }

        await pool.query(
          `UPDATE "SenditStaging"
           SET state = 'matched', "senditStatus" = $1, amount = $2, fee = $3, "updatedAt" = NOW()
           WHERE id = $4`,
          [senditStatus, amount, fee, staging.id]
        )
        synced++
      }

      return NextResponse.json({ ok: true, synced, statusChanged, skipped })
    } catch (error) {
      console.error('[Sendit] sync-matched', error)
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 })
    }
  }

  if (body.action !== 'pull') return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })

  try {
    const deliveries = await listAllSenditDeliveries()
    const orders = await pool.query(
      `SELECT id, "orderNumber", "senditTrackingId", status::text AS status FROM "Order"`
    )
    const promoted = await pool.query(
      `SELECT code, "promotedOrderId" FROM "SenditStaging"
       WHERE promoted = true AND "promotedOrderId" IS NOT NULL`
    )
    const users = await pool.query(
      `SELECT id, name, phone FROM "User" WHERE role IS DISTINCT FROM 'ADMIN' AND phone IS NOT NULL`
    )

    const orderById = new Map<number, any>()
    const byTracking = new Map<string, any>()
    const referenceCandidates = new Map<string, any[]>()
    for (const order of orders.rows) {
      orderById.set(order.id, order)
      if (order.senditTrackingId) byTracking.set(order.senditTrackingId, order)
      for (const key of [referenceKey(order.orderNumber), referenceKey(`ORD-${order.id}`)]) {
        if (!key) continue
        const candidates = referenceCandidates.get(key) || []
        candidates.push(order)
        referenceCandidates.set(key, candidates)
      }
    }

    const promotedOwnerByCode = new Map<string, any>()
    for (const row of promoted.rows) {
      const owner = orderById.get(row.promotedOrderId)
      if (owner) promotedOwnerByCode.set(row.code, owner)
    }

    const usersByPhone = new Map<string, any>()
    for (const user of users.rows) {
      const key = phoneKey(user.phone)
      if (key && !usersByPhone.has(key)) usersByPhone.set(key, user)
    }

    let inserted = 0
    let updated = 0
    for (const delivery of deliveries) {
      const refMatches = referenceCandidates.get(referenceKey(delivery.reference)) || []
      const matchedOrder = promotedOwnerByCode.get(delivery.code)
        || byTracking.get(delivery.code)
        || (refMatches.length === 1 ? refMatches[0] : null)
      const matchedUser = usersByPhone.get(phoneKey(delivery.phone)) || null
      const mapped = mapSenditStatus(delivery.status)
      const state = !matchedOrder ? 'sendit_only' : mapped === matchedOrder.status ? 'matched' : 'mismatch'

      const result = await pool.query(
        `INSERT INTO "SenditStaging"
           (code, "senditStatus", name, phone, "phoneKey", city, amount, fee, "productsText", reference,
            "senditCreatedAt", "matchedOrderId", "matchedUserId", "matchedCustomerName", state, "pulledAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
         ON CONFLICT (code) DO UPDATE SET
           "senditStatus" = EXCLUDED."senditStatus", name = EXCLUDED.name, phone = EXCLUDED.phone,
           "phoneKey" = EXCLUDED."phoneKey", city = EXCLUDED.city, amount = EXCLUDED.amount, fee = EXCLUDED.fee,
           "productsText" = EXCLUDED."productsText", reference = EXCLUDED.reference,
           "senditCreatedAt" = EXCLUDED."senditCreatedAt",
           "matchedOrderId" = CASE
             WHEN "SenditStaging".promoted AND "SenditStaging"."promotedOrderId" IS NOT NULL
               THEN "SenditStaging"."promotedOrderId"
             ELSE EXCLUDED."matchedOrderId"
           END,
           "matchedUserId" = EXCLUDED."matchedUserId",
           "matchedCustomerName" = EXCLUDED."matchedCustomerName",
           state = CASE WHEN "SenditStaging".promoted THEN "SenditStaging".state ELSE EXCLUDED.state END,
           "pulledAt" = NOW(), "updatedAt" = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [
          delivery.code, delivery.status, delivery.name, delivery.phone, phoneKey(delivery.phone), delivery.city,
          delivery.amount, delivery.fee, delivery.products, delivery.reference, delivery.createdAt || null,
          matchedOrder?.id || null, matchedUser?.id || null, matchedUser?.name || null, state,
        ]
      )
      if (result.rows[0]?.inserted) inserted++
      else updated++
    }

    return NextResponse.json({ ok: true, pulled: deliveries.length, inserted, updated })
  } catch (error) {
    console.error('[Sendit] staging pull', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 })
  }
}
