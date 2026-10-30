import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { analyticsError, analyticsQuery } from '@/lib/analytics/db'
import { MEDIUMS_PAYANTS, TZ } from '@/lib/analytics/metrics'
import { fenetreSql, traficAutomatiseSql } from '@/lib/analytics/automated'
import {
  construireVueGoogle, parserCampagnes, parserGroupes, parserMotsCles,
  type GoogleDonnees, type NiveauVue,
} from '@/lib/analytics/google-ads-view'
import { googleAdsConfigured, googleAdsSearch } from '@/lib/google-ads'

/**
 * GET /api/ops/analytics/google-ads?debut=AAAA-MM-JJ&fin=AAAA-MM-JJ&niveau=campagne|groupe|motcle
 *
 * Ce que chaque campagne, groupe d'annonces et mot-cle Google a coute et rapporte : clics et depense
 * viennent de l'API Google Ads (en direct, 5 minutes de memoire), visites / paniers / commandes de la
 * boutique, avec la MEME regle de trafic automatise que la page Sessions. Definition : lib/analytics/google-ads-view.ts.
 *
 * Pas de table ni de synchro : comme pour Meta, la depense est lue au moment de l'affichage. Elle est donc
 * a jour de la minute (la synchro quotidienne vers AdSpendDaily ne l'est que du lendemain), et si Google ne
 * repond pas la page le dit au lieu d'afficher 0.
 */

export const dynamic = 'force-dynamic'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const NIVEAUX: NiveauVue[] = ['campagne', 'groupe', 'motcle']

const CACHE = new Map<string, { at: number; donnees: GoogleDonnees }>()
const CACHE_MS = 5 * 60 * 1000

/** Une relance : le premier appel apres un demarrage a froid peut echouer sur le reseau (« fetch failed ») sans que Google soit en cause. */
async function avecRelance<T>(f: () => Promise<T>): Promise<T> {
  try { return await f() } catch { return await f() }
}

async function lireGoogle(debut: string, fin: string): Promise<{ donnees: GoogleDonnees | null; erreur?: string }> {
  if (!googleAdsConfigured()) return { donnees: null, erreur: 'Google Ads non configuré (identifiants absents).' }
  const cle = `${debut}|${fin}`
  const hit = CACHE.get(cle)
  if (hit && Date.now() - hit.at < CACHE_MS) return { donnees: hit.donnees }
  try {
    // Les dates sont validees plus haut (AAAA-MM-JJ) : aucune valeur libre n'entre dans la requete.
    const fenetre = `segments.date BETWEEN '${debut}' AND '${fin}'`
    const devise = await avecRelance(() => googleAdsSearch<{ customer?: { currencyCode?: string } }>('SELECT customer.currency_code FROM customer'))
    const code = devise[0]?.customer?.currencyCode
    // Le compte est en dirhams : une autre devise fausserait tous les profits sans rien signaler.
    if (code && code !== 'MAD') return { donnees: null, erreur: `Le compte Google Ads est en ${code}, pas en MAD : conversion non gérée.` }

    // Les campagnes SUPPRIMEES sont exclues partout : leurs groupes gardent un statut propre (ENABLED) et
    // reapparaissaient a zero (le « Groupe d'annonces 1 » de l'ancienne campagne Salerm).
    const [camp, grp, kw] = await Promise.all([
      avecRelance(() => googleAdsSearch(`SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE ${fenetre} AND campaign.status != 'REMOVED'`)),
      avecRelance(() => googleAdsSearch(`SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros FROM ad_group WHERE ${fenetre} AND ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED'`)),
      avecRelance(() => googleAdsSearch(`SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, metrics.impressions, metrics.clicks, metrics.cost_micros FROM keyword_view WHERE ${fenetre} AND ad_group_criterion.negative = FALSE AND campaign.status != 'REMOVED'`)),
    ])
    const donnees: GoogleDonnees = { campagnes: parserCampagnes(camp), groupes: parserGroupes(grp), motsCles: parserMotsCles(kw) }
    CACHE.set(cle, { at: Date.now(), donnees })
    return { donnees }
  } catch (e) {
    return { donnees: null, erreur: e instanceof Error ? `Google Ads : ${e.message}` : 'Google Ads injoignable' }
  }
}

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token || token.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const sp = request.nextUrl.searchParams
    const debut = sp.get('debut') || '', fin = sp.get('fin') || ''
    if (!DATE.test(debut) || !DATE.test(fin) || debut > fin) return NextResponse.json({ error: 'Période invalide' }, { status: 400 })
    const niveau = (sp.get('niveau') || 'campagne') as NiveauVue
    if (!NIVEAUX.includes(niveau)) return NextResponse.json({ error: 'Niveau invalide' }, { status: 400 })
    const inclureAuto = sp.get('auto') === '1'

    const medias = MEDIUMS_PAYANTS.map((m) => `'${m}'`).join(', ')
    const GOOGLE_S = `LOWER(COALESCE(s."utmSource", '')) = 'google' AND LOWER(COALESCE(s."utmMedium", '')) IN (${medias})`

    // TRAFIC : visites et paniers des annonces Google, groupes par ce que l'URL portait.
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
      SELECT NULLIF(TRIM(s."utmCampaign"), '') AS campagne, NULLIF(TRIM(s."utmContent"), '') AS groupe,
             NULLIF(TRIM(s."utmTerm"), '') AS "motCle",
             COUNT(*)::int AS sessions, COUNT(*) FILTER (WHERE st.paniers > 0)::int AS paniers
      FROM "AnalyticsSession" s
      LEFT JOIN st ON st."sessionId" = s."sessionId"
      LEFT JOIN LATERAL (SELECT id FROM "Order" WHERE "sessionId" = s."sessionId" ORDER BY "createdAt" DESC LIMIT 1) o ON true
      WHERE ${fenetreSql('s."firstSeenAt"', '$1', '$2')} AND ${GOOGLE_S}
        AND ${inclureAuto ? 'TRUE' : `NOT ${AUTO}`}
      GROUP BY 1, 2, 3`, [debut, fin])

    // COMMANDES : la source vient de la commande, sinon de sa session ; le mot-cle n'existe que sur la session.
    const commandes = await analyticsQuery(`
      SELECT NULLIF(TRIM(COALESCE(NULLIF(o."utmCampaign", ''), s."utmCampaign")), '') AS campagne,
             NULLIF(TRIM(COALESCE(NULLIF(o."utmContent", ''), s."utmContent")), '') AS groupe,
             NULLIF(TRIM(s."utmTerm"), '') AS "motCle",
             COUNT(*)::int AS passees,
             COUNT(*) FILTER (WHERE o.status::text = 'DELIVERED')::int AS livrees,
             COUNT(*) FILTER (WHERE o.status::text = 'CANCELLED')::int AS annulees,
             COUNT(*) FILTER (WHERE o.status::text NOT IN ('DELIVERED', 'CANCELLED') AND o."returnedAt" IS NULL)::int AS "enCours",
             COALESCE(SUM(o.revenue) FILTER (WHERE o.status::text = 'DELIVERED'), 0)::float AS "caLivre",
             COALESCE(SUM(COALESCE(o."finalProfit", o."estimatedProfit")) FILTER (WHERE o.status::text = 'DELIVERED'), 0)::float AS "margeLivree"
      FROM "Order" o
      LEFT JOIN "AnalyticsSession" s ON s."sessionId" = o."sessionId"
      WHERE ${fenetreSql('o."createdAt"', '$1', '$2')}
        AND LOWER(COALESCE(NULLIF(o."utmSource", ''), s."utmSource", '')) = 'google'
        AND LOWER(COALESCE(NULLIF(o."utmMedium", ''), s."utmMedium", '')) IN (${medias})
      GROUP BY 1, 2, 3`, [debut, fin])

    const emb = await analyticsQuery(`SELECT value FROM "AppSetting" WHERE key = 'packaging_cost_per_parcel'`)
    const emballageParColis = Number(emb.rows[0]?.value) || 0

    const { donnees, erreur } = await lireGoogle(debut, fin)

    const vue = construireVueGoogle({
      niveau, google: donnees, emballageParColis,
      trafic: trafic.rows.map((x) => ({ campagne: x.campagne as string | null, groupe: x.groupe as string | null, motCle: x.motCle as string | null, sessions: Number(x.sessions), paniers: Number(x.paniers) })),
      commandes: commandes.rows.map((x) => ({
        campagne: x.campagne as string | null, groupe: x.groupe as string | null, motCle: x.motCle as string | null,
        passees: Number(x.passees), livrees: Number(x.livrees), annulees: Number(x.annulees), enCours: Number(x.enCours),
        caLivre: Number(x.caLivre), margeLivree: Number(x.margeLivree),
      })),
    })

    return NextResponse.json({
      periode: { debut, fin }, tz: TZ, niveau, emballageParColis, inclureAuto,
      ...vue, googleErreur: erreur ?? null, genereA: new Date().toISOString(),
    })
  } catch (e) {
    console.error('[analytics/google-ads]', analyticsError(e))
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
