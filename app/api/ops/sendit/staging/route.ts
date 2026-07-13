import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'
import { creditOrderPoints } from '@/lib/loyalty'
import { fireDeliveredCapi } from '@/lib/meta-capi'
import { isPrepaidPaymentMethod } from '@/lib/order-utils'
import { getShipmentTracking } from '@/lib/sendit'
import { pullSenditStaging } from '@/lib/sendit-staging-sync'

async function guard() {
  const session = await getServerSession(authOptions)
  return !!session?.user?.email && isFounder(session.user.email)
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
           "promotedOrderId", "lastActionAt", "pulledAt"
    FROM "SenditStaging"
    WHERE state IS DISTINCT FROM 'ignored'
    ORDER BY promoted ASC, "senditCreatedAt" DESC NULLS LAST
  `)
  const counts = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE state IS DISTINCT FROM 'ignored')::int AS total,
      COUNT(*) FILTER (WHERE state = 'sendit_only' AND NOT promoted)::int AS sendit_only,
      COUNT(*) FILTER (WHERE state = 'matched')::int AS matched,
      COUNT(*) FILTER (WHERE state = 'mismatch')::int AS mismatch,
      COUNT(*) FILTER (WHERE promoted)::int AS promoted,
      COUNT(*) FILTER (WHERE state = 'ignored')::int AS ignored,
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

  // Ignore / restore parcels that belong to a third party sharing the Sendit account
  // (e.g. the founder's brother's other business). Only allowed on non-promoted rows so
  // official BOS orders are never touched. 'ignored' is preserved across pulls.
  if (body.action === 'ignore' || body.action === 'unignore') {
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : []
    if (ids.length === 0) return NextResponse.json({ error: 'Aucun colis sélectionné' }, { status: 400 })
    if (body.action === 'ignore') {
      const r = await pool.query(
        `UPDATE "SenditStaging" SET state = 'ignored', "updatedAt" = NOW()
         WHERE id = ANY($1) AND promoted = false AND state <> 'ignored'`,
        [ids]
      )
      return NextResponse.json({ ok: true, ignored: r.rowCount })
    }
    // unignore → back to sendit_only (unmatched) so it can be re-processed on next pull
    const r = await pool.query(
      `UPDATE "SenditStaging" SET state = 'sendit_only', "updatedAt" = NOW()
       WHERE id = ANY($1) AND state = 'ignored'`,
      [ids]
    )
    return NextResponse.json({ ok: true, restored: r.rowCount })
  }

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
                 "senditStatus" = $2::text,
                 "deliveryStatus" = $2::varchar,
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
                 "senditStatus" = $2::text,
                 "deliveryStatus" = $2::varchar,
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
    return NextResponse.json(await pullSenditStaging())
  } catch (error) {
    console.error('[Sendit] staging pull', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 })
  }
}
