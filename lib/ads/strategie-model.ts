import { z } from 'zod'

/**
 * LA STRATEGIE PUBLICITAIRE D'ACHRAF — ce que l'agent Meta Ads doit servir.
 *
 * Pure (sans base) : le formulaire du BOS la valide avant d'envoyer, le serveur
 * la revalide avant d'ecrire, l'agent la lit dans son contexte. Chaque champ a
 * une valeur par defaut prudente ; les cibles chiffrees restent vides tant
 * qu'Achraf ne les a pas fixees (l'ecran montre le seuil de rentabilite reel
 * pour l'aider a choisir).
 */

const texte = (max: number, defaut = '') => z.string().trim().max(max).default(defaut)
const montant = (max: number) => z.number().min(0).max(max).nullable().default(null)
const ids = z.array(z.number().int().positive()).max(40).default([])

export const OBJECTIFS = {
  rentabilite: 'Rentabilité : chaque dirham de pub doit rapporter de la marge',
  croissance: 'Croissance : plus de clientes, marge plus faible acceptée',
  lancement: 'Lancement : faire connaître une gamme (ex. K-beauty)',
  destockage: 'Déstockage : écouler un stock précis',
} as const

export const StrategieSchema = z.object({
  objectif: z.enum(['rentabilite', 'croissance', 'lancement', 'destockage']).default('rentabilite'),
  budgetMensuel: montant(1_000_000),
  budgetJourMax: montant(100_000),
  cibles: z.object({
    /** Ce qu'on accepte de payer en pub pour UNE commande livree. */
    coutParCommandeMax: montant(10_000),
    /** CA livre / depense pub. */
    roasMin: z.number().min(0).max(100).nullable().default(null),
    /** Marge restante apres la pub, en % du CA livre. */
    margeApresPubMin: z.number().min(0).max(100).nullable().default(null),
  }).default({}),
  produitsPrioritaires: ids,
  produitsExclus: ids,
  marquesPrioritaires: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  zones: texte(400, 'Tout le Maroc'),
  public: texte(800, 'Femmes 20-45 ans au Maroc, attentives à la santé de leurs cheveux et de leur peau'),
  langues: z.array(z.enum(['fr', 'darija', 'ar'])).min(1).default(['fr', 'darija']),
  ton: texte(600, 'Chaleureux, expert et honnête : on explique, on ne promet jamais de miracle.'),
  canaux: z.object({
    site: z.boolean().default(true),
    dmInstagram: z.boolean().default(true),
    whatsapp: z.boolean().default(true),
  }).default({}),
  offres: texte(1000),
  regles: z.object({
    /** Au-dela, la pub fatigue : on change la creation ou le public. */
    frequenceMax: z.number().min(1).max(20).default(3),
    /** Depense minimale d'une pub avant de la juger (MAD). */
    depenseMinAvantVerdict: z.number().min(0).max(10_000).default(100),
    /** Duree d'un test de creation avant verdict (jours). */
    joursTestCreatif: z.number().int().min(1).max(60).default(4),
    /** Les « posts boostes » optimises pour l'engagement : autorises ou non. */
    boostsAutorises: z.boolean().default(false),
  }).default({}),
  calendrier: z.array(z.object({
    nom: z.string().trim().min(2).max(80),
    debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: texte(300),
  })).max(20).default([]),
  notes: texte(4000),
})

export type Strategie = z.infer<typeof StrategieSchema>
export const strategieParDefaut = (): Strategie => StrategieSchema.parse({})

/** Les points que la strategie ne fixe pas encore : l'agent les signale, l'ecran les montre. */
export function manquesStrategie(s: Strategie): string[] {
  const m: string[] = []
  if (s.budgetMensuel == null) m.push('budget mensuel')
  if (s.cibles.coutParCommandeMax == null) m.push('coût maximum par commande livrée')
  if (s.cibles.roasMin == null && s.cibles.margeApresPubMin == null) m.push('seuil de rentabilité (ROAS ou marge après pub)')
  if (!s.produitsPrioritaires.length && !s.marquesPrioritaires.length) m.push('produits ou marques à pousser')
  return m
}
