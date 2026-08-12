import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import pool from '@/lib/db'
import { cachedAnalytics } from '@/lib/analytics-cache'
import {
  acquisitionChannelSql, basisDateExpr, decomposeMargin, maturite,
  parseSegment, segmentEventFilter, segmentIsEmpty,
  type MoneyBasis, type EtatMarge,
} from '@/lib/analytics/metrics'

/**
 * Store Analytics — 100% LIVE from raw tables (no star schema / no ETL).
 *
 * Built to answer "what is happening in my beauty store right now", always fresh.
 *
 * Les DEFINITIONS (canal d'acquisition, base de date, seuil d'effectif,
 * decomposition) vivent dans `lib/analytics/metrics.ts` et nulle part ailleurs.
 * Ce fichier contenait trois cartographies de canal differentes et deux
 * definitions du CA : deux cartes voisines pouvaient afficher deux verites sur
 * la meme periode. Toute nouvelle requete doit importer, jamais recopier.
 *
 * GET /api/ops/analytics/store?days=30&basis=cohorte|cash&device=&locale=&source=
 */

const TZ = 'Africa/Casablanca'
// Une commande VALIDE (elle n'a pas ete annulee) — sert au potentiel et au
// catalogue. A ne pas confondre avec le CA REALISE, qui est livre et lui seul.
const REVENUE_STATUSES = ['DELIVERED', 'CONFIRMED']
// CA = produits réellement vendus, HORS frais de livraison (encaissés par Sendit).
// Même définition que le BOS — sinon les deux tableaux de bord affichent deux CA
// différents pour la même période (l'écart valait 1 275 MAD sur 30 j, soit +6 %).
const INTERNAL_EVENTS = ['SESSION_START', 'SESSION_END', 'PAGE_VIEW', 'PAGE_VIEW_DURATION', 'SCROLL_DEPTH']
type DbRow = Record<string, unknown>

function rangeFromDays(days: number) {
  const end = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const startD = new Date(end + 'T00:00:00Z')
  startD.setUTCDate(startD.getUTCDate() - (days - 1))
  const start = startD.toISOString().split('T')[0]
  const prevEndD = new Date(start + 'T00:00:00Z'); prevEndD.setUTCDate(prevEndD.getUTCDate() - 1)
  const prevEnd = prevEndD.toISOString().split('T')[0]
  const prevStartD = new Date(prevEnd + 'T00:00:00Z'); prevStartD.setUTCDate(prevStartD.getUTCDate() - (days - 1))
  const prevStart = prevStartD.toISOString().split('T')[0]
  return { start, end, prevStart, prevEnd }
}

function casablancaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function casablancaYesterday() {
  const y = new Date()
  y.setDate(y.getDate() - 1)
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(y)
}

/**
 * Filtre anti-bruit.
 *
 * L'ancienne version excluait toute session depassant 100 evenements. Sur 30
 * jours elle jetait 46 sessions — dont 6 QUI AVAIENT ACHETE et 28 qui avaient
 * mis au panier. Une cliente tres engagee (167 impressions, 10 fiches, 4 ajouts
 * panier, 2 saisies de paiement) etait classee robot. Le volume brut
 * d'evenements punit l'engagement : c'est exactement l'inverse du but.
 *
 * Deux changements :
 *  1. Le bruit machine se detecte sur les SESSION_START repetes — une session
 *     en boucle en avait 314, la ou une vraie visite en emet 1 ou 2. C'est le
 *     signal fiable, et il ne correle pas avec l'engagement.
 *  2. Une session qui a achete ou mis au panier n'est JAMAIS ecartee, quoi que
 *     disent les autres signaux. Un robot ne remplit pas un panier.
 */
const BOT_FILTER = `
  AND NOT EXISTS (
    SELECT 1 FROM "AnalyticsSession" s2
    WHERE s2."sessionId" = "PageView"."sessionId"
      AND (
        COALESCE(s2."userAgent", '') ~* 'bot|crawler|spider|googlebot|bingbot|slurp|facebookexternalhit|facebot|twitterbot'
        OR (SELECT COUNT(*) FROM "AnalyticsEvent" e
             WHERE e."sessionId" = s2."sessionId" AND e.name = 'SESSION_START') > 10
      )
      AND NOT EXISTS (
        SELECT 1 FROM "AnalyticsEvent" e2
        WHERE e2."sessionId" = s2."sessionId"
          AND e2.name IN ('PURCHASE_SUCCESS', 'ORDER_CREATED', 'PRODUCT_ADD_TO_CART')
      )
  )
`

const num = (v: unknown) => (v == null ? 0 : Number(v))
const delta = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null)

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token || token.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Support: ?days=30 OR ?from=YYYY-MM-DD&to=YYYY-MM-DD OR ?preset=today|yesterday
    const preset = req.nextUrl.searchParams.get('preset')
    const fromParam = req.nextUrl.searchParams.get('from')
    const toParam = req.nextUrl.searchParams.get('to')

    let start: string, end: string, days: number

    if (preset === 'today') {
      start = end = casablancaToday()
      days = 1
    } else if (preset === 'yesterday') {
      start = end = casablancaYesterday()
      days = 1
    } else if (fromParam && toParam) {
      start = fromParam
      end = toParam
      const diffMs = new Date(end).getTime() - new Date(start).getTime()
      days = Math.max(1, Math.ceil(diffMs / 86400000) + 1)
    } else {
      const daysParam = parseInt(req.nextUrl.searchParams.get('days') || '30', 10)
      days = Math.min(Math.max(Number.isNaN(daysParam) ? 30 : daysParam, 1), 365)
      const range = rangeFromDays(days)
      start = range.start
      end = range.end
    }

    // Previous period for deltas
    const prevEndD = new Date(start + 'T00:00:00Z')
    prevEndD.setUTCDate(prevEndD.getUTCDate() - 1)
    const prevEnd = prevEndD.toISOString().split('T')[0]
    const prevStartD = new Date(prevEnd + 'T00:00:00Z')
    prevStartD.setUTCDate(prevStartD.getUTCDate() - (days - 1))
    const prevStart = prevStartD.toISOString().split('T')[0]

    // BASE DE DATE — cf. metrics.ts §1. Sur 30 j, la meme periode vaut 19 337 MAD
    // datee a la commande et 21 431 MAD datee a la livraison. Les deux sont
    // justes ; elles ne repondent pas a la meme question, et on ne les melange
    // jamais. `orderDate` suit desormais le choix de l'utilisateur.
    const basisParam = req.nextUrl.searchParams.get('basis')
    const basis: MoneyBasis = basisParam === 'cash' ? 'cash' : 'cohorte'
    const orderDate = basisDateExpr(basis)
    // En base livraison, aucun filtre de statut supplementaire n'est necessaire :
    // une commande non livree a `deliveredAt` a NULL, et `NULL BETWEEN ...` est
    // faux — elle sort d'elle-meme de la periode. La definition se suffit.
    const pvDate = `("createdAt" AT TIME ZONE '${TZ}')::date`

    // SEGMENT — cf. metrics.ts §6. `_device`/`_locale`/`_source` sont presents
    // sur 100 % des evenements et n'etaient exploites nulle part.
    const segment = parseSegment(req.nextUrl.searchParams)
    const segEvent = segmentEventFilter(segment, '"AnalyticsEvent"')
    const segPageView = segmentIsEmpty(segment) ? '' : `
      AND EXISTS (
        SELECT 1 FROM "AnalyticsEvent" WHERE "AnalyticsEvent"."sessionId" = "PageView"."sessionId"
        ${segmentEventFilter(segment, '"AnalyticsEvent"')}
      )`

    // Keep in sync with the client-side friction set (EVENT_META, tone: 'friction')
    // so the aggregate "Bugs & erreurs" panel and per-session error counts match the
    // red dots in the session timeline — incl. the OTP delivery/verification failures.
    // RAGE_CLICK / DEAD_CLICK / CHECKOUT_FIELD_ERROR y figurent : une interface
    // qui ne repond pas est un bug, pas un « comportement ». C'est meme le seul
    // endroit ou un bouton casse peut se signaler tout seul.
    const ERROR_EVENTS = ['PURCHASE_FAILED', 'CHECKOUT_VALIDATION_FAILED', 'CHECKOUT_ABANDONED', 'PROMO_CODE_FAILED', 'SEARCH_ZERO_RESULTS', 'CHECKOUT_CART_EMPTY', 'OTP_SEND_FAILED', 'OTP_DELIVERY_FAILED', 'OTP_INVALID', 'RAGE_CLICK', 'DEAD_CLICK', 'CHECKOUT_FIELD_ERROR']

    // Cache 5 min (cf. CLAUDE.md « Analytics data: 5-minute in-memory cache »).
    // ?fresh=1 force le recalcul. Les ~30 requêtes ci-dessous ne repartent donc
    // qu'une fois par période de 5 min d'utilisation, au lieu de chaque ouverture.
    const fresh = req.nextUrl.searchParams.get('fresh') === '1'
    const { data: payload, cachedAt } = await cachedAnalytics(
      // La base et le segment font partie de la clé : sans eux, changer de base
      // ou de segment ne ferait que ressortir le cache de la vue précédente.
      `store:${start}:${end}:${prevStart}:${prevEnd}:${basis}:${segment.device ?? ''}:${segment.locale ?? ''}:${segment.source ?? ''}`,
      5 * 60 * 1000,
      async () => {
    const [
      ordersAgg, prevOrdersAgg, traffic, prevTraffic,
      revenueByDay, ordersByStatus, topProducts, topBrands,
      channels, cities, trafficSources, funnelRows, realtime, lowStock,
      topActions, searchQueries, searchMissing, searchFunnel, errorsAgg, errorSamples, recentSessions,
      avgDuration, prevAvgDuration, durationBuckets, topSessions, durationByPage,
      pageElements, checkoutAbandon, abandonedCarts, deviceConv, abandonRates,
      loyalty, orderTiming, cityRefusals, landingPages, visitDepth, shelfTraffic, shelfStock, homeFlow, otpFunnel,
    ] = await Promise.all([
      // Current orders KPIs (revenue statuses only).
      // convertedSessions = distinct SITE sessions that ordered (sessionId not null).
      // orders/revenue keep counting ALL orders (incl. Instagram/Sendit added
      // manually with sessionId = NULL) for the CA cards, but CVR must use only
      // site-attributed sessions or it divides off-site orders by site sessions.
      pool.query(
        `SELECT COUNT(*)::int AS orders, COALESCE(SUM(COALESCE(revenue, "productsTotal", total)),0)::float AS revenue,
                COUNT(DISTINCT "sessionId") FILTER (WHERE "sessionId" IS NOT NULL)::int AS "convertedSessions"
         FROM "Order" WHERE status = ANY($3) AND ${orderDate} BETWEEN $1::date AND $2::date`,
        [start, end, REVENUE_STATUSES]
      ),
      // Previous period orders
      pool.query(
        `SELECT COUNT(*)::int AS orders, COALESCE(SUM(COALESCE(revenue, "productsTotal", total)),0)::float AS revenue
         FROM "Order" WHERE status = ANY($3) AND ${orderDate} BETWEEN $1::date AND $2::date`,
        [prevStart, prevEnd, REVENUE_STATUSES]
      ),
      // Current traffic (visitors / pageviews) — bot-filtered, segment-filtered
      pool.query(
        `SELECT COUNT(DISTINCT "sessionId")::int AS visitors, COUNT(*)::int AS pageviews
         FROM "PageView"
         WHERE ${pvDate} BETWEEN $1::date AND $2::date ${BOT_FILTER} ${segPageView}`,
        [start, end]
      ),
      // Previous traffic — bot-filtered
      pool.query(
        `SELECT COUNT(DISTINCT "sessionId")::int AS visitors
         FROM "PageView"
         WHERE ${pvDate} BETWEEN $1::date AND $2::date ${BOT_FILTER} ${segPageView}`,
        [prevStart, prevEnd]
      ),
      // Per-day series (full date spine so every day renders): revenue, orders,
      // units, plus sessions & converted-sessions for AOV and CVR.
      pool.query(
        `WITH days AS (
           SELECT generate_series($1::date, $2::date, interval '1 day')::date AS d
         ),
         -- La courbe doit mesurer LA MEME CHOSE que le grand chiffre au-dessus
         -- d'elle. Avant, la tuile « CA réalisé » affichait les commandes
         -- livrées, pendant que sa courbe et son % d'évolution comptaient les
         -- livrées PLUS les confirmées : trois mesures dans une seule tuile.
         -- revenue = réalisé (livré). pending = encaissable, compté à part.
         ord AS (
           SELECT ${orderDate} AS d, COUNT(*)::int AS orders,
                  COALESCE(SUM(COALESCE(revenue, "productsTotal", total)) FILTER (WHERE status = 'DELIVERED'),0)::float AS revenue,
                  COALESCE(SUM(COALESCE(revenue, "productsTotal", total)) FILTER (WHERE status <> 'DELIVERED'),0)::float AS pending,
                  COUNT(DISTINCT "sessionId") FILTER (WHERE "sessionId" IS NOT NULL)::int AS conversions
           FROM "Order" WHERE status = ANY($3) AND ${orderDate} BETWEEN $1::date AND $2::date
           GROUP BY 1
         ),
         units AS (
           SELECT (o."createdAt" AT TIME ZONE '${TZ}')::date AS d, COALESCE(SUM(oi.quantity),0)::int AS units
           FROM "Order" o JOIN "OrderItem" oi ON oi."orderId" = o.id
           WHERE o.status = ANY($3) AND (o."createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
           GROUP BY 1
         ),
         sess AS (
           SELECT ${pvDate} AS d, COUNT(DISTINCT "sessionId")::int AS sessions
           FROM "PageView" WHERE ${pvDate} BETWEEN $1::date AND $2::date ${BOT_FILTER} ${segPageView}
           GROUP BY 1
         )
         SELECT days.d::text AS date,
                COALESCE(ord.revenue,0)::float AS revenue,
                COALESCE(ord.pending,0)::float AS pending,
                COALESCE(ord.orders,0)::int AS orders,
                COALESCE(u.units,0)::int AS units,
                COALESCE(ord.conversions,0)::int AS conversions,
                COALESCE(sess.sessions,0)::int AS sessions
         FROM days
         LEFT JOIN ord ON ord.d = days.d
         LEFT JOIN units u ON u.d = days.d
         LEFT JOIN sess ON sess.d = days.d
         ORDER BY days.d ASC`,
        [start, end, REVENUE_STATUSES]
      ),
      // Status breakdown (all statuses)
      pool.query(
        `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(COALESCE(revenue, "productsTotal", total)),0)::float AS revenue
         FROM "Order" WHERE ${orderDate} BETWEEN $1::date AND $2::date
         GROUP BY status ORDER BY count DESC`,
        [start, end]
      ),
      // Top products (units + revenue) from delivered/confirmed orders, plus product
      // detail views in the period so the overview can show view→buy conversion.
      pool.query(
        `SELECT p.name, p.brand,
                SUM(oi.quantity)::int AS units,
                COALESCE(SUM(oi.quantity * oi.price),0)::float AS revenue,
                COALESCE(MAX(v.views),0)::int AS views
         FROM "OrderItem" oi
         JOIN "Order" o ON o.id = oi."orderId"
         JOIN "Product" p ON p.id = oi."productId"
         LEFT JOIN (
           SELECT props->>'productId' AS pid, COUNT(*)::int AS views
           FROM "AnalyticsEvent"
           WHERE name = 'PRODUCT_VIEW_DETAIL' AND ${pvDate} BETWEEN $1::date AND $2::date
             AND props->>'productId' IS NOT NULL
           GROUP BY 1
         ) v ON v.pid = p.id::text
         WHERE o.status = ANY($3) AND (o."createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
         GROUP BY p.name, p.brand ORDER BY revenue DESC LIMIT 30`,
        [start, end, REVENUE_STATUSES]
      ),
      // Top brands
      pool.query(
        `SELECT COALESCE(NULLIF(p.brand,''),'—') AS brand,
                SUM(oi.quantity)::int AS units,
                COALESCE(SUM(oi.quantity * oi.price),0)::float AS revenue
         FROM "OrderItem" oi
         JOIN "Order" o ON o.id = oi."orderId"
         JOIN "Product" p ON p.id = oi."productId"
         WHERE o.status = ANY($3) AND (o."createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
         GROUP BY 1 ORDER BY revenue DESC LIMIT 20`,
        [start, end, REVENUE_STATUSES]
      ),
      // Sales channels: prefer order attribution, then fall back to session source.
      pool.query(
        // TYPE (site/manuel) et ACQUISITION sont deux dimensions distinctes.
        // Le TYPE vient de sessionId (présent = passée sur le site). L'ACQUISITION
        // vient des utm. Avant, tout était écrasé dans sourceChannel — d'où « Sendit »
        // (un transporteur) affiché comme s'il était une source de trafic.
        `WITH o2 AS (
           SELECT COALESCE(o.revenue, o."productsTotal", o.total) AS amount,
                  (o."sessionId" IS NOT NULL) AS is_site,
                  LOWER(COALESCE(NULLIF(TRIM(o."utmSource"),''), NULLIF(TRIM(s."utmSource"),''))) AS src,
                  LOWER(COALESCE(NULLIF(TRIM(o."utmMedium"),''), NULLIF(TRIM(s."utmMedium"),''))) AS med,
                  LOWER(NULLIF(TRIM(o."sourceChannel"),'')) AS ch
           FROM "Order" o
           LEFT JOIN "AnalyticsSession" s ON s."sessionId" = o."sessionId"
           WHERE o.status = ANY($3) AND ${orderDate} BETWEEN $1::date AND $2::date
         )
         SELECT
           CASE WHEN is_site THEN 'Site' ELSE 'Manuel' END AS type,
           COALESCE(is_site AND med = 'paid', false) AS paid,
           CASE
             -- Commandes site : l'acquisition vient des utm
             WHEN is_site AND med = 'paid' AND (src LIKE '%insta%' OR src = 'ig') THEN 'Instagram Ads'
             WHEN is_site AND med = 'paid' AND (src LIKE '%face%' OR src = 'fb') THEN 'Facebook Ads'
             WHEN is_site AND med = 'paid' AND src IS NOT NULL THEN 'Pub ' || INITCAP(src)
             WHEN is_site AND (src LIKE '%insta%' OR src = 'ig') THEN 'Instagram (organique)'
             WHEN is_site AND (src LIKE '%face%' OR src = 'fb') THEN 'Facebook (organique)'
             WHEN is_site AND (src LIKE '%search%' OR src LIKE '%google%') THEN 'Recherche Google'
             WHEN is_site AND src IS NOT NULL THEN INITCAP(src)
             WHEN is_site THEN 'Direct'
             -- Commandes manuelles : l'origine est ce que l'équipe a saisi
             WHEN ch LIKE '%insta%' THEN 'Instagram (manuel)'
             WHEN ch LIKE '%whats%' THEN 'WhatsApp (manuel)'
             WHEN ch LIKE '%tiktok%' THEN 'TikTok (manuel)'
             -- « Sendit » = créée depuis un colis : l'origine réelle n'a jamais été saisie
             WHEN ch = 'sendit' OR ch IS NULL THEN 'Manuel (origine non renseignée)'
             ELSE INITCAP(ch) || ' (manuel)'
           END AS channel,
           COUNT(*)::int AS orders,
           COALESCE(SUM(amount),0)::float AS revenue
         FROM o2
         GROUP BY 1,2,3 ORDER BY revenue DESC`,
        [start, end, REVENUE_STATUSES]
      ),
      // Top cities (delivery)
      pool.query(
        `SELECT COALESCE(NULLIF("deliveryCity",''),'—') AS city,
                COUNT(*)::int AS orders, COALESCE(SUM(COALESCE(revenue, "productsTotal", total)),0)::float AS revenue
         FROM "Order" WHERE status = ANY($3) AND ${orderDate} BETWEEN $1::date AND $2::date
         GROUP BY 1 ORDER BY revenue DESC LIMIT 30`,
        [start, end, REVENUE_STATUSES]
      ),
      // Traffic sources — derive from utmSource OR landingReferrer (fallback for old sessions)
      pool.query(
        `WITH sess AS (
           SELECT s."sessionId",
                  -- Canonical source: map BOTH the utm value and the referrer to one
                  -- label so 'facebook' (from the ad link) and 'Facebook' (from the
                  -- referrer) don't show up as two separate rows.
                  CASE
                    WHEN LOWER(s."utmSource") IN ('facebook','fb','meta') OR s."landingReferrer" ~* 'facebook\\.com|fb\\.com|m\\.me' THEN 'Facebook'
                    WHEN LOWER(s."utmSource") LIKE 'insta%' OR LOWER(s."utmSource") = 'ig' OR s."landingReferrer" ~* 'instagram\\.com|ig\\.me' THEN 'Instagram'
                    WHEN LOWER(s."utmSource") LIKE 'tiktok%' OR LOWER(s."utmSource") = 'tt' OR s."landingReferrer" ~* 'tiktok\\.com|t\\.tiktok\\.com' THEN 'TikTok'
                    WHEN LOWER(s."utmSource") LIKE 'whats%' OR s."landingReferrer" ~* 'wa\\.me|whatsapp\\.com|chat\\.whatsapp\\.com' THEN 'WhatsApp'
                    WHEN LOWER(s."utmSource") LIKE 'google%' OR LOWER(s."utmSource") IN ('search','bing') OR s."landingReferrer" ~* 'google\\.|bing\\.com|yahoo\\.com' THEN 'Search'
                    WHEN s."landingReferrer" ~* 'twitter\\.com|t\\.co' THEN 'Twitter'
                    WHEN s."utmSource" IS NOT NULL AND s."utmSource" <> '' THEN INITCAP(s."utmSource")
                    ELSE 'Direct'
                  END AS source
           FROM "AnalyticsSession" s
           WHERE s."sessionId" IN (
             SELECT DISTINCT "sessionId" FROM "PageView" WHERE ${pvDate} BETWEEN $1::date AND $2::date
           )
         ),
         ord AS (
           SELECT "sessionId", COUNT(*)::int AS orders, COALESCE(SUM(COALESCE(revenue, "productsTotal", total)),0)::float AS revenue
           FROM "Order" WHERE status = ANY($3) AND ${orderDate} BETWEEN $1::date AND $2::date AND "sessionId" IS NOT NULL
           GROUP BY "sessionId"
         )
         SELECT sess.source,
                COUNT(DISTINCT sess."sessionId")::int AS visitors,
                COALESCE(SUM(o.orders),0)::int AS orders,
                COALESCE(SUM(o.revenue),0)::float AS revenue
         FROM sess LEFT JOIN ord o ON o."sessionId" = sess."sessionId"
         GROUP BY sess.source ORDER BY visitors DESC LIMIT 20`,
        [start, end, REVENUE_STATUSES]
      ),
      // Entonnoir ordonné : chaque étape doit suivre la précédente dans la MÊME session.
      // L'entrée = COALESCE(product_at, cart_at) : on peut ajouter au panier depuis une
      // étagère sans ouvrir de fiche produit. Exiger la fiche excluait ces sessions de
      // TOUTES les étapes (15 % des paniers, 19 % des checkouts mesurés sur 30 j).
      pool.query(
        `WITH ev AS (
           SELECT "sessionId", name, MIN("createdAt") AS first_at
           FROM "AnalyticsEvent"
           WHERE name IN ('PRODUCT_VIEW_DETAIL','PRODUCT_ADD_TO_CART','VIEW_CART','BEGIN_CHECKOUT','ADD_PAYMENT_INFO')
             AND ${pvDate} BETWEEN $1::date AND $2::date
             AND "sessionId" IS NOT NULL
           GROUP BY "sessionId", name
         ),
         firsts AS (
           SELECT "sessionId",
             MIN(first_at) FILTER (WHERE name = 'PRODUCT_VIEW_DETAIL') AS product_at,
             MIN(first_at) FILTER (WHERE name = 'PRODUCT_ADD_TO_CART') AS cart_at,
             MIN(first_at) FILTER (WHERE name = 'VIEW_CART') AS cartview_at,
             MIN(first_at) FILTER (WHERE name = 'BEGIN_CHECKOUT') AS checkout_at,
             MIN(first_at) FILTER (WHERE name = 'ADD_PAYMENT_INFO') AS payment_at
           FROM ev
           GROUP BY "sessionId"
         ),
         order_sessions AS (
           SELECT "sessionId", MIN("createdAt") AS order_at
           FROM "Order"
           WHERE status = ANY($3)
             AND "sessionId" IS NOT NULL
             AND ${orderDate} BETWEEN $1::date AND $2::date
           GROUP BY "sessionId"
         )
         SELECT 'PRODUCT_VIEW_DETAIL' AS name,
                COUNT(*) FILTER (WHERE COALESCE(product_at, cart_at) IS NOT NULL)::int AS sessions
         FROM firsts
         UNION ALL
         SELECT 'PRODUCT_ADD_TO_CART' AS name,
                COUNT(*) FILTER (WHERE cart_at IS NOT NULL AND cart_at >= COALESCE(product_at, cart_at))::int AS sessions
         FROM firsts
         UNION ALL
         SELECT 'VIEW_CART' AS name,
                COUNT(*) FILTER (WHERE cart_at IS NOT NULL AND cart_at >= COALESCE(product_at, cart_at) AND cartview_at >= cart_at)::int AS sessions
         FROM firsts
         UNION ALL
         SELECT 'BEGIN_CHECKOUT' AS name,
                COUNT(*) FILTER (WHERE cart_at IS NOT NULL AND cart_at >= COALESCE(product_at, cart_at) AND checkout_at >= cart_at)::int AS sessions
         FROM firsts
         UNION ALL
         SELECT 'ADD_PAYMENT_INFO' AS name,
                COUNT(*) FILTER (WHERE cart_at IS NOT NULL AND cart_at >= COALESCE(product_at, cart_at) AND checkout_at >= cart_at AND payment_at >= checkout_at)::int AS sessions
         FROM firsts
         UNION ALL
         SELECT 'ORDER_COMPLETED' AS name,
                COUNT(*) FILTER (WHERE cart_at IS NOT NULL AND cart_at >= COALESCE(product_at, cart_at) AND checkout_at >= cart_at AND order_at >= checkout_at)::int AS sessions
         FROM firsts
         LEFT JOIN order_sessions USING ("sessionId")`,
        [start, end, REVENUE_STATUSES]
      ),
      // Real-time (5 min) — bot-filtered
      pool.query(
        `SELECT COUNT(DISTINCT "sessionId")::int AS "activeVisitors", COUNT(*)::int AS "recentPageviews"
         FROM "PageView"
         WHERE "createdAt" >= NOW() - INTERVAL '5 minutes' ${BOT_FILTER}`
      ),
      // Low stock (operational signal)
      pool.query(
        `SELECT name, brand, stock::int AS stock
         FROM "Product" WHERE active = true AND stock <= 5
         ORDER BY stock ASC LIMIT 8`
      ),
      // Top actions visitors perform (what's happening)
      pool.query(
        `SELECT name, COUNT(*)::int AS count, COUNT(DISTINCT "sessionId")::int AS sessions
         FROM "AnalyticsEvent"
         WHERE ${pvDate} BETWEEN $1::date AND $2::date
           AND NOT (name = ANY($3))
         GROUP BY name ORDER BY count DESC LIMIT 40`,
        [start, end, INTERNAL_EVENTS]
      ),
      // Searched queries (with zero-result detection)
      // Recherches par INTENTION RÉELLE (SEARCH_SUBMIT = validée), pas par frappe.
      // SEARCH_QUERY se déclenche à chaque caractère : le classement remontait
      // "sa/sal/saler/salerm" comme 4 requêtes distinctes pour un seul mot.
      // `clientes` (sessions distinctes) est la métrique honnête — une personne
      // qui tape longtemps ne doit pas ressembler à une forte demande.
      pool.query(
        `SELECT LOWER(TRIM(props->>'query')) AS query,
                COUNT(*)::int AS searches,
                COUNT(DISTINCT "sessionId")::int AS customers,
                COUNT(*) FILTER (WHERE props->>'hasResults' = 'false' OR props->>'resultsCount' = '0')::int AS zero,
                ROUND(AVG(CASE WHEN props->>'resultsCount' ~ '^[0-9]+$' THEN (props->>'resultsCount')::numeric END))::int AS avg_results
         FROM "AnalyticsEvent"
         WHERE name IN ('SEARCH_SUBMIT','SEARCH_RESULT_CLICK','SEARCH_ABANDONED')
           AND COALESCE(TRIM(props->>'query'),'') <> ''
           AND ${pvDate} BETWEEN $1::date AND $2::date
         GROUP BY 1 ORDER BY customers DESC, searches DESC LIMIT 20`,
        [start, end]
      ),
      // DEMANDE MANQUANTE : recherches sans résultat, regroupées par racine
      // normalisée (4 car.) pour rassembler les variantes de frappe
      // ("jergens/jergen/jerge..."), classées par CLIENTES distinctes.
      // Chaque ligne = un produit que des clientes cherchent et que tu n'as pas.
      pool.query(
        // Un seul terme par session : le PLUS LONG qu'elle ait tapé. L'événement se
        // déclenche à chaque frappe, donc "jerg/jerge/jergens" venait d'une seule
        // personne ; en gardant la frappe la plus complète on obtient le vrai nom
        // de produit cherché ("kérastase 8h magic night serum") au lieu de fragments.
        `WITH z AS (
           SELECT DISTINCT ON ("sessionId")
                  "sessionId", LOWER(TRIM(props->>'query')) AS q
           FROM "AnalyticsEvent"
           WHERE name = 'SEARCH_ZERO_RESULTS' AND COALESCE(TRIM(props->>'query'),'') <> ''
             AND ${pvDate} BETWEEN $1::date AND $2::date
           ORDER BY "sessionId", LENGTH(LOWER(TRIM(props->>'query'))) DESC
         )
         SELECT q AS term,
                COUNT(*)::int AS customers,
                COUNT(*)::int AS attempts
         FROM z GROUP BY q ORDER BY customers DESC, LENGTH(q) DESC LIMIT 15`,
        [start, end]
      ),
      // ENTONNOIR DE LA RECHERCHE : cherché -> cliqué un résultat -> commandé.
      // Révèle si la recherche transforme vraiment (elle ramenait 62 clics pour
      // 1 seule commande sur 30 j — un signal invisible jusqu'ici).
      pool.query(
        `WITH searched AS (
           SELECT DISTINCT "sessionId" FROM "AnalyticsEvent"
           WHERE name IN ('SEARCH_SUBMIT','SEARCH_QUERY') AND "sessionId" IS NOT NULL
             AND ${pvDate} BETWEEN $1::date AND $2::date
         ),
         clicked AS (
           SELECT DISTINCT "sessionId" FROM "AnalyticsEvent"
           WHERE name = 'SEARCH_RESULT_CLICK' AND "sessionId" IS NOT NULL
             AND ${pvDate} BETWEEN $1::date AND $2::date
         ),
         ordered AS (
           SELECT DISTINCT "sessionId" FROM "Order"
           WHERE "sessionId" IS NOT NULL AND ${orderDate} BETWEEN $1::date AND $2::date
         ),
         zero AS (
           SELECT DISTINCT "sessionId" FROM "AnalyticsEvent"
           WHERE name = 'SEARCH_ZERO_RESULTS' AND "sessionId" IS NOT NULL
             AND ${pvDate} BETWEEN $1::date AND $2::date
         )
         SELECT (SELECT COUNT(*) FROM searched)::int AS searched,
                (SELECT COUNT(*) FROM clicked)::int AS clicked,
                (SELECT COUNT(*) FROM clicked c JOIN ordered o USING ("sessionId"))::int AS converted,
                (SELECT COUNT(*) FROM zero)::int AS dead_end`,
        [start, end]
      ),
      // Error / bug events — counts per type
      pool.query(
        `SELECT name, COUNT(*)::int AS count, COUNT(DISTINCT "sessionId")::int AS sessions
         FROM "AnalyticsEvent" WHERE name = ANY($3) AND ${pvDate} BETWEEN $1::date AND $2::date
         GROUP BY name ORDER BY count DESC`,
        [start, end, ERROR_EVENTS]
      ),
      // Error / bug events — recent samples (the actual messages)
      pool.query(
        `SELECT name, COALESCE(props->>'error', props->>'reason', props->>'step') AS error, "sessionId", "createdAt"
         FROM "AnalyticsEvent" WHERE name = ANY($3) AND ${pvDate} BETWEEN $1::date AND $2::date
         ORDER BY "createdAt" DESC LIMIT 15`,
        [start, end, ERROR_EVENTS]
      ),
      // Per-visitor recent sessions (actions summary)
      pool.query(
        `WITH ev AS (
           SELECT "sessionId",
                  COUNT(*) FILTER (WHERE NOT (name = ANY($5)))::int AS actions,
                  MAX("createdAt") AS "lastSeen",
                  COALESCE(SUM(CASE WHEN props->>'durationSeconds' ~ '^[0-9]+$' THEN (props->>'durationSeconds')::int END), 0)::int AS "durationSec",
                  COUNT(*) FILTER (WHERE name = 'PRODUCT_VIEW_DETAIL')::int AS "productViews",
                  COUNT(*) FILTER (WHERE name = 'PRODUCT_ADD_TO_CART')::int AS carts,
                  COUNT(*) FILTER (WHERE name = 'SEARCH_QUERY')::int AS searches,
                  COUNT(*) FILTER (WHERE name = ANY($3))::int AS errors
           FROM "AnalyticsEvent"
           WHERE ${pvDate} BETWEEN $1::date AND $2::date AND "sessionId" IS NOT NULL
           GROUP BY "sessionId"
         )
         SELECT ev.*, s.device, s.city, COALESCE(NULLIF(s."utmSource",''),'Direct') AS source,
                -- WHO: the linked account, else the customer named on their order.
                COALESCE(NULLIF(TRIM(u.name), ''), ord.name) AS "visitorName",
                COALESCE(u.phone, ord.phone) AS "visitorPhone",
                (s."userId" IS NOT NULL) AS "hasAccount",
                EXISTS(
                  SELECT 1 FROM "Order" o
                  WHERE o."sessionId" = ev."sessionId"
                    AND o.status = ANY($4)
                    AND (o."createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
                ) AS ordered
         FROM ev
         LEFT JOIN "AnalyticsSession" s ON s."sessionId" = ev."sessionId"
         LEFT JOIN "User" u ON u.id = s."userId"
         LEFT JOIN LATERAL (
           SELECT o."deliveryName" AS name, o."deliveryPhone" AS phone
           FROM "Order" o WHERE o."sessionId" = ev."sessionId"
           ORDER BY o."createdAt" DESC LIMIT 1
         ) ord ON true
         ORDER BY ev."lastSeen" DESC LIMIT 200`,
        [start, end, ERROR_EVENTS, REVENUE_STATUSES, INTERNAL_EVENTS]
      ),

      // Session duration: average for current period
      pool.query(
        `WITH durations AS (
           SELECT "sessionId", SUM((props->>'durationSeconds')::int) AS total_sec
           FROM "AnalyticsEvent"
           WHERE name = 'PAGE_VIEW_DURATION' AND ${pvDate} BETWEEN $1::date AND $2::date
             AND props->>'durationSeconds' ~ '^[0-9]+$'
           GROUP BY "sessionId"
         )
         SELECT AVG(total_sec)::float AS avg_seconds, COUNT(*)::int AS sessions_count
         FROM durations WHERE total_sec > 0`,
        [start, end]
      ),

      // Session duration: average for previous period (for delta)
      pool.query(
        `WITH durations AS (
           SELECT "sessionId", SUM((props->>'durationSeconds')::int) AS total_sec
           FROM "AnalyticsEvent"
           WHERE name = 'PAGE_VIEW_DURATION' AND ${pvDate} BETWEEN $1::date AND $2::date
             AND props->>'durationSeconds' ~ '^[0-9]+$'
           GROUP BY "sessionId"
         )
         SELECT AVG(total_sec)::float AS avg_seconds
         FROM durations WHERE total_sec > 0`,
        [prevStart, prevEnd]
      ),

      // Session duration: distribution by time buckets
      pool.query(
        `WITH durations AS (
           SELECT "sessionId", SUM((props->>'durationSeconds')::int) AS total_sec
           FROM "AnalyticsEvent"
           WHERE name = 'PAGE_VIEW_DURATION' AND ${pvDate} BETWEEN $1::date AND $2::date
             AND props->>'durationSeconds' ~ '^[0-9]+$'
           GROUP BY "sessionId"
         )
         SELECT
           CASE
             WHEN total_sec < 30 THEN '0-30s'
             WHEN total_sec < 60 THEN '30s-1min'
             WHEN total_sec < 180 THEN '1-3min'
             WHEN total_sec < 300 THEN '3-5min'
             ELSE '5+min'
           END AS bucket,
           COUNT(*)::int AS sessions
         FROM durations WHERE total_sec > 0
         GROUP BY 1
         ORDER BY MIN(total_sec)`,
        [start, end]
      ),

      // Session duration: top 10 longest sessions
      pool.query(
        `WITH durations AS (
           SELECT e."sessionId",
                  SUM((e.props->>'durationSeconds')::int) AS total_sec,
                  COUNT(DISTINCT e.path)::int AS pages,
                  s.device, s.city, COALESCE(NULLIF(s."utmSource",''),'Direct') AS source
           FROM "AnalyticsEvent" e
           LEFT JOIN "AnalyticsSession" s ON s."sessionId" = e."sessionId"
            WHERE e.name = 'PAGE_VIEW_DURATION' AND ${pvDate} BETWEEN $1::date AND $2::date
              AND e.props->>'durationSeconds' ~ '^[0-9]+$'
           GROUP BY e."sessionId", s.device, s.city, s."utmSource"
         )
         SELECT "sessionId", total_sec::int, pages, device, city, source
         FROM durations WHERE total_sec > 0
         ORDER BY total_sec DESC LIMIT 10`,
        [start, end]
      ),

      // Session duration: average time by page/URL
      pool.query(
        `SELECT e.path,
                AVG((e.props->>'durationSeconds')::int)::float AS avg_seconds,
                COUNT(*)::int AS views
         FROM "AnalyticsEvent" e
          WHERE e.name = 'PAGE_VIEW_DURATION' AND ${pvDate} BETWEEN $1::date AND $2::date
            AND e.props->>'durationSeconds' ~ '^[0-9]+$'
           AND e.path IS NOT NULL
         GROUP BY e.path
         HAVING COUNT(*) >= 5
         ORDER BY avg_seconds DESC LIMIT 15`,
        [start, end]
      ),

      // Page-elements tracking: which UI elements customers actually click, grouped
      // by the page they clicked on. Powers the "what do they click, where" view.
      // Excludes admin/api paths (that's us, not customers).
      pool.query(
        `SELECT path,
                COALESCE(NULLIF(TRIM(props->>'label'),''), props->>'id', props->>'tag') AS element,
                props->>'id' AS id,
                COUNT(*)::int AS clicks,
                COUNT(DISTINCT "sessionId")::int AS sessions
         FROM "AnalyticsEvent"
         WHERE name = 'CLICK_UI'
           AND ${pvDate} BETWEEN $1::date AND $2::date
           AND path IS NOT NULL
           AND path NOT LIKE '/admin%'
           AND path NOT LIKE '/api%'
         GROUP BY path, COALESCE(NULLIF(TRIM(props->>'label'),''), props->>'id', props->>'tag'), props->>'id'
         HAVING COUNT(*) >= 2
         ORDER BY clicks DESC LIMIT 120`,
        [start, end]
      ),

      // Checkout abandons: where in checkout they drop, and the reason captured.
      pool.query(
        `SELECT COALESCE(NULLIF(TRIM(props->>'step'),''),'?') AS step,
                COALESCE(NULLIF(TRIM(props->>'reason'),''),'?') AS reason,
                COUNT(*)::int AS count,
                COUNT(DISTINCT "sessionId")::int AS sessions
         FROM "AnalyticsEvent"
         WHERE name = 'CHECKOUT_ABANDONED' AND ${pvDate} BETWEEN $1::date AND $2::date
         GROUP BY 1, 2 ORDER BY count DESC LIMIT 30`,
        [start, end]
      ),

      // Abandoned carts = actionable leads (typed contact, never ordered). Newest first.
      // Suit la PÉRIODE SÉLECTIONNÉE : c'était figé sur 30 jours, donc la carte affichait
      // les mêmes leads quel que soit le filtre de dates (7 j, mois, période perso).
      pool.query(
        `SELECT name, phone, city, "cartTotal"::float AS total,
                "lastStep", reason, "updatedAt"
         FROM "AbandonedCheckout"
         WHERE contacted = false AND "orderId" IS NULL
           AND ("updatedAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
         ORDER BY "updatedAt" DESC LIMIT 50`,
        [start, end]
      ),

      // CONVERSION PAR APPAREIL — rapatriée de la page « Parcours » (supprimée car
      // son entonnoir doublait celui d'ici). C'était la seule donnée qu'on n'avait
      // nulle part ailleurs : mobile vs desktop change tout sur une boutique COD.
      pool.query(
        `WITH sess AS (
           SELECT DISTINCT s."sessionId", COALESCE(NULLIF(TRIM(s.device),''),'inconnu') AS device
           FROM "AnalyticsSession" s
           WHERE s."sessionId" IN (SELECT DISTINCT "sessionId" FROM "PageView" WHERE ${pvDate} BETWEEN $1::date AND $2::date)
         ),
         ord AS (
           SELECT DISTINCT "sessionId" FROM "Order"
           WHERE status = ANY($3) AND "sessionId" IS NOT NULL AND ${orderDate} BETWEEN $1::date AND $2::date
         )
         SELECT sess.device,
                COUNT(DISTINCT sess."sessionId")::int AS visitors,
                COUNT(DISTINCT o."sessionId")::int AS orders
         FROM sess LEFT JOIN ord o ON o."sessionId" = sess."sessionId"
         GROUP BY sess.device ORDER BY visitors DESC`,
        [start, end, REVENUE_STATUSES]
      ),

      // TAUX d'abandon panier / checkout — l'autre donnée unique de « Parcours ».
      // Les cartes d'ici listent QUI rappeler ; ceci donne le TAUX, qui manquait.
      // Même sémantique que l'entonnoir corrigé : on n'exige pas de vue produit.
      pool.query(
        `WITH ev AS (
           SELECT "sessionId", name, MIN("createdAt") AS first_at
           FROM "AnalyticsEvent"
           WHERE name IN ('PRODUCT_ADD_TO_CART','BEGIN_CHECKOUT')
             AND ${pvDate} BETWEEN $1::date AND $2::date AND "sessionId" IS NOT NULL
           GROUP BY 1, 2
         ),
         firsts AS (
           SELECT "sessionId",
             MIN(first_at) FILTER (WHERE name = 'PRODUCT_ADD_TO_CART') AS cart_at,
             MIN(first_at) FILTER (WHERE name = 'BEGIN_CHECKOUT') AS checkout_at
           FROM ev GROUP BY 1
         ),
         ord AS (
           SELECT DISTINCT "sessionId" FROM "Order"
           WHERE status = ANY($3) AND "sessionId" IS NOT NULL AND ${orderDate} BETWEEN $1::date AND $2::date
         )
         SELECT
           COUNT(*) FILTER (WHERE cart_at IS NOT NULL)::int AS carts,
           COUNT(*) FILTER (WHERE cart_at IS NOT NULL AND checkout_at IS NULL)::int AS carts_abandoned,
           COUNT(*) FILTER (WHERE checkout_at IS NOT NULL)::int AS checkouts,
           COUNT(*) FILTER (WHERE checkout_at IS NOT NULL AND o."sessionId" IS NULL)::int AS checkouts_abandoned
         FROM firsts LEFT JOIN ord o USING ("sessionId")`,
        [start, end, REVENUE_STATUSES]
      ),

      // FIDÉLITÉ — sur des cosmétiques (produits qu'on rachète), le réachat est le
      // levier le moins cher. Volontairement calculé sur TOUT l'historique et non
      // sur la période : une cliente ne recommande pas en 30 jours, un taux calculé
      // sur la fenêtre courante serait mécaniquement proche de zéro et trompeur.
      // Clé = 9 derniers chiffres du téléphone (même normalisation que le back-office).
      pool.query(
        `WITH c AS (
           SELECT RIGHT(regexp_replace(COALESCE("deliveryPhone",''), '[^0-9]', '', 'g'), 9) AS phone_key,
                  COUNT(*)::int AS n,
                  MIN("createdAt") AS first_at,
                  MAX("createdAt") AS last_at
           FROM "Order"
           WHERE status = ANY($1) AND length(regexp_replace(COALESCE("deliveryPhone",''), '[^0-9]', '', 'g')) >= 9
           GROUP BY 1
         )
         SELECT COUNT(*)::int AS customers,
                COUNT(*) FILTER (WHERE n = 1)::int AS once,
                COUNT(*) FILTER (WHERE n = 2)::int AS twice,
                COUNT(*) FILTER (WHERE n >= 3)::int AS loyal,
                COALESCE(ROUND(AVG(n)::numeric, 2), 0)::float AS avg_orders,
                COALESCE(percentile_cont(0.5) WITHIN GROUP (
                  ORDER BY EXTRACT(epoch FROM (last_at - first_at)) / 86400
                ) FILTER (WHERE n > 1), 0)::int AS median_days
         FROM c`,
        [REVENUE_STATUSES]
      ),

      // QUAND les clientes commandent — jour de semaine et heure, sur la période.
      // Volume trop faible pour une grille 7×24 (elle serait quasi vide) : deux
      // séries lisibles valent mieux qu'une carte de chaleur clairsemée.
      pool.query(
        `SELECT
           EXTRACT(dow FROM "createdAt" AT TIME ZONE '${TZ}')::int AS dow,
           EXTRACT(hour FROM "createdAt" AT TIME ZONE '${TZ}')::int AS hr,
           COUNT(*)::int AS orders
         FROM "Order"
         WHERE status = ANY($3) AND ${orderDate} BETWEEN $1::date AND $2::date
         GROUP BY 1, 2`,
        [start, end, REVENUE_STATUSES]
      ),

      // REFUS À LA LIVRAISON par ville (COD annulé). Fenêtre fixe de 180 jours,
      // affichée telle quelle dans l'interface : sur 30 jours chaque ville aurait
      // 2-3 commandes et le taux ne voudrait rien dire.
      pool.query(
        `SELECT COALESCE(NULLIF(TRIM("deliveryCity"), ''), 'Non renseignée') AS city,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled
         FROM "Order"
         WHERE "createdAt" >= NOW() - INTERVAL '180 days'
         GROUP BY 1
         HAVING COUNT(*) >= 3
         ORDER BY (COUNT(*) FILTER (WHERE status = 'CANCELLED'))::float / NULLIF(COUNT(*), 0) DESC, total DESC
         LIMIT 10`
      ),

      // PAGES D'ATTERRISSAGE — sur quelle page la visiteuse arrive, et est-ce que
      // cette page vend ? Une page qui reçoit du trafic et ne convertit personne,
      // c'est du CA qu'on laisse sur la table (et souvent de la pub déjà payée).
      // On compte en sessions distinctes ; seuil à 10 visiteuses pour éviter le bruit.
      pool.query(
        `WITH s AS (
           SELECT DISTINCT "sessionId",
                  split_part(regexp_replace(COALESCE("landingUrl",''), '^https?://[^/]+', ''), '?', 1) AS lp
           FROM "AnalyticsSession"
           WHERE ("firstSeenAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
         ),
         o AS (
           SELECT DISTINCT "sessionId" FROM "Order"
           WHERE "sessionId" IS NOT NULL AND ${orderDate} BETWEEN $1::date AND $2::date
         ),
         c AS (
           SELECT DISTINCT "sessionId" FROM "AnalyticsEvent"
           WHERE name = 'PRODUCT_ADD_TO_CART' AND "sessionId" IS NOT NULL
             AND ${pvDate} BETWEEN $1::date AND $2::date
         )
         SELECT s.lp AS page,
                COUNT(DISTINCT s."sessionId")::int AS visitors,
                COUNT(DISTINCT o."sessionId")::int AS orders,
                COUNT(DISTINCT c."sessionId")::int AS carts
         FROM s LEFT JOIN o ON o."sessionId" = s."sessionId"
                LEFT JOIN c ON c."sessionId" = s."sessionId"
         WHERE COALESCE(s.lp,'') <> ''
         GROUP BY s.lp
         HAVING COUNT(DISTINCT s."sessionId") >= 10
         ORDER BY visitors DESC
         LIMIT 14`,
        [start, end]
      ),

      // PROFONDEUR DE VISITE — le clivage le plus net du site : une visiteuse qui ne
      // voit qu'UNE page n'achète jamais (0 sur 1 573 sessions mesurées), alors qu'à
      // partir de la 2e page elle achète à ~3,5 % QUEL QUE SOIT son point d'entrée.
      // Le vrai levier n'est donc pas « quelle page », c'est « déclencher le 2e clic ».
      pool.query(
        `WITH land AS (
           SELECT "sessionId",
                  split_part(regexp_replace(COALESCE("landingUrl",''), '^https?://[^/]+', ''), '?', 1) AS lp
           FROM "AnalyticsSession"
           WHERE ("firstSeenAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
         ),
         pv AS (
           SELECT "sessionId", COUNT(*)::int AS pages FROM "PageView"
           WHERE ${pvDate} BETWEEN $1::date AND $2::date GROUP BY 1
         ),
         o AS (
           SELECT DISTINCT "sessionId" FROM "Order"
           WHERE "sessionId" IS NOT NULL AND ${orderDate} BETWEEN $1::date AND $2::date
         )
         SELECT CASE WHEN l.lp = '/' THEN 'Entrée par l''accueil' ELSE 'Entrée directe (pub / SEO)' END AS entry,
                (COALESCE(p.pages, 1) = 1) AS single_page,
                COUNT(*)::int AS sessions,
                COUNT(o."sessionId")::int AS orders
         FROM land l
         LEFT JOIN pv p ON p."sessionId" = l."sessionId"
         LEFT JOIN o ON o."sessionId" = l."sessionId"
         WHERE COALESCE(l.lp,'') <> ''
         GROUP BY 1, 2 ORDER BY sessions DESC`,
        [start, end]
      ),

      // CATALOGUE vs TRAFIC — pour chaque page marque / catégorie qui reçoit du monde,
      // quelle part de ce qui y est affiché est réellement ACHETABLE ? Envoyer du
      // trafic (et de la pub) vers une page où la moitié des produits affiche
      // « Prévenez-moi » est la façon la plus silencieuse de perdre des ventes.
      // Le rapprochement page ↔ catalogue se fait côté JS (slug), plus sûr qu'en SQL.
      pool.query(
        `SELECT split_part(regexp_replace(COALESCE(url,''), '^https?://[^/]+', ''), '?', 1) AS path,
                COUNT(DISTINCT "sessionId")::int AS sessions
         FROM "PageView"
         WHERE ${pvDate} BETWEEN $1::date AND $2::date
           AND (url LIKE '%/marques/%' OR url LIKE '%/categorie/%')
         GROUP BY 1 HAVING COUNT(DISTINCT "sessionId") >= 5
         ORDER BY sessions DESC LIMIT 20`,
        [start, end]
      ),
      pool.query(
        `SELECT 'brand' AS kind, brand AS label,
                COUNT(*)::int AS displayed,
                COUNT(*) FILTER (WHERE (stock + COALESCE("virtualStock",0)) > 0 AND NOT COALESCE("importUnavailable",false))::int AS buyable
         FROM "Product" WHERE active = true AND COALESCE(TRIM(brand),'') <> ''
         GROUP BY brand
         UNION ALL
         SELECT 'category', c.slug,
                COUNT(*)::int,
                COUNT(*) FILTER (WHERE (p.stock + COALESCE(p."virtualStock",0)) > 0 AND NOT COALESCE(p."importUnavailable",false))::int
         FROM "Category" c
         JOIN "_CategoryToProduct" ctp ON ctp."A" = c.id
         JOIN "Product" p ON p.id = ctp."B"
         WHERE p.active = true
         GROUP BY c.slug`
      ),

      // PARCOURS APRÈS L'ACCUEIL — l'accueil concentre les 2/3 des entrées : que font
      // ces visiteuses ensuite, et quel chemin transforme ? On classe la 2e page vue
      // par TYPE (fiche, marque, catégorie…) plutôt que par URL, sinon on obtient
      // des centaines de lignes illisibles. « Repart sans 2e page » = rebond.
      pool.query(
        `WITH landed AS (
           SELECT DISTINCT "sessionId" FROM "AnalyticsSession"
           WHERE split_part(regexp_replace(COALESCE("landingUrl",''), '^https?://[^/]+', ''), '?', 1) = '/'
             AND ("firstSeenAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
         ),
         pv AS (
           SELECT p."sessionId",
                  split_part(regexp_replace(COALESCE(p.url,''), '^https?://[^/]+', ''), '?', 1) AS path,
                  ROW_NUMBER() OVER (PARTITION BY p."sessionId" ORDER BY p."createdAt") AS rn
           FROM "PageView" p JOIN landed l ON l."sessionId" = p."sessionId"
           WHERE ${pvDate} BETWEEN $1::date AND $2::date
         ),
         second AS (SELECT "sessionId", path FROM pv WHERE rn = 2),
         o AS (
           SELECT DISTINCT "sessionId" FROM "Order"
           WHERE "sessionId" IS NOT NULL AND ${orderDate} BETWEEN $1::date AND $2::date
         )
         SELECT CASE
                  WHEN s.path IS NULL THEN 'Repart sans 2e page'
                  WHEN s.path LIKE '/products/%' THEN 'Fiche produit'
                  WHEN s.path LIKE '/marques%' THEN 'Page marque'
                  WHEN s.path LIKE '/categorie%' THEN 'Catégorie'
                  WHEN s.path LIKE '/checkout%' THEN 'Checkout'
                  WHEN s.path = '/' OR s.path = '' THEN 'Reste sur l''accueil'
                  ELSE 'Autre page'
                END AS step,
                COUNT(DISTINCT l."sessionId")::int AS sessions,
                COUNT(DISTINCT o."sessionId")::int AS orders
         FROM landed l
         LEFT JOIN second s ON s."sessionId" = l."sessionId"
         LEFT JOIN o ON o."sessionId" = l."sessionId"
         GROUP BY 1 ORDER BY sessions DESC`,
        [start, end]
      ),

      // ENTONNOIR OTP — la vérification du numéro est le dernier obstacle avant la
      // commande, et c'était un angle mort total : les 8 événements OTP étaient
      // jetés par /api/events (nom absent du contrat), donc 0 en base. Corrigé —
      // cette vue se remplit à partir du déploiement du correctif.
      pool.query(
        `SELECT
           COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'OTP_REQUESTED')::int AS requested,
           COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'OTP_SENT')::int AS sent,
           COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'OTP_SUBMITTED')::int AS submitted,
           COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'OTP_VERIFIED')::int AS verified,
           COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'OTP_INVALID')::int AS invalid,
           COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'OTP_RESENT')::int AS resent,
           COUNT(DISTINCT "sessionId") FILTER (WHERE name IN ('OTP_SEND_FAILED','OTP_DELIVERY_FAILED'))::int AS failed
         FROM "AnalyticsEvent"
         WHERE name LIKE 'OTP\\_%' AND "sessionId" IS NOT NULL
           AND ${pvDate} BETWEEN $1::date AND $2::date`,
        [start, end]
      ),
    ])

    const orders = num(ordersAgg.rows[0]?.orders)
    const revenue = num(ordersAgg.rows[0]?.revenue)
    const visitors = num(traffic.rows[0]?.visitors)
    const pageviews = num(traffic.rows[0]?.pageviews)
    const prevOrders = num(prevOrdersAgg.rows[0]?.orders)
    const prevRevenue = num(prevOrdersAgg.rows[0]?.revenue)
    const prevVisitors = num(prevTraffic.rows[0]?.visitors)

    const aov = orders > 0 ? revenue / orders : 0
    // CVR = site sessions that converted / site visitors. Uses convertedSessions
    // (sessionId not null) — NOT the raw order count, which includes off-site
    // Instagram/Sendit orders that never touched the site. Clamp to 100% in case
    // a converting buyer's session was excluded from the bot-filtered visitor set.
    const convertedSessions = num(ordersAgg.rows[0]?.convertedSessions)
    const conversionRate = visitors > 0 ? Math.min(100, (convertedSessions / visitors) * 100) : 0

    // Funnel ordered
    const fmap = new Map(funnelRows.rows.map((r: DbRow) => [String(r.name), num(r.sessions)]))
    const META_CHANNELS = ['facebook', 'fb', 'instagram', 'insta', 'ig', 'meta']
    const [
      channelRoasRes, metaSpendRes, metaMarginRes, totalMarginRes, totalSpendRes,
      prevMarginRes, prevSpendRes, opexRes,
    ] = await Promise.all([
      // TABLEAU PAR CANAL D'ACQUISITION REEL.
      //
      // Avant, cette requete groupait sur `sourceChannel`, dont les valeurs sont
      // `website` (33), `instagram` (22), `whatsapp` (9) : un melange du TYPE de
      // commande et de l'ORIGINE d'une saisie manuelle. Les 15 commandes venues
      // des publicites (utm ig/fb) etaient noyees dans `website` — on divisait
      // 2 287 MAD de depense Meta par un tableau ou Meta n'apparaissait pas.
      //
      // On ajoute la marge (pour juger un canal a ce qu'il RAPPORTE, pas a ce
      // qu'il encaisse) et le rachat (un canal qui amene des clientes qui
      // reviennent vaut plus cher que son ROAS immediat ne le dit).
      pool.query(
        `WITH ord AS (
           SELECT ${acquisitionChannelSql('o', 's')} AS channel,
                  o.status,
                  COALESCE(o.revenue, o."productsTotal", o.total) AS total,
                  COALESCE(o."finalProfit", o."estimatedProfit", 0) AS profit,
                  NULLIF(TRIM(o."deliveryPhone"),'') AS phone
           FROM "Order" o
           LEFT JOIN "AnalyticsSession" s ON s."sessionId" = o."sessionId"
           WHERE ${basisDateExpr(basis, 'o')} BETWEEN $1::date AND $2::date
         ),
         repeat_phones AS (
           SELECT NULLIF(TRIM("deliveryPhone"),'') AS phone
           FROM "Order" WHERE status = 'DELIVERED' AND NULLIF(TRIM("deliveryPhone"),'') IS NOT NULL
           GROUP BY 1 HAVING COUNT(*) > 1
         )
         SELECT channel,
                COUNT(*)::int AS placed,
                COUNT(*) FILTER (WHERE status = 'DELIVERED')::int AS delivered,
                COALESCE(SUM(total) FILTER (WHERE status = 'DELIVERED'),0)::float AS delivered_revenue,
                COALESCE(SUM(profit) FILTER (WHERE status = 'DELIVERED'),0)::float AS margin,
                COUNT(DISTINCT ord.phone) FILTER (WHERE ord.status = 'DELIVERED')::int AS buyers,
                COUNT(DISTINCT ord.phone) FILTER (
                  WHERE ord.status = 'DELIVERED' AND ord.phone IN (SELECT phone FROM repeat_phones)
                )::int AS repeat_buyers
         FROM ord
         GROUP BY channel ORDER BY margin DESC`,
        [start, end]
      ),
      // Real Meta spend over the SELECTED period (per-day, from the Meta daily sync).
      // 0 until the next sync populates AdSpendDaily -> the page falls back to manual.
      pool.query(
        `SELECT COALESCE(SUM(spend),0)::float AS spend FROM "AdSpendDaily"
         WHERE LOWER(platform) = 'meta' AND date BETWEEN $1::date AND $2::date`,
        [start, end]
      ),
      // Marge de contribution (AVANT publicite) des commandes livrees issues des
      // PUBLICITES Meta. Le filtre porte desormais sur les utm — comme la table
      // par canal — et non plus sur `sourceChannel`, qui rangeait ici les DM
      // Instagram saisis a la main : on comparait une depense publicitaire a une
      // marge produite par des conversations privees.
      // finalProfit nette COGS + livraison reelle + retours ; il n'existe qu'une
      // fois le cout de livraison connu, d'ou le repli sur estimatedProfit.
      pool.query(
        `SELECT COALESCE(SUM(COALESCE(o."finalProfit", o."estimatedProfit", 0)),0)::float AS margin
         FROM "Order" o
         LEFT JOIN "AnalyticsSession" s ON s."sessionId" = o."sessionId"
         WHERE o.status = 'DELIVERED'
           AND ${acquisitionChannelSql('o', 's')} IN ('Instagram Ads','Facebook Ads')
           AND ${basisDateExpr(basis, 'o')} BETWEEN $1::date AND $2::date`,
        [start, end]
      ),
      // Marge de contribution TOTALE (tous canaux), et depense publicitaire
      // TOUTES plateformes. Les deux requetes au-dessus ne couvraient que Meta :
      // impossible d'ecrire la chaine de l'argent de bout en bout, donc
      // impossible de dire ce que la periode a REELLEMENT laisse.
      //
      // On sort ici les quatre grandeurs de la decomposition (cf. metrics.ts §5)
      // pour la periode ET la precedente, plus la maturite : sans elles, « la
      // marge a baisse de 900 MAD » ne designe aucun responsable.
      pool.query(
        `SELECT
           COALESCE(SUM(COALESCE("finalProfit", "estimatedProfit", 0)) FILTER (WHERE status = 'DELIVERED'),0)::float AS margin,
           COUNT(*) FILTER (WHERE status = 'DELIVERED')::int AS delivered,
           COUNT(*)::int AS placed,
           COUNT(*) FILTER (WHERE status NOT IN ('DELIVERED','CANCELLED'))::int AS in_flight,
           COALESCE(SUM(COALESCE(revenue, "productsTotal", total)) FILTER (WHERE status = 'DELIVERED'),0)::float AS delivered_revenue,
           COALESCE(SUM(COALESCE(revenue, "productsTotal", total)) FILTER (WHERE status NOT IN ('DELIVERED','CANCELLED')),0)::float AS pending_revenue
         FROM "Order"
         WHERE ${orderDate} BETWEEN $1::date AND $2::date`,
        [start, end]
      ),
      pool.query(
        `SELECT COALESCE(SUM(spend),0)::float AS spend FROM "AdSpendDaily"
         WHERE date BETWEEN $1::date AND $2::date`,
        [start, end]
      ),
      // Les memes grandeurs sur la periode PRECEDENTE — le terme de comparaison
      // de la decomposition.
      pool.query(
        `SELECT
           COALESCE(SUM(COALESCE("finalProfit", "estimatedProfit", 0)) FILTER (WHERE status = 'DELIVERED'),0)::float AS margin,
           COUNT(*) FILTER (WHERE status = 'DELIVERED')::int AS delivered,
           COUNT(*)::int AS placed
         FROM "Order"
         WHERE ${orderDate} BETWEEN $1::date AND $2::date`,
        [prevStart, prevEnd]
      ),
      pool.query(
        `SELECT COALESCE(SUM(spend),0)::float AS spend FROM "AdSpendDaily"
         WHERE date BETWEEN $1::date AND $2::date`,
        [prevStart, prevEnd]
      ),
      // Charges d'exploitation de la periode. La table est vide a ce jour : le
      // compte de resultat doit donc afficher 0 AVEC la mention « aucune charge
      // saisie », jamais un zero muet qui se lirait comme « pas de charges ».
      pool.query(
        `SELECT COALESCE(SUM(amount),0)::float AS total, COUNT(*)::int AS n
         FROM "OperatingExpense" WHERE date BETWEEN $1::date AND $2::date`,
        [start, end]
      ),
    ])
    const metaSpendPeriod = num(metaSpendRes.rows[0]?.spend)
    const metaMargin = num(metaMarginRes.rows[0]?.margin) // before ad spend
    // CA livre des PUBLICITES Meta sur la periode. Meme correction que la marge
    // ci-dessus : on lit les canaux publicitaires nommes, plus `sourceChannel`.
    const metaRevenue = channelRoasRes.rows
      .filter((r: DbRow) => ['Instagram Ads', 'Facebook Ads'].includes(String(r.channel)))
      .reduce((s: number, r: DbRow) => s + num(r.delivered_revenue), 0)

    // ── LA DECOMPOSITION DE L'ECART ──────────────────────────────────────────
    // marge nette = commandes x taux de livraison x marge/commande − publicite.
    // On attribue la variation a chaque facteur, en dirhams. La somme des effets
    // reconstitue EXACTEMENT l'ecart (verifie sur 7/30/90 j, residu nul).
    const etatCourant: EtatMarge = {
      commandes: num(totalMarginRes.rows[0]?.placed),
      livrees: num(totalMarginRes.rows[0]?.delivered),
      marge: num(totalMarginRes.rows[0]?.margin),
      pub: num(totalSpendRes.rows[0]?.spend),
    }
    const etatPrecedent: EtatMarge = {
      commandes: num(prevMarginRes.rows[0]?.placed),
      livrees: num(prevMarginRes.rows[0]?.delivered),
      marge: num(prevMarginRes.rows[0]?.margin),
      pub: num(prevSpendRes.rows[0]?.spend),
    }
    const decomposition = decomposeMargin(etatCourant, etatPrecedent)

    // Maturite : le delai median commande -> livraison est de 1,4 jour. Les
    // commandes des derniers jours sont encore en vol et leur taux de livraison
    // ne peut que monter — l'afficher sans le dire fait passer un chiffre
    // provisoire pour un resultat.
    const mat = maturite(etatCourant.commandes, num(totalMarginRes.rows[0]?.in_flight))

    // ── CE QUE LA DONNEE DEJA COLLECTEE PERMET, ET QUE PERSONNE NE REGARDAIT ──
    // `_device`, `_locale`, `_source` sont presents sur 100 % des 42 134
    // evenements des 30 derniers jours. Aucune carte ne les utilisait.
    const [merchFunnelRes, shelfPosRes, abandonValueRes, localeSegRes, deviceSegRes] = await Promise.all([
      // ENTONNOIR DE MARCHANDISAGE, par produit. Il separe deux maladies
      // opposees que le CA seul confond : « vu mais jamais clique » (le visuel
      // ou le prix n'accroche pas en rayon) et « clique mais jamais ajoute »
      // (la fiche produit ne convainc pas). Le remede n'est pas le meme.
      pool.query(
        `WITH e AS (
           SELECT (props->>'productId') AS pid, name
           FROM "AnalyticsEvent"
           WHERE name IN ('PRODUCT_IMPRESSION','PRODUCT_CLICK','PRODUCT_VIEW_DETAIL','PRODUCT_ADD_TO_CART')
             AND ${pvDate} BETWEEN $1::date AND $2::date
             AND props->>'productId' IS NOT NULL ${segEvent}
         )
         SELECT e.pid::int AS "productId", p.name, p.brand,
                COUNT(*) FILTER (WHERE e.name = 'PRODUCT_IMPRESSION')::int AS impressions,
                COUNT(*) FILTER (WHERE e.name = 'PRODUCT_CLICK')::int AS clicks,
                COUNT(*) FILTER (WHERE e.name = 'PRODUCT_VIEW_DETAIL')::int AS views,
                COUNT(*) FILTER (WHERE e.name = 'PRODUCT_ADD_TO_CART')::int AS carts
         FROM e JOIN "Product" p ON p.id = e.pid::int
         GROUP BY 1,2,3
         HAVING COUNT(*) FILTER (WHERE e.name = 'PRODUCT_IMPRESSION') > 0
         ORDER BY impressions DESC LIMIT 40`,
        [start, end]
      ),
      // EFFICACITE DES ETAGERES par bloc de position. 9 516 impressions en
      // position 1-3 contre 2 290 au-dela de 25 : le CTR par bloc dit ou
      // s'arrete l'attention, donc la longueur utile d'une etagere.
      pool.query(
        `WITH ev AS (
           SELECT name, "sessionId",
                  CASE
                    WHEN (props->>'position')::int <= 3 THEN '1 à 3'
                    WHEN (props->>'position')::int <= 6 THEN '4 à 6'
                    WHEN (props->>'position')::int <= 12 THEN '7 à 12'
                    WHEN (props->>'position')::int <= 24 THEN '13 à 24'
                    ELSE '25 et plus'
                  END AS bloc,
                  (props->>'position')::int AS pos,
                  props->>'productId' AS pid
           FROM "AnalyticsEvent"
           WHERE name IN ('PRODUCT_IMPRESSION','PRODUCT_CLICK')
             AND props->>'position' ~ '^[0-9]+$'
             AND ${pvDate} BETWEEN $1::date AND $2::date ${segEvent}
         )
         SELECT bloc, MIN(pos)::int AS ordre,
                COUNT(*) FILTER (WHERE name = 'PRODUCT_IMPRESSION')::int AS impressions,
                COUNT(*) FILTER (WHERE name = 'PRODUCT_CLICK')::int AS clicks
         FROM ev GROUP BY bloc ORDER BY ordre`,
        [start, end]
      ),
      // VALEUR RECUPERABLE DES ABANDONS. 152 abandons pour 63 492 MAD de paniers
      // sur 30 j — plus de trois fois le CA realise. L'evenement porte l'etape,
      // la raison ET le contenu du panier : chaque correctif peut donc etre
      // chiffre au lieu d'etre suppose.
      pool.query(
        `SELECT props->>'step' AS step,
                COALESCE(props->>'reason','—') AS reason,
                COUNT(*)::int AS abandons,
                COUNT(DISTINCT "sessionId")::int AS sessions,
                COALESCE(SUM((props->>'cartValue')::numeric),0)::float AS value,
                COALESCE(AVG((props->>'cartValue')::numeric),0)::float AS avg_value
         FROM "AnalyticsEvent"
         WHERE name = 'CHECKOUT_ABANDONED'
           AND props->>'cartValue' ~ '^[0-9.]+$'
           AND ${pvDate} BETWEEN $1::date AND $2::date ${segEvent}
         GROUP BY 1,2 ORDER BY value DESC LIMIT 12`,
        [start, end]
      ),
      // LANGUE. Premier constat que la segmentation fait apparaitre : l'arabe
      // fait 90 sessions et ZERO commande, contre 1,36 % en francais. Un segment
      // entier a l'arret, invisible depuis toujours.
      pool.query(
        `WITH s AS (
           SELECT "sessionId", MAX(props->>'_locale') AS seg
           FROM "AnalyticsEvent"
           WHERE ${pvDate} BETWEEN $1::date AND $2::date AND props ? '_locale'
           GROUP BY 1
         )
         SELECT s.seg, COUNT(*)::int AS sessions,
                COUNT(o.id)::int AS orders,
                COALESCE(SUM(COALESCE(o.revenue, o."productsTotal", o.total)) FILTER (WHERE o.status = 'DELIVERED'),0)::float AS revenue
         FROM s LEFT JOIN "Order" o ON o."sessionId" = s."sessionId"
         GROUP BY 1 ORDER BY sessions DESC`,
        [start, end]
      ),
      pool.query(
        `WITH s AS (
           SELECT "sessionId", MAX(props->>'_device') AS seg
           FROM "AnalyticsEvent"
           WHERE ${pvDate} BETWEEN $1::date AND $2::date AND props ? '_device'
           GROUP BY 1
         )
         SELECT s.seg, COUNT(*)::int AS sessions,
                COUNT(o.id)::int AS orders,
                COALESCE(SUM(COALESCE(o.revenue, o."productsTotal", o.total)) FILTER (WHERE o.status = 'DELIVERED'),0)::float AS revenue
         FROM s LEFT JOIN "Order" o ON o."sessionId" = s."sessionId"
         GROUP BY 1 ORDER BY sessions DESC`,
        [start, end]
      ),
    ])

    const funnel = [
      { stage: 'Visiteurs', sessions: visitors },
      { stage: 'Vues produit', sessions: num(fmap.get('PRODUCT_VIEW_DETAIL')) },
      { stage: 'Ajouts panier', sessions: num(fmap.get('PRODUCT_ADD_TO_CART')) },
      { stage: 'Panier ouvert', sessions: num(fmap.get('VIEW_CART')) },
      { stage: 'Checkout', sessions: num(fmap.get('BEGIN_CHECKOUT')) },
      { stage: 'Paiement', sessions: num(fmap.get('ADD_PAYMENT_INFO')) },
      { stage: 'Commandes', sessions: num(fmap.get('ORDER_COMPLETED')) },
    ]

    return {
      period: { start, end, days },
      kpis: {
        revenue, orders, aov, visitors, pageviews, conversionRate,
        revenueDelta: delta(revenue, prevRevenue),
        ordersDelta: delta(orders, prevOrders),
        visitorsDelta: delta(visitors, prevVisitors),
        aov_prev: prevOrders > 0 ? prevRevenue / prevOrders : 0,
      },
      revenueByDay: revenueByDay.rows.map((r: DbRow) => ({ date: r.date, revenue: num(r.revenue), pending: num(r.pending), orders: num(r.orders), units: num(r.units), sessions: num(r.sessions), conversions: num(r.conversions) })),
      ordersByStatus: ordersByStatus.rows.map((r: DbRow) => ({ status: r.status, count: num(r.count), revenue: num(r.revenue) })),
      topProducts: topProducts.rows.map((r: DbRow) => ({ name: r.name, brand: r.brand, units: num(r.units), revenue: num(r.revenue), views: num(r.views) })),
      topBrands: topBrands.rows.map((r: DbRow) => ({ brand: r.brand, units: num(r.units), revenue: num(r.revenue) })),
      channels: channels.rows.map((r: DbRow) => ({ channel: r.channel, type: String(r.type), paid: r.paid === true, orders: num(r.orders), revenue: num(r.revenue) })),
      channelRoas: channelRoasRes.rows.map((r: DbRow) => ({
        channel: r.channel, placed: num(r.placed), delivered: num(r.delivered),
        deliveryRate: num(r.placed) > 0 ? Math.round((num(r.delivered) / num(r.placed)) * 100) : 0,
        deliveredRevenue: num(r.delivered_revenue),
        aov: num(r.delivered) > 0 ? Math.round(num(r.delivered_revenue) / num(r.delivered)) : 0,
        // Un canal se juge a ce qu'il RAPPORTE, pas a ce qu'il encaisse : deux
        // canaux au meme CA n'ont pas la meme marge.
        margin: num(r.margin),
        buyers: num(r.buyers),
        repeatBuyers: num(r.repeat_buyers),
      })),
      roas: { metaRevenue, metaSpendPeriod, metaMargin },
      // La chaine de l'argent, de bout en bout : ce que la periode a coute en
      // publicite, ce qu'elle a rapporte en marge, et ce qu'il reste.
      money: {
        adSpend: num(totalSpendRes.rows[0]?.spend),
        margin: num(totalMarginRes.rows[0]?.margin),
        delivered: num(totalMarginRes.rows[0]?.delivered),
        placed: num(totalMarginRes.rows[0]?.placed),
        deliveredRevenue: num(totalMarginRes.rows[0]?.delivered_revenue),
        // Encaissable mais pas encore encaisse : c'est ce que la maturite
        // explique, et ce qui manquait pour que « CA realise » cesse d'etre
        // confondu avec « CA potentiel ».
        pendingRevenue: num(totalMarginRes.rows[0]?.pending_revenue),
        opex: num(opexRes.rows[0]?.total),
        opexEntries: num(opexRes.rows[0]?.n),
      },
      // Quelle est la base de lecture, et l'assume-t-on ? Sans cette mention, le
      // meme ecran vaut 19 337 ou 21 431 MAD sans qu'on sache lequel.
      basis,
      segment,
      maturite: mat,
      decomposition,
      // Marchandisage : de l'impression en rayon a l'ajout au panier.
      merchFunnel: merchFunnelRes.rows.map((r: DbRow) => ({
        productId: num(r.productId), name: String(r.name), brand: (r.brand as string) || '—',
        impressions: num(r.impressions), clicks: num(r.clicks),
        views: num(r.views), carts: num(r.carts),
      })),
      shelfPositions: shelfPosRes.rows.map((r: DbRow) => ({
        bloc: String(r.bloc), impressions: num(r.impressions), clicks: num(r.clicks),
      })),
      abandonValue: abandonValueRes.rows.map((r: DbRow) => ({
        step: (r.step as string) || '—', reason: String(r.reason),
        abandons: num(r.abandons), sessions: num(r.sessions),
        value: num(r.value), avgValue: num(r.avg_value),
      })),
      segments: {
        locale: localeSegRes.rows.map((r: DbRow) => ({ seg: String(r.seg), sessions: num(r.sessions), orders: num(r.orders), revenue: num(r.revenue) })),
        device: deviceSegRes.rows.map((r: DbRow) => ({ seg: String(r.seg), sessions: num(r.sessions), orders: num(r.orders), revenue: num(r.revenue) })),
      },
      cities: cities.rows.map((r: DbRow) => ({ city: r.city, orders: num(r.orders), revenue: num(r.revenue) })),
      trafficSources: trafficSources.rows.map((r: DbRow) => ({ source: r.source, visitors: num(r.visitors), orders: num(r.orders), revenue: num(r.revenue) })),
      funnel,
      realtime: { activeVisitors: num(realtime.rows[0]?.activeVisitors), recentPageviews: num(realtime.rows[0]?.recentPageviews) },
      lowStock: lowStock.rows.map((r: DbRow) => ({ name: r.name, brand: r.brand, stock: num(r.stock) })),
      topActions: topActions.rows.map((r: DbRow) => ({ name: r.name, count: num(r.count), sessions: num(r.sessions) })),
      searchQueries: searchQueries.rows.map((r: DbRow) => ({ query: r.query, searches: num(r.searches), customers: num(r.customers), zero: num(r.zero), avgResults: num(r.avg_results) })),
      // Demande manquante : ce que des clientes cherchent et que tu ne vends pas.
      // Fidelite / reachat (tout l'historique, volontairement hors periode).
      loyalty: (() => {
        const r = loyalty.rows[0] || {}
        const customers = num(r.customers)
        const repeat = num(r.twice) + num(r.loyal)
        return {
          customers, once: num(r.once), twice: num(r.twice), loyal: num(r.loyal),
          repeat, repeatRate: customers > 0 ? (repeat / customers) * 100 : 0,
          avgOrders: num(r.avg_orders), medianDays: num(r.median_days),
        }
      })(),
      // Quand les clientes commandent (jour de semaine x heure) sur la periode.
      orderTiming: orderTiming.rows.map((r: DbRow) => ({ dow: num(r.dow), hour: num(r.hr), orders: num(r.orders) })),
      // Refus a la livraison par ville — fenetre fixe de 180 jours.
      cityRefusals: cityRefusals.rows.map((r: DbRow) => ({
        city: String(r.city), total: num(r.total), cancelled: num(r.cancelled),
        rate: num(r.total) > 0 ? (num(r.cancelled) / num(r.total)) * 100 : 0,
      })),
      // Pages d'atterrissage : trafic vs conversion (ou l'argent est laisse sur la table).
      landingPages: landingPages.rows.map((r: DbRow) => ({
        page: String(r.page),
        visitors: num(r.visitors),
        orders: num(r.orders),
        carts: num(r.carts),
        rate: num(r.visitors) > 0 ? (num(r.orders) / num(r.visitors)) * 100 : 0,
      })),
      // Profondeur de visite : 1 page vs a navigue, par type d'entree.
      visitDepth: visitDepth.rows.map((r: DbRow) => ({
        entry: String(r.entry),
        singlePage: r.single_page === true,
        sessions: num(r.sessions),
        orders: num(r.orders),
        rate: num(r.sessions) > 0 ? (num(r.orders) / num(r.sessions)) * 100 : 0,
      })),
      // Catalogue vs trafic : part reellement achetable sur les pages qui recoivent du monde.
      // Rapprochement par slug cote JS (slugify), plus sur qu'un match SQL.
      shelfAvailability: (() => {
        const slug = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        const stock = new Map<string, { displayed: number; buyable: number; label: string }>()
        for (const r of shelfStock.rows as DbRow[]) {
          const kind = String(r.kind), label = String(r.label)
          const key = kind === 'brand' ? `brand:${slug(label)}` : `category:${slug(label)}`
          stock.set(key, { displayed: num(r.displayed), buyable: num(r.buyable), label })
        }
        const out: Array<{ page: string; label: string; sessions: number; displayed: number; buyable: number; unavailableRate: number }> = []
        for (const r of shelfTraffic.rows as DbRow[]) {
          const path = String(r.path)
          const m = path.match(/\/(marques|categorie)\/([^/]+)/)
          if (!m) continue
          const key = m[1] === 'marques' ? `brand:${slug(m[2])}` : `category:${slug(m[2])}`
          const st = stock.get(key)
          if (!st || st.displayed === 0) continue
          const prev = out.find((o) => o.page === key)
          const sessions = num(r.sessions)
          // Une meme etagere peut etre servie par /x et /ar/x : on additionne.
          if (prev) { prev.sessions += sessions; continue }
          out.push({
            page: key, label: st.label, sessions,
            displayed: st.displayed, buyable: st.buyable,
            unavailableRate: st.displayed > 0 ? ((st.displayed - st.buyable) / st.displayed) * 100 : 0,
          })
        }
        return out.sort((a, b) => b.sessions * b.unavailableRate - a.sessions * a.unavailableRate).slice(0, 8)
      })(),
      // Parcours apres l'accueil : 2e page vue par type + conversion du chemin.
      homeFlow: homeFlow.rows.map((r: DbRow) => ({
        step: String(r.step), sessions: num(r.sessions), orders: num(r.orders),
        rate: num(r.sessions) > 0 ? (num(r.orders) / num(r.sessions)) * 100 : 0,
      })),
      // Entonnoir de verification du numero (OTP) au checkout.
      otpFunnel: (() => {
        const r = otpFunnel.rows[0] || {}
        return {
          requested: num(r.requested), sent: num(r.sent), submitted: num(r.submitted),
          verified: num(r.verified), invalid: num(r.invalid), resent: num(r.resent),
          failed: num(r.failed),
        }
      })(),
      // Conversion par appareil (rapatriee de « Parcours »).
      deviceConversion: deviceConv.rows.map((r: DbRow) => ({
        device: String(r.device),
        visitors: num(r.visitors),
        orders: num(r.orders),
        rate: num(r.visitors) > 0 ? (num(r.orders) / num(r.visitors)) * 100 : 0,
      })),
      // Taux d'abandon panier / checkout (rapatries de « Parcours »).
      abandonRates: (() => {
        const r = abandonRates.rows[0] || {}
        const carts = num(r.carts), cartsAb = num(r.carts_abandoned)
        const cos = num(r.checkouts), cosAb = num(r.checkouts_abandoned)
        return {
          cart: { total: carts, abandoned: cartsAb, rate: carts > 0 ? (cartsAb / carts) * 100 : 0 },
          checkout: { total: cos, abandoned: cosAb, rate: cos > 0 ? (cosAb / cos) * 100 : 0 },
        }
      })(),
      searchMissing: searchMissing.rows.map((r: DbRow) => ({ term: r.term, customers: num(r.customers), attempts: num(r.attempts) })),
      // Entonnoir de la recherche (sessions distinctes).
      searchFunnel: {
        searched: num(searchFunnel.rows[0]?.searched),
        clicked: num(searchFunnel.rows[0]?.clicked),
        converted: num(searchFunnel.rows[0]?.converted),
        deadEnd: num(searchFunnel.rows[0]?.dead_end),
      },
      errors: {
        total: errorsAgg.rows.reduce((s: number, r: DbRow) => s + num(r.count), 0),
        byType: errorsAgg.rows.map((r: DbRow) => ({ name: r.name, count: num(r.count), sessions: num(r.sessions) })),
        recent: errorSamples.rows.map((r: DbRow) => ({ name: r.name, error: r.error, sessionId: r.sessionId, at: r.createdAt })),
      },
      recentSessions: recentSessions.rows.map((r: DbRow) => ({
        sessionId: r.sessionId, actions: num(r.actions), productViews: num(r.productViews), carts: num(r.carts),
        searches: num(r.searches), errors: num(r.errors), device: r.device || '—', city: r.city || '—',
        source: r.source, ordered: !!r.ordered, lastSeen: r.lastSeen, durationSec: num(r.durationSec),
        visitorName: (r.visitorName as string) || null, visitorPhone: (r.visitorPhone as string) || null,
        hasAccount: !!r.hasAccount,
      })),
      sessionDuration: {
        avgSeconds: num(avgDuration.rows[0]?.avg_seconds),
        sessionsCount: num(avgDuration.rows[0]?.sessions_count),
        prevAvgSeconds: num(prevAvgDuration.rows[0]?.avg_seconds),
        delta: delta(num(avgDuration.rows[0]?.avg_seconds), num(prevAvgDuration.rows[0]?.avg_seconds)),
        distribution: durationBuckets.rows.map((r: DbRow) => ({ bucket: r.bucket, sessions: num(r.sessions) })),
        topSessions: topSessions.rows.map((r: DbRow) => ({
          sessionId: r.sessionId, totalSec: num(r.total_sec), pages: num(r.pages),
          device: r.device || '—', city: r.city || '—', source: r.source
        })),
        byPage: durationByPage.rows.map((r: DbRow) => ({ path: r.path, avgSeconds: num(r.avg_seconds), views: num(r.views) })),
      },
      pageElements: pageElements.rows.map((r: DbRow) => ({
        path: r.path, element: (r.element as string) || '—', id: (r.id as string) || null,
        clicks: num(r.clicks), sessions: num(r.sessions),
      })),
      checkoutAbandon: checkoutAbandon.rows.map((r: DbRow) => ({
        step: r.step, reason: r.reason, count: num(r.count), sessions: num(r.sessions),
      })),
      abandonedCarts: abandonedCarts.rows.map((r: DbRow) => ({
        name: (r.name as string) || null, phone: (r.phone as string) || null, city: (r.city as string) || null,
        total: num(r.total), lastStep: (r.lastStep as string) || null, reason: (r.reason as string) || null,
        updatedAt: r.updatedAt,
      })),
    }
      },
      { fresh }
    )

    return NextResponse.json(
      { ...payload, _cachedAt: new Date(cachedAt).toISOString() },
      { headers: { 'Cache-Control': 'private, max-age=30' } }
    )
  } catch (error) {
    console.error('[Analytics Store] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
