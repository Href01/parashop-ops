import { canonicalEventName, canonicalFunnelSteps } from './events'

/**
 * L'ENTONNOIR SEQUENCE — la seule implementation du comptage.
 *
 * Extraite de la route pour etre testable sans base : une commande ne doit
 * compter qu'une fois, que la session porte PLACE_ORDER + ORDER_CREATED
 * (ancien contrat), CHECKOUT_SUBMIT_ATTEMPT + PURCHASE_SUCCESS (contrat
 * canonique), ou les deux a la fois pendant la transition.
 */

/**
 * L'entonnoir proposé par défaut, dans l'ORDRE RÉEL du checkout.
 *
 * Relevé sur les 12 sessions qui ont acheté en 30 jours (12 sur 12) :
 *   BEGIN_CHECKOUT > CHECKOUT_SUBMIT_ATTEMPT > ADD_PAYMENT_INFO > OTP_VERIFIED > PURCHASE_SUCCESS
 * `CHECKOUT_SUBMIT_ATTEMPT` part au premier clic sur « Commander », AVANT la
 * validation des coordonnées et avant le code reçu par téléphone.
 *
 * L'entonnoir est séquentiel : une étape ne compte que si elle survient APRÈS la
 * précédente. L'ancien défaut posait ADD_PAYMENT_INFO avant CHECKOUT_SUBMIT_ATTEMPT
 * et s'arrêtait avant PURCHASE_SUCCESS ; sa dernière marche valait donc toujours 0
 * et l'écran annonçait « 0 % de conversion, 100 % de fuite » pour 12 commandes.
 */
export const FUNNEL_PAR_DEFAUT = [
  'PRODUCT_VIEW_DETAIL', 'PRODUCT_ADD_TO_CART', 'BEGIN_CHECKOUT',
  'CHECKOUT_SUBMIT_ATTEMPT', 'ADD_PAYMENT_INFO', 'OTP_VERIFIED', 'PURCHASE_SUCCESS',
] as const

export type FunnelRawEvent = {
  sessionId: string
  name: string
  at: Date | string
  dansPeriode: boolean
}

export type FunnelStepCount = {
  evenement: string
  sessions: number
  /** Delai median depuis l'etape precedente, en secondes. */
  delaiMedian: number | null
}

type FunnelEvent = { name: string; at: number; dansPeriode: boolean }

const mediane = (valeurs: number[]): number => {
  if (!valeurs.length) return 0
  const v = [...valeurs].sort((a, b) => a - b)
  const i = Math.floor(v.length / 2)
  return v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2
}

export function countFunnel(
  rows: readonly FunnelRawEvent[],
  requestedSteps: readonly string[],
  fenetreMin: number,
): FunnelStepCount[] {
  const etapes = canonicalFunnelSteps(requestedSteps)
  if (etapes.length === 0) return []

  const parSession = new Map<string, FunnelEvent[]>()
  for (const row of rows) {
    const liste = parSession.get(row.sessionId) ?? []
    liste.push({
      name: canonicalEventName(row.name),
      at: new Date(row.at).getTime(),
      dansPeriode: row.dansPeriode,
    })
    parSession.set(row.sessionId, liste)
  }

  const comptes = etapes.map(() => 0)
  const delais = etapes.map(() => [] as number[])
  const fenetreMs = fenetreMin * 60_000

  for (const evs of parSession.values()) {
    let meilleur: number[] = []
    const departs = evs
      .map((e, i) => (e.name === etapes[0] && e.dansPeriode ? i : -1))
      .filter((i) => i >= 0)
    for (const departIndex of departs) {
      let index = departIndex
      const temps = [evs[index].at]
      for (let i = 1; i < etapes.length; i++) {
        let suivant = -1
        for (let k = index + 1; k < evs.length; k++) {
          if (evs[k].at - temps[0] > fenetreMs) break
          if (evs[k].name === etapes[i]) {
            suivant = k
            break
          }
        }
        if (suivant < 0) break
        index = suivant
        temps.push(evs[index].at)
      }
      if (temps.length > meilleur.length) meilleur = temps
      if (meilleur.length === etapes.length) break
    }
    for (let i = 0; i < meilleur.length; i++) {
      comptes[i]++
      if (i > 0) delais[i].push((meilleur[i] - meilleur[i - 1]) / 1000)
    }
  }

  return etapes.map((e, i) => ({
    evenement: e,
    sessions: comptes[i],
    delaiMedian: i === 0 ? null : mediane(delais[i]),
  }))
}
