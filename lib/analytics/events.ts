/**
 * LE CONTRAT DES EVENEMENTS DE COMMANDE — un fait, deux vocabulaires.
 *
 * La PR site #3 (feat/tracking-events-completion) retire deux conversions
 * ambiguës :
 *
 *   PLACE_ORDER   -> CHECKOUT_SUBMIT_ATTEMPT  (une TENTATIVE d'envoi)
 *   ORDER_CREATED -> PURCHASE_SUCCESS         (la seule conversion de commande)
 *
 * Les evenements deja en base gardent les anciens noms, et la migration de
 * renommage n'est pas executee. Le BOS doit donc lire les deux contrats pendant
 * la transition, sans compter une commande deux fois.
 *
 * Ce module est la seule definition de ces correspondances. Toute lecture du
 * funnel passe par `canonicalEventNameSql` (SQL) ou `canonicalEventName` (TS).
 */

/** Ancien nom -> nom canonique. Un nom absent est deja canonique. */
export const LEGACY_EVENT_ALIASES = {
  PLACE_ORDER: 'CHECKOUT_SUBMIT_ATTEMPT',
  ORDER_CREATED: 'PURCHASE_SUCCESS',
} as const

/** La convertion canonique d'une commande acceptee. */
export const PURCHASE_EVENT = 'PURCHASE_SUCCESS'
/** La tentative d'envoi du checkout (ancien PLACE_ORDER). */
export const CHECKOUT_SUBMIT_EVENT = 'CHECKOUT_SUBMIT_ATTEMPT'

export function canonicalEventName(name: string): string {
  return LEGACY_EVENT_ALIASES[name as keyof typeof LEGACY_EVENT_ALIASES] ?? name
}

/**
 * Expression SQL qui ramene un nom d'evenement a son nom canonique.
 *
 * A n'utiliser que dans le SELECT : l'expression n'est pas indexable. Le WHERE
 * doit filtrer sur `name = ANY(...)` avec `sourceEventNames`, qui contient les
 * anciens ET les nouveaux noms, afin de conserver l'usage de l'index.
 */
export function canonicalEventNameSql(alias = 'e'): string {
  const branches = Object.entries(LEGACY_EVENT_ALIASES)
    .map(([legacy, canonical]) => `WHEN '${legacy}' THEN '${canonical}'`)
    .join(' ')
  return `CASE ${alias}.name ${branches} ELSE ${alias}.name END`
}

/**
 * Les etapes demandees, ramenees aux noms canoniques et dedoublonnees.
 *
 * Si l'UI envoie encore PLACE_ORDER (ancien defaut) ET CHECKOUT_SUBMIT_ATTEMPT,
 * on ne garde qu'une marche : deux marches identiques ne mesureraient qu'une
 * seule action et feraient chuter artificiellement l'entonnoir.
 */
export function canonicalFunnelSteps(steps: readonly string[]): string[] {
  const out: string[] = []
  for (const step of steps) {
    const canonical = canonicalEventName(step)
    if (!out.includes(canonical)) out.push(canonical)
  }
  return out
}

/**
 * Les noms reellement presents en base pour un ensemble d'etapes canoniques.
 * Sert au WHERE indexe : `name = ANY($n)`.
 */
export function sourceEventNames(steps: readonly string[]): string[] {
  const canonical = new Set(canonicalFunnelSteps(steps))
  const names = new Set<string>(canonical)
  for (const [legacy, target] of Object.entries(LEGACY_EVENT_ALIASES)) {
    if (canonical.has(target)) names.add(legacy)
  }
  return [...names]
}
