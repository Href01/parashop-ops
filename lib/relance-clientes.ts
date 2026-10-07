/* LES RÉGLAGES DE LA RELANCE DES CLIENTES QUI NE COMMANDENT PLUS (BOS → boutique).

   Même clé AppSetting (`winback_rules`) et mêmes bornes que lib/winback.ts de la
   boutique, qui envoie. Le BOS écrit les réglages ; le statut Meta du modèle
   (`modele`) est écrit par la boutique et jamais écrasé ici. */

export const CLE_RELANCE = 'winback_rules'

export type Promo = { code: string; pourcent: number; validiteJours: number; minimumDh: number }
export type ModeleMeta = { nom: string; langue: string; statut: string }
export type ReglesRelance = {
  inactifDepuisJours: number
  delaiEntreRelancesJours: number
  pauseApresMessageJours: number
  lotMax: number
  promo: Promo
  modele: ModeleMeta | null
}

export const REGLES_RELANCE_DEFAUT: ReglesRelance = {
  inactifDepuisJours: 60, delaiEntreRelancesJours: 60, pauseApresMessageJours: 7, lotMax: 50,
  promo: { code: 'BIENVENUE10', pourcent: 10, validiteJours: 14, minimumDh: 790 },
  modele: null,
}

const entier = (v: unknown, min: number, max: number, defaut: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= min && n <= max ? n : defaut
}

export function normaliserCode(v: unknown): string | null {
  const code = String(v ?? '').trim().toUpperCase()
  return /^[A-Z0-9]{3,20}$/.test(code) ? code : null
}

export function normaliserReglesRelance(v: unknown): ReglesRelance {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const p = (o.promo && typeof o.promo === 'object' ? o.promo : {}) as Record<string, unknown>
  const d = REGLES_RELANCE_DEFAUT
  const m = o.modele as Partial<ModeleMeta> | null
  return {
    inactifDepuisJours: entier(o.inactifDepuisJours, 14, 730, d.inactifDepuisJours),
    delaiEntreRelancesJours: entier(o.delaiEntreRelancesJours, 14, 365, d.delaiEntreRelancesJours),
    pauseApresMessageJours: entier(o.pauseApresMessageJours, 0, 60, d.pauseApresMessageJours),
    lotMax: entier(o.lotMax, 1, 300, d.lotMax),
    promo: {
      code: normaliserCode(p.code) ?? d.promo.code,
      pourcent: entier(p.pourcent, 1, 50, d.promo.pourcent),
      validiteJours: entier(p.validiteJours, 1, 90, d.promo.validiteJours),
      minimumDh: entier(p.minimumDh, 0, 5000, d.promo.minimumDh),
    },
    modele: m && typeof m.nom === 'string' && /^[a-z0-9_]{1,512}$/.test(m.nom) && typeof m.langue === 'string'
      ? { nom: m.nom, langue: m.langue, statut: typeof m.statut === 'string' ? m.statut : 'INCONNU' } : null,
  }
}

/** Les réglages saisis, sans jamais toucher au statut Meta du modèle. */
export function fusionnerReglagesRelance(actuelles: ReglesRelance, saisie: unknown): ReglesRelance {
  const s = (saisie && typeof saisie === 'object' ? saisie : {}) as Record<string, unknown>
  const r = normaliserReglesRelance({ ...actuelles, ...s, promo: { ...actuelles.promo, ...((s.promo as object) ?? {}) } })
  return { ...r, modele: actuelles.modele }
}
