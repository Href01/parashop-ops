/* LES RÈGLES DES DEMANDES D'AVIS (BOS → boutique).

   Même clé AppSetting (`review_rewards`) et mêmes bornes que lib/review-rewards.ts
   de la boutique, qui les lit pour la tâche quotidienne, l'envoi manuel, la page
   /avis et le versement du bonus. Le BOS écrit les montants et réglages ; les
   champs `modeleDemande` / `modeleRecompense` / `modeleRappel` sont écrits par la boutique (statut
   Meta) et ne sont jamais écrasés par un enregistrement des réglages. */

export const CLE_REGLES_AVIS = 'review_rewards'

export type ModeleMeta = { nom: string; langue: string; statut: string }

export type ReglesAvis = {
  premierDh: number
  suivantDh: number
  envoiAuto: boolean
  delaiJours: number
  relanceApresJours: number
  relancesMax: number
  lotParJour: number
  modeleDemande: ModeleMeta | null
  modeleRecompense: ModeleMeta | null
  modeleRappel: ModeleMeta | null
}

export const REGLES_AVIS_DEFAUT: ReglesAvis = {
  premierDh: 50, suivantDh: 10, envoiAuto: false, delaiJours: 2, relanceApresJours: 7, relancesMax: 1, lotParJour: 40,
  modeleDemande: null, modeleRecompense: null, modeleRappel: null,
}

const entier = (v: unknown, min: number, max: number, defaut: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= min && n <= max ? n : defaut
}
const modele = (v: unknown): ModeleMeta | null => {
  const m = v as Partial<ModeleMeta> | null
  return m && typeof m.nom === 'string' && /^[a-z0-9_]{1,512}$/.test(m.nom) && typeof m.langue === 'string'
    ? { nom: m.nom, langue: m.langue, statut: typeof m.statut === 'string' ? m.statut : 'INCONNU' }
    : null
}

export function normaliserReglesAvis(v: unknown): ReglesAvis {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    premierDh: entier(o.premierDh, 0, 500, REGLES_AVIS_DEFAUT.premierDh),
    suivantDh: entier(o.suivantDh, 0, 500, REGLES_AVIS_DEFAUT.suivantDh),
    envoiAuto: o.envoiAuto === true,
    delaiJours: entier(o.delaiJours, 0, 60, REGLES_AVIS_DEFAUT.delaiJours),
    relanceApresJours: entier(o.relanceApresJours, 1, 90, REGLES_AVIS_DEFAUT.relanceApresJours),
    relancesMax: entier(o.relancesMax, 0, 3, REGLES_AVIS_DEFAUT.relancesMax),
    lotParJour: entier(o.lotParJour, 1, 200, REGLES_AVIS_DEFAUT.lotParJour),
    modeleDemande: modele(o.modeleDemande),
    modeleRecompense: modele(o.modeleRecompense),
    modeleRappel: modele(o.modeleRappel),
  }
}

/** Ce que le BOS peut modifier : les réglages, jamais les statuts Meta. */
export function fusionnerReglages(actuelles: ReglesAvis, saisie: unknown): ReglesAvis {
  const s = normaliserReglesAvis({ ...actuelles, ...(saisie && typeof saisie === 'object' ? saisie : {}) })
  return { ...s, modeleDemande: actuelles.modeleDemande, modeleRecompense: actuelles.modeleRecompense, modeleRappel: actuelles.modeleRappel }
}
