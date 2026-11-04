import { redirect } from 'next/navigation'

/**
 * L'ENTRÉE D'ANALYTICS : TOUJOURS LES SESSIONS DU JOUR.
 *
 * On ouvre ce tableau de bord d'abord pour savoir ce qui se passe maintenant :
 * qui est sur le site, ce qui a été commandé aujourd'hui. L'ancienne entrée, la Vue
 * d'ensemble sur 30 jours, est devenue un module comme les autres
 * (/analytics/acquisition, vue « marge »).
 *
 * Un ancien lien qui porte des réglages (période, segments) garde sa vue : il est
 * renvoyé vers la Vue d'ensemble avec les mêmes paramètres, plutôt que d'atterrir
 * sur autre chose que ce qu'il désignait.
 */
export default async function EntreeAnalytics({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const brut = await searchParams
  const reglages = new URLSearchParams()
  for (const [cle, valeur] of Object.entries(brut)) {
    for (const v of Array.isArray(valeur) ? valeur : valeur != null ? [valeur] : []) reglages.append(cle, v)
  }
  const query = reglages.toString()
  // Sans `?jours=1` : Sessions ouvre sur aujourd'hui PAR DÉFAUT (useReport joursParDefaut), et ce défaut ne s'écrit pas
  // dans l'adresse. Écrit, il voyageait vers tous les onglets : Acquisition, Parcours ou Meta s'ouvraient sur UNE journée,
  // trop petite pour dire quoi que ce soit (« 0 session sur 29 vont jusqu'à la commande »).
  redirect(query ? `/analytics/acquisition?${query}&vue=marge` : '/analytics/sessions')
}
