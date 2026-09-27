/**
 * Les regles pures de l'agent Meta Ads (sans base ni reseau) : lecture des
 * « actions » Meta, indicateurs d'une pub, signaux de fatigue. Testees seules.
 */

export type MetaActions = { action_type: string; value: string | number }[] | undefined

/**
 * Meta compte le meme achat sous plusieurs noms (omni_purchase, purchase,
 * offsite_conversion.fb_pixel_purchase) : on prend le PREMIER present dans
 * l'ordre de priorite, jamais la somme — sinon un achat compte triple.
 */
function premier(actions: MetaActions, types: string[]): number {
  if (!actions) return 0
  for (const t of types) {
    const hit = actions.find((a) => a.action_type === t)
    if (hit) return Number(hit.value) || 0
  }
  return 0
}

export const TYPES = {
  achats: ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'],
  paniers: ['omni_add_to_cart', 'add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'],
  commandesInitiees: ['omni_initiated_checkout', 'initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'],
  vuesPage: ['landing_page_view', 'omni_landing_page_view'],
  messages: ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.total_messaging_connection'],
  vuesVideo3s: ['video_view'],
  engagements: ['post_engagement', 'page_engagement'],
}

export function actionsParJour(actions: MetaActions, valeurs: MetaActions, thruplays: MetaActions) {
  return {
    achats: premier(actions, TYPES.achats),
    valeurAchats: premier(valeurs, TYPES.achats),
    paniers: premier(actions, TYPES.paniers),
    commandesInitiees: premier(actions, TYPES.commandesInitiees),
    vuesPage: premier(actions, TYPES.vuesPage),
    messages: premier(actions, TYPES.messages),
    vuesVideo3s: premier(actions, TYPES.vuesVideo3s),
    thruplays: premier(thruplays, ['video_view']),
    engagements: premier(actions, TYPES.engagements),
  }
}

export type Cumul = { depense: number; impressions: number; clicsLien: number; vuesPage: number; achats: number; valeurAchats: number; messages: number; vuesVideo3s: number; thruplays: number }

/** Les indicateurs d'une pub sur une periode ; null quand le denominateur est nul (jamais 0 invente). */
export function indicateurs(c: Cumul) {
  const par = (a: number, b: number, k = 1) => (b > 0 ? (a / b) * k : null)
  const resultats = c.achats + c.messages
  return {
    ctr: par(c.clicsLien, c.impressions, 100),          // % de clics sur le lien
    cpm: par(c.depense, c.impressions, 1000),           // cout pour 1 000 affichages
    cpc: par(c.depense, c.clicsLien),                   // cout d'un clic
    coutParMessage: par(c.depense, c.messages),
    coutParAchatPixel: par(c.depense, c.achats),
    coutParResultat: par(c.depense, resultats),         // achat pixel OU conversation demarree
    roasPixel: par(c.valeurAchats, c.depense),
    accroche: par(c.vuesVideo3s, c.impressions, 100),   // % qui regardent 3 s (video)
    retention: par(c.thruplays, c.vuesVideo3s, 100),    // % des 3 s qui vont au bout
  }
}

/**
 * Une pub fatigue quand la meme personne la voit trop souvent ET que les clics
 * baissent : frequence 7 j au-dessus du seuil de la strategie, CTR 7 j inferieur
 * d'au moins 25 % a celui des 30 j. Les deux, pas un seul : une frequence haute
 * sur une pub qui convertit encore n'est pas un probleme.
 */
export function fatigue(frequence7j: number | null, ctr7j: number | null, ctr30j: number | null, frequenceMax: number): boolean {
  if (frequence7j == null || ctr7j == null || ctr30j == null || ctr30j === 0) return false
  return frequence7j > frequenceMax && ctr7j < ctr30j * 0.75
}

/** Un « post booste » : optimise pour l'engagement, pas pour une vente ni un message. */
export function estBoost(objectif: string | null | undefined, optimisation: string | null | undefined): boolean {
  return /ENGAGEMENT|POST_ENGAGEMENT|PAGE_LIKES|REACH|THRUPLAY|VIDEO_VIEWS/i.test(`${objectif || ''} ${optimisation || ''}`)
    && !/CONVERSATIONS|OFFSITE_CONVERSIONS|VALUE|LANDING_PAGE_VIEWS|LINK_CLICKS/i.test(optimisation || '')
}

/** Un point de serie : ce que la pub a coute et ce qui a ete livre ce jour-la (ou cette semaine-la). */
export type Jour = { jour: string; depense: number; messages: number; achats: number; clics: number; livrees: number; ca: number; marge: number }

/**
 * Au-dela de 90 jours, 365 barres ne se lisent plus : on somme par semaine
 * (du lundi au dimanche, la semaine portant la date de son lundi). Pur, teste seul.
 */
export function parSemaine(jours: Jour[]): Jour[] {
  const out = new Map<string, Jour>()
  for (const j of jours) {
    const d = new Date(`${j.jour}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    const cle = d.toISOString().slice(0, 10)
    const s = out.get(cle) ?? { jour: cle, depense: 0, messages: 0, achats: 0, clics: 0, livrees: 0, ca: 0, marge: 0 }
    for (const k of ['depense', 'messages', 'achats', 'clics', 'livrees', 'ca', 'marge'] as const) s[k] += j[k]
    out.set(cle, s)
  }
  return [...out.values()]
}
