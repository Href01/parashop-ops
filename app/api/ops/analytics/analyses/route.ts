import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { cachedAnalytics } from '@/lib/analytics-cache'
import { analyticsError, analyticsQuery } from '@/lib/analytics/db'
import { SESSION_BOT_FILTER_CLAUSE, TZ } from '@/lib/analytics/metrics'

/**
 * LES PRIMITIVES D'ANALYSE — entonnoir, cohortes, chemins.
 *
 * Trois formes qu'un tableau de dimension ne sait pas produire, parce qu'elles
 * portent sur des SEQUENCES et non sur des agregats : l'ordre des evenements,
 * le retour d'une personne d'un mois sur l'autre, l'enchainement des pages.
 * C'est ce qu'Amplitude et GA4 apportent, et ce qui manquait entierement.
 *
 * POST /api/ops/analytics/analyses  { type: 'entonnoir' | 'cohortes' | 'chemins' | 'clientes', ... }
 */

export const dynamic = 'force-dynamic'

/** Le catalogue d'etapes proposees. Liste blanche : rien d'autre n'atteint le SQL. */
export const ETAPES = {
  SESSION_START: 'Visite',
  PRODUCT_IMPRESSION: 'Produit vu en rayon',
  PRODUCT_CLICK: 'Clic en rayon',
  PRODUCT_VIEW_DETAIL: 'Fiche produit',
  PRODUCT_ADD_TO_CART: 'Ajout au panier',
  VIEW_CART: 'Panier ouvert',
  BEGIN_CHECKOUT: 'Checkout démarré',
  DELIVERY_CITY_SELECTED: 'Ville choisie',
  ADD_PAYMENT_INFO: 'Coordonnées saisies',
  PLACE_ORDER: 'Commande envoyée',
  PURCHASE_SUCCESS: 'Commande acceptée',
} as const

const dateEv = `("createdAt" AT TIME ZONE '${TZ}')::date`

/**
 * ENTONNOIR SEQUENCE, avec fenetre de conversion.
 *
 * Deux exigences que l'ancien entonnoir figé ne satisfaisait qu'a moitie :
 *
 *  1. L'ORDRE. Chaque etape doit survenir APRES la precedente dans la MEME
 *     session. Compter « qui a fait A » et « qui a fait B » separement gonfle
 *     l'entonnoir : une visiteuse qui ouvre son panier puis regarde une fiche
 *     compterait comme ayant suivi le chemin.
 *  2. LA FENETRE. Sans elle, un entonnoir n'a pas de sens : acheter 12 jours
 *     apres la premiere visite n'est pas la meme histoire qu'en 4 minutes. On
 *     mesure aussi le DELAI MEDIAN entre etapes — c'est lui qui dit ou l'on
 *     hesite, la ou le taux dit seulement ou l'on part.
 */
async function entonnoir(etapes: string[], debut: string, fin: string, fenetreMin: number) {
  type Ev = { sessionId: string; name: string; at: Date; dansPeriode: boolean }
  const r = await analyticsQuery<Ev>(`
    SELECT e."sessionId", e.name, e."createdAt" AS at,
           ${dateEv.replaceAll('"createdAt"', 'e."createdAt"')} BETWEEN $1::date AND $2::date AS "dansPeriode"
    FROM "AnalyticsEvent" e
    LEFT JOIN "AnalyticsSession" s ON s."sessionId" = e."sessionId"
    WHERE e.name = ANY($3) AND e."sessionId" IS NOT NULL
      AND (e."createdAt" AT TIME ZONE '${TZ}') >= $1::date
      AND (e."createdAt" AT TIME ZONE '${TZ}') < $2::date + interval '1 day' + ($4 * interval '1 minute')
      ${SESSION_BOT_FILTER_CLAUSE}
    ORDER BY e."sessionId", e."createdAt", e.id`, [debut, fin, etapes, fenetreMin])

  const parSession = new Map<string, Ev[]>()
  for (const row of r.rows) {
    const liste = parSession.get(row.sessionId) ?? []
    liste.push(row)
    parSession.set(row.sessionId, liste)
  }
  const comptes = etapes.map(() => 0)
  const delais = etapes.map(() => [] as number[])
  const fenetreMs = fenetreMin * 60_000

  for (const evs of parSession.values()) {
    let meilleur: number[] = []
    const departs = evs.map((e, i) => e.name === etapes[0] && e.dansPeriode ? i : -1).filter((i) => i >= 0)
    for (const departIndex of departs) {
      let index = departIndex
      const temps = [new Date(evs[index].at).getTime()]
      for (let i = 1; i < etapes.length; i++) {
        let suivant = -1
        for (let k = index + 1; k < evs.length; k++) {
          const t = new Date(evs[k].at).getTime()
          if (t - temps[0] > fenetreMs) break
          if (evs[k].name === etapes[i]) { suivant = k; break }
        }
        if (suivant < 0) break
        index = suivant
        temps.push(new Date(evs[index].at).getTime())
      }
      if (temps.length > meilleur.length) meilleur = temps
      if (meilleur.length === etapes.length) break
    }
    for (let i = 0; i < meilleur.length; i++) {
      comptes[i]++
      if (i > 0) delais[i].push((meilleur[i] - meilleur[i - 1]) / 1000)
    }
  }

  const mediane = (valeurs: number[]): number => {
    if (!valeurs.length) return 0
    const v = [...valeurs].sort((a, b) => a - b)
    const i = Math.floor(v.length / 2)
    return v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2
  }
  return etapes.map((e, i) => ({
    evenement: e,
    label: (ETAPES as Record<string, string>)[e] ?? e,
    sessions: comptes[i],
    /** Delai median depuis l'etape precedente, en secondes. */
    delaiMedian: i === 0 ? null : mediane(delais[i]),
  }))
}

/**
 * COHORTES — les clientes reviennent-elles ?
 *
 * Groupees par mois de PREMIERE commande livree, suivies mois par mois. La
 * personne est identifiee par son numero de livraison : c'est le seul
 * identifiant stable ici, puisque 61 % des commandes n'ont pas de session.
 *
 * La diagonale doit egaler la taille de chaque cohorte — c'est le controle qui
 * dit si le calcul tient.
 */
async function cohortes(mois: number) {
  const tel = `NULLIF(RIGHT(REGEXP_REPLACE(TRIM("deliveryPhone"), '[^0-9]', '', 'g'), 9), '')`
  const sql = `
    WITH c AS (
      SELECT ${tel} AS p,
             date_trunc('month', MIN("deliveredAt" AT TIME ZONE '${TZ}')) AS cohorte
      FROM "Order"
      WHERE status = 'DELIVERED' AND "deliveredAt" IS NOT NULL AND ${tel} IS NOT NULL
      GROUP BY 1
    ),
    o AS (
      SELECT ${tel} AS p,
             date_trunc('month', "deliveredAt" AT TIME ZONE '${TZ}') AS mois,
             COALESCE(revenue, "productsTotal", total) AS montant
      FROM "Order"
      WHERE status = 'DELIVERED' AND "deliveredAt" IS NOT NULL AND ${tel} IS NOT NULL
    )
    SELECT to_char(c.cohorte, 'YYYY-MM') AS cohorte,
           (EXTRACT(year FROM age(o.mois, c.cohorte)) * 12
            + EXTRACT(month FROM age(o.mois, c.cohorte)))::int AS rang,
           COUNT(DISTINCT o.p)::int AS clientes,
           COALESCE(SUM(o.montant), 0)::float AS ca
    FROM c JOIN o ON o.p = c.p
    WHERE c.cohorte >= date_trunc('month', now() AT TIME ZONE '${TZ}') - interval '${Math.max(0, mois - 1)} months'
    GROUP BY 1, 2 ORDER BY 1, 2`
  const r = await analyticsQuery(sql)
  return r.rows.map((x) => ({
    cohorte: String(x.cohorte), rang: Number(x.rang),
    clientes: Number(x.clientes), ca: Number(x.ca),
  }))
}

/**
 * LES CLIENTES, UNE PAR UNE — recence, frequence, valeur.
 *
 * Rapatrie depuis l'ancienne page « Clientes », et REFAIT : le bareme qu'elle
 * appliquait etait mort sur ces donnees. Il donnait M=5 au-dela de 5 000 MAD de
 * cumul quand la meilleure cliente en pese 1 970, et F=3 a partir de quatre
 * commandes quand le maximum observe est de trois. Deux axes sur trois etaient
 * donc constants : 108 clientes sur 152 en M=1, 133 sur 152 en F=1. Le segment
 * « VIP » (4 commandes OU 2 000 MAD) ne pouvait designer personne, et
 * « inactives » (plus de 180 jours) non plus, la doyenne datant de 162 jours.
 * Un bareme copie d'ailleurs, jamais confronte a la base.
 *
 * Ce qui le remplace :
 *
 *  · LES SCORES SONT DES QUINTILES DE LA DISTRIBUTION REELLE, pas des seuils en
 *    dirhams. R=5 veut dire « parmi le cinquieme le plus recent », ce qui reste
 *    vrai quand la boutique grandit. On utilise PERCENT_RANK et non NTILE parce
 *    que les ex aequo doivent partager le meme score : deux clientes au meme
 *    cumul ne peuvent pas etre notees differemment.
 *  · PAS DE SCORE F. Avec trois commandes au maximum, ecrire « F=2 » n'ajoute
 *    rien a « 2 commandes » — et donne l'illusion d'une echelle. On affiche le
 *    nombre brut tant que la profondeur d'achat ne le justifie pas.
 *  · LA BASE EST LA LIVRAISON. Le cumul compte les produits livres et payes
 *    (`revenue`), pas les CONFIRMED ni les frais de port : l'ancienne page
 *    annoncait 69 744 MAD la ou le back-office en compte 64 119.
 *  · LA RECENCE SE COMPTE DEPUIS LA LIVRAISON, comme partout ailleurs depuis la
 *    migration 025.
 */
async function clientes() {
  const tel = `NULLIF(RIGHT(REGEXP_REPLACE(TRIM(o."deliveryPhone"), '[^0-9]', '', 'g'), 9), '')`
  const base = `
    WITH c AS (
      SELECT ${tel} AS tel,
             (ARRAY_AGG(NULLIF(TRIM(o."deliveryName"), '') ORDER BY o."deliveredAt" DESC)
               FILTER (WHERE NULLIF(TRIM(o."deliveryName"), '') IS NOT NULL))[1] AS nom,
             (ARRAY_AGG(NULLIF(TRIM(o."deliveryCity"), '') ORDER BY o."deliveredAt" DESC)
               FILTER (WHERE NULLIF(TRIM(o."deliveryCity"), '') IS NOT NULL))[1] AS ville,
             COUNT(*)::int AS cmd,
             SUM(COALESCE(o.revenue, o."productsTotal", o.total))::float AS ltv,
             SUM(COALESCE(o."finalProfit", o."estimatedProfit", 0))::float AS marge,
             MIN(COALESCE(o."deliveredAt", o."createdAt")) AS premiere,
             MAX(COALESCE(o."deliveredAt", o."createdAt")) AS derniere,
             EXTRACT(DAY FROM NOW() - MAX(COALESCE(o."deliveredAt", o."createdAt")))::int AS recence
      FROM "Order" o
      WHERE o.status = 'DELIVERED' AND o."deliveredAt" IS NOT NULL AND ${tel} IS NOT NULL
      GROUP BY 1
    ),
    s AS (
      SELECT *,
        CASE
          WHEN cmd >= 2 AND recence <= 90 THEN 'fidele'
          WHEN cmd >= 2                   THEN 'a_reactiver'
          WHEN recence <= 30              THEN 'nouvelle'
          WHEN recence <= 90              THEN 'a_convertir'
          ELSE 'perdue_de_vue'
        END AS segment,
        LEAST(5, 1 + FLOOR(PERCENT_RANK() OVER (ORDER BY recence DESC) * 5))::int AS r,
        LEAST(5, 1 + FLOOR(PERCENT_RANK() OVER (ORDER BY ltv) * 5))::int AS m
      FROM c
    )`

  const seg = await analyticsQuery(`${base}
      SELECT segment, COUNT(*)::int AS clientes,
             COALESCE(SUM(ltv), 0)::float AS ca, COALESCE(SUM(marge), 0)::float AS marge,
             COALESCE(AVG(ltv), 0)::float AS ltv_moyen, COALESCE(AVG(recence), 0)::float AS recence,
             COALESCE(AVG(cmd), 0)::float AS cmd_moyen
      FROM s GROUP BY 1`)
  const liste = await analyticsQuery(`${base}
      SELECT tel, nom, ville, cmd, ltv, marge, recence, segment, r, m,
             to_char(premiere, 'YYYY-MM-DD') AS premiere,
             to_char(derniere, 'YYYY-MM-DD') AS derniere
      FROM s ORDER BY ltv DESC LIMIT 200`)
  // Le delai avant la deuxieme commande : c'est lui qui dit QUAND relancer.
  // Sous le seuil d'effectif on renvoie l'effectif avec, jamais la mediane seule.
  const deux = await analyticsQuery(`
      WITH o AS (
        SELECT NULLIF(RIGHT(REGEXP_REPLACE(TRIM("deliveryPhone"), '[^0-9]', '', 'g'), 9), '') AS tel,
               "deliveredAt" AS d,
               ROW_NUMBER() OVER (
                 PARTITION BY NULLIF(RIGHT(REGEXP_REPLACE(TRIM("deliveryPhone"), '[^0-9]', '', 'g'), 9), '')
                 ORDER BY "deliveredAt") AS rang
        FROM "Order"
        WHERE status = 'DELIVERED' AND "deliveredAt" IS NOT NULL
          AND NULLIF(RIGHT(REGEXP_REPLACE(TRIM("deliveryPhone"), '[^0-9]', '', 'g'), 9), '') IS NOT NULL
      )
      SELECT COUNT(*)::int AS effectif,
             COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(epoch FROM (b.d - a.d)) / 86400), 0)::float AS mediane
      FROM o a JOIN o b ON b.tel = a.tel AND b.rang = 2 WHERE a.rang = 1`)

  return {
    segments: seg.rows.map((x) => ({
      cle: String(x.segment), clientes: Number(x.clientes),
      ca: Number(x.ca), marge: Number(x.marge), ltvMoyen: Number(x.ltv_moyen),
      recence: Number(x.recence), cmdMoyen: Number(x.cmd_moyen),
    })),
    clientes: liste.rows.map((x) => ({
      tel: String(x.tel), nom: x.nom ? String(x.nom) : '', ville: x.ville ? String(x.ville) : '',
      cmd: Number(x.cmd), ltv: Number(x.ltv), marge: Number(x.marge), recence: Number(x.recence),
      segment: String(x.segment), r: Number(x.r), m: Number(x.m),
      premiere: String(x.premiere), derniere: String(x.derniere),
    })),
    deuxiemeCommande: {
      effectif: Number(deux.rows[0]?.effectif ?? 0),
      medianeJours: Number(deux.rows[0]?.mediane ?? 0),
    },
  }
}

/**
 * LA RECHERCHE — ce qu'elles tapent, et ce qu'elles ne trouvent pas.
 *
 * UN PIEGE QU'IL FAUT DESAMORCER D'ABORD. `SEARCH_QUERY` part a CHAQUE FRAPPE :
 * « sa », « sal », « saler », « salerm » sont quatre evenements pour une seule
 * intention. Compter les evenements, comme le faisait l'ancienne page, comptait
 * donc des touches de clavier et non des recherches — 2 316 contre 864, un
 * facteur 2,7. Pire, le classement en etait fausse : les prefixes courts d'un
 * mot frequent remontaient devant les vraies requetes.
 *
 * On ne garde donc que la frappe TERMINEE : une requete qui est le prefixe
 * d'une autre, saisie dans la meme session moins de soixante secondes plus
 * tard, n'est qu'une etape de saisie. Ce qui reste est une intention.
 *
 * Le vrai gisement est la colonne « sans resultat ». Une recherche sans reponse
 * est une cliente qui voulait acheter et qui repart — et le terme dit
 * exactement quoi : soit une marque a rentrer, soit un mot que le catalogue
 * ecrit autrement.
 */
async function recherches(debut: string, fin: string) {
  type SearchEv = { sessionId: string; name: string; at: Date; props: Record<string, unknown> }
  const resultat = await analyticsQuery<SearchEv>(`
    SELECT e."sessionId", e.name, e."createdAt" AS at, e.props
    FROM "AnalyticsEvent" e
    LEFT JOIN "AnalyticsSession" s ON s."sessionId" = e."sessionId"
    WHERE e.name = ANY($3) AND e."sessionId" IS NOT NULL
      AND (e."createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
      ${SESSION_BOT_FILTER_CLAUSE}
    ORDER BY e."sessionId", e."createdAt", e.id`, [
      debut, fin, ['SEARCH_QUERY', 'SEARCH_SUBMIT', 'SEARCH_ZERO_RESULTS', 'SEARCH_RESULT_CLICK'],
    ])

  const texte = (props: Record<string, unknown>): string =>
    String(props.query ?? props.searchTerm ?? props.term ?? '').trim().toLowerCase()
  const nombre = (props: Record<string, unknown>): number => {
    const n = Number(props.resultsCount ?? props.resultCount ?? props.count ?? 0)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }
  const aDesResultats = (props: Record<string, unknown>, n: number): boolean => {
    const v = props.hasResults
    if (typeof v === 'boolean') return v
    if (typeof v === 'string') return v === 'true'
    return n > 0
  }

  const groupes = new Map<string, SearchEv[]>()
  for (const e of resultat.rows) {
    const liste = groupes.get(e.sessionId) ?? []
    liste.push(e)
    groupes.set(e.sessionId, liste)
  }

  type Intention = { terme: string; sessionId: string; resultats: number; zero: boolean; clic: boolean }
  const intentions: Intention[] = []
  let frappes = 0
  for (const [sessionId, evs] of groupes) {
    const queries = evs.filter((e) => e.name === 'SEARCH_QUERY' && texte(e.props))
    frappes += queries.length
    const submits = evs.filter((e) => e.name === 'SEARCH_SUBMIT' && texte(e.props))
    const finales = submits.length ? submits : queries.filter((e, i) => {
      const q = texte(e.props)
      const at = new Date(e.at).getTime()
      return !queries.slice(i + 1).some((suivant) => {
        const sq = texte(suivant.props)
        const dt = new Date(suivant.at).getTime() - at
        return dt >= 0 && dt <= 60_000 && sq !== q && sq.startsWith(q)
      })
    })

    for (let i = 0; i < finales.length; i++) {
      const e = finales[i]
      const terme = texte(e.props)
      const at = new Date(e.at).getTime()
      const prochaine = finales[i + 1] ? new Date(finales[i + 1].at).getTime() : at + 30 * 60_000
      const querySource = e.name === 'SEARCH_SUBMIT'
        ? [...queries].reverse().find((q) => new Date(q.at).getTime() <= at && texte(q.props) === terme)
        : e
      const props = { ...(querySource?.props ?? {}), ...e.props }
      const n = nombre(props)
      const zeroExplicite = evs.some((x) => {
        const t = new Date(x.at).getTime()
        return x.name === 'SEARCH_ZERO_RESULTS' && t >= at && t < prochaine
          && (!texte(x.props) || texte(x.props) === terme)
      })
      const clic = evs.some((x) => {
        const t = new Date(x.at).getTime()
        return x.name === 'SEARCH_RESULT_CLICK' && t >= at && t < prochaine
          && (!texte(x.props) || texte(x.props) === terme)
      })
      intentions.push({
        terme, sessionId, resultats: n,
        zero: zeroExplicite || !aDesResultats(props, n), clic,
      })
    }
  }

  const parTerme = new Map<string, { n: number; sessions: Set<string>; zeroSessions: Set<string>; resultats: number; zero: number }>()
  for (const x of intentions) {
    const a = parTerme.get(x.terme) ?? {
      n: 0, sessions: new Set<string>(), zeroSessions: new Set<string>(), resultats: 0, zero: 0,
    }
    a.n++
    a.sessions.add(x.sessionId)
    a.resultats += x.resultats
    if (x.zero) { a.zero++; a.zeroSessions.add(x.sessionId) }
    parTerme.set(x.terme, a)
  }
  const lignes = [...parTerme].map(([terme, x]) => ({
    terme, n: x.n, sessions: x.sessions.size,
    resultats: x.n ? x.resultats / x.n : 0, zero: x.zero, zeroSessions: x.zeroSessions.size,
  })).sort((a, b) => b.n - a.n || b.sessions - a.sessions)
  const avecClic = intentions.filter((x) => x.clic)
  return {
    resume: {
      frappes,
      recherches: intentions.length,
      sessions: new Set(intentions.map((x) => x.sessionId)).size,
      sansResultat: intentions.filter((x) => x.zero).length,
      clics: avecClic.length,
      sessionsAvecClic: new Set(avecClic.map((x) => x.sessionId)).size,
    },
    top: lignes.slice(0, 40),
    zero: lignes.filter((x) => x.zero > 0).map((x) => ({
      terme: x.terme, n: x.zero, sessions: x.zeroSessions,
    })).slice(0, 40),
  }
}

/**
 * CHEMINS — ce qui suit une page donnee.
 *
 * L'exploration de chemin de GA4, en version lisible : depuis un point de
 * depart, les suites classees par frequence. Un seul pas a la fois, parce
 * qu'un diagramme a cinq niveaux se regarde bien et ne se lit pas.
 */
async function chemins(depart: string | null, debut: string, fin: string) {
  const sql = `
    WITH brut AS (
      SELECT e."sessionId", split_part(e.path, '?', 1) AS p, e."createdAt", e.id,
             LAG(split_part(e.path, '?', 1)) OVER (
               PARTITION BY e."sessionId" ORDER BY e."createdAt", e.id) AS precedent
      FROM "AnalyticsEvent" e
      LEFT JOIN "AnalyticsSession" s ON s."sessionId" = e."sessionId"
      WHERE e.name = 'PAGE_VIEW'
        AND (e."createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
        AND e.path IS NOT NULL ${SESSION_BOT_FILTER_CLAUSE}
    ),
    pv AS (
      SELECT "sessionId", p, "createdAt",
             ROW_NUMBER() OVER (PARTITION BY "sessionId" ORDER BY "createdAt", id) AS rang
      FROM brut WHERE precedent IS DISTINCT FROM p
    )
    SELECT a.p AS de, COALESCE(b.p, '(fin de visite)') AS vers, COUNT(*)::int AS n
    FROM pv a LEFT JOIN pv b ON b."sessionId" = a."sessionId" AND b.rang = a.rang + 1
    ${depart ? 'WHERE a.p = $3' : ''}
    GROUP BY 1, 2 ORDER BY n DESC LIMIT 25`
  const r = await analyticsQuery(sql, depart ? [debut, fin, depart] : [debut, fin])
  return r.rows.map((x) => ({ de: String(x.de), vers: String(x.vers), n: Number(x.n) }))
}

export async function POST(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    if (!token || token.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const b = await request.json()
    const dateOk = (v: unknown) => {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
      const d = new Date(`${v}T00:00:00Z`)
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
    }
    const debut = b?.periode?.debut, fin = b?.periode?.fin

    if (b?.type === 'cohortes') {
      const mois = Math.min(Math.max(Number(b.mois) || 12, 1), 36)
      const { data } = await cachedAnalytics(`coh:${mois}`, 5 * 60 * 1000, () => cohortes(mois))
      return NextResponse.json({ cohortes: data })
    }

    if (b?.type === 'clientes') {
      // Comme les cohortes : la vie d'une cliente ne se decoupe pas en periode,
      // elle se lit sur tout l'historique.
      const { data } = await cachedAnalytics('cli', 5 * 60 * 1000, () => clientes())
      return NextResponse.json(data)
    }

    if (!dateOk(debut) || !dateOk(fin) || debut > fin) {
      return NextResponse.json({ error: 'Période invalide' }, { status: 400 })
    }

    if (b?.type === 'entonnoir') {
      // Liste blanche stricte : seules les etapes du catalogue sont acceptees.
      const etapes: string[] = (Array.isArray(b.etapes) ? b.etapes : [])
        .filter((e: string) => typeof e === 'string' && e in ETAPES)
        .slice(0, 8)
      if (etapes.length < 2) return NextResponse.json({ error: 'Au moins deux étapes' }, { status: 400 })
      const fenetre = Math.min(Math.max(Number(b.fenetreMin) || 1440, 1), 60 * 24 * 30)
      const { data } = await cachedAnalytics(
        `fun:${debut}:${fin}:${etapes.join(',')}:${fenetre}`, 5 * 60 * 1000,
        () => entonnoir(etapes, debut, fin, fenetre)
      )
      return NextResponse.json({ etapes: data, fenetreMin: fenetre })
    }

    if (b?.type === 'recherches') {
      const { data } = await cachedAnalytics(
        `rec:${debut}:${fin}`, 5 * 60 * 1000, () => recherches(debut, fin)
      )
      return NextResponse.json(data)
    }

    if (b?.type === 'chemins') {
      const depart = typeof b.depart === 'string' && b.depart.length < 200 ? b.depart : null
      const { data } = await cachedAnalytics(
        `che:${debut}:${fin}:${depart ?? ''}`, 5 * 60 * 1000, () => chemins(depart, debut, fin)
      )
      return NextResponse.json({ chemins: data })
    }

    return NextResponse.json({ error: 'Type inconnu' }, { status: 400 })
  } catch (e) {
    console.error('[analytics/analyses]', analyticsError(e))
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token || token.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ etapes: Object.entries(ETAPES).map(([cle, label]) => ({ cle, label })) })
}
