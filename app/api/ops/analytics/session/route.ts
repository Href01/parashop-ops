import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import pool from '@/lib/db'

/**
 * Per-visitor action timeline — the exact sequence of actions for one session,
 * enriched with WHO the visitor is (linked account or the customer on their
 * order), full acquisition attribution, and device/browser context.
 * GET /api/ops/analytics/session?id=<sessionId>
 */
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token || token.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const [events, session, order] = await Promise.all([
      pool.query(
        /* `id` départage les ex æquo : deux évènements peuvent porter le même
           instant à la milliseconde près (un CLICK_UI et le DEAD_CLICK qu'il
           déclenche, par exemple). Sans départage, leur ordre est arbitraire —
           et avec un LIMIT, la sélection elle-même devient non déterministe. */
        `SELECT name, path, props, "userId", "createdAt"
         FROM "AnalyticsEvent" WHERE "sessionId" = $1
         ORDER BY "createdAt" ASC, id ASC LIMIT 300`,
        [id]
      ),
      pool.query(
        `SELECT "device", "city", "country", "utmSource", "utmMedium", "utmCampaign",
                "utmContent", "landingUrl", "landingReferrer", "userAgent",
                "fbclid", "gclid", "userId", "firstSeenAt", "lastSeenAt"
         FROM "AnalyticsSession" WHERE "sessionId" = $1`,
        [id]
      ),
      pool.query(
        `SELECT id, status, total, "deliveryName", "deliveryPhone", "deliveryCity",
                "sourceChannel", "userId", "createdAt"
         FROM "Order" WHERE "sessionId" = $1 ORDER BY "createdAt" DESC`,
        [id]
      ),
    ])

    const sess = session.rows[0] || null
    const orders = order.rows

    // Resolve WHO: prefer the linked account (session or any event carried a
    // userId), else fall back to the customer named on their order.
    const eventUserId = events.rows.find((e: any) => e.userId != null)?.userId ?? null
    const userId: number | null = sess?.userId ?? eventUserId ?? orders.find((o: any) => o.userId != null)?.userId ?? null

    let identity: {
      kind: 'account' | 'guest' | 'anonymous'
      name: string | null
      phone: string | null
      email: string | null
      city: string | null
      memberSince: string | null
      priorSessions: number
    } = { kind: 'anonymous', name: null, phone: null, email: null, city: null, memberSince: null, priorSessions: 0 }

    if (userId != null) {
      const [user, prior] = await Promise.all([
        pool.query(`SELECT name, phone, email, "createdAt" FROM "User" WHERE id = $1`, [userId]),
        pool.query(
          `SELECT COUNT(DISTINCT "sessionId")::int AS n FROM "AnalyticsSession" WHERE "userId" = $1 AND "sessionId" <> $2`,
          [userId, id]
        ),
      ])
      const u = user.rows[0]
      identity = {
        kind: 'account',
        name: u?.name ?? orders[0]?.deliveryName ?? null,
        phone: u?.phone ?? orders[0]?.deliveryPhone ?? null,
        email: u?.email ?? null,
        city: orders[0]?.deliveryCity ?? sess?.city ?? null,
        memberSince: u?.createdAt ?? null,
        priorSessions: prior.rows[0]?.n ?? 0,
      }
    } else if (orders[0]?.deliveryName) {
      identity = {
        kind: 'guest',
        name: orders[0].deliveryName,
        phone: orders[0].deliveryPhone ?? null,
        email: null,
        city: orders[0].deliveryCity ?? sess?.city ?? null,
        memberSince: null,
        priorSessions: 0,
      }
    }

    return NextResponse.json({
      identity,
      session: sess
        ? {
            device: sess.device,
            city: sess.city,
            country: sess.country,
            utmSource: sess.utmSource,
            utmMedium: sess.utmMedium,
            utmCampaign: sess.utmCampaign,
            utmContent: sess.utmContent,
            landingUrl: sess.landingUrl,
            landingReferrer: sess.landingReferrer,
            userAgent: sess.userAgent,
            paid: !!(sess.fbclid || sess.gclid),
            paidSource: sess.fbclid ? 'Meta' : sess.gclid ? 'Google Ads' : null,
            firstSeenAt: sess.firstSeenAt,
            lastSeenAt: sess.lastSeenAt,
          }
        : null,
      orders: orders.map((o: any) => ({
        id: o.id,
        status: o.status,
        total: Number(o.total),
        channel: o.sourceChannel ?? null,
        at: o.createdAt,
      })),
      timeline: events.rows.map((e: any) => ({
        name: e.name,
        path: e.path,
        props: e.props,
        at: e.createdAt,
      })),
    })
  } catch (error) {
    console.error('[Analytics Session] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
