import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * GET /api/ops/leads
 *
 * Two back-office feeds over the SHARED DB:
 *  - "leads": visitors who typed their delivery info but never ordered
 *    (AbandonedCheckout) — to call/WhatsApp manually.
 *  - "errors": recent actionable failures — OTP delivery failures (incl. 131042),
 *    purchase failures, OTP send failures — so nothing fails silently.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [leadsRes, errorsRes, summaryRes] = await Promise.all([
      pool.query(`
        SELECT id, "sessionId", name, phone, city, address, "cartItems",
               "cartTotal"::float AS "cartTotal", "lastStep", reason, contacted,
               "createdAt", "updatedAt"
        FROM "AbandonedCheckout"
        WHERE contacted = false AND "orderId" IS NULL
          AND "updatedAt" > NOW() - INTERVAL '30 days'
        ORDER BY "updatedAt" DESC
        LIMIT 100`),
      pool.query(`
        SELECT * FROM (
          SELECT 'otp_delivery_failed' AS kind, phone AS label, "errorCode" AS detail, "createdAt" AS at
          FROM "MessageLog"
          WHERE type = 'otp' AND status = 'failed' AND "createdAt" > NOW() - INTERVAL '7 days'
          UNION ALL
          SELECT 'purchase_failed' AS kind,
                 COALESCE(props->>'finalTotal','') AS label, props->>'error' AS detail, "createdAt" AS at
          FROM "AnalyticsEvent"
          WHERE name = 'PURCHASE_FAILED' AND "createdAt" > NOW() - INTERVAL '7 days'
          UNION ALL
          SELECT 'otp_send_failed' AS kind, COALESCE(props->>'phase','') AS label,
                 COALESCE(props->>'trigger','') AS detail, "createdAt" AS at
          FROM "AnalyticsEvent"
          WHERE name = 'OTP_SEND_FAILED' AND "createdAt" > NOW() - INTERVAL '7 days'
        ) e
        ORDER BY at DESC
        LIMIT 60`),
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM "AbandonedCheckout" WHERE contacted = false AND "orderId" IS NULL AND "updatedAt" > NOW() - INTERVAL '30 days')::int AS leads,
          (SELECT COUNT(*) FROM "MessageLog" WHERE type='otp' AND status='failed' AND "createdAt" > NOW() - INTERVAL '24 hours')::int AS otp_failed_24h,
          (SELECT COUNT(*) FROM "AnalyticsEvent" WHERE name='PURCHASE_FAILED' AND "createdAt" > NOW() - INTERVAL '24 hours')::int AS purchase_failed_24h`),
    ])

    return NextResponse.json({
      leads: leadsRes.rows,
      errors: errorsRes.rows,
      summary: summaryRes.rows[0],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error'
    console.error('[ops/leads]', message)
    return NextResponse.json({ error: 'Failed to fetch leads', details: message }, { status: 500 })
  }
}
