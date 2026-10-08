/* LA GESTION DES DEMANDES D'AVIS (page Avis du BOS) : types et règles d'affichage.
   Sans import serveur : utilisé par les composants client et par les routes. */

/** Une cliente de la file d'envoi, telle que la boutique la calcule (GET /api/reviews/requests). */
export type LigneFile = {
  userId: number
  name: string | null
  phone: string
  points: number
  type: 'nouvelle' | 'relance'
  deja: boolean
  messagesTour: number
  dernierMessage: string | null
  bonusDh: number
  modele: 'rappel' | 'variable' | 'historique' | null
  envoyable: boolean
  produits: { id: number; name: string }[]
  texte: string | null
}

export type Passage = { at: string; candidats: number; envoyees: number; nouvelles: number; relances: number; attenteModele: number; echecs: number }

export type FileEnvoi = {
  total: number
  nouvelles: number
  relances: number
  premierBonus: number
  bonusSuivant: number
  bloquees: number
  file: LigneFile[]
  dernierPassage: Passage | null
}

/** Une cliente déjà sollicitée : sa demande en cours (dernier lien d'avis). */
export type LigneSuivi = {
  userId: number
  name: string | null
  phone: string | null
  demandeLe: string
  produits: number
  paye: boolean
  envoyes: number
  echecs: number
  recu: boolean
  lu: boolean
  dernierMessage: string | null
  erreur: string | null
  ouvert: boolean
  laisses: number
  publies: number
  desinscrite: boolean
}

export type Etape = 'echec' | 'sans_message' | 'envoye' | 'recu' | 'lu' | 'ouvert' | 'en_cours' | 'a_publier' | 'paye'

/** Du plus en retard au plus avancé : l'ordre sert aussi à l'entonnoir. */
export const ETAPES: { cle: Etape; libelle: string; aide: string; ton: 'danger' | 'neutral' | 'info' | 'warning' | 'success' }[] = [
  { cle: 'echec', libelle: 'Échec d’envoi', aide: 'Le message n’est pas parti', ton: 'danger' },
  { cle: 'sans_message', libelle: 'Sans message', aide: 'Lien créé, aucun message journalisé', ton: 'neutral' },
  { cle: 'envoye', libelle: 'Envoyé', aide: 'Pas encore d’accusé de réception', ton: 'neutral' },
  { cle: 'recu', libelle: 'Reçu, pas lu', aide: 'Arrivé sur son téléphone, pas ouvert', ton: 'neutral' },
  { cle: 'lu', libelle: 'Lu, lien pas ouvert', aide: 'A lu le message sans cliquer', ton: 'warning' },
  { cle: 'ouvert', libelle: 'Lien ouvert, aucun avis', aide: 'A ouvert la page sans noter', ton: 'warning' },
  { cle: 'en_cours', libelle: 'Avis commencés', aide: 'A noté une partie des produits', ton: 'info' },
  { cle: 'a_publier', libelle: 'À publier par vous', aide: 'Tous ses avis sont laissés : le bonus attend leur publication', ton: 'info' },
  { cle: 'paye', libelle: 'Bonus versé', aide: 'Tous ses avis sont publiés et le bonus est crédité', ton: 'success' },
]

export function etapeSuivi(l: LigneSuivi): Etape {
  if (l.paye) return 'paye'
  if (l.produits > 0 && l.laisses >= l.produits) return 'a_publier'
  if (l.laisses > 0) return 'en_cours'
  if (l.ouvert) return 'ouvert'
  if (l.lu) return 'lu'
  if (l.recu) return 'recu'
  if (l.envoyes > 0) return 'envoye'
  if (l.echecs > 0) return 'echec'
  return 'sans_message'
}

export const rangEtape = (e: Etape) => ETAPES.findIndex(x => x.cle === e)

/** L'entonnoir : chaque marche compte les clientes arrivées au moins jusque-là. */
export const MARCHES: { libelle: string; depuis: Etape }[] = [
  { libelle: 'Envoyées', depuis: 'envoye' },
  { libelle: 'Reçues', depuis: 'recu' },
  { libelle: 'Lues', depuis: 'lu' },
  { libelle: 'Lien ouvert', depuis: 'ouvert' },
  { libelle: 'Avis laissés', depuis: 'en_cours' },
  { libelle: 'Bonus versé', depuis: 'paye' },
]

// Codes d'erreur WhatsApp Cloud API les plus fréquents, en clair.
const ERREURS: Record<string, string> = {
  '131026': 'Numéro injoignable sur WhatsApp',
  '131049': 'Retenu par Meta (trop de messages marketing pour cette cliente)',
  '130472': 'Retenu par Meta (numéro inclus dans un test Meta)',
  '131050': 'La cliente a refusé les messages marketing',
  '131047': 'Hors de la fenêtre de 24 h',
  '131042': 'Problème de paiement du compte WhatsApp',
  '132001': 'Modèle introuvable chez Meta',
  '131056': 'Trop de messages envoyés à ce numéro',
}
export const libelleErreur = (code: string | null) => (code ? ERREURS[code] ?? `Échec (code ${code})` : 'Échec d’envoi')

export const LIBELLES_MESSAGE: Record<NonNullable<LigneFile['modele']>, string> = {
  rappel: 'Relance « vos X DH vous attendent »',
  variable: 'Demande avec montant',
  historique: 'Ancien message (50 DH)',
}

/** « il y a 3 j », « aujourd'hui », « jamais ». */
export function depuis(date: string | null, maintenant = Date.now()): string {
  if (!date) return 'Jamais'
  const j = Math.floor((maintenant - new Date(date).getTime()) / 86_400_000)
  return j <= 0 ? 'Aujourd’hui' : j === 1 ? 'Hier' : `Il y a ${j} j`
}

export const dateCourte = (date: string) => new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
