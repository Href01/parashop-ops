import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'

/**
 * Price change history + impact analysis.
 *
 * For each product's most-recent price change, compares the window SINCE the change
 * against the same number of days BEFORE it (apples-to-apples), on real data:
 *  - units / day, CA / day, marge / day (from OrderItem — real selling prices)
 *  - conversion vue→achat and vue→panier (from AnalyticsEvent)
 *  - price elasticity of demand  E = %Δ(units/day) / %Δprice
 *  - a plain-language verdict (win / loss / neutral / insufficient data)
 *
 * GET            → all products with a price change
 * GET ?productId → one product (used on the product detail page)
 */

const AFTER_CAP = 30 // don't compare more than 30 days on each side
const MS_DAY = 86400000

async function guard() {
  const s = await getServerSession(authOptions)
  return !!s?.user?.email && isFounder(s.user.email)
}

type Agg = { units: number; revenue: number; margin: number; orders: number; views: number; carts: number }
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

function verdict(pctPrice: number | null, elasticity: number | null, marginBeforePerDay: number, marginAfterPerDay: number, daysAfter: number, totalUnits: number) {
  if (daysAfter < 3 || totalUnits < 3) {
    return { code: 'insufficient', text: `Trop tôt pour conclure (${daysAfter}j après, ${totalUnits} u). Reviens dans quelques jours.` }
  }
  const d = marginAfterPerDay - marginBeforePerDay
  const rel = marginBeforePerDay > 0 ? d / marginBeforePerDay : (d > 0 ? 1 : 0)
  if (elasticity != null && Math.abs(elasticity) < 1 && d >= 0)
    return { code: 'win', text: `Demande peu sensible au prix (élasticité ${elasticity.toFixed(2)}). La hausse augmente ta marge/jour de ${(rel * 100).toFixed(0)}%.` }
  if (d > 0.02 * Math.max(1, marginBeforePerDay))
    return { code: 'win', text: `Marge/jour en hausse (+${(rel * 100).toFixed(0)}%) malgré le volume. La hausse paie.` }
  if (d < -0.02 * Math.max(1, marginBeforePerDay))
    return { code: 'loss', text: `Marge/jour en baisse (${(rel * 100).toFixed(0)}%)${elasticity != null && Math.abs(elasticity) > 1 ? ` — demande élastique (${elasticity.toFixed(2)}), le volume chute plus vite que le prix.` : '.'}` }
  return { code: 'neutral', text: 'Impact quasi neutre sur la marge/jour.' }
}

async function analyseProduct(row: any) {
  const changeAt: Date = new Date(row.changedAt)
  const now = new Date()
  const daysAfter = Math.max(1, Math.min(AFTER_CAP, Math.ceil((now.getTime() - changeAt.getTime()) / MS_DAY)))
  const beforeFrom = new Date(changeAt.getTime() - daysAfter * MS_DAY)
  const pid = row.productId
  const cost = num(row.cost)

  const oi = await pool.query(
    `SELECT
       COALESCE(SUM(oi.quantity) FILTER (WHERE o."createdAt" >= $2),0) ua,
       COALESCE(SUM(oi.quantity*oi.price) FILTER (WHERE o."createdAt" >= $2),0) ra,
       COALESCE(SUM(oi.quantity*(oi.price - COALESCE(oi."unitCost",$4,0))) FILTER (WHERE o."createdAt" >= $2),0) ma,
       COUNT(DISTINCT o.id) FILTER (WHERE o."createdAt" >= $2) oa,
       COALESCE(SUM(oi.quantity) FILTER (WHERE o."createdAt" < $2),0) ub,
       COALESCE(SUM(oi.quantity*oi.price) FILTER (WHERE o."createdAt" < $2),0) rb,
       COALESCE(SUM(oi.quantity*(oi.price - COALESCE(oi."unitCost",$4,0))) FILTER (WHERE o."createdAt" < $2),0) mb,
       COUNT(DISTINCT o.id) FILTER (WHERE o."createdAt" < $2) ob
     FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
     WHERE oi."productId" = $1 AND o.status IN ('CONFIRMED','DELIVERED')
       AND o."createdAt" >= $3 AND o."createdAt" < $5`,
    [pid, changeAt.toISOString(), beforeFrom.toISOString(), cost, now.toISOString()]
  )
  const ev = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE name='PRODUCT_VIEW_DETAIL' AND "createdAt" >= $2) va,
       COUNT(*) FILTER (WHERE name='PRODUCT_VIEW_DETAIL' AND "createdAt" < $2) vb,
       COUNT(*) FILTER (WHERE name='PRODUCT_ADD_TO_CART' AND "createdAt" >= $2) ca,
       COUNT(*) FILTER (WHERE name='PRODUCT_ADD_TO_CART' AND "createdAt" < $2) cb
     FROM "AnalyticsEvent"
     WHERE (props->>'productId') = $1::text AND "createdAt" >= $3 AND "createdAt" < $4`,
    [pid, changeAt.toISOString(), beforeFrom.toISOString(), now.toISOString()]
  )
  const r = oi.rows[0], e = ev.rows[0]
  const after: Agg = { units: num(r.ua), revenue: num(r.ra), margin: num(r.ma), orders: num(r.oa), views: num(e.va), carts: num(e.ca) }
  const before: Agg = { units: num(r.ub), revenue: num(r.rb), margin: num(r.mb), orders: num(r.ob), views: num(e.vb), carts: num(e.cb) }

  const perDay = (a: Agg) => ({
    units: a.units / daysAfter, revenue: a.revenue / daysAfter, margin: a.margin / daysAfter,
    conv: a.views > 0 ? a.units / a.views : null, cartRate: a.views > 0 ? a.carts / a.views : null,
  })
  const pdB = perDay(before), pdA = perDay(after)
  const old = num(row.oldPrice), nw = num(row.newPrice)
  const pctPrice = old > 0 ? (nw - old) / old : null
  const pctQ = pdB.units > 0 ? (pdA.units - pdB.units) / pdB.units : null
  const elasticity = pctQ != null && pctPrice ? pctQ / pctPrice : null
  const pct = (b: number, a: number) => (b > 0 ? (a - b) / b : null)

  return {
    productId: pid, name: row.name, brand: row.brand,
    currentPrice: num(row.curPrice), costPrice: cost,
    change: { oldPrice: old, newPrice: nw, pct: pctPrice, changedAt: row.changedAt, source: row.source },
    window: { daysAfter, from: beforeFrom.toISOString(), changeAt: changeAt.toISOString() },
    before: { ...before, perDay: pdB },
    after: { ...after, perDay: pdA },
    deltas: {
      unitsPerDay: pct(pdB.units, pdA.units), revenuePerDay: pct(pdB.revenue, pdA.revenue),
      marginPerDay: pct(pdB.margin, pdA.margin), conv: pct(pdB.conv || 0, pdA.conv || 0),
    },
    elasticity,
    verdict: verdict(pctPrice, elasticity, pdB.margin, pdA.margin, daysAfter, before.units + after.units),
  }
}

export async function GET(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const pidParam = req.nextUrl.searchParams.get('productId')
    // Latest change per product (optionally one product).
    const latest = await pool.query(
      `SELECT DISTINCT ON (pc."productId") pc."productId", pc."oldPrice", pc."newPrice", pc."changedAt", pc.source,
              p.name, p.brand, p.price::numeric AS "curPrice", p."costPrice"::numeric AS cost
       FROM "PriceChange" pc JOIN "Product" p ON p.id = pc."productId"
       ${pidParam ? 'WHERE pc."productId" = $1' : ''}
       ORDER BY pc."productId", pc."changedAt" DESC`,
      pidParam ? [Number(pidParam)] : []
    )
    const products = await Promise.all(latest.rows.map(analyseProduct))
    // Full history (timeline), most recent first.
    const hist = await pool.query(
      `SELECT "productId", "oldPrice", "newPrice", "changedAt", source, note FROM "PriceChange"
       ${pidParam ? 'WHERE "productId" = $1' : ''} ORDER BY "changedAt" DESC`,
      pidParam ? [Number(pidParam)] : []
    )
    const history: Record<number, any[]> = {}
    for (const h of hist.rows) (history[h.productId] ||= []).push(h)

    // Sort: biggest margin/day swing first (most decision-worthy).
    products.sort((a, b) => Math.abs((b.deltas.marginPerDay ?? 0)) - Math.abs((a.deltas.marginPerDay ?? 0)))
    const summary = {
      changedProducts: products.length,
      wins: products.filter((p) => p.verdict.code === 'win').length,
      losses: products.filter((p) => p.verdict.code === 'loss').length,
      pending: products.filter((p) => p.verdict.code === 'insufficient').length,
      marginPerDayDelta: products.reduce((s, p) => s + (p.after.perDay.margin - p.before.perDay.margin), 0),
    }
    return NextResponse.json({ products, history, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error'
    return NextResponse.json({ error: 'Failed', details: message }, { status: 500 })
  }
}
