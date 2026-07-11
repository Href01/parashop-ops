import crypto from 'crypto'
import pool from '@/lib/db'
import { getMetaToken } from '@/lib/meta-token'

// Meta Conversions API (server-side) for the OFFLINE "Delivered" conversion.
// When a COD order is actually delivered (= really paid), we tell Meta so the ad
// algorithm can optimise on real payers, not form-fillers who cancel.
//
// Env: META_PIXEL_ID (or NEXT_PUBLIC_META_PIXEL_ID). Token comes from getMetaToken().

const PIXEL_ID = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || '1793293408300562'
const VERSION = (process.env.META_GRAPH_VERSION || 'v21.0').replace(/^\/+|\/+$/g, '')
const TEST_CODE = process.env.META_CAPI_TEST_CODE

function hash(v?: string | null): string | undefined {
  const norm = (v || '').trim().toLowerCase()
  return norm ? crypto.createHash('sha256').update(norm).digest('hex') : undefined
}
function hashPhone(v?: string | null): string | undefined {
  const digits = (v || '').replace(/[^0-9]/g, '')
  return digits ? crypto.createHash('sha256').update(digits).digest('hex') : undefined
}

type CapiEvent = {
  eventName: string
  eventId: string
  phone?: string | null
  email?: string | null
  city?: string | null
  value?: number
  currency?: string
  contentIds?: Array<string | number>
  contents?: Array<{ id: string | number; quantity: number }>
}

async function sendMetaCapi(ev: CapiEvent): Promise<boolean> {
  if (!PIXEL_ID) return false
  // Prefer an explicit CAPI token (same one as the main site); else the ad-sync token.
  const token = process.env.META_CAPI_TOKEN || process.env.META_ACCESS_TOKEN || await getMetaToken()
  if (!token) return false
  try {
    const user_data: Record<string, unknown> = {}
    const ph = hashPhone(ev.phone); if (ph) user_data.ph = [ph]
    const em = hash(ev.email); if (em) user_data.em = [em]
    const ct = hash(ev.city); if (ct) user_data.ct = [ct]

    const custom_data: Record<string, unknown> = { currency: ev.currency || 'MAD' }
    if (ev.value != null) custom_data.value = ev.value
    if (ev.contentIds?.length) { custom_data.content_type = 'product'; custom_data.content_ids = ev.contentIds.map(String) }
    if (ev.contents?.length) custom_data.contents = ev.contents.map((c) => ({ id: String(c.id), quantity: c.quantity || 1 }))

    const body = {
      data: [{
        event_name: ev.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: ev.eventId,
        // Delivery is a real-world confirmation, not a page action.
        action_source: 'physical_store',
        user_data,
        custom_data,
      }],
      ...(TEST_CODE ? { test_event_code: TEST_CODE } : {}),
    }

    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(
      `https://graph.facebook.com/${VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal }
    ).finally(() => clearTimeout(t))
    if (!res.ok) {
      console.error('[CAPI delivered]', res.status, (await res.text()).slice(0, 200))
      return false
    }
    return true
  } catch (e) {
    console.error('[CAPI delivered]', e instanceof Error ? e.message : e)
    return false
  }
}

/**
 * Fire the "Delivered" CAPI event ONCE for an order that just became DELIVERED.
 * Atomic claim on capiDeliveredAt prevents double-firing across re-syncs / concurrency.
 * Never throws — must not break the status-sync flow.
 */
export async function fireDeliveredCapi(orderId: number): Promise<void> {
  try {
    if (!PIXEL_ID) return
    // Claim it: only the caller that flips capiDeliveredAt from NULL proceeds.
    const claim = await pool.query(
      `UPDATE "Order" SET "capiDeliveredAt" = NOW()
       WHERE id = $1 AND status = 'DELIVERED' AND "capiDeliveredAt" IS NULL
       RETURNING total, "codAmount", "deliveryPhone", "deliveryCity", "capiDeliveredAt"`,
      [orderId]
    )
    if (claim.rows.length === 0) return
    const o = claim.rows[0]
    const items = await pool.query(`SELECT "productId", quantity FROM "OrderItem" WHERE "orderId" = $1`, [orderId])
    const value = Number(o.codAmount ?? o.total) || 0
    const sent = await sendMetaCapi({
      eventName: 'Delivered',
      eventId: `delivered_${orderId}`,
      phone: o.deliveryPhone,
      city: o.deliveryCity,
      value,
      currency: 'MAD',
      contentIds: items.rows.map((i: { productId: number }) => i.productId),
      contents: items.rows.map((i: { productId: number; quantity: number }) => ({ id: i.productId, quantity: i.quantity })),
    })
    if (!sent) {
      await pool.query(
        `UPDATE "Order" SET "capiDeliveredAt" = NULL WHERE id = $1 AND "capiDeliveredAt" = $2`,
        [orderId, o.capiDeliveredAt]
      )
    }
  } catch (e) {
    console.error('[CAPI delivered] fire', e instanceof Error ? e.message : e)
  }
}
