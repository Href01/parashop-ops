import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'
import { listAllSenditDeliveries } from '@/lib/sendit'

async function guard() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !isFounder(session.user.email)) return false
  return true
}

/** Normalize a Moroccan phone to its 9-digit core for matching. */
function phoneKey(p: string | null | undefined): string {
  let d = (p || '').replace(/\D/g, '')
  if (d.startsWith('212')) d = d.slice(3)
  if (d.startsWith('0')) d = d.slice(1)
  return d.slice(-9)
}

function mapSenditStatus(s: string): string {
  const u = (s || '').toUpperCase()
  if (u === 'DELIVERED') return 'DELIVERED'
  if (['CANCELED', 'CANCELLED', 'REJECTED', 'REFUSED', 'RETURNED', 'RETURN'].some((k) => u.includes(k))) return 'CANCELLED'
  return 'CONFIRMED' // warehouse / in-transit / pending pickup
}

/** GET — current staging rows + summary counts (read-only). */
export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await pool.query(`
    SELECT id, code, "senditStatus", name, phone, city, amount::float AS amount, fee::float AS fee,
           "productsText", reference, "senditCreatedAt", "matchedOrderId", "matchedUserId",
           "matchedCustomerName", "assignedProducts", state, promoted, "promotedOrderId", "pulledAt"
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
      COUNT(*) FILTER (WHERE "assignedProducts" IS NOT NULL AND jsonb_array_length("assignedProducts") > 0 AND NOT promoted)::int AS ready
    FROM "SenditStaging"
  `)
  return NextResponse.json({ rows: rows.rows, counts: counts.rows[0] })
}

/**
 * POST — staging actions:
 *  { action: 'pull' }         pull all Sendit deliveries + match (read-only on BOS)
 *  { action: 'sync-matched' } Phase 1: push Sendit truth (status/COD/fee + link)
 *                             onto the already-matched BOS orders
 */
export async function POST(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))

  if (body.action === 'sync-matched') {
    try {
      const rows = await pool.query(
        `SELECT * FROM "SenditStaging" WHERE "matchedOrderId" IS NOT NULL AND state IN ('matched', 'mismatch')`
      )
      let synced = 0, statusChanged = 0
      for (const s of rows.rows) {
        const cur = await pool.query(`SELECT status::text AS status FROM "Order" WHERE id = $1`, [s.matchedOrderId])
        if (cur.rows.length === 0) continue
        const oldStatus = cur.rows[0].status
        const mapped = mapSenditStatus(s.senditStatus)
        // Push Sendit truth: link + status + actual COD + delivery fee
        await pool.query(
          `UPDATE "Order"
           SET "senditTrackingId" = $1, "senditStatus" = $2, "deliveryStatus" = $2,
               status = $3::"OrderStatus", "deliveryFeeCharged" = $4, total = $5
           WHERE id = $6`,
          [s.code, s.senditStatus, mapped, Number(s.fee) || 0, Number(s.amount) || 0, s.matchedOrderId]
        )
        if (mapped !== oldStatus) {
          await pool.query(
            `INSERT INTO "OrderStatusHistory" ("orderId","oldStatus","newStatus","source","note","createdAt")
             VALUES ($1,$2,$3,'sendit',$4,NOW())`,
            [s.matchedOrderId, oldStatus, mapped, `Réconciliation Sendit: ${s.senditStatus}`]
          )
          statusChanged++
        }
        await pool.query(`UPDATE "SenditStaging" SET state = 'matched', "updatedAt" = NOW() WHERE id = $1`, [s.id])
        synced++
      }
      return NextResponse.json({ ok: true, synced, statusChanged })
    } catch (e) {
      console.error('[Sendit] sync-matched', e)
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
    }
  }

  if (body.action !== 'pull') return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })

  try {
    const deliveries = await listAllSenditDeliveries()

    // Load BOS orders + users once (read-only) for matching
    const orders = await pool.query(`SELECT id, "senditTrackingId", "deliveryPhone", status::text AS status, "deliveryName" FROM "Order"`)
    const users = await pool.query(`SELECT id, name, phone FROM "User" WHERE role IS DISTINCT FROM 'ADMIN' AND phone IS NOT NULL`)
    const byTracking = new Map<string, any>()
    const ordersByPhone = new Map<string, any>()
    for (const o of orders.rows) {
      if (o.senditTrackingId) byTracking.set(o.senditTrackingId, o)
      const k = phoneKey(o.deliveryPhone)
      if (k && !ordersByPhone.has(k)) ordersByPhone.set(k, o)
    }
    const usersByPhone = new Map<string, any>()
    for (const u of users.rows) {
      const k = phoneKey(u.phone)
      if (k && !usersByPhone.has(k)) usersByPhone.set(k, u)
    }

    let inserted = 0, updated = 0
    for (const d of deliveries) {
      const pk = phoneKey(d.phone)
      const matchedOrder = byTracking.get(d.code) || ordersByPhone.get(pk) || null
      const matchedUser = usersByPhone.get(pk) || null
      const mapped = mapSenditStatus(d.status)
      const state = !matchedOrder ? 'sendit_only' : (mapped === matchedOrder.status ? 'matched' : 'mismatch')

      const r = await pool.query(
        `INSERT INTO "SenditStaging"
           (code, "senditStatus", name, phone, "phoneKey", city, amount, fee, "productsText", reference,
            "senditCreatedAt", "matchedOrderId", "matchedUserId", "matchedCustomerName", state, "pulledAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
         ON CONFLICT (code) DO UPDATE SET
           "senditStatus" = EXCLUDED."senditStatus", name = EXCLUDED.name, phone = EXCLUDED.phone,
           "phoneKey" = EXCLUDED."phoneKey", city = EXCLUDED.city, amount = EXCLUDED.amount, fee = EXCLUDED.fee,
           "productsText" = EXCLUDED."productsText", reference = EXCLUDED.reference,
           "senditCreatedAt" = EXCLUDED."senditCreatedAt", "matchedOrderId" = EXCLUDED."matchedOrderId",
           "matchedUserId" = EXCLUDED."matchedUserId", "matchedCustomerName" = EXCLUDED."matchedCustomerName",
           state = CASE WHEN "SenditStaging".promoted THEN "SenditStaging".state ELSE EXCLUDED.state END,
           "pulledAt" = NOW(), "updatedAt" = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [
          d.code, d.status, d.name, d.phone, pk, d.city, d.amount, d.fee, d.products, d.reference,
          d.createdAt || null, matchedOrder?.id || null, matchedUser?.id || null, matchedUser?.name || null, state,
        ]
      )
      if (r.rows[0]?.inserted) inserted++; else updated++
    }

    return NextResponse.json({ ok: true, pulled: deliveries.length, inserted, updated })
  } catch (e) {
    console.error('[Sendit] staging pull', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
