import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import pool from '@/lib/db'

const TZ = 'Africa/Casablanca'
const REVENUE_STATUSES = ['DELIVERED', 'CONFIRMED']
type DbRow = Record<string, unknown>

const num = (v: unknown) => (v == null ? 0 : Number(v))

function resolveRange(searchParams: URLSearchParams) {
  const preset = searchParams.get('preset')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
  if (preset === 'today') return { start: today, end: today }
  if (preset === 'yesterday') {
    const y = new Date(); y.setDate(y.getDate() - 1)
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(y)
    return { start: d, end: d }
  }
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30'), 1), 365)
  const endD = new Date(today)
  const startD = new Date(endD); startD.setDate(startD.getDate() - (days - 1))
  return { start: startD.toISOString().split('T')[0], end: today }
}

// Resilient query runner: a single failing query returns [] for its section
// instead of rejecting the whole response (Promise.all would blank every card).
async function safeRows(label: string, q: Promise<{ rows: DbRow[] }>): Promise<DbRow[]> {
  try {
    const r = await q
    return r.rows
  } catch (e) {
    console.error(`[Products API] query "${label}" failed:`, e)
    return []
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token || token.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { start, end } = resolveRange(req.nextUrl.searchParams)
    const dateFilter = `("createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date`

    const [topByRevenue, topByViews, viewToCart, contentEngagement, contentOpportunities, topBrands, searchQueries, lowStock] = await Promise.all([
      // Top products by revenue
      safeRows('topByRevenue', pool.query(
        `SELECT p.id, p.name, p.brand,
                SUM(oi.quantity)::int AS units,
                COALESCE(SUM(oi.quantity * oi.price),0)::float AS revenue
         FROM "OrderItem" oi
         JOIN "Order" o ON o.id = oi."orderId"
         JOIN "Product" p ON p.id = oi."productId"
         WHERE o.status = ANY($3) AND (o."createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
         GROUP BY p.id, p.name, p.brand
         ORDER BY revenue DESC LIMIT 15`,
        [start, end, REVENUE_STATUSES]
      )),

      // Top products by views (regex guard: only cast numeric productIds — avoids 500 on garbage data)
      safeRows('topByViews', pool.query(
        `SELECT
           (props->>'productId')::int AS id,
           props->>'name' AS name,
           props->>'brand' AS brand,
           COUNT(*)::int AS views
         FROM "AnalyticsEvent"
         WHERE name = ANY(ARRAY['PRODUCT_VIEW_DETAIL', 'PRODUCT_IMPRESSION'])
           AND ${dateFilter}
           AND props->>'productId' ~ '^[0-9]+$'
         GROUP BY 1, 2, 3
         ORDER BY views DESC LIMIT 15`,
        [start, end]
      )),

      // View-to-cart rate. ROUND needs numeric (ROUND(double precision, int) does not exist in PG),
      // hence the ::numeric cast before rounding.
      safeRows('viewToCart', pool.query(
        `WITH views AS (
           SELECT (props->>'productId')::int AS pid, COUNT(*)::int AS view_count
           FROM "AnalyticsEvent"
           WHERE name = 'PRODUCT_VIEW_DETAIL' AND ${dateFilter} AND props->>'productId' ~ '^[0-9]+$'
           GROUP BY 1
         ),
         carts AS (
           SELECT (props->>'productId')::int AS pid, COUNT(*)::int AS cart_count
           FROM "AnalyticsEvent"
           WHERE name = 'PRODUCT_ADD_TO_CART' AND ${dateFilter} AND props->>'productId' ~ '^[0-9]+$'
           GROUP BY 1
         )
         SELECT v.pid AS id,
                (SELECT name FROM "Product" WHERE id = v.pid) AS name,
                (SELECT brand FROM "Product" WHERE id = v.pid) AS brand,
                v.view_count AS views,
                COALESCE(c.cart_count, 0)::int AS carts,
                CASE WHEN v.view_count > 0
                  THEN ROUND((COALESCE(c.cart_count, 0)::float / v.view_count * 100)::numeric, 1)
                  ELSE 0
                END AS cart_rate
         FROM views v LEFT JOIN carts c ON c.pid = v.pid
         WHERE v.view_count >= 10
         ORDER BY v.view_count DESC, cart_rate ASC
         LIMIT 12`,
        [start, end]
      )),

      // Product content engagement: which products need more reassurance/info.
      safeRows('contentEngagement', pool.query(
        `WITH content AS (
           SELECT (props->>'productId')::int AS pid,
                  COUNT(*)::int AS clicks,
                  COUNT(*) FILTER (WHERE COALESCE(props->>'action','open') = 'open')::int AS opens,
                  COUNT(DISTINCT "sessionId")::int AS sessions,
                  COUNT(*) FILTER (WHERE props->>'section' = 'description' AND COALESCE(props->>'action','open') = 'open')::int AS description_opens,
                  COUNT(*) FILTER (WHERE props->>'section' = 'ingredients' AND COALESCE(props->>'action','open') = 'open')::int AS ingredients_opens,
                  COUNT(*) FILTER (WHERE props->>'section' = 'faq' AND COALESCE(props->>'action','open') = 'open')::int AS faq_opens,
                  COUNT(*) FILTER (WHERE props->>'section' = 'usage' AND COALESCE(props->>'action','open') = 'open')::int AS usage_opens,
                  COUNT(*) FILTER (WHERE props->>'section' = 'benefits' AND COALESCE(props->>'action','open') = 'open')::int AS benefits_opens,
                  COUNT(*) FILTER (WHERE props->>'section' = 'specs' AND COALESCE(props->>'action','open') = 'open')::int AS specs_opens
           FROM "AnalyticsEvent"
           WHERE name = 'PRODUCT_CONTENT_SECTION_CLICK'
             AND ${dateFilter}
             AND props->>'productId' ~ '^[0-9]+$'
           GROUP BY 1
         ),
         views AS (
           SELECT (props->>'productId')::int AS pid, COUNT(*)::int AS views
           FROM "AnalyticsEvent"
           WHERE name = 'PRODUCT_VIEW_DETAIL' AND ${dateFilter} AND props->>'productId' ~ '^[0-9]+$'
           GROUP BY 1
         ),
         carts AS (
           SELECT (props->>'productId')::int AS pid, COUNT(*)::int AS carts
           FROM "AnalyticsEvent"
           WHERE name = 'PRODUCT_ADD_TO_CART' AND ${dateFilter} AND props->>'productId' ~ '^[0-9]+$'
           GROUP BY 1
         ),
         orders AS (
           SELECT oi."productId" AS pid, COUNT(DISTINCT o.id)::int AS orders
           FROM "OrderItem" oi
           JOIN "Order" o ON o.id = oi."orderId"
           WHERE o.status = ANY($3) AND (o."createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
           GROUP BY 1
         )
         SELECT p.id, p.name, p.brand,
                COALESCE(v.views, 0)::int AS views,
                COALESCE(ca.carts, 0)::int AS carts,
                COALESCE(o.orders, 0)::int AS orders,
                content.clicks, content.opens, content.sessions,
                content.description_opens, content.ingredients_opens, content.faq_opens,
                content.usage_opens, content.benefits_opens, content.specs_opens,
                CASE WHEN COALESCE(v.views, 0) > 0
                  THEN ROUND((content.opens::float / v.views * 100)::numeric, 1)
                  ELSE 0
                END AS content_rate,
                CASE WHEN COALESCE(v.views, 0) > 0
                  THEN ROUND((COALESCE(ca.carts, 0)::float / v.views * 100)::numeric, 1)
                  ELSE 0
                END AS cart_rate
         FROM content
         JOIN "Product" p ON p.id = content.pid
         LEFT JOIN views v ON v.pid = content.pid
         LEFT JOIN carts ca ON ca.pid = content.pid
         LEFT JOIN orders o ON o.pid = content.pid
         WHERE content.opens > 0
         ORDER BY content.opens DESC, content.sessions DESC, COALESCE(v.views, 0) DESC
         LIMIT 15`,
        [start, end, REVENUE_STATUSES]
      )),

      // CVR opportunities: viewed products with low cart rate, content curiosity,
      // or missing reassurance blocks (ingredients/FAQ/description).
      safeRows('contentOpportunities', pool.query(
        `WITH views AS (
           SELECT (props->>'productId')::int AS pid, COUNT(*)::int AS views
           FROM "AnalyticsEvent"
           WHERE name = 'PRODUCT_VIEW_DETAIL' AND ${dateFilter} AND props->>'productId' ~ '^[0-9]+$'
           GROUP BY 1
         ),
         carts AS (
           SELECT (props->>'productId')::int AS pid, COUNT(*)::int AS carts
           FROM "AnalyticsEvent"
           WHERE name = 'PRODUCT_ADD_TO_CART' AND ${dateFilter} AND props->>'productId' ~ '^[0-9]+$'
           GROUP BY 1
         ),
         content AS (
           SELECT (props->>'productId')::int AS pid,
                  COUNT(*) FILTER (WHERE COALESCE(props->>'action','open') = 'open')::int AS opens,
                  COUNT(*) FILTER (WHERE props->>'section' = 'description' AND COALESCE(props->>'action','open') = 'open')::int AS description_opens,
                  COUNT(*) FILTER (WHERE props->>'section' = 'ingredients' AND COALESCE(props->>'action','open') = 'open')::int AS ingredients_opens,
                  COUNT(*) FILTER (WHERE props->>'section' = 'faq' AND COALESCE(props->>'action','open') = 'open')::int AS faq_opens
           FROM "AnalyticsEvent"
           WHERE name = 'PRODUCT_CONTENT_SECTION_CLICK'
             AND ${dateFilter}
             AND props->>'productId' ~ '^[0-9]+$'
           GROUP BY 1
         ),
         orders AS (
           SELECT oi."productId" AS pid, COUNT(DISTINCT o.id)::int AS orders
           FROM "OrderItem" oi
           JOIN "Order" o ON o.id = oi."orderId"
           WHERE o.status = ANY($3) AND (o."createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
           GROUP BY 1
         ),
         metrics AS (
           SELECT p.id, p.name, p.brand,
                  v.views,
                  COALESCE(ca.carts, 0)::int AS carts,
                  COALESCE(o.orders, 0)::int AS orders,
                  COALESCE(content.opens, 0)::int AS content_opens,
                  COALESCE(content.description_opens, 0)::int AS description_opens,
                  COALESCE(content.ingredients_opens, 0)::int AS ingredients_opens,
                  COALESCE(content.faq_opens, 0)::int AS faq_opens,
                  ROUND((COALESCE(ca.carts, 0)::float / NULLIF(v.views, 0) * 100)::numeric, 1) AS cart_rate,
                  ROUND((COALESCE(content.opens, 0)::float / NULLIF(v.views, 0) * 100)::numeric, 1) AS content_rate,
                  (length(COALESCE(NULLIF(TRIM(p.description), ''), '')) < 80) AS weak_description,
                  (length(COALESCE(NULLIF(TRIM(p.ingredients), ''), '')) < 20) AS missing_ingredients,
                  (jsonb_array_length(CASE WHEN jsonb_typeof(p.faqs::jsonb) = 'array' THEN p.faqs::jsonb ELSE '[]'::jsonb END) = 0) AS missing_faq
           FROM views v
           JOIN "Product" p ON p.id = v.pid
           LEFT JOIN carts ca ON ca.pid = v.pid
           LEFT JOIN content ON content.pid = v.pid
           LEFT JOIN orders o ON o.pid = v.pid
           WHERE p.active = true
         )
         SELECT *
         FROM metrics
         WHERE views >= 10
           AND (
             cart_rate < 15
             OR content_opens >= 3
             OR weak_description
             OR missing_ingredients
             OR missing_faq
           )
         ORDER BY cart_rate ASC, content_opens DESC, views DESC
         LIMIT 12`,
        [start, end, REVENUE_STATUSES]
      )),

      // Top brands
      safeRows('topBrands', pool.query(
        `SELECT COALESCE(NULLIF(p.brand,''),'—') AS brand,
                SUM(oi.quantity)::int AS units,
                COALESCE(SUM(oi.quantity * oi.price),0)::float AS revenue
         FROM "OrderItem" oi
         JOIN "Order" o ON o.id = oi."orderId"
         JOIN "Product" p ON p.id = oi."productId"
         WHERE o.status = ANY($3) AND (o."createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
         GROUP BY 1 ORDER BY revenue DESC LIMIT 10`,
        [start, end, REVENUE_STATUSES]
      )),

      // Search queries
      safeRows('searchQueries', pool.query(
        `SELECT LOWER(TRIM(props->>'query')) AS query,
                COUNT(*)::int AS searches,
                SUM(CASE WHEN (props->>'hasResults' = 'false' OR props->>'resultsCount' = '0') THEN 1 ELSE 0 END)::int AS zero
         FROM "AnalyticsEvent"
         WHERE name = 'SEARCH_QUERY' AND COALESCE(TRIM(props->>'query'),'') <> '' AND ${dateFilter}
         GROUP BY 1 ORDER BY searches DESC LIMIT 15`,
        [start, end]
      )),

      // Low stock
      safeRows('lowStock', pool.query(
        `SELECT id, name, brand, stock::int FROM "Product" WHERE active = true AND stock <= 5 ORDER BY stock ASC LIMIT 10`
      )),
    ])

    return NextResponse.json({
      period: { start, end },
      topByRevenue: topByRevenue.map((r: DbRow) => ({ id: r.id, name: r.name, brand: r.brand, units: num(r.units), revenue: num(r.revenue) })),
      topByViews: topByViews.map((r: DbRow) => ({ id: num(r.id), name: r.name, brand: r.brand, views: num(r.views) })),
      viewToCart: viewToCart.map((r: DbRow) => ({ id: num(r.id), name: r.name, brand: r.brand, views: num(r.views), carts: num(r.carts), cartRate: num(r.cart_rate) })),
      contentEngagement: contentEngagement.map((r: DbRow) => ({
        id: num(r.id), name: r.name, brand: r.brand,
        views: num(r.views), carts: num(r.carts), orders: num(r.orders),
        clicks: num(r.clicks), opens: num(r.opens), sessions: num(r.sessions),
        descriptionOpens: num(r.description_opens),
        ingredientsOpens: num(r.ingredients_opens),
        faqOpens: num(r.faq_opens),
        usageOpens: num(r.usage_opens),
        benefitsOpens: num(r.benefits_opens),
        specsOpens: num(r.specs_opens),
        contentRate: num(r.content_rate),
        cartRate: num(r.cart_rate),
      })),
      contentOpportunities: contentOpportunities.map((r: DbRow) => {
        const missingContent = [
          r.weak_description ? 'description courte' : null,
          r.missing_ingredients ? 'ingredients' : null,
          r.missing_faq ? 'faq' : null,
        ].filter(Boolean)
        return {
          id: num(r.id), name: r.name, brand: r.brand,
          views: num(r.views), carts: num(r.carts), orders: num(r.orders),
          contentOpens: num(r.content_opens),
          descriptionOpens: num(r.description_opens),
          ingredientsOpens: num(r.ingredients_opens),
          faqOpens: num(r.faq_opens),
          cartRate: num(r.cart_rate),
          contentRate: num(r.content_rate),
          missingContent,
        }
      }),
      topBrands: topBrands.map((r: DbRow) => ({ brand: r.brand, units: num(r.units), revenue: num(r.revenue) })),
      searchQueries: searchQueries.map((r: DbRow) => ({ query: r.query, searches: num(r.searches), zero: num(r.zero) })),
      lowStock: lowStock.map((r: DbRow) => ({ id: r.id, name: r.name, brand: r.brand, stock: num(r.stock) })),
    }, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    console.error('[Products API]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
