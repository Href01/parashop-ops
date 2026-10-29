import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { analyticsError, analyticsQuery } from '@/lib/analytics/db'
import { TZ } from '@/lib/analytics/metrics'
import { fenetreSql, traficAutomatiseSql } from '@/lib/analytics/automated'
import { construirePlacements, parserInsightsMeta, SANS_SOURCE, type LigneMeta } from '@/lib/analytics/placements'
import { getMetaToken } from '@/lib/meta-token'
import { META_GRAPH, fxToMad } from '@/lib/ads/meta-fx'

/**
 * GET /api/ops/analytics/placements?debut=AAAA-MM-JJ&fin=AAAA-MM-JJ
 *
 * Rentabilite par emplacement Meta (Instagram, Facebook, Audience Network…) :
 * ce que chacun a rapporte une fois les commandes LIVREES, moins ce que Meta a
 * depense dessus. Voir lib/analytics/placements.ts pour la definition.
 *
 * Les commandes sont celles PASSEES dans la periode (comme la page Sessions).
 * Celles qui ne sont pas encore livrees apparaissent « en cours » : leur marge
 * n'est pas comptee tant qu'elles ne sont pas livrees.
 */

export const dynamic = 'force-dynamic'

const DATE = /^\d{4}-\d{2}-\d{2}$/

/* Meta limite le debit de son API et la page se rafraichit : 10 minutes de memoire
   par periode suffisent, la depense du jour n'a pas besoin d'etre a la seconde. */
const CACHE = new Map<string, { at: number; lignes: LigneMeta[] }>()
const CACHE_MS = 10 * 60 * 1000

async function depenseMeta(debut: string, fin: string): Promise<{ lignes: LigneMeta[] | null; erreur?: string }> {
  const rawAccount = process.env.META_AD_ACCOUNT_ID
  const token = await getMetaToken()
  if (!token || !rawAccount) return { lignes: null, erreur: 'Meta non configuré (jeton ou compte publicitaire absent).' }
  const cle = `${debut}|${fin}`
  const hit = CACHE.get(cle)
  if (hit && Date.now() - hit.at < CACHE_MS) return { lignes: hit.lignes }
  try {
    const account = rawAccount.startsWith('act_') ? rawAccount : `act_${rawAccount}`
    const fx = await fxToMad(account, token)
    const lignes: LigneMeta[] = []
    let url: string | null = `${META_GRAPH}/${account}/insights`
      + `?level=account&fields=spend,impressions,clicks,actions,action_values`
      + `&breakdowns=publisher_platform,platform_position`
      + `&time_range=${encodeURIComponent(JSON.stringify({ since: debut, until: fin }))}`
      + `&limit=200&access_token=${encodeURIComponent(token)}`
    for (let page = 0; url && page < 5; page++) {
      const res: Response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
      const json: { paging?: { next?: string }; error?: { message?: string } } = await res.json()
      if (!res.ok) return { lignes: null, erreur: `Meta : ${json?.error?.message || res.status}` }
      lignes.push(...parserInsightsMeta(json, fx))
      url = json.paging?.next || null
    }
    CACHE.set(cle, { at: Date.now(), lignes })
    return { lignes }
  } catch (e) {
    return { lignes: null, erreur: e instanceof Error ? `Meta : ${e.message}` : 'Meta injoignable' }
  }
}

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token || token.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const sp = request.nextUrl.searchParams
    const debut = sp.get('debut') || '', fin = sp.get('fin') || ''
    if (!DATE.test(debut) || !DATE.test(fin) || debut > fin) return NextResponse.json({ error: 'Période invalide' }, { status: 400 })
    const inclureAuto = sp.get('auto') === '1'

    const SOURCE = (alias: string) => `LOWER(COALESCE(NULLIF(${alias}."utmSource", ''), '${SANS_SOURCE}'))`

    // TRAFIC : sessions et paniers par source, avec la MEME regle de trafic automatise que la page Sessions.
    const AUTO = traficAutomatiseSql({ session: 's', paniers: 'st.paniers', duree: 'st.duree', commande: 'o.id' })
    const trafic = await analyticsQuery(`
      WITH st AS (
        SELECT "sessionId",
               COUNT(*) FILTER (WHERE name = 'PRODUCT_ADD_TO_CART')::int AS paniers,
               EXTRACT(epoch FROM (MAX("createdAt") - MIN("createdAt")))::int AS duree
        FROM "AnalyticsEvent"
        WHERE ${fenetreSql('"createdAt"', '$1', '$2')} AND "sessionId" IS NOT NULL
          AND name NOT IN ('ORDER_CONFIRMED', 'ORDER_DELIVERED', 'ORDER_CANCELLED')
        GROUP BY 1
      )
      SELECT ${SOURCE('s')} AS source, COUNT(*)::int AS sessions,
             COUNT(*) FILTER (WHERE st.paniers > 0)::int AS paniers
      FROM "AnalyticsSession" s
      LEFT JOIN st ON st."sessionId" = s."sessionId"
      LEFT JOIN LATERAL (SELECT id FROM "Order" WHERE "sessionId" = s."sessionId" ORDER BY "createdAt" DESC LIMIT 1) o ON true
      WHERE ${fenetreSql('s."firstSeenAt"', '$1', '$2')}
        AND ${inclureAuto ? 'TRUE' : `NOT ${AUTO}`}
      GROUP BY 1`, [debut, fin])

    // COMMANDES : par source portee par la commande elle-meme (les commandes
    // manuelles n'ont pas de session, mais gardent leur source quand elle existe).
    const commandes = await analyticsQuery(`
      SELECT ${SOURCE('o')} AS source,
             COUNT(*)::int AS passees,
             COUNT(*) FILTER (WHERE o.status::text = 'DELIVERED')::int AS livrees,
             COUNT(*) FILTER (WHERE o.status::text = 'CANCELLED')::int AS annulees,
             COUNT(*) FILTER (WHERE o.status::text NOT IN ('DELIVERED', 'CANCELLED') AND o."returnedAt" IS NULL)::int AS "enCours",
             COALESCE(SUM(o.revenue) FILTER (WHERE o.status::text = 'DELIVERED'), 0)::float AS "caLivre",
             COALESCE(SUM(COALESCE(o."finalProfit", o."estimatedProfit")) FILTER (WHERE o.status::text = 'DELIVERED'), 0)::float AS "margeLivree"
      FROM "Order" o
      WHERE ${fenetreSql('o."createdAt"', '$1', '$2')}
      GROUP BY 1`, [debut, fin])

    const emb = await analyticsQuery(`SELECT value FROM "AppSetting" WHERE key = 'packaging_cost_per_parcel'`)
    const emballageParColis = Number(emb.rows[0]?.value) || 0

    const { lignes: meta, erreur } = await depenseMeta(debut, fin)

    const base = construirePlacements({
      trafic: trafic.rows.map((x) => ({ source: String(x.source), sessions: Number(x.sessions), paniers: Number(x.paniers) })),
      commandes: commandes.rows.map((x) => ({
        source: String(x.source), passees: Number(x.passees), livrees: Number(x.livrees), annulees: Number(x.annulees),
        enCours: Number(x.enCours), caLivre: Number(x.caLivre), margeLivree: Number(x.margeLivree),
      })),
      meta, emballageParColis,
    })

    // Position (fil, stories, reels…) : declare par Meta, jamais rattache aux commandes.
    const positions = (meta ?? [])
      .map((x) => ({ ...x, depense: Math.round(x.depense * 100) / 100, valeur: Math.round(x.valeur * 100) / 100 }))
      .sort((a, b) => b.depense - a.depense)

    return NextResponse.json({
      periode: { debut, fin }, tz: TZ, emballageParColis,
      ...base, positions, metaErreur: erreur ?? null, inclureAuto,
      genereA: new Date().toISOString(),
    })
  } catch (e) {
    console.error('[analytics/placements]', analyticsError(e))
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
