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
const fmt0 = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v || 0)
const signed = (v: number) => `${v >= 0 ? '+' : ''}${fmt0(v)}`

type Confidence = 'low' | 'medium' | 'high'

/** How much we can trust this read, from the amount of real data behind it. */
function confidenceLevel(daysAfter: number, totalUnits: number): Confidence {
  if (daysAfter < 5 || totalUnits < 6) return 'low'
  if (totalUnits < 20) return 'medium'
  return 'high'
}

/**
 * Honest read of the price↔demand relationship, in plain language.
 * Key insight: elasticity is only meaningful when price and volume move in OPPOSITE
 * directions (price up → sales down). When they move the SAME way (price up AND sales up),
 * the number is confounded by outside factors (ads, season, stock) — it is NOT elasticity,
 * so we say so instead of printing a fake "26.25 · élastique".
 */
function priceEffect(pctPrice: number | null, pctQ: number | null, elasticity: number | null, confidence: Confidence) {
  if (pctPrice == null || pctPrice === 0 || pctQ == null)
    return { reliable: false, label: 'Effet prix indéterminé', note: 'Pas assez de ventes avant/après pour mesurer l’effet du prix.' }
  const priceUp = pctPrice > 0
  const sameDir = pctQ !== 0 && priceUp === (pctQ > 0)
  if (sameDir)
    return {
      reliable: false,
      label: 'Effet prix non isolable',
      note: priceUp
        ? 'Le prix a monté et les ventes aussi : d’autres facteurs ont joué (pub, saison, stock). On ne peut pas attribuer la hausse des ventes au prix.'
        : 'Le prix a baissé et les ventes aussi : d’autres facteurs ont joué. L’effet du prix seul n’est pas isolable.',
    }
  if (confidence === 'low' || elasticity == null)
    return { reliable: false, label: 'Signal faible', note: 'Trop peu de ventes pour mesurer la sensibilité au prix — à reconfirmer dans quelques jours.' }
  const e = Math.abs(elasticity)
  if (e < 1)
    return { reliable: true, label: 'Demande peu sensible au prix', note: `Si le prix bouge de 10 %, le volume ne bouge que d’environ ${(e * 10).toFixed(0)} %. Tu as de la marge pour ajuster le prix.` }
  return { reliable: true, label: 'Demande sensible au prix', note: `Si le prix bouge de 10 %, le volume bouge d’environ ${(e * 10).toFixed(0)} %. Le volume réagit fort — prudence sur les hausses.` }
}

type Bridge = { priceMad: number; volumeMad: number; totalMad: number } | null

/**
 * Where did the marge/jour change come from — the PRICE or the VOLUME?
 * Splits Δ(marge/jour) into two parts that sum exactly to it:
 *   priceMad  = (margeUnitAprès − margeUnitAvant) × ventesAprès   → l'effet du prix
 *   volumeMad = (ventesAprès − ventesAvant) × margeUnitAvant      → l'effet du volume
 * This is a standard price/volume margin bridge. It's what lets us stop crediting the
 * price for a gain that's really just more sales (ads/season).
 */
function marginBridge(q0: number, q1: number, m0: number | null, m1: number | null): Bridge {
  if (m0 == null || m1 == null) return null
  const priceMad = (m1 - m0) * q1
  const volumeMad = (q1 - q0) * m0
  return { priceMad, volumeMad, totalMad: priceMad + volumeMad }
}

/**
 * Honest verdict, driven by the bridge. The badge now judges THE PRICE, not raw cash:
 *  - price & volume moved the SAME way (price↑ & sales↑) → the sales gain is external
 *    (pub/saison), so we say "surtout le volume", not a price win.
 *  - price & volume moved OPPOSITE ways (price↑ & sales↓) → the price caused both the
 *    higher unit margin AND the lost sales, so the net (totalMad) IS the price's doing.
 * Low confidence never declares anything — stays "à surveiller".
 */
function verdict(bridge: Bridge, marginBeforePerDay: number, marginAfterPerDay: number, daysAfter: number, totalUnits: number, unitsAfter: number, confidence: Confidence, coMove: boolean, priceUp: boolean, newPrice: number, marginUnitAfter: number | null) {
  if (daysAfter < 3 || totalUnits < 3)
    return { code: 'insufficient', text: `Trop tôt pour conclure : ${fmt0(totalUnits)} vente(s) sur ${daysAfter}j. Reviens dans quelques jours.` }
  const total = bridge ? bridge.totalMad : marginAfterPerDay - marginBeforePerDay
  const thresh = Math.max(1, 0.02 * Math.max(1, marginBeforePerDay))
  const unit = marginUnitAfter != null ? `${fmt0(marginUnitAfter)} MAD de marge par vente` : `${fmt0(newPrice)} MAD`
  const move = priceUp ? 'hausse' : 'baisse'

  if (confidence === 'low') {
    const trend = total > thresh ? 'semble positive' : total < -thresh ? 'semble négative' : 'reste neutre'
    return { code: 'insufficient', text: `À ${fmt0(newPrice)} MAD tu fais ${unit}. Mais encore peu de recul (${fmt0(unitsAfter)} ventes en ${daysAfter}j) : la tendance ${trend}, à confirmer.` }
  }

  // Price and sales moved the same way → the volume swing isn't the price's doing.
  if (coMove && bridge) {
    return { code: 'volume', text: `À ${fmt0(newPrice)} MAD tu fais ${unit}. Ta marge/jour a surtout bougé à cause du VOLUME (${signed(bridge.volumeMad)} MAD/j) — tes ventes ont changé pour d'autres raisons (pub, saison), pas grâce au prix (${signed(bridge.priceMad)} MAD/j seulement).` }
  }

  // Opposite directions (or no split) → the price move owns the net result.
  if (total > thresh)
    return { code: 'win', text: `À ${fmt0(newPrice)} MAD tu fais ${unit}. Ta ${move} de prix rapporte : ${signed(total)} MAD/jour net${bridge ? ` (plus de marge par vente que de clients perdus)` : ''}. Bon move.` }
  if (total < -thresh)
    return { code: 'loss', text: `À ${fmt0(newPrice)} MAD tu fais ${unit}, mais ta ${move} de prix coûte ${signed(total)} MAD/jour${priceUp ? ' : tu perds plus de clients que tu ne gagnes en marge. Le prix est peut-être trop haut.' : '.'}` }
  return { code: 'neutral', text: `À ${fmt0(newPrice)} MAD tu fais ${unit}. Impact quasi nul sur ta marge/jour (${fmt0(marginAfterPerDay)} vs ${fmt0(marginBeforePerDay)} avant).` }
}

async function analyseProduct(row: any) {
  const changeAt: Date = new Date(row.changedAt)
  const now = new Date()
  const daysAfter = Math.max(1, Math.min(AFTER_CAP, Math.ceil((now.getTime() - changeAt.getTime()) / MS_DAY)))
  // Cap the AFTER window to daysAfter as well — otherwise a change older than 30 days
  // would sum >30 days of sales but still divide by 30, inflating the per-day rate.
  const afterTo = new Date(Math.min(now.getTime(), changeAt.getTime() + daysAfter * MS_DAY))
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
    [pid, changeAt.toISOString(), beforeFrom.toISOString(), cost, afterTo.toISOString()]
  )
  const ev = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE name='PRODUCT_VIEW_DETAIL' AND "createdAt" >= $2) va,
       COUNT(*) FILTER (WHERE name='PRODUCT_VIEW_DETAIL' AND "createdAt" < $2) vb,
       COUNT(*) FILTER (WHERE name='PRODUCT_ADD_TO_CART' AND "createdAt" >= $2) ca,
       COUNT(*) FILTER (WHERE name='PRODUCT_ADD_TO_CART' AND "createdAt" < $2) cb
     FROM "AnalyticsEvent"
     WHERE (props->>'productId') = $1::text AND "createdAt" >= $3 AND "createdAt" < $4`,
    [pid, changeAt.toISOString(), beforeFrom.toISOString(), afterTo.toISOString()]
  )
  const r = oi.rows[0], e = ev.rows[0]
  const after: Agg = { units: num(r.ua), revenue: num(r.ra), margin: num(r.ma), orders: num(r.oa), views: num(e.va), carts: num(e.ca) }
  const before: Agg = { units: num(r.ub), revenue: num(r.rb), margin: num(r.mb), orders: num(r.ob), views: num(e.vb), carts: num(e.cb) }

  const perDay = (a: Agg) => ({
    units: a.units / daysAfter, revenue: a.revenue / daysAfter, margin: a.margin / daysAfter,
    // Conversion vue→achat = share of viewers who bought → orders (purchases) per view,
    // not units per view (a multi-item order isn't multiple conversions).
    conv: a.views > 0 ? a.orders / a.views : null, cartRate: a.views > 0 ? a.carts / a.views : null,
  })
  const pdB = perDay(before), pdA = perDay(after)
  const old = num(row.oldPrice), nw = num(row.newPrice)
  const pctPrice = old > 0 ? (nw - old) / old : null
  const pctQ = pdB.units > 0 ? (pdA.units - pdB.units) / pdB.units : null
  const elasticity = pctQ != null && pctPrice ? pctQ / pctPrice : null
  const pct = (b: number, a: number) => (b > 0 ? (a - b) / b : null)

  const totalUnits = before.units + after.units
  const confidence = confidenceLevel(daysAfter, totalUnits)
  const uMargeB = before.units > 0 ? before.margin / before.units : null
  const uMargeA = after.units > 0 ? after.margin / after.units : null
  // Price/volume margin bridge — where the marge/jour change actually came from.
  const bridge = marginBridge(pdB.units, pdA.units, uMargeB, uMargeA)
  // Did price and sales move the SAME direction? (then the volume swing is external.)
  const coMove = pctPrice != null && pctQ != null && pctPrice !== 0 && pctQ !== 0 && (pctPrice > 0) === (pctQ > 0)
  const priceUp = (pctPrice ?? 0) >= 0

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
      marginPerUnit: pct(uMargeB || 0, uMargeA || 0),
    },
    elasticity,
    confidence,
    // Per-unit margin — the number the founder actually knows (real cash per sale).
    marginUnit: { before: uMargeB, after: uMargeA },
    // Where the marge/jour change came from: price vs volume (sums to Δ marge/jour).
    bridge,
    // Absolute counts behind the per-day rates — so the UI can show "(4 ventes en 22j)"
    // and mute conversion when it rests on a handful of views.
    sample: { unitsBefore: before.units, unitsAfter: after.units, viewsBefore: before.views, viewsAfter: after.views },
    priceEffect: priceEffect(pctPrice, pctQ, elasticity, confidence),
    verdict: verdict(bridge, pdB.margin, pdA.margin, daysAfter, totalUnits, after.units, confidence, coMove, priceUp, nw, uMargeA),
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
