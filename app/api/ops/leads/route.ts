import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'
import { cached } from '@/lib/ops-cache'

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

    const { data } = await cached('leads', 60 * 1000, async () => {
    const [leadsRes, errorsRes, summaryRes] = await Promise.all([
      // Historique de commandes rattache a chaque lead.
      //
      // Rapprochement sur les 9 DERNIERS CHIFFRES : aucun des deux cotes n'est
      // normalise. Les leads arrivent en "0664083337", "665602233", "+212..." ou
      // "212..." ; les commandes en "+212661382592" ou "066...". Les 9 derniers
      // chiffres sont le seul denominateur commun.
      //
      // A quoi ca sert : "orderId IS NULL" ne repere que les commandes passees
      // dans LA MEME session. Une cliente qui revient le lendemain sur son
      // telephone reste listee comme lead a rappeler alors qu'elle a deja
      // achete. C'est du temps d'appel perdu, et un appel qui fait mauvais effet.
      pool.query(`
        SELECT a.id, a."sessionId", a.name, a.phone, a.city, a.address, a."cartItems",
               a."cartTotal"::float AS "cartTotal", a."lastStep", a.reason, a.contacted,
               a."createdAt", a."updatedAt",
               COALESCE(h.total, 0)          AS "ordersTotal",
               COALESCE(h.avant, 0)          AS "ordersBefore",
               COALESCE(h.apres, 0)          AS "ordersAfter",
               COALESCE(h.livrees, 0)        AS "ordersDelivered",
               h."lastOrderAt",
               COALESCE(h.depense, 0)::float AS "totalSpent"
        FROM "AbandonedCheckout" a
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int                                                        AS total,
                 COUNT(*) FILTER (WHERE o."createdAt" <  a."updatedAt")::int          AS avant,
                 COUNT(*) FILTER (WHERE o."createdAt" >= a."updatedAt")::int          AS apres,
                 COUNT(*) FILTER (WHERE o.status = 'DELIVERED')::int                  AS livrees,
                 MAX(o."createdAt")                                                   AS "lastOrderAt",
                 SUM(COALESCE(o.revenue, o."productsTotal", o.total::numeric, 0))
                   FILTER (WHERE o.status <> 'CANCELLED')                             AS depense
          FROM "Order" o
          WHERE NULLIF(TRIM(a.phone), '') IS NOT NULL
            AND RIGHT(regexp_replace(o."deliveryPhone", '\\D', '', 'g'), 9)
              = RIGHT(regexp_replace(a.phone, '\\D', '', 'g'), 9)
        ) h ON TRUE
        WHERE a.contacted = false AND a."orderId" IS NULL
          AND a."updatedAt" > NOW() - INTERVAL '30 days'
        -- Celles qui ont deja rachete passent en fin de liste : sans ce tri,
        -- une cliente convertie trone en haut de la liste d'appels juste parce
        -- qu'elle est recente. Le reste garde l'ordre chronologique, un abandon
        -- frais se rattrapant mieux qu'un abandon de trois semaines.
        ORDER BY (COALESCE(h.apres, 0) > 0), a."updatedAt" DESC
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
          -- Combien de ces "leads" ont en fait deja commande depuis ? Ce sont
          -- autant d'appels a ne pas passer.
          (SELECT COUNT(*) FROM "AbandonedCheckout" a
            WHERE a.contacted = false AND a."orderId" IS NULL
              AND a."updatedAt" > NOW() - INTERVAL '30 days'
              AND NULLIF(TRIM(a.phone), '') IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM "Order" o
                WHERE o."createdAt" >= a."updatedAt"
                  AND RIGHT(regexp_replace(o."deliveryPhone", '\\D', '', 'g'), 9)
                    = RIGHT(regexp_replace(a.phone, '\\D', '', 'g'), 9)
              ))::int AS leads_deja_convertis,
          (SELECT COUNT(*) FROM "MessageLog" WHERE type='otp' AND status='failed' AND "createdAt" > NOW() - INTERVAL '24 hours')::int AS otp_failed_24h,
          (SELECT COUNT(*) FROM "AnalyticsEvent" WHERE name='PURCHASE_FAILED' AND "createdAt" > NOW() - INTERVAL '24 hours')::int AS purchase_failed_24h`),
    ])

    return {
      leads: leadsRes.rows,
      errors: errorsRes.rows,
      summary: summaryRes.rows[0],
    }
    })
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error'
    console.error('[ops/leads]', message)
    return NextResponse.json({ error: 'Failed to fetch leads', details: message }, { status: 500 })
  }
}
