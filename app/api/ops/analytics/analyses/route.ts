import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import pool from '@/lib/db'
import { cachedAnalytics } from '@/lib/analytics-cache'
import { TZ } from '@/lib/analytics/metrics'

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
  const sql = `
    WITH ev AS (
      SELECT "sessionId", name, MIN("createdAt") AS a
      FROM "AnalyticsEvent"
      WHERE name = ANY($3) AND ${dateEv} BETWEEN $1::date AND $2::date AND "sessionId" IS NOT NULL
      GROUP BY 1, 2
    ),
    piv AS (
      SELECT "sessionId",
             ${etapes.map((e, i) => `MIN(a) FILTER (WHERE name = '${e}') AS t${i}`).join(',\n             ')}
      FROM ev GROUP BY 1
    )
    SELECT
      ${etapes.map((_, i) => {
        // Etape i atteinte = toutes les precedentes existent, dans l'ordre, et
        // la derniere est survenue dans la fenetre depuis la PREMIERE etape.
        const conds = [`t0 IS NOT NULL`]
        for (let k = 1; k <= i; k++) conds.push(`t${k} >= t${k - 1}`)
        if (i > 0) conds.push(`t${i} <= t0 + interval '${fenetreMin} minutes'`)
        return `COUNT(*) FILTER (WHERE ${conds.join(' AND ')})::int AS s${i}`
      }).join(',\n      ')}
      ${etapes.slice(1).map((_, i) => `,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(epoch FROM (t${i + 1} - t${i}))
      ) FILTER (WHERE t${i + 1} >= t${i} AND t${i + 1} <= t0 + interval '${fenetreMin} minutes'), 0)::float AS d${i + 1}`).join('')}
    FROM piv`
  const r = await pool.query(sql, [debut, fin, etapes])
  const row = r.rows[0] || {}
  return etapes.map((e, i) => ({
    evenement: e,
    label: (ETAPES as Record<string, string>)[e] ?? e,
    sessions: Number(row[`s${i}`] ?? 0),
    /** Delai median depuis l'etape precedente, en secondes. */
    delaiMedian: i === 0 ? null : Number(row[`d${i}`] ?? 0),
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
  const sql = `
    WITH c AS (
      SELECT NULLIF(TRIM("deliveryPhone"), '') AS p,
             date_trunc('month', MIN("createdAt" AT TIME ZONE '${TZ}')) AS cohorte
      FROM "Order"
      WHERE status = 'DELIVERED' AND NULLIF(TRIM("deliveryPhone"), '') IS NOT NULL
      GROUP BY 1
    ),
    o AS (
      SELECT NULLIF(TRIM("deliveryPhone"), '') AS p,
             date_trunc('month', "createdAt" AT TIME ZONE '${TZ}') AS mois,
             COALESCE(revenue, "productsTotal", total) AS montant
      FROM "Order"
      WHERE status = 'DELIVERED' AND NULLIF(TRIM("deliveryPhone"), '') IS NOT NULL
    )
    SELECT to_char(c.cohorte, 'YYYY-MM') AS cohorte,
           (EXTRACT(year FROM age(o.mois, c.cohorte)) * 12
            + EXTRACT(month FROM age(o.mois, c.cohorte)))::int AS rang,
           COUNT(DISTINCT o.p)::int AS clientes,
           COALESCE(SUM(o.montant), 0)::float AS ca
    FROM c JOIN o ON o.p = c.p
    WHERE c.cohorte >= date_trunc('month', now()) - interval '${mois} months'
    GROUP BY 1, 2 ORDER BY 1, 2`
  const r = await pool.query(sql)
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
  const base = `
    WITH c AS (
      SELECT NULLIF(TRIM(o."deliveryPhone"), '') AS tel,
             MAX(o."deliveryName") AS nom,
             MAX(o."deliveryCity") AS ville,
             COUNT(*)::int AS cmd,
             SUM(COALESCE(o.revenue, o."productsTotal", o.total))::float AS ltv,
             SUM(COALESCE(o."finalProfit", o."estimatedProfit", 0))::float AS marge,
             MIN(COALESCE(o."deliveredAt", o."createdAt")) AS premiere,
             MAX(COALESCE(o."deliveredAt", o."createdAt")) AS derniere,
             EXTRACT(DAY FROM NOW() - MAX(COALESCE(o."deliveredAt", o."createdAt")))::int AS recence
      FROM "Order" o
      WHERE o.status = 'DELIVERED' AND NULLIF(TRIM(o."deliveryPhone"), '') IS NOT NULL
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

  const [seg, liste, deux] = await Promise.all([
    pool.query(`${base}
      SELECT segment, COUNT(*)::int AS clientes,
             COALESCE(SUM(ltv), 0)::float AS ca, COALESCE(SUM(marge), 0)::float AS marge,
             COALESCE(AVG(ltv), 0)::float AS ltv_moyen, COALESCE(AVG(recence), 0)::float AS recence,
             COALESCE(AVG(cmd), 0)::float AS cmd_moyen
      FROM s GROUP BY 1`),
    pool.query(`${base}
      SELECT tel, nom, ville, cmd, ltv, marge, recence, segment, r, m,
             to_char(premiere, 'YYYY-MM-DD') AS premiere,
             to_char(derniere, 'YYYY-MM-DD') AS derniere
      FROM s ORDER BY ltv DESC LIMIT 200`),
    // Le delai avant la deuxieme commande : c'est lui qui dit QUAND relancer.
    // Sous le seuil d'effectif on renvoie l'effectif avec, jamais la mediane seule.
    pool.query(`
      WITH o AS (
        SELECT NULLIF(TRIM("deliveryPhone"), '') AS tel,
               COALESCE("deliveredAt", "createdAt") AS d,
               ROW_NUMBER() OVER (PARTITION BY NULLIF(TRIM("deliveryPhone"), '')
                                  ORDER BY COALESCE("deliveredAt", "createdAt")) AS rang
        FROM "Order"
        WHERE status = 'DELIVERED' AND NULLIF(TRIM("deliveryPhone"), '') IS NOT NULL
      )
      SELECT COUNT(*)::int AS effectif,
             COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(epoch FROM (b.d - a.d)) / 86400), 0)::float AS mediane
      FROM o a JOIN o b ON b.tel = a.tel AND b.rang = 2 WHERE a.rang = 1`),
  ])

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
  const frappe = `
    WITH brut AS (
      SELECT "sessionId", "createdAt" AS a, lower(trim(props->>'query')) AS q,
             COALESCE((props->>'resultsCount')::int, 0) AS n_res,
             (props->>'hasResults') = 'true' AS ok
      FROM "AnalyticsEvent"
      WHERE name = 'SEARCH_QUERY' AND COALESCE(trim(props->>'query'), '') <> ''
        AND ${dateEv} BETWEEN $1::date AND $2::date
    ),
    finale AS (
      SELECT b.* FROM brut b
      WHERE NOT EXISTS (
        SELECT 1 FROM brut c
        WHERE c."sessionId" = b."sessionId" AND c.q <> b.q AND c.q LIKE b.q || '%'
          AND c.a BETWEEN b.a AND b.a + interval '60 seconds')
    )`

  const [resume, top, zero, clics] = await Promise.all([
    pool.query(`${frappe}
      SELECT (SELECT COUNT(*)::int FROM brut) AS frappes,
             (SELECT COUNT(*)::int FROM finale) AS recherches,
             (SELECT COUNT(DISTINCT "sessionId")::int FROM finale) AS sessions,
             (SELECT COUNT(*)::int FROM finale WHERE NOT ok) AS sans_resultat`, [debut, fin]),
    pool.query(`${frappe}
      SELECT q AS terme, COUNT(*)::int AS n, COUNT(DISTINCT "sessionId")::int AS sessions,
             COALESCE(AVG(n_res), 0)::float AS resultats,
             COUNT(*) FILTER (WHERE NOT ok)::int AS zero
      FROM finale GROUP BY 1 ORDER BY n DESC, sessions DESC LIMIT 40`, [debut, fin]),
    pool.query(`${frappe}
      SELECT q AS terme, COUNT(*)::int AS n, COUNT(DISTINCT "sessionId")::int AS sessions
      FROM finale WHERE NOT ok GROUP BY 1 ORDER BY n DESC, sessions DESC LIMIT 40`, [debut, fin]),
    // Une recherche suivie d'un clic sur un resultat a servi ; les autres non.
    pool.query(`
      SELECT COUNT(*)::int AS clics, COUNT(DISTINCT "sessionId")::int AS sessions
      FROM "AnalyticsEvent"
      WHERE name = 'SEARCH_RESULT_CLICK' AND ${dateEv} BETWEEN $1::date AND $2::date`, [debut, fin]),
  ])

  const r = resume.rows[0] || {}
  return {
    resume: {
      frappes: Number(r.frappes ?? 0),
      recherches: Number(r.recherches ?? 0),
      sessions: Number(r.sessions ?? 0),
      sansResultat: Number(r.sans_resultat ?? 0),
      clics: Number(clics.rows[0]?.clics ?? 0),
      sessionsAvecClic: Number(clics.rows[0]?.sessions ?? 0),
    },
    top: top.rows.map((x) => ({
      terme: String(x.terme), n: Number(x.n), sessions: Number(x.sessions),
      resultats: Number(x.resultats), zero: Number(x.zero),
    })),
    zero: zero.rows.map((x) => ({
      terme: String(x.terme), n: Number(x.n), sessions: Number(x.sessions),
    })),
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
    WITH pv AS (
      SELECT "sessionId", split_part(path, '?', 1) AS p, "createdAt",
             ROW_NUMBER() OVER (PARTITION BY "sessionId" ORDER BY "createdAt") AS rang
      FROM "AnalyticsEvent"
      WHERE name = 'PAGE_VIEW' AND ${dateEv} BETWEEN $1::date AND $2::date AND path IS NOT NULL
    )
    SELECT a.p AS de, COALESCE(b.p, '(fin de visite)') AS vers, COUNT(*)::int AS n
    FROM pv a LEFT JOIN pv b ON b."sessionId" = a."sessionId" AND b.rang = a.rang + 1
    ${depart ? 'WHERE a.p = $3' : ''}
    GROUP BY 1, 2 ORDER BY n DESC LIMIT 25`
  const r = await pool.query(sql, depart ? [debut, fin, depart] : [debut, fin])
  return r.rows.map((x) => ({ de: String(x.de), vers: String(x.vers), n: Number(x.n) }))
}

export async function POST(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    if (!token || token.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const b = await request.json()
    const dateOk = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
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

    if (!dateOk(debut) || !dateOk(fin)) return NextResponse.json({ error: 'Période invalide' }, { status: 400 })

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
    console.error('[analytics/analyses]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token || token.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ etapes: Object.entries(ETAPES).map(([cle, label]) => ({ cle, label })) })
}
