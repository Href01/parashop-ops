/**
 * DATES LISIBLES POUR LES BARRES DE PÉRIODE : « 4 oct. → 2 nov. 2026 », pas « 2026-10-04 → 2026-11-02 ».
 *
 * Les dates restent des chaînes AAAA-MM-JJ partout dans le code (elles voyagent dans l'URL
 * et dans les requêtes) : seul l'AFFICHAGE les met en forme. Lues en UTC, pour qu'un jour
 * ne glisse jamais de la veille selon le fuseau de l'ordinateur.
 */
const format = (date: string, avecAnnee: boolean) =>
  new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(avecAnnee ? { year: 'numeric' as const } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))

const valide = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`))

/** « 2 nov. 2026 ». */
export function dateFr(date: string): string {
  return valide(date) ? format(date, true) : date
}

/** « 2 nov. 2026 » pour un jour, « 4 oct. → 2 nov. 2026 » pour une plage (l'année n'apparaît qu'une fois si elle est commune). */
export function plageFr(debut: string, fin: string): string {
  if (!valide(debut) || !valide(fin)) return debut === fin ? debut : `${debut} → ${fin}`
  if (debut === fin) return format(fin, true)
  const memeAnnee = debut.slice(0, 4) === fin.slice(0, 4)
  return `${format(debut, !memeAnnee)} → ${format(fin, true)}`
}
