import 'server-only'
import pool from '@/lib/db'
import { parSemaine, type Jour } from './meta-model'

/**
 * LES SERIES DE L'ECRAN META ADS : jour par jour, ce que la pub a coute et ce
 * qui a ete livre ; le mois en cours ; les commandes encore en route (le
 * paiement a la livraison met 24-48 h : une semaine « sans ventes » ne l'est
 * souvent pas encore).
 */

export type { Jour }

export async function serieQuotidienne(jours: number): Promise<Jour[]> {
  const r = await pool.query(
    `WITH j AS (SELECT generate_series(current_date - $1::int + 1, current_date, interval '1 day')::date AS jour),
     pub AS (SELECT jour, sum(depense)::float depense, sum(messages)::int messages, sum(achats)::int achats, sum(clics_lien)::int clics FROM "MetaAdDaily" GROUP BY jour),
     spend AS (SELECT date AS jour, sum(spend)::float depense FROM "AdSpendDaily" WHERE platform = 'Meta' GROUP BY date),
     cmd AS (SELECT (coalesce("deliveredAt", "createdAt") AT TIME ZONE 'Africa/Casablanca')::date AS jour, count(*)::int livrees,
                    sum(coalesce(revenue, "productsTotal"))::float ca, sum(coalesce("finalProfit", "estimatedProfit"))::float marge
             FROM "Order" WHERE status = 'DELIVERED' GROUP BY 1)
     SELECT j.jour::text, coalesce(pub.depense, spend.depense, 0) depense, coalesce(pub.messages, 0) messages, coalesce(pub.achats, 0) achats,
            coalesce(pub.clics, 0) clics, coalesce(cmd.livrees, 0) livrees, coalesce(cmd.ca, 0) ca, coalesce(cmd.marge, 0) marge
     FROM j LEFT JOIN pub USING (jour) LEFT JOIN spend USING (jour) LEFT JOIN cmd USING (jour) ORDER BY j.jour`, [jours])
  return r.rows.map((x) => ({ jour: x.jour, depense: Number(x.depense), messages: x.messages, achats: x.achats, clics: x.clics, livrees: x.livrees, ca: Number(x.ca), marge: Number(x.marge) }))
}

export async function serie(jours: number): Promise<{ pas: 'jour' | 'semaine'; points: Jour[] }> {
  const q = await serieQuotidienne(jours)
  return jours > 90 ? { pas: 'semaine', points: parSemaine(q) } : { pas: 'jour', points: q }
}

/** Le mois en cours (heure du Maroc) : depense a date et position dans le mois, pour le rythme du budget. */
export async function moisEnCours() {
  const r = await pool.query(
    `SELECT coalesce((SELECT sum(depense) FROM "MetaAdDaily" WHERE jour >= date_trunc('month', current_date)), 
                     (SELECT sum(spend) FROM "AdSpendDaily" WHERE platform = 'Meta' AND date >= date_trunc('month', current_date)), 0)::float depense,
            extract(day FROM (now() AT TIME ZONE 'Africa/Casablanca'))::int jour,
            extract(day FROM (date_trunc('month', current_date) + interval '1 month - 1 day'))::int total`)
  return { depenseMois: Number(r.rows[0].depense), jourDuMois: r.rows[0].jour, joursDansMois: r.rows[0].total }
}

/** Commandes des 7 derniers jours pas encore livrees ni annulees. */
export async function commandesEnRoute(): Promise<number> {
  const r = await pool.query(`SELECT count(*)::int n FROM "Order" WHERE status IN ('PENDING', 'CONFIRMED') AND "createdAt" > now() - interval '7 days'`)
  return r.rows[0].n
}

/** Le detail d'une pub : sa creation et ses jours. */
export async function detailPub(adId: string) {
  const [a, d] = await Promise.all([
    pool.query(`SELECT * FROM "MetaAd" WHERE ad_id = $1`, [adId]),
    pool.query(`SELECT jour::text, depense::float, impressions, portee, clics_lien, vues_page, messages, achats, valeur_achats::float, vues_video_3s, thruplays
                FROM "MetaAdDaily" WHERE ad_id = $1 ORDER BY jour`, [adId]),
  ])
  if (!a.rowCount) return null
  return { pub: a.rows[0], jours: d.rows }
}
