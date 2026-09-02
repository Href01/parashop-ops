import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { analyticsError, analyticsQuery } from '@/lib/analytics/db'
import { SESSION_BOT_FILTER_CLAUSE, TZ } from '@/lib/analytics/metrics'

/**
 * LA LISTE DES SESSIONS, et qui est là maintenant.
 *
 * C'est l'equivalent premiere main du « User Look-Up » d'Amplitude et de la
 * liste d'enregistrements de Hotjar. On ne rejoue pas une video — on rejoue la
 * SUITE DES ACTIONS, qui repond a la meme question pour l'essentiel : qu'a-t-elle
 * fait, dans quel ordre, et ou s'est-elle arretee. Zero kilo-octet sur la
 * vitrine, et rattachable a la commande, ce qu'aucun outil externe ne sait faire
 * ici.
 *
 * GET /api/ops/analytics/sessions?minutes=30&filtre=…&appareil=…&canal=…&q=
 */

export const dynamic = 'force-dynamic'

/**
 * LES SEGMENTS DE COMPORTEMENT.
 *
 * Filtrer sur « a commandé » ne suffisait pas : l'essentiel se joue AVANT. Les
 * deux qui comptent vraiment :
 *
 *  · `panier` — a mis quelque chose au panier ;
 *  · `panier_sans_achat` — l'a mis, et n'a pas commandé. C'est la population la
 *    plus chère du site : l'intention est prouvée, seule la fin manque.
 *
 * Chaque segment porte son EXPRESSION SQL une seule fois. Elle sert à la fois à
 * filtrer la liste et à compter la répartition — impossible que le compte
 * affiché sur une puce et la liste qu'elle ouvre divergent.
 */
export const SEGMENTS = {
  toutes:            { label: 'Toutes',              sql: `TRUE` },
  achat:             { label: 'Ont commandé',        sql: `o.id IS NOT NULL` },
  panier:            { label: 'Ont mis au panier',   sql: `stats.paniers > 0` },
  panier_sans_achat: { label: 'Panier sans commande', sql: `stats.paniers > 0 AND o.id IS NULL` },
  fiche:             { label: 'Ont vu une fiche',    sql: `stats.fiches > 0` },
  recherche:         { label: 'Ont cherché',         sql: `stats.recherches > 0` },
  friction:          { label: 'Ont buté',            sql: `stats.frictions > 0` },
  sans_action:       { label: 'Sans action',         sql: `COALESCE(stats.actions, 0) = 0` },
} as const
type Filtre = keyof typeof SEGMENTS

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token || token.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const sp = request.nextUrl.searchParams
    // La fenêtre est désormais une PÉRIODE DATÉE, pas une fenêtre glissante :
    // « hier » et « le mois dernier » ne s'expriment pas en « il y a N minutes ».
    // `minutes` reste accepté pour ne rien casser, et se traduit en dates.
    const dateOk = (v: string | null): v is string => {
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
      const d = new Date(`${v}T00:00:00Z`)
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
    }
    const jourTz = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
    const decale = (d: string, n: number) => {
      const x = new Date(`${d}T00:00:00Z`)
      x.setUTCDate(x.getUTCDate() + n)
      return x.toISOString().slice(0, 10)
    }
    const minutes = Math.min(Math.max(parseInt(sp.get('minutes') || '1440', 10) || 1440, 5), 60 * 24 * 400)
    const finDef = jourTz()
    const debutDef = decale(finDef, -Math.max(0, Math.ceil(minutes / 1440) - 1))
    const debut = dateOk(sp.get('debut')) ? sp.get('debut')! : debutDef
    const fin = dateOk(sp.get('fin')) ? sp.get('fin')! : finDef
    if (debut > fin) return NextResponse.json({ error: 'Période invalide' }, { status: 400 })
    const cmp = sp.get('cmp') !== '0'
    const nbJours = Math.max(1, Math.round(
      (new Date(fin).getTime() - new Date(debut).getTime()) / 86400000) + 1)
    // Les bornes de comparaison viennent de l'interface, qui les AFFICHE. Les
    // recalculer ici aurait cree une seconde regle : le jour ou l'une des deux
    // change (un mois civil se compare au mois civil precedent, pas aux N jours
    // qui precedent), le libelle mentirait sur ce qui a ete compare. Le repli
    // « periode collee de meme duree » ne sert qu'aux appels sans bornes.
    const finPrec = dateOk(sp.get('cmpFin')) ? sp.get('cmpFin')! : decale(debut, -1)
    const debutPrec = dateOk(sp.get('cmpDebut')) ? sp.get('cmpDebut')! : decale(finPrec, -(nbJours - 1))

    const brut = sp.get('filtre') || 'toutes'
    const filtre = (Object.prototype.hasOwnProperty.call(SEGMENTS, brut) ? brut : 'toutes') as Filtre
    const q = (sp.get('q') || '').trim().slice(0, 60)
    const appareil = (sp.get('appareil') || '').trim().slice(0, 20)
    const canal = (sp.get('canal') || '').trim().slice(0, 40)

    // Le direct : 30 minutes, comme GA4. Les 5 minutes precedentes etaient trop
    // courtes pour un site a ce volume — on y voyait « 0 visiteur » en
    // permanence, ce qui donne l'impression que la mesure est cassee.
    const direct = await analyticsQuery(`
      SELECT COUNT(DISTINCT e."sessionId")::int AS actifs,
             COUNT(*)::int AS evenements
      FROM "AnalyticsEvent" e
      LEFT JOIN "AnalyticsSession" s ON s."sessionId" = e."sessionId"
      WHERE e."createdAt" >= NOW() - INTERVAL '30 minutes'
        AND e.name NOT IN ('ORDER_CONFIRMED', 'ORDER_DELIVERED', 'ORDER_CANCELLED')
        ${SESSION_BOT_FILTER_CLAUSE}`)

    // Requête PARAMÉTRÉE. La version précédente interpolait la recherche dans
    // le SQL après avoir doublé les apostrophes : ça tenait, mais une règle qui
    // dépend d'un échappement fait à la main finit toujours par céder.
    const params: unknown[] = []
    // $1 et $2 : les bornes de la periode courante. Elles sont posees en
    // PREMIER pour que les memes indices servent a la periode precedente, en
    // ne changeant que les deux valeurs.
    params.push(debut, fin)
    const FENETRE = `(s."firstSeenAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date`
    const conditions: string[] = [FENETRE, SESSION_BOT_FILTER_CLAUSE.replace(/^\s*AND\s*/, '')]

    // Les filtres d'attribut s'appliquent AUSSI au comptage des segments : les
    // puces doivent compter dans le même périmètre que la liste qu'elles ouvrent.
    const perimetre: string[] = []
    if (appareil) { params.push(appareil); perimetre.push(`LOWER(COALESCE(s.device,'')) = LOWER($${params.length})`) }
    if (canal) {
      params.push(canal)
      perimetre.push(canal === 'direct'
        ? `COALESCE(s."utmSource",'') = ''`
        : `LOWER(COALESCE(s."utmSource",'')) = LOWER($${params.length})`)
    }
    if (q) {
      params.push(`%${q}%`)
      const i = params.length
      perimetre.push(`(s."sessionId" ILIKE $${i} OR COALESCE(s.city,'') ILIKE $${i}
        OR COALESCE(s."utmSource",'') ILIKE $${i} OR COALESCE(o."deliveryName",'') ILIKE $${i}
        OR COALESCE(o."deliveryPhone",'') ILIKE $${i})`)
    }
    conditions.push(...perimetre)
    if (filtre !== 'toutes') conditions.push(SEGMENTS[filtre].sql)

    const r = await analyticsQuery(`
      WITH bornes AS (
        SELECT "sessionId",
               COALESCE(MAX("createdAt") FILTER (WHERE name = 'SESSION_START'), MIN("createdAt")) AS depart
        FROM "AnalyticsEvent"
        WHERE ("createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
          AND "sessionId" IS NOT NULL
          AND name NOT IN ('ORDER_CONFIRMED', 'ORDER_DELIVERED', 'ORDER_CANCELLED')
        GROUP BY 1
      ), stats AS (
        SELECT e."sessionId",
               COUNT(*)::int AS actions,
               COUNT(*) FILTER (WHERE e.name = 'PRODUCT_VIEW_DETAIL')::int AS fiches,
               COUNT(*) FILTER (WHERE e.name = 'PRODUCT_ADD_TO_CART')::int AS paniers,
               COUNT(*) FILTER (WHERE e.name = 'SEARCH_SUBMIT')::int AS recherches,
               COUNT(*) FILTER (WHERE e.name IN (
                 'PURCHASE_FAILED','CHECKOUT_VALIDATION_FAILED','PROMO_CODE_FAILED',
                 'SEARCH_ZERO_RESULTS','OTP_INVALID','OTP_SEND_FAILED','OTP_DELIVERY_FAILED',
                 'RAGE_CLICK','DEAD_CLICK','CHECKOUT_FIELD_ERROR','JS_ERROR'))::int AS frictions,
               MAX(e."createdAt") AS derniere,
               MIN(e."createdAt") AS premiere
        FROM "AnalyticsEvent" e
        JOIN bornes b ON b."sessionId" = e."sessionId" AND e."createdAt" >= b.depart
        WHERE (e."createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
          AND e.name NOT IN ('ORDER_CONFIRMED', 'ORDER_DELIVERED', 'ORDER_CANCELLED')
        GROUP BY 1
      )
      SELECT s."sessionId",
             s.device, s.city, s."utmSource", s."visitorId",
             s."firstSeenAt", COALESCE(stats.derniere, s."lastSeenAt", s."firstSeenAt") AS derniere,
             COALESCE(stats.actions, 0)::int AS actions,
             COALESCE(stats.fiches, 0)::int AS fiches,
             COALESCE(stats.paniers, 0)::int AS paniers,
             COALESCE(stats.recherches, 0)::int AS recherches,
             COALESCE(stats.frictions, 0)::int AS frictions,
             COALESCE(EXTRACT(epoch FROM (stats.derniere - stats.premiere)), 0)::int AS duree,
             o.id AS "orderId", o."deliveryName", o."deliveryPhone", o.status AS "orderStatus",
             COALESCE(o.revenue, o."productsTotal", o.total) AS montant,
             (COALESCE(stats.derniere, s."lastSeenAt", s."firstSeenAt") >= NOW() - INTERVAL '5 minutes') AS "enLigne"
      FROM "AnalyticsSession" s
      LEFT JOIN stats ON stats."sessionId" = s."sessionId"
      LEFT JOIN LATERAL (
        SELECT * FROM "Order" WHERE "sessionId" = s."sessionId" ORDER BY "createdAt" DESC LIMIT 1
      ) o ON true
      WHERE ${conditions.join(' AND ')}
      ORDER BY COALESCE(stats.derniere, s."lastSeenAt", s."firstSeenAt") DESC
      LIMIT 60`, params)

    // LA RÉPARTITION — combien de sessions dans chaque segment, sur le même
    // périmètre. C'est ce qui permet de COMPARER : « 60 sessions, dont 12 avec
    // panier, dont 11 sans commande » se lit d'un coup, et chaque puce dit
    // combien elle contient avant qu'on clique.
    //
    // Elle est écrite UNE fois et appelée deux fois — période courante, période
    // précédente. Deux requêtes jumelles écrites à la main auraient fini par
    // diverger d'une condition, et l'écart affiché aurait été faux sans que rien
    // ne le signale.
    const compter = (d1: string, d2: string) => analyticsQuery(`
      WITH stats AS (
        SELECT "sessionId",
               COUNT(*)::int AS actions,
               COUNT(*) FILTER (WHERE name = 'PRODUCT_VIEW_DETAIL')::int AS fiches,
               COUNT(*) FILTER (WHERE name = 'PRODUCT_ADD_TO_CART')::int AS paniers,
               COUNT(*) FILTER (WHERE name = 'SEARCH_SUBMIT')::int AS recherches,
               COUNT(*) FILTER (WHERE name IN (
                 'PURCHASE_FAILED','CHECKOUT_VALIDATION_FAILED','PROMO_CODE_FAILED',
                 'SEARCH_ZERO_RESULTS','OTP_INVALID','OTP_SEND_FAILED','OTP_DELIVERY_FAILED',
                 'RAGE_CLICK','DEAD_CLICK','CHECKOUT_FIELD_ERROR','JS_ERROR'))::int AS frictions
        FROM "AnalyticsEvent"
        WHERE ("createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
          AND "sessionId" IS NOT NULL
          AND name NOT IN ('ORDER_CONFIRMED', 'ORDER_DELIVERED', 'ORDER_CANCELLED')
        GROUP BY 1
      )
      SELECT ${(Object.keys(SEGMENTS) as Filtre[])
        .map((k) => `COUNT(*) FILTER (WHERE ${SEGMENTS[k].sql})::int AS "${k}"`).join(',\n             ')}
      FROM "AnalyticsSession" s
      LEFT JOIN stats ON stats."sessionId" = s."sessionId"
      LEFT JOIN LATERAL (
        SELECT * FROM "Order" WHERE "sessionId" = s."sessionId" ORDER BY "createdAt" DESC LIMIT 1
      ) o ON true
      WHERE ${[FENETRE, ...perimetre].join(' AND ')}`,
      // Seules les deux bornes changent : les filtres d'attribut, eux, restent
      // identiques d'une période à l'autre, sinon on ne comparerait pas la même
      // population.
      [d1, d2, ...params.slice(2)])

    const compte = await compter(debut, fin)
    const comptePrec = cmp ? await compter(debutPrec, finPrec) : null

    // De quoi remplir les listes déroulantes sans les inventer.
    const dims = await analyticsQuery(`
      SELECT LOWER(COALESCE(NULLIF(s.device,''), 'inconnu')) AS appareil,
             LOWER(COALESCE(NULLIF(s."utmSource",''), 'direct')) AS canal,
             COUNT(*)::int AS n
      FROM "AnalyticsSession" s
      WHERE (s."firstSeenAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
        ${SESSION_BOT_FILTER_CLAUSE}
      GROUP BY GROUPING SETS ((1), (2))`, [debut, fin])

    return NextResponse.json({
      periode: { debut, fin },
      comparaison: cmp ? { debut: debutPrec, fin: finPrec } : null,
      repartition: compte.rows[0] ?? {},
      repartitionPrecedente: comptePrec?.rows[0] ?? null,
      segments: (Object.keys(SEGMENTS) as Filtre[]).map((k) => ({ cle: k, label: SEGMENTS[k].label })),
      appareils: dims.rows.filter((x) => x.appareil != null && x.canal == null)
        .map((x) => ({ cle: String(x.appareil), n: Number(x.n) })).sort((a, b) => b.n - a.n),
      canaux: dims.rows.filter((x) => x.canal != null && x.appareil == null)
        .map((x) => ({ cle: String(x.canal), n: Number(x.n) })).sort((a, b) => b.n - a.n).slice(0, 12),
      direct: {
        actifs: Number(direct.rows[0]?.actifs ?? 0),
        evenements: Number(direct.rows[0]?.evenements ?? 0),
      },
      sessions: r.rows.map((x) => ({
        sessionId: String(x.sessionId),
        device: (x.device as string) || '—',
        ville: (x.city as string) || '—',
        source: (x.utmSource as string) || 'direct',
        visiteur: (x.visitorId as string) || null,
        debut: x.firstSeenAt, derniere: x.derniere,
        actions: Number(x.actions), fiches: Number(x.fiches), paniers: Number(x.paniers),
        recherches: Number(x.recherches), frictions: Number(x.frictions),
        duree: Number(x.duree ?? 0),
        enLigne: x.enLigne === true,
        commande: x.orderId ? {
          id: Number(x.orderId), nom: (x.deliveryName as string) || null,
          telephone: (x.deliveryPhone as string) || null,
          statut: String(x.orderStatus), montant: Number(x.montant ?? 0),
        } : null,
      })),
      jours: nbJours,
      genereA: new Date().toISOString(),
      tz: TZ,
    })
  } catch (e) {
    console.error('[analytics/sessions]', analyticsError(e))
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
