import type { Strategie } from '@/lib/ads/strategie-model'
import type { Conseil, Verdict, Famille } from '@/lib/ads/conseils'
import type { Idee, Mouvement, TypeDirection } from '@/lib/ads/direction-model'
import type { Ambiance, Transition } from '@/lib/ads/reel-model'

/* Ce que GET /api/ops/ads/agent renvoie (ecran()). Un seul endroit pour les formes. */

export type Verite = {
  jours: number; de: string; a: string; depense: number; sourceDepense: string; joursSansDetail: number; messages: number; pixel: { achats: number | null; valeur: number }
  partiel: boolean; ouverture: string | null
  livrees: number; annulees: number; ca: number; marge: number; parCanal: { canal: string; commandes: number; ca: number; marge: number }[]
  suiviesMeta: { commandes: number; ca: number }; profitApresPub: number; coutParCommandeLivree: number | null
  merLivre: number | null; seuilParCommande: number | null; panierMoyen: number | null
}
export type Indic = {
  depense: number; impressions: number; clicsLien: number; vuesPage: number; messages: number; achats: number; valeurAchats: number; vuesVideo3s: number; thruplays: number
  ctr: number | null; cpm: number | null; cpc: number | null; coutParMessage: number | null; coutParAchatPixel: number | null; coutParResultat: number | null; roasPixel: number | null; accroche: number | null; retention: number | null
}
export type Pub = {
  adId: string; nom: string | null; statut: string | null; campagne: string | null; objectif: string | null; optimisation: string | null; budgetJour: number | null
  format: string | null; texte: string; titre: string | null; cta: string | null; vignette: string | null; permalien: string | null; creeLe: string | null
  frequence7j: number | null; boost: boolean; fatigue: boolean; j30: Indic; j7: Indic
}
export type Produit = { id: number; nom: string; marque: string; categorie: string; prix: number; margeUnitaire: number | null; margeShine: number | null; partenaire: boolean; tauxMarge: number | null; stockVendable: number; importBloque: boolean; vendus90j: number; ca90j: number }
export type Action = { id: number; priorite: number; type: string; action: string; cible: string | null; signal: string | null; effet: string | null; effort: string | null; statut: string; rapport_id: number; rapport_titre: string; rapport_le: string }
export type Image = { id: number; creatif_id: number; option_id: number | null; carte: number | null; format: 'feed' | 'story' | 'carre'; url: string; largeur: number; hauteur: number; modele: string; qualite: string | null; choisie: boolean; duree_ms: number | null; cree_le: string }
export type Creatif = {
  id: number; rapport_id: number | null; produit_ids: number[]; angle: string; format: string; public: string | null; accroche: string; script: string | null
  texte_fr: string | null; texte_darija: string | null; texte_ar: string | null; titre: string | null; cta: string | null; visuel: string | null
  statut: string; ad_id: string | null; cree_le: string; images: Image[]; options: Option[]
}
/** Une option (image seule), une carte (carrousel) ou un plan (Reel) du directeur artistique. */
export type Option = {
  id: number; creatif_id: number; demande_id: number | null; serie: number; carte: number | null; role: string | null; concept: string; pourquoi: string | null
  prompt: string; texte: { fr?: string; darija?: string; ar?: string }; position: 'haut' | 'bas'; format: 'feed' | 'story' | 'carre'
  produit_ids: number[] | null; animes: number[] | null; mouvement: Mouvement | null; duree: string | number | null
  motion: {
    transition?: Transition; ambiance?: Ambiance; bulles?: { de: 'cliente' | 'shine'; texte: Multi }[]; points?: Multi[]; choix?: Multi[]
    voix?: Multi | null; voixUrl?: Partial<Record<'fr' | 'darija' | 'ar', { url: string; texte: string; duree?: number | null }>>
    confiance?: string[]; prix?: boolean; ecrans?: ('produit' | 'panier' | 'livraison')[]; fond?: 'decor' | 'vert' | 'aurore' | 'prune' | 'creme'; ouvert?: boolean; melange?: boolean
  } | null
  style: string | null; brief: string | null; qualite: string | null; note: string | null; modele: string | null; cree_le: string
}
type Multi = { fr?: string; darija?: string; ar?: string }
export type CaptureSite = { url: string; cible: { x: number; y: number; w: number; h: number }; bouton: string | null; prix: number | null; captureLe: string }
export type ProduitCatalogue = {
  id: number; nom: string; marque: string; categorie: string; image: string | null; stockVendable: number; importBloque: boolean; prix?: number
  prixAvant?: number                                                                 // le prix de reference barre sur le site (promo, pack)
  composants?: number[]                                                              // un pack : ses produits, dans l'ordre
  captures?: Partial<Record<'produit' | 'panier' | 'livraison', CaptureSite>>        // les vraies captures du tunnel d'achat
}
export type ParametresDirection = {
  type: TypeDirection; nombre: number; format: 'feed' | 'story' | 'carre'; styles: string[]; qualite: 'medium' | 'high'; brief: string; creatifId?: number; produitIds?: number[]
  objectif?: 'site' | 'dm' | 'portee'; offre?: 'aucune' | 'bienvenue' | 'livraison' | 'pack'; montrer?: string[]; langue?: 'fr' | 'darija' | 'mix'; fond?: 'libre' | 'shine'
  retouche?: { optionId: number; note: string }
}
export type Demande = { id: number; genre: string; sujet: string; statut: string; demande_le: string; termine_le: string | null; erreur: string | null; rapport_id: number | null; creatif_id?: number | null; parametres?: ParametresDirection | null; resultat?: string | null
  couverture?: { consigne: string; plans: number[] }[] | null }
export type Rapport = { id: number; source: string; titre: string; cree_le: string; modele: string | null; en_bref: string }
export type Jour = { jour: string; depense: number; messages: number; achats: number; clics: number; livrees: number; ca: number; marge: number }
export type Repartition = { dimension: string; valeur: string; depense: number; impressions: number; clics_lien: number; achats: number; messages: number }
export type Donnees = {
  strategie: { config: Strategie; modifie_le: string | null; modifie_par: string | null; manques: string[]; historique: { id: number; modifie_le: string; modifie_par: string | null }[] }
  verite: Verite; precedent: Verite; serie: Jour[]; pas: 'jour' | 'semaine'; mois: { depenseMois: number; jourDuMois: number; joursDansMois: number }; enRoute: number
  pubs: Pub[]; produits: Produit[]; verdicts: Record<string, { verdict: Verdict; raison: string; famille: Famille }>; conseils: Conseil[]
  demandes: Demande[]; rapports: Rapport[]; actions: Action[]; creatifs: Creatif[]
  synchro: { le: string | null; jusquAu: string | null }; repartitions: Record<string, Repartition[]>
  catalogue: ProduitCatalogue[]; idees: Idee[]
}
/** Ce dont le directeur artistique a besoin a l'ecran, dans l'agent comme dans le studio. */
export type BaseCreative = Pick<Donnees, 'catalogue' | 'idees' | 'demandes'>
export type Onglet = 'ensemble' | 'campagnes' | 'creations' | 'afaire' | 'strategie' | 'agent'

export const dh = (v: number | null | undefined) => (v == null ? '—' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)} DH`)
export const dh1 = (v: number | null | undefined) => (v == null ? '—' : `${v.toLocaleString('fr-FR', { maximumFractionDigits: v < 10 ? 1 : 0 })} DH`)
export const nb = (v: number | null | undefined, d = 1) => (v == null ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: d }))
export const pct = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${v.toLocaleString('fr-FR', { maximumFractionDigits: d })} %`)
export const quand = (d: string | null) => (d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
/** Les periodes de l'ecran (en jours) et leur nom. */
export const PERIODES: [number, string][] = [[7, '7 j'], [30, '30 j'], [90, '3 mois'], [180, '6 mois'], [270, '9 mois'], [365, '12 mois']]
export const nomPeriode = (j: number) => { const p = PERIODES.find(([x]) => x === j); return p ? (j < 90 ? `${j} jours` : p[1]) : `${j} jours` }
export const moisAnnee = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
export const jourCourt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

/** Evolution contre la periode d'avant, en %, ou null si la base est nulle. */
export const evolution = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100)

export const statutPub = (x: string | null) => !x ? '—' : x === 'ACTIVE' ? 'Active' : /PAUSED/.test(x) ? (x.startsWith('CAMPAIGN') ? 'Campagne en pause' : x.startsWith('ADSET') ? 'Ensemble en pause' : 'En pause') : x === 'ARCHIVED' ? 'Archivée' : x === 'DELETED' ? 'Supprimée' : /REVIEW|PENDING/.test(x) ? 'En validation' : /DISAPPROVED|REJECTED/.test(x) ? 'Refusée' : x.toLowerCase()

export const VERDICTS: Record<Verdict, { label: string; ton: 'vert' | 'orange' | 'rouge' | 'gris' }> = {
  gagnante: { label: 'Gagnante', ton: 'vert' }, surveiller: { label: 'À surveiller', ton: 'orange' }, couper: { label: 'À couper', ton: 'rouge' }, trop_tot: { label: 'Trop tôt', ton: 'gris' },
}
export const FAMILLES: Record<Famille, string> = { messages: 'Messages', ventes: 'Ventes', autre: 'Autre' }
export const TYPES_ACTION: Record<string, { label: string; ton: 'vert' | 'orange' | 'rouge' | 'bleu' | 'gris' }> = {
  couper: { label: 'Couper', ton: 'rouge' }, reduire: { label: 'Réduire', ton: 'orange' }, augmenter: { label: 'Augmenter', ton: 'vert' }, tester: { label: 'Tester', ton: 'bleu' },
  lancer: { label: 'Lancer', ton: 'vert' }, corriger_suivi: { label: 'Corriger le suivi', ton: 'orange' }, offre: { label: 'Offre', ton: 'bleu' }, autre: { label: 'Autre', ton: 'gris' },
}
export const STATUTS_CREATIF: Record<string, string> = { idee: 'Idées', validee: 'Validées', produite: 'Produites', en_ligne: 'En ligne', ecartee: 'Écartées' }

/** Ce que le directeur artistique doit retenir (les retours d'Achraf). */
export type Lecon = { id: number; texte: string; creatif_id: number | null; par: string | null; active: boolean; cree_le: string }
