/**
 * L'HEURE DU MAROC, SANS DEPENDRE DE POSTGRES.
 *
 * Le Maroc est a UTC+1 toute l'annee, sauf pendant le ramadan (UTC+0). La base
 * (PostgreSQL 16 de Neon) embarque une copie de la base des fuseaux horaires qui
 * est JUSTE jusqu'au 20/09/2026, puis FAUSSE : elle donne UTC+0 hors ramadan
 * (mesure : 21/09/2026 → 2029, un decalage d'une heure). Toute conversion
 * `AT TIME ZONE 'Africa/Casablanca'` faite en SQL derive donc depuis cette date.
 *
 * Ici le decalage vient de Node (Intl, tzdata a jour). On en tire les periodes
 * a UTC+0 (ramadan), et on les ECRIT dans le SQL sous forme de bornes fixes : la
 * base n'a plus aucune regle a connaitre.
 *
 *   heure locale = heure UTC + 1 h, sauf dans une periode a UTC+0.
 *
 * Fichier pur (ni base ni reseau) : teste, et compare a Intl sur des milliers de
 * lignes reelles (tests/analytics/maroc-time.test.ts + script de verification).
 */

const TZ = 'Africa/Casablanca'
const HEURE = 3_600_000
const JOUR = 24 * HEURE

/** Premiere et derniere annee couvertes. Hors de cette plage on retombe sur UTC+1. */
export const ANNEE_DEBUT = 2024
export const ANNEE_FIN = 2036

const format = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

/** Decalage du Maroc par rapport a UTC, en heures, a l'instant `ms`. */
export function decalageHeures(ms: number): number {
  const p: Record<string, number> = {}
  for (const x of format.formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = Number(x.value)
  const local = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((local - Math.floor(ms / 1000) * 1000) / HEURE)
}

export type Periode = { debut: number; fin: number }

let memo: { zero: Periode[]; jours: { de: string; a: string }[] } | null = null

const jourIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Periodes (ms UTC, [debut, fin[) pendant lesquelles le Maroc est a UTC+0. */
export function calculerPeriodesUtc0(): { zero: Periode[]; jours: { de: string; a: string }[] } {
  if (memo) return memo
  const debut = Date.UTC(ANNEE_DEBUT, 0, 1), fin = Date.UTC(ANNEE_FIN, 0, 1)
  const zero: Periode[] = []
  let ouvert: number | null = null
  let prec = decalageHeures(debut)
  if (prec === 0) ouvert = debut
  for (let t = debut + 3 * JOUR; t <= fin; t += 3 * JOUR) {
    const d = decalageHeures(t)
    if (d !== prec) {
      // Une bascule s'est produite entre t - 3 j et t : on la cherche a la seconde.
      let lo = t - 3 * JOUR, hi = t
      while (hi - lo > 1000) { const mid = Math.floor((lo + hi) / 2); decalageHeures(mid) === prec ? (lo = mid) : (hi = mid) }
      const bascule = Math.floor(hi / 1000) * 1000 // les bascules tombent sur une seconde ronde
      if (d === 0) ouvert = bascule
      else if (ouvert != null) { zero.push({ debut: ouvert, fin: bascule }); ouvert = null }
      prec = d
    }
  }
  if (ouvert != null) zero.push({ debut: ouvert, fin })

  // Les JOURS dont le minuit LOCAL tombe a UTC+0 (pour convertir une date en instant).
  const jours: { de: string; a: string }[] = []
  let courant: { de: string; a: string } | null = null
  for (let d = debut; d < fin; d += JOUR) {
    const minuitUtc1 = d - HEURE // minuit local si le Maroc est a UTC+1
    const decalage = decalageHeures(minuitUtc1) === 1 ? 1 : 0
    if (decalage === 0) { courant = courant ? { de: courant.de, a: jourIso(d) } : { de: jourIso(d), a: jourIso(d) } }
    else if (courant) { jours.push(courant); courant = null }
  }
  if (courant) jours.push(courant)
  memo = { zero, jours }
  return memo
}

const ts = (ms: number) => `TIMESTAMP '${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')}'`

/**
 * SQL : heure locale du Maroc (timestamp sans fuseau) d'une expression « timestamp
 * sans fuseau » exprimee en UTC. `expr` est repetee : passer une colonne ou une
 * expression sans effet de bord.
 */
export function heureLocaleDepuisUtcSql(expr: string): string {
  const { zero } = calculerPeriodesUtc0()
  if (zero.length === 0) return `(${expr} + INTERVAL '1 hour')`
  const conds = zero.map((p) => `(${expr} >= ${ts(p.debut)} AND ${expr} < ${ts(p.fin)})`).join(' OR ')
  return `(CASE WHEN ${conds} THEN ${expr} ELSE ${expr} + INTERVAL '1 hour' END)`
}

/**
 * SQL : l'instant UTC (timestamp sans fuseau) du minuit LOCAL de la date `dateExpr`.
 * Sert aux bornes de fenetre : `col >= minuitLocalEnUtcSql($1)` utilise l'index.
 */
export function minuitLocalEnUtcSql(dateExpr: string): string {
  const { jours } = calculerPeriodesUtc0()
  const base = `((${dateExpr})::date)::timestamp`
  if (jours.length === 0) return `(${base} - INTERVAL '1 hour')`
  const conds = jours.map((j) => `((${dateExpr})::date BETWEEN DATE '${j.de}' AND DATE '${j.a}')`).join(' OR ')
  return `(CASE WHEN ${conds} THEN ${base} ELSE ${base} - INTERVAL '1 hour' END)`
}

/** SQL : instant UTC d'une heure MURALE locale (ex. une heure donnee par Sendit). */
export function instantDepuisHeureLocaleSql(expr: string): string {
  const { zero } = calculerPeriodesUtc0()
  if (zero.length === 0) return `(${expr} - INTERVAL '1 hour')`
  // Dans une periode a UTC+0, heure locale = heure UTC : la borne murale est la borne UTC.
  const conds = zero.map((p) => `(${expr} >= ${ts(p.debut)} AND ${expr} < ${ts(p.fin)})`).join(' OR ')
  return `(CASE WHEN ${conds} THEN ${expr} ELSE ${expr} - INTERVAL '1 hour' END)`
}
