import { z } from 'zod'
import type { FormatImage } from './creatif-model'
import { ILLUSTRATIONS } from './reel-model'

/**
 * LE DIRECTEUR ARTISTIQUE — la partie pure (testee seule).
 *
 * Claude ecrit les consignes d'image ; le modele d'image d'OpenAI les execute
 * avec les VRAIES photos produit en reference. Ici : ce qu'Achraf peut demander
 * (le brief, et des idees de brief tirees de ses chiffres), ce que Claude doit
 * livrer (options, cartes ou plans de Reel), et les garde-fous que le BOS colle
 * TOUJOURS a la consigne, quoi que Claude ait ecrit.
 * La doctrine du directeur artistique vit dans scripts/ads/DIRECTION.md (depot
 * parashop), que la routine lit avant chaque direction.
 */

export const STYLES = {
  studio: 'Studio produit (hero shot net, fond maîtrisé)',
  lifestyle: 'Lifestyle (le produit dans une vraie routine)',
  texture: 'Texture et ingrédients (macro, matière du soin)',
  ugc: 'Style téléphone / UGC (authentique, pris sur le vif)',
  mains: 'Mains et application (le geste)',
  zellige: 'Salle de bain marocaine (zellige, tadelakt, lumière chaude)',
  ete: 'Été / plage / piscine',
  couleur: 'Couleur vive (color block qui arrête le scroll)',
} as const
export type Style = keyof typeof STYLES

export type TypeDirection = 'options' | 'carrousel' | 'reel'
export const BORNES: Record<TypeDirection, { min: number; max: number; defaut: number; formats: FormatImage[] }> = {
  // Des options : plusieurs concepts VRAIMENT differents pour une meme pub, a comparer.
  options: { min: 2, max: 4, defaut: 3, formats: ['feed', 'story', 'carre'] },
  // Un carrousel Instagram : toutes les cartes au meme format, 1:1 ou 4:5.
  carrousel: { min: 3, max: 10, defaut: 5, formats: ['carre', 'feed'] },
  // Un Reel anime : 3 a 6 plans verticaux, 8 a 15 secondes.
  reel: { min: 3, max: 8, defaut: 4, formats: ['story'] },
}

/** Le vocabulaire des Reels animes (dessines par le BOS, lib/ads/reel-model.ts). */
export const MOUVEMENTS = {
  rebond: 'Le produit tombe, s’écrase au contact et rebondit ; le reflet Shine le traverse',
  pop: 'Les produits surgissent en ressort, l’un après l’autre',
  glisse: 'Le produit entre de côté en pivotant',
  duo: 'Deux produits face à face, un « ou » entre eux',
  revele: 'Révélation premium : le flacon monte lentement, lumière et étincelles',
  etiquette: 'Étiquette annotée : zoom sur le produit, 2 ou 3 atouts reliés par un trait',
  quiz: 'Quiz : 2 ou 3 réponses, un doigt touche la bonne, le produit répond',
  dm: 'Conversation DM animée : la cliente demande, Shine répond et envoie le produit',
  zoom: 'Zoom lent sur le décor (texture, geste, ambiance ; le produit peut être dans l’image)',
  fin: 'Carte de fin : les produits + le bouton vert qui pulse',
  etapes: 'La routine numérotée : chaque produit entre à son tour, en grand, avec son numéro et son nom, puis rejoint la rangée',
  site: 'Les vraies étapes du site : les captures de shinecosmetics.ma dans un téléphone, un doigt touche le bon bouton',
} as const
export type Mouvement = keyof typeof MOUVEMENTS
export const TRANSITIONS = {
  coupe: 'Coupe franche sur le temps (flash bref)',
  traversee: 'Traversée : on plonge à travers le plan d’avant',
  balayage: 'Balayage (whip pan) : les plans filent de côté',
  revelation: 'Révélation : le plan s’ouvre en cercle',
  vague: 'Vague : une lame verte ondulée dévoile le plan',
} as const
/**
 * LES FONDS SHINE : des degrades dessines par le BOS aux couleurs de la maison,
 * sans image a peindre. Achraf : « un beau dégradé vert style shinecosmetics.ma,
 * mieux que les décors de l'agent, qu'on retrouve partout ». `decor` = le decor
 * peint par OpenAI d'apres la consigne (le defaut).
 */
export const FONDS = {
  decor: 'Décor peint (consigne d’image)',
  vert: 'Dégradé vert Shine (la signature)',
  aurore: 'Aurore : vert Shine → beurre',
  prune: 'Prune profond',
  creme: 'Crème lumineux',
  nuit: 'Nuit : vert presque noir (accroche dramatique)',
} as const
export type FondShine = keyof typeof FONDS
export const fondDessine = (f: string | null | undefined) => Boolean(f && f !== 'decor')

export const AMBIANCES = { aucune: 'Aucune', etincelles: 'Étincelles', gouttes: 'Gouttes d’eau', bulles: 'Bulles', sable: 'Grains de sable' } as const

/**
 * Les badges de confiance de la carte de fin. Au Maroc, la cliente hesite a
 * commander en ligne : lui dire qu'elle paie a la reception, qu'elle recoit
 * vite et que le produit est authentique leve le dernier frein. Chaque promesse
 * est deja tenue par la boutique (bandeau du site : authentique, 24-48 h,
 * paiement a la livraison).
 */
export const CONFIANCE = {
  cod: { fr: 'Paiement à la livraison', darija: 'Khelles mnin twslek', ar: 'الدفع عند الاستلام' },
  livraison: { fr: 'Livraison 24-48 h', darija: 'Tawsil 24-48h', ar: 'توصيل 24-48 ساعة' },
  authentique: { fr: 'Produits authentiques', darija: 'Produits originaux', ar: 'منتجات أصلية' },
  conseil: { fr: 'Conseil gratuit en DM', darija: 'Nsi7a b-lmajjan f DM', ar: 'استشارة مجانية في الرسائل' },
} as const
export type CleConfiance = keyof typeof CONFIANCE
/** L'appel du quiz ouvert : on repond en commentaire (ce qui pousse le Reel). */
export const APPEL_COMMENTAIRE = { fr: 'Commente ta réponse 👇', darija: 'Kteb jawabek f commentaire 👇', ar: 'اكتبي إجابتك في التعليقات 👇' } as const
/** Les appels a commenter : la reponse du jeu, ou son type de peau (on conseille en retour — la vente se fait en DM). */
export const APPELS = {
  reponse: APPEL_COMMENTAIRE,
  peau: { fr: 'Commente ton type de peau 👇', darija: 'Kteb no3 dyal bachrtek 👇', ar: 'اكتبي نوع بشرتك في التعليقات 👇' },
  // L'envoi en DM est le signal le plus fort pour toucher des non-abonnees (Instagram, 2026) ; l'enregistrement dit « utile ».
  partage: { fr: 'Envoie-la à ta sœur 👭', darija: 'Siftiha l khtek 👭', ar: 'أرسليه لأختك 👭' },
  enregistre: { fr: 'Enregistre-la pour ta routine 📌', darija: 'Sauvegardiha l routine dyalek 📌', ar: 'احفظيه لروتينك 📌' },
} as const
export type CleAppel = keyof typeof APPELS

/**
 * CE QUE LA PUB DOIT OBTENIR. Shine vend sur le site (paiement a la livraison)
 * ET en DM : ce ne sont pas les memes pubs (bouton, fin, etapes du site).
 */
export const OBJECTIFS = {
  site: { label: 'Commandes sur le site', aide: 'Bouton « Commander », les vraies étapes du site, le prix.' },
  dm: { label: 'Messages (DM)', aide: 'Bouton « Envoyer un message » : la cliente demande conseil, la vente se fait en DM.' },
  portee: { label: 'Faire connaître (portée)', aide: 'Accroche forte, à partager et enregistrer ; pas de vente forcée.' },
} as const
export type Objectif = keyof typeof OBJECTIFS
/** L'offre a mettre en avant : seulement une offre qui existe VRAIMENT dans la boutique (contexte « boutique »). */
export const OFFRES = {
  aucune: 'Pas d’offre',
  bienvenue: 'Le code de bienvenue (1re commande)',
  livraison: 'La livraison offerte (dès le seuil)',
  pack: 'Le prix du pack (et son prix barré)',
} as const
export type Offre = keyof typeof OFFRES
/** Ce qui DOIT se voir dans le Reel : le BOS verifie chaque case a la livraison. */
export const A_MONTRER = {
  site: 'Les vraies étapes du site',
  cod: 'Paiement à la livraison',
  prix: 'Le prix',
  pack: 'Chaque produit du pack',
  texture: 'La texture en gros plan',
  voix: 'Une voix off chuchotée',
} as const
export type AMontrer = keyof typeof A_MONTRER

/**
 * LES RECETTES : des Reels qui ont plu a Achraf (#23, #24) ou qui suivent un mecanisme
 * psychologique prouve, figes en charpente. Choisir une recette, c'est choisir le
 * mecanisme ; le directeur artistique ecrit les textes et choisit les schemas, et le BOS
 * verifie qu'il a suivi la charpente plan par plan.
 * `montre` : ce qu'un plan « zoom » doit MONTRER — le probleme, l'idee recue, la reponse, un vrai avis.
 */
export type PlanRecette = {
  mouvement: string; duree: number; role: string
  montre?: 'probleme' | 'mythe' | 'reponse' | 'avis'
  cache?: boolean; lettres?: boolean; melange?: boolean; appel?: 'reponse' | 'peau'
}
export const RECETTES = {
  secret: {
    nom: 'Ce que personne ne te dit', exemple: 'Reel #23',
    mecanisme: 'Le savoir caché (curiosité) et le produit masqué, puis l’idée reçue démontée (peur de mal faire) et le mécanisme montré (preuve). Elle reste pour avoir la réponse.',
    pour: 'Vente', ideal: 'Un soin qui répond à un problème de peau visible (taches, teint terne).',
    plans: [
      { mouvement: 'revele', duree: 2.5, role: 'Accroche : le produit caché sous un post-it « ? »', cache: true },
      { mouvement: 'zoom', duree: 3.5, role: 'Le problème, montré', montre: 'probleme' },
      { mouvement: 'zoom', duree: 3, role: 'L’idée reçue démontée', montre: 'mythe' },
      { mouvement: 'zoom', duree: 4, role: 'La réponse, montrée (le mécanisme)', montre: 'reponse' },
      { mouvement: 'zoom', duree: 3, role: 'La protection, montrée', montre: 'reponse' },
      { mouvement: 'etapes', duree: 4.5, role: 'La routine : chaque produit et sa solution' },
      { mouvement: 'fin', duree: 3.5, role: 'L’offre réelle' },
    ] as PlanRecette[],
  },
  reconnais: {
    nom: 'Tu te reconnais ?', exemple: 'Reel #24',
    mecanisme: 'Elle se reconnaît dans la première seconde (le problème montré), le soin est dévoilé, la réponse se voit, puis une vraie cliente le confirme (preuve sociale).',
    pour: 'Vente', ideal: 'Un soin cheveux, ou tout produit qui a de vrais avis.',
    plans: [
      { mouvement: 'zoom', duree: 2.5, role: 'Accroche : le problème, montré', montre: 'probleme' },
      { mouvement: 'revele', duree: 3, role: 'Le soin caché, puis dévoilé', cache: true },
      { mouvement: 'zoom', duree: 3.5, role: 'La réponse, montrée', montre: 'reponse' },
      { mouvement: 'etiquette', duree: 3, role: 'Ce qu’il fait (2 ou 3 atouts)' },
      { mouvement: 'zoom', duree: 3.5, role: 'Un vrai avis client', montre: 'avis' },
      { mouvement: 'fin', duree: 3.5, role: 'L’offre réelle' },
    ] as PlanRecette[],
  },
  piege: {
    nom: 'Le piège A, B ou C', exemple: 'Reels #21 et #22',
    mecanisme: 'Un jeu sans réponse (on commente pour deviner), puis le retournement « ça dépend de ta peau » : les commentaires poussent la portée, le conseil ouvre la vente.',
    pour: 'Portée et vente', ideal: 'Trois routines pour trois problèmes différents.',
    plans: [
      { mouvement: 'pop', duree: 2, role: 'Accroche : trois produits, « tu prends lequel ? »', lettres: true },
      { mouvement: 'pop', duree: 3, role: 'Le jeu, sans réponse', lettres: true, appel: 'reponse' },
      { mouvement: 'etapes', duree: 4, role: 'Le retournement : la bonne réponse selon la peau', lettres: true },
      { mouvement: 'site', duree: 3.5, role: 'Le vrai site' },
      { mouvement: 'fin', duree: 3.5, role: 'L’offre réelle' },
    ] as PlanRecette[],
  },
  bonneteau: {
    nom: 'Où est le … ?', exemple: 'Reel #20',
    mecanisme: 'Suivre un produit des yeux pendant qu’il se mélange (rétention), puis le problème montré et la solution produit par produit.',
    pour: 'Portée et vente', ideal: 'Une routine de 3 ou 4 produits avec un produit héros.',
    plans: [
      { mouvement: 'pop', duree: 2.5, role: 'Accroche : le bonneteau', melange: true },
      { mouvement: 'zoom', duree: 2.5, role: 'Le problème, montré', montre: 'probleme' },
      { mouvement: 'etapes', duree: 4.5, role: 'La solution : chaque produit et son rôle' },
      { mouvement: 'etiquette', duree: 2.5, role: 'La preuve : les actifs du héros' },
      { mouvement: 'site', duree: 3.5, role: 'Le vrai site' },
      { mouvement: 'fin', duree: 3, role: 'L’offre réelle' },
    ] as PlanRecette[],
  },
} as const
export type CleRecette = keyof typeof RECETTES
/** Les schemas qui montrent chaque role. */
const SCHEMAS_POUR = { probleme: ['taches', 'cheveu-abime'], mythe: ['citron'], reponse: ['barriere', 'bouclier', 'cheveu-repare'] } as const

/** Le Reel suit la recette plan par plan (le mouvement, et ce que le plan doit montrer). */
export function verifierRecette(options: OptionLivree[], cle: CleRecette, avisDispo = true) {
  const r = RECETTES[cle]
  if (options.length !== r.plans.length) throw new Error(`La recette « ${r.nom} » a ${r.plans.length} plans (${options.length} livrés).`)
  r.plans.forEach((p, i) => {
    const o = options[i], nom = `Plan ${i + 1} (${p.role})`
    if (o.mouvement !== p.mouvement) throw new Error(`${nom} : la recette « ${r.nom} » demande un « ${p.mouvement} » ici (« ${o.mouvement} » livré).`)
    // Sans aucun avis ecrit pour ces produits, le plan de preuve reste un « zoom » (l'authenticite, la fiche) : on n'invente pas d'avis.
    if (p.montre === 'avis' && avisDispo && !o.avisId) throw new Error(`${nom} : un vrai avis (« avisId » pris dans « avisReels »).`)
    if (p.montre && p.montre !== 'avis' && !(SCHEMAS_POUR[p.montre] as readonly string[]).includes(o.illustration ?? '')) throw new Error(`${nom} : un schéma qui montre ${p.montre === 'probleme' ? 'le problème' : p.montre === 'mythe' ? 'l’idée reçue' : 'la réponse'} (« illustration » : ${SCHEMAS_POUR[p.montre].join(' ou ')}).`)
    if (p.cache && !o.cache) throw new Error(`${nom} : le produit caché sous le post-it (« cache »: true).`)
    if (p.lettres && !o.lettres) throw new Error(`${nom} : les lettres A, B, C (« lettres »: true).`)
    if (p.melange && !o.melange) throw new Error(`${nom} : le bonneteau (« melange »: true).`)
    if (p.appel && !o.appel) throw new Error(`${nom} : l’appel à commenter (« appel »).`)
  })
}

export const DemandeDirectionSchema = z.object({
  creatifId: z.number().int().positive().optional(),
  produitIds: z.array(z.number().int().positive()).max(6).optional(),
  type: z.enum(['options', 'carrousel', 'reel']),
  nombre: z.number().int(),
  format: z.enum(['feed', 'story', 'carre']),
  styles: z.array(z.string()).max(4).default([]),
  qualite: z.enum(['medium', 'high']).default('high'),
  brief: z.string().trim().max(2000).default(''),
  objectif: z.enum(['site', 'dm', 'portee']).optional(),
  offre: z.enum(['aucune', 'bienvenue', 'livraison', 'pack']).default('aucune'),
  montrer: z.array(z.enum(['site', 'cod', 'prix', 'pack', 'texture', 'voix'])).max(6).default([]),
  langue: z.enum(['fr', 'darija', 'mix']).optional(),
  // « shine » : tous les plans sur un fond Shine dessine (degrade), aucun decor peint.
  fond: z.enum(['libre', 'shine']).default('libre'),
  // Une recette choisie : la charpente est imposee (et la regle « pas deux fois la meme charpente » ne s'applique pas).
  recette: z.enum(['secret', 'reconnais', 'piege', 'bonneteau']).optional(),
  // « video » : TOUS les plans filmes par Higgsfield (image de depart avec le vrai produit, puis video) ;
  // « motion » : l'animation Shine (le BOS anime les vrais produits detoures sur des fonds).
  rendu: z.enum(['motion', 'video']).default('motion'),
  // Discuter avant de creer : le directeur artistique propose d'abord (concept, plans, modeles, questions).
  alignement: z.boolean().default(true),
  // En video : le storyboard d'abord (images de depart + l'accroche filmee), le reste seulement apres le OK d'Achraf.
  storyboard: z.boolean().default(true),
})
export type DemandeDirection = z.infer<typeof DemandeDirectionSchema>

/**
 * LA DISCUSSION PAR PALIERS. Chaque palier se valide avant que l'argent parte :
 * « idee » (le texte, gratuit) → « storyboard » (en video : les images de depart et la
 * seule accroche filmee) → la creation complete. Une piece jointe (image, video, lien)
 * peut accompagner chaque message, dans les deux sens.
 */
export type Piece = { type: 'image' | 'video' | 'lien'; url: string }
export type Palier = 'idee' | 'storyboard'
export type Message = { auteur: 'agent' | 'achraf'; texte: string; le: string; valide?: boolean; palier?: Palier; pieces?: Piece[]; par?: string | null }

/** Les pieces jointes acceptees : les images et videos du Cloudinary de Shine, et des liens https (8 au plus). */
export function piecesValides(entree: unknown, nuage: string): Piece[] {
  if (entree == null) return []
  if (!Array.isArray(entree)) throw new Error('Pièces jointes : une liste.')
  if (entree.length > 8) throw new Error('8 pièces jointes au plus par message.')
  return entree.map((x) => {
    const url = String((x as { url?: unknown } | null)?.url ?? x ?? '').trim()
    if (!/^https:\/\/\S+$/.test(url) || url.length > 800) throw new Error(`Pièce jointe : une adresse https complète (« ${url.slice(0, 60)} »).`)
    const type: Piece['type'] = url.startsWith(`https://res.cloudinary.com/${nuage}/image/upload/`) ? 'image' : url.startsWith(`https://res.cloudinary.com/${nuage}/video/upload/`) ? 'video' : 'lien'
    return { type, url }
  })
}

/**
 * Ou en est une direction : ce qu'Achraf a valide, et ce que le directeur artistique doit
 * faire maintenant — « proposer » (l'idee), « storyboard » (livrer, peindre, filmer l'accroche
 * seulement, puis soumettre), « creer » (tout est valide : creer ou filmer le reste, terminer).
 */
export function etapeDirection(d: { alignement?: boolean; rendu?: string; storyboard?: boolean }, echanges: Message[]) {
  const valides = new Set(echanges.filter((m) => m.auteur === 'achraf' && m.valide).map((m) => m.palier ?? 'idee'))
  const avecStoryboard = d.rendu === 'video' && d.alignement === true && d.storyboard !== false
  const idee = d.alignement !== true || valides.has('idee')
  const storyboard = avecStoryboard ? valides.has('storyboard') : null
  const etape: 'proposer' | 'storyboard' | 'creer' = !idee ? 'proposer' : storyboard === false ? 'storyboard' : 'creer'
  return { idee, storyboard, etape }
}

/** Valide un brief et le rend coherent (bornes, format, styles connus). */
export function validerDemande(entree: unknown): DemandeDirection {
  const p = DemandeDirectionSchema.safeParse(entree)
  if (!p.success) throw new Error(p.error.issues.map((i) => `${i.path.join('.') || 'demande'} : ${i.message}`).join(' · '))
  const d = p.data
  // Tout en video : un Reel vertical, sans recette (ce sont des montages animes) ni fond dessine.
  if (d.rendu === 'video') { d.type = 'reel'; d.format = 'story'; d.recette = undefined; d.fond = 'libre' }
  // Une recette fixe le type et le nombre de plans.
  if (d.recette) { d.type = 'reel'; d.format = 'story'; d.nombre = RECETTES[d.recette].plans.length }
  const b = BORNES[d.type]
  if (d.nombre < b.min || d.nombre > b.max) throw new Error(d.type === 'carrousel' ? `Un carrousel a de ${b.min} à ${b.max} cartes.` : d.type === 'reel' ? `Un Reel a de ${b.min} à ${b.max} plans.` : `De ${b.min} à ${b.max} options.`)
  if (!b.formats.includes(d.format)) throw new Error(d.type === 'reel' ? 'Un Reel est vertical (9:16).' : 'Un carrousel Instagram est carré (1:1) ou vertical (4:5) : pas de format Story.')
  if (!d.creatifId && !d.produitIds?.length) throw new Error('Choisis au moins un produit, ou pars d’une création existante.')
  if (!d.creatifId && d.brief.length < 10) throw new Error('Pour une nouvelle création, décris en une phrase ce que tu veux (10 caractères au moins).')
  return { ...d, styles: d.styles.filter((s): s is Style => s in STYLES) }
}

/** Le sujet lisible de la demande, dans la file de l'agent. */
export function sujetDemande(d: DemandeDirection): string {
  const quoi = d.type === 'carrousel' ? `Carrousel de ${d.nombre} cartes` : d.type === 'reel' ? (d.rendu === 'video' ? `Reel vidéo (Higgsfield) en ${d.nombre} plans` : `Reel animé en ${d.nombre} plans`) : `${d.nombre} options de visuel`
  const format = { feed: '4:5', story: '9:16', carre: '1:1' }[d.format]
  return `${quoi} (${format})${d.brief ? ` — ${d.brief}` : ''}`.slice(0, 1500)
}

const Texte = z.object({ fr: z.string().trim().max(120).default(''), darija: z.string().trim().max(120).default(''), ar: z.string().trim().max(120).default('') })
const Court = z.object({ fr: z.string().trim().min(1).max(40), darija: z.string().trim().max(40).default(''), ar: z.string().trim().max(40).default('') })
/** Les ecrans du tunnel d'achat, dans l'ordre ou la cliente les voit (captures reelles, AdsSiteCapture). */
export const ETAPES_SITE = ['produit', 'panier', 'livraison'] as const
export type EtapeSite = (typeof ETAPES_SITE)[number]
/** Le libelle par defaut de chaque ecran, tel qu'on le dit a la cliente. */
export const LIBELLES_SITE: Record<EtapeSite, { fr: string; darija: string; ar: string }> = {
  produit: { fr: 'Ajoute au panier', darija: 'Zidi l panier', ar: 'أضيفي إلى السلة' },
  panier: { fr: 'Ton panier', darija: 'Panier dyalek', ar: 'سلتك' },
  livraison: { fr: 'Paie à la livraison', darija: 'Khelles mnin twslek', ar: 'ادفعي عند الاستلام' },
}
const Voix = z.object({ fr: z.string().trim().max(180).default(''), darija: z.string().trim().max(180).default(''), ar: z.string().trim().max(180).default('') })

/* ------------------------------------------------------------------ */
/* LE FRANCAIS QUI S'AFFICHE : accents et mot mis en valeur             */
/* ------------------------------------------------------------------ */

/**
 * Des mots qui n'existent pas sans leurs accents. Le premier Reel livre
 * affichait « Taches apres l'ete », « Etape 2 : le serum », « paiement a la
 * livraison » : la doctrine etait ecrite sans accents et Claude l'a imitee.
 * Une cliente qui lit ca doute du serieux de la boutique.
 */
const SANS_ACCENT = /(?<![\p{L}])(apres|etapes?|serums?|cremes?|cremeuse|tres|deja|legere?s?|eclat|ete|beaute|coreenne?s?|reponses?|repond|memes?|premiere|derniere|deuxieme|troisieme|reparer|reparateurs?|reparatrices?|abimee?s?|secheresse|seches?|hydratee?s?|nourrie?s?|protegee?s?|decouvre[sz]?|ecris|ecrivez|ecrire|ca|voila|a la livraison|a domicile|a partir)(?![\p{L}])/giu

/** Les mots francais ecrits sans leurs accents, pour les refuser avant qu'ils s'affichent. */
export function fautesFrancais(texte: string | null | undefined): string[] {
  if (!texte) return []
  return [...new Set([...texte.replace(/\*/g, '').matchAll(SANS_ACCENT)].map((m) => m[1].toLowerCase()))]
}

const MOTS_VIDES = new Set(['le', 'la', 'les', "l'", 'un', 'une', 'des', 'du', 'de', "d'", 'et', 'ou', 'à', 'a', 'au', 'aux', 'en', 'pour', 'par', 'sur', 'sous', 'avec', 'sans', 'dans', 'après', 'apres', 'avant', 'puis', 'mais', 'donc', 'ce', 'cette', 'ces', 'son', 'sa', 'ses', 'ton', 'ta', 'tes', 'ma', 'mes', 'votre', 'vos', 'notre', 'nos', 'qui', 'que', 'est', 'sont', 'plus', 'très'])

/** Le mot entre *etoiles* doit porter le sens (probleme, benefice, produit), jamais un mot vide. */
export function motMisEnValeurVide(texte: string | null | undefined): string | null {
  const m = /\*([^*]+)\*/.exec(texte || '')
  if (!m) return null
  const mot = m[1].trim().toLowerCase().replace(/[.,!?؟:;]+$/, '')
  return MOTS_VIDES.has(mot) ? m[1] : null
}

/** La routine numerotee : ~0,9 s par produit (entree, numero, nom), plus la rangee finale. */
export const dureeMinEtapes = (n: number) => Math.ceil((0.6 + n * 0.9) * 2) / 2
/** Le tunnel : ~1,3 s par ecran (glisse, le doigt vise, touche). */
export const dureeMinSite = (n: number) => Math.ceil((0.3 + n * 1.3) * 2) / 2

/** Le temps de lire une conversation DM : ~1 s par message, plus la fiche produit. */
export const dureeMinDm = (messages: number, fiche: boolean) => Math.ceil((0.8 + messages * 1 + (fiche ? 0.7 : 0)) * 2) / 2

/**
 * La duree d'une voix off chuchotee (ASMR), estimee avant de la generer :
 * ~0,45 s par mot, 0,35 s par pause (virgule, point, « … »), 0,3 s de souffle.
 * Etalonnee sur les quatre voix reelles du Reel #15 (6 s, 7 s, 4 s, 5 s).
 * Une voix plus longue que son plan deborde sur le suivant.
 */
export function dureeVoix(texte: string): number {
  const t = texte.trim()
  if (!t) return 0
  const mots = t.split(/\s+/).filter((m) => /[\p{L}\p{N}]/u.test(m)).length
  const pauses = (t.match(/[,.;:!?…،؟]+/g) ?? []).length
  return Math.round((0.3 + mots * 0.45 + pauses * 0.35) * 10) / 10
}
/** La voix commence 0,15 s apres l'entree du plan ; 0,3 s de marge suffit a ne pas mordre sur le suivant. */
export const voixTropLongue = (texte: string, duree: number) => dureeVoix(texte) > duree + 0.3
/** Combien de mots chuchotes tiennent dans un plan (avec une pause). */
export const motsVoixMax = (duree: number) => Math.max(2, Math.floor((duree - 0.35) / 0.45))

/** Ce que Claude livre au BOS pour une demande « direction ». */
export const LivraisonDirection = z.object({
  demandeId: z.number().int().positive(),
  modele: z.string().trim().max(100).optional(),
  style: z.string().trim().min(20, 'style : le decor, la lumiere et la palette communs (20 caracteres au moins)').max(2000),
  // Obligatoire quand la demande ne part pas d'une creation existante : Claude cree la creation.
  creation: z.object({
    angle: z.string().trim().min(3).max(300),
    accroche: z.string().trim().min(5).max(500),
    public: z.string().trim().max(500).optional(),
    texteFr: z.string().trim().max(2200).optional(),
    texteDarija: z.string().trim().max(2200).optional(),
    texteAr: z.string().trim().max(2200).optional(),
    titre: z.string().trim().max(120).optional(),
    cta: z.string().trim().max(60).optional(),
  }).optional(),
  options: z.array(z.object({
    role: z.string().trim().max(60).default(''),
    concept: z.string().trim().min(2).max(200),
    pourquoi: z.string().trim().min(10, 'pourquoi : en quoi ce visuel devrait convertir (10 caracteres au moins)').max(800),
    // La consigne d'image : obligatoire (200 caracteres au moins) sauf sur un fond Shine dessine.
    prompt: z.string().trim().max(4000).default(''),
    fond: z.enum(['decor', 'vert', 'aurore', 'prune', 'creme', 'nuit']).optional(),
    // Des lettres A, B, C au-dessus des produits (le jeu « lequel tu prends ? »), et sur les etapes a la place des numeros.
    lettres: z.boolean().optional(),
    // L'appel a commenter : « Commente ta réponse 👇 » ou « Commente ton type de peau 👇 » (quiz ouvert, pop, zoom).
    appel: z.enum(['reponse', 'peau', 'partage', 'enregistre']).optional(),
    texte: Texte,
    position: z.enum(['haut', 'bas']).default('haut'),
    // Produits PEINTS dans l'image. Absent = tous ceux de la creation ; [] = aucun (decor vide, texture).
    produitIds: z.array(z.number().int().positive()).max(3).nullable().optional(),
    // Reel seulement : les vrais produits detoures, animes par-dessus le decor.
    animes: z.array(z.number().int().positive()).max(4).optional(),
    mouvement: z.enum(['rebond', 'pop', 'glisse', 'zoom', 'duo', 'fin', 'revele', 'etiquette', 'quiz', 'dm', 'etapes', 'site']).optional(),
    duree: z.number().min(1).max(6).optional(),
    transition: z.enum(['coupe', 'traversee', 'balayage', 'revelation', 'vague']).optional(),
    ambiance: z.enum(['aucune', 'etincelles', 'gouttes', 'bulles', 'sable']).optional(),
    bulles: z.array(z.object({ de: z.enum(['cliente', 'shine']), texte: z.object({ fr: z.string().trim().min(1).max(90), darija: z.string().trim().max(90).default(''), ar: z.string().trim().max(90).default('') }) })).max(5).optional(),
    // etiquette : 2 ou 3 atouts ; etapes : le nom court de chaque produit, dans l'ordre ; site : le libelle de chaque ecran.
    points: z.array(Court).max(4).optional(),
    // site : les ecrans montres, dans l'ordre du tunnel (les captures viennent du BOS, jamais d'une URL ecrite).
    ecrans: z.array(z.enum(ETAPES_SITE)).min(2).max(3).optional(),
    choix: z.array(Court).max(3).optional(),
    // Reel : la voix off du plan (ASMR ou non), lue par la synthese vocale d'OpenAI.
    // null = pas de voix (ce que la base garde pour un plan muet) : un patch qui la renvoie ne doit pas echouer.
    voix: Voix.nullable().optional(),
    // Carte de fin : badges de confiance (2 au plus lisibles) et sticker de prix des produits animes.
    confiance: z.array(z.enum(['cod', 'livraison', 'authentique', 'conseil'])).max(3).optional(),
    prix: z.boolean().optional(),
    // Quiz : question ouverte (pas de doigt, « Commente ta réponse »), la reponse vient dans un plan suivant.
    ouvert: z.boolean().optional(),
    // Pop : le bonneteau — le premier produit de « animes » est entoure, tout le monde echange de place, on le retrouve.
    melange: z.boolean().optional(),
    // Zoom : un schema anime qui MONTRE (taches, citron, barriere, bouclier, cheveu-abime, cheveu-repare) ; etiquettes dans « points ».
    illustration: z.enum(ILLUSTRATIONS).optional(),
    // Revele, pop, rebond : le produit cache sous un post-it « ? » qui s'arrache.
    cache: z.boolean().optional(),
    // Zoom : un VRAI avis (son id dans « avisReels » du contexte) ; le BOS en recopie le texte exact.
    avisId: z.number().int().positive().optional(),
    // Un clip video REEL en fond du plan (tourne au telephone ou genere par une IA video), a la place du decor :
    // une video du Cloudinary de Shine, envoyee depuis le studio. `debut` : ou le clip commence (secondes).
    clip: z.object({
      url: z.string().trim().max(600).regex(/^https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/video\/upload\/\S+$/i, 'clip : une vidéo envoyée depuis le studio'),
      duree: z.number().positive().max(300).nullable().optional(),
      debut: z.number().min(0).max(300).default(0),
    }).nullable().optional(),
    // La consigne pour filmer ou generer ce clip (en anglais, a coller dans l'outil video) : le plan l'affiche avec « Copier ».
    clipPrompt: z.string().trim().max(2000).nullable().optional(),
    // Garder le son du clip (Veo, Kling avec son…) dans le Reel ; sinon il est muet sous les bruitages et la voix du BOS.
    clipSon: z.boolean().optional(),
    // Le texte est deja dans la video (genere par Higgsfield) : le BOS ne l'ecrit pas. `texte` reste la reference (legende, verification).
    texteVideo: z.boolean().optional(),
    // Filme sans image de depart (texte → video) : seulement un plan SANS produit (ambiance, cheveux, peau, matiere).
    sansDepart: z.boolean().optional(),
    // Plan 1 seulement : la bande-son de tout le Reel (un fichier son du Cloudinary de Shine), et son volume.
    bandeSon: z.object({
      url: z.string().trim().max(600).regex(/^https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/video\/upload\/\S+$/i, 'bande-son : un son envoyé sur le Cloudinary de Shine'),
      volume: z.number().min(0).max(1).default(0.5),
    }).nullable().optional(),
  })).min(1).max(10),
  // Chaque consigne du brief, et le ou les plans qui la tiennent ([] = tenue partout, ex. « ne parle pas de l'été »).
  couverture: z.array(z.object({ consigne: z.string().trim().min(2).max(300), plans: z.array(z.number().int().min(1).max(10)).max(10) })).max(15).optional(),
})
export type OptionLivree = z.infer<typeof LivraisonDirection>['options'][number]
export const OptionLivreeSchema = LivraisonDirection.shape.options.element
export type Livraison = z.infer<typeof LivraisonDirection>

/**
 * Les regles d'UNE option, carte ou plan : ce que Claude livre, et ce qu'Achraf
 * enregistre depuis la table de montage. `i` est la position (0 = premier plan).
 */
export function verifierOption(o: OptionLivree, i: number, type: TypeDirection, produitsCreation: number[]) {
  const nom = `${type === 'carrousel' ? 'Carte' : type === 'reel' ? 'Plan' : 'Option'} ${i + 1}`
  const inconnus = [...(o.produitIds ?? []), ...(o.animes ?? [])].filter((id) => !produitsCreation.includes(id))
  if (inconnus.length) throw new Error(`${nom} : produit(s) ${inconnus.join(', ')} hors de la création (${produitsCreation.join(', ') || 'aucun'}).`)
  if (!o.texte.fr) throw new Error(`${nom} : le texte à poser en français manque.`)
  if (!fondDessine(o.fond) && !o.sansDepart && o.prompt.length < 200) throw new Error(`${nom} : prompt : une consigne de photographe complète (200 caractères au moins), ou un fond Shine dessiné (« fond »).`)
  if (fondDessine(o.fond) && type !== 'reel') throw new Error(`${nom} : les fonds Shine dessinés servent aux Reels ; ici il faut une consigne d'image.`)
  const francais = [o.texte.fr, ...(o.bulles ?? []).map((b) => b.texte.fr), ...(o.points ?? []).map((x) => x.fr), ...(o.choix ?? []).map((x) => x.fr), o.voix?.fr]
  const fautes = [...new Set(francais.flatMap(fautesFrancais))]
  if (fautes.length) throw new Error(`${nom} : français sans accents (${fautes.map((f) => `« ${f} »`).join(', ')}) — écris-le avec tous ses accents (é, è, à, ç…).`)
  const vide = motMisEnValeurVide(o.texte.fr)
  if (vide) throw new Error(`${nom} : le mot mis en valeur « ${vide} » est un mot vide ; entoure d'étoiles le mot qui porte le sens (le problème, le bénéfice, le produit).`)
  if (type === 'reel') {
    if (!o.mouvement || !o.duree) throw new Error(`${nom} : « mouvement » et « duree » sont obligatoires dans un Reel.`)
    // Des coupes sur le temps : a 120 BPM, un temps dure 0,5 s.
    if (!Number.isInteger(o.duree * 2)) throw new Error(`${nom} : durée en demi-secondes (1,5 · 2 · 2,5…) pour couper sur le temps.`)
    const n = o.animes?.length ?? 0
    if (!['zoom', 'dm'].includes(o.mouvement) && !n) throw new Error(`${nom} : le mouvement « ${o.mouvement} » anime des produits : remplis « animes ».`)
    if (o.mouvement === 'duo' && n !== 2) throw new Error(`${nom} : « duo » anime exactement deux produits.`)
    if (['etiquette', 'quiz', 'revele'].includes(o.mouvement) && n !== 1) throw new Error(`${nom} : « ${o.mouvement} » anime un seul produit.`)
    if (['rebond', 'glisse'].includes(o.mouvement) && n > 3) throw new Error(`${nom} : « ${o.mouvement} » anime 3 produits au plus ; pour 4, utilise « pop » ou « fin ».`)
    if (o.mouvement === 'dm' && n > 1) throw new Error(`${nom} : une conversation DM envoie un seul produit.`)
    if (o.mouvement === 'dm' && ((o.bulles?.length ?? 0) < 2)) throw new Error(`${nom} : une conversation DM a 2 à 5 messages (« bulles »).`)
    if (o.mouvement === 'dm' && o.duree < dureeMinDm(o.bulles!.length, n > 0)) throw new Error(`${nom} : ${o.bulles!.length} messages se lisent en ${dureeMinDm(o.bulles!.length, n > 0)} s au moins (${o.duree} s donnés).`)
    if (o.mouvement === 'etiquette' && ((o.points?.length ?? 0) < 2)) throw new Error(`${nom} : une étiquette annotée montre 2 ou 3 atouts (« points »).`)
    if (!['etapes', 'site', 'pop'].includes(o.mouvement) && (o.points?.length ?? 0) > 3) throw new Error(`${nom} : 3 atouts au plus (« points »).`)
    if (o.mouvement === 'etapes') {
      if (n < 2) throw new Error(`${nom} : « etapes » montre la routine, 2 à 4 produits dans l'ordre d'application.`)
      if ((o.points?.length ?? 0) !== n) throw new Error(`${nom} : « etapes » nomme chaque produit — ${n} produit(s), donc ${n} nom(s) courts dans « points » (« Nettoyant », « Sérum »…), dans le même ordre.`)
      if (o.duree < dureeMinEtapes(n)) throw new Error(`${nom} : ${n} étapes se lisent en ${dureeMinEtapes(n)} s au moins (${o.duree} s donnés).`)
    }
    if (o.mouvement === 'site') {
      const e = o.ecrans ?? []
      if (n !== 1) throw new Error(`${nom} : « site » montre le tunnel d'UN produit (celui qu'on achète) : un seul id dans « animes ».`)
      if (e.length < 2) throw new Error(`${nom} : « site » montre 2 ou 3 écrans du vrai site (« ecrans » : produit, panier, livraison).`)
      if (new Set(e).size !== e.length || e.some((x, k) => k > 0 && ETAPES_SITE.indexOf(x) < ETAPES_SITE.indexOf(e[k - 1]))) throw new Error(`${nom} : les écrans suivent l'ordre du site, sans doublon (produit → panier → livraison).`)
      if (o.points?.length && o.points.length !== e.length) throw new Error(`${nom} : un libellé par écran dans « points » (${e.length}), ou aucun pour les libellés par défaut.`)
      if (o.duree < dureeMinSite(e.length)) throw new Error(`${nom} : ${e.length} écrans se suivent en ${dureeMinSite(e.length)} s au moins (${o.duree} s donnés).`)
    } else if (o.ecrans) throw new Error(`${nom} : « ecrans » ne sert que dans un plan « site ».`)
    if (o.ouvert && o.mouvement !== 'quiz') throw new Error(`${nom} : « ouvert » ne sert qu'à un quiz.`)
    if (o.illustration && o.mouvement !== 'zoom') throw new Error(`${nom} : un schéma (« illustration ») se dessine sur un plan « zoom ».`)
    if ((o.clipSon || o.texteVideo) && !o.clip && !String(o.clipPrompt ?? '').trim()) throw new Error(`${nom} : le son ou le texte « dans la vidéo » ne servent qu'à un plan à clip (écris sa consigne « clipPrompt »).`)
    // Sans image de depart, le modele video invente tout ce qu'il montre : jamais un produit (il inventerait l'emballage).
    // La carte de fin aussi : ses produits sont les vrais detoures poses par-dessus, jamais dans le clip.
    if (o.sansDepart && (!['zoom', 'fin'].includes(o.mouvement) || !Array.isArray(o.produitIds) || o.produitIds.length || String(o.clipPrompt ?? '').trim().length < 60)) throw new Error(`${nom} : « sansDepart » (filmé sans image de départ, texte → vidéo) : un plan « zoom » ou la carte de fin, SANS produit dans l'image (« produitIds »: []) et avec sa consigne de mouvement (« clipPrompt », 60 caractères au moins). Un produit visible dans le clip part toujours d'une image de départ, sinon le modèle invente l'emballage.`)
    if (o.bandeSon && i !== 0) throw new Error(`${nom} : la bande-son se pose sur le plan 1 (elle court sous tout le Reel).`)
    if (o.clip?.duree && o.clip.debut >= o.clip.duree) throw new Error(`${nom} : le clip commence après sa fin (${o.clip.debut} s pour un clip de ${o.clip.duree} s).`)
    if (o.avisId && o.mouvement !== 'zoom') throw new Error(`${nom} : un avis client se montre sur un plan « zoom ».`)
    if (o.avisId && o.illustration) throw new Error(`${nom} : un schéma OU un avis par plan, pas les deux.`)
    if (o.cache && (!['revele', 'pop', 'rebond'].includes(o.mouvement) || n < 1)) throw new Error(`${nom} : le post-it (« cache ») couvre un produit d'un « revele », « pop » ou « rebond ».`)
    if (o.appel && !['quiz', 'pop', 'zoom'].includes(o.mouvement)) throw new Error(`${nom} : l'appel à commenter va sur un quiz, un « pop » ou un « zoom ».`)
    if (o.lettres && !['pop', 'rebond', 'glisse', 'fin', 'etapes'].includes(o.mouvement)) throw new Error(`${nom} : les lettres A, B, C vont sur un « pop », « rebond », « glisse », « fin » ou « etapes ».`)
    if (o.mouvement === 'pop' && o.points?.length && o.points.length !== n) throw new Error(`${nom} : une étiquette par produit dans « points » (${n}), dans le même ordre.`)
    if (o.melange && (o.mouvement !== 'pop' || n < 3)) throw new Error(`${nom} : le bonneteau (« melange ») est un « pop » de 3 ou 4 produits.`)
    if (o.melange && o.duree < 2) throw new Error(`${nom} : le bonneteau se joue en 2 s au moins (entourer, mélanger, retrouver).`)
    if (o.mouvement === 'quiz' && ((o.choix?.length ?? 0) < 2)) throw new Error(`${nom} : un quiz propose 2 ou 3 réponses (« choix »), la première menant au produit.`)
    if (i === 0 && o.transition && o.transition !== 'coupe') throw new Error(`${nom} : pas de transition d’entrée sur le premier plan.`)
    // Un produit anime ET peint dans le decor apparaitrait deux fois.
    if (n && (o.produitIds === undefined || o.produitIds === null || o.produitIds.length)) throw new Error(`${nom} : les produits sont animés par-dessus : le décor doit être vide (« produitIds »: []).`)
    if ((o.confiance?.length || o.prix) && o.mouvement !== 'fin') throw new Error(`${nom} : les badges de confiance et le prix vont sur la carte de fin (« fin »).`)
    for (const [langue, texte] of Object.entries(o.voix ?? {})) {
      if (typeof texte === 'string' && voixTropLongue(texte, o.duree)) throw new Error(`${nom} : la voix off (${langue}) dure ~${dureeVoix(texte)} s chuchotée pour un plan de ${o.duree} s — elle déborderait sur le plan suivant. ${motsVoixMax(o.duree)} mots au plus, ou allonge le plan.`)
    }
  } else if (o.animes?.length || o.mouvement || o.transition || o.bulles || o.points || o.choix || o.voix || o.ecrans || o.clip || o.sansDepart || o.bandeSon) {
    throw new Error(`${nom} : « animes », « mouvement », « transition », « bulles », « points », « choix », « voix » et « ecrans » ne servent que dans un Reel.`)
  }
}

/** Le Reel entier : duree totale, accroche courte. */
export function verifierMontage(durees: number[]) {
  const total = durees.reduce((n, d) => n + d, 0)
  if (total < 6 || total > 30) throw new Error(`Un Reel de ${total} s : vise 12 à 25 s (6 à 30 au plus).`)
  if ((durees[0] ?? 0) > 2.5) throw new Error('Plan 1 : l’accroche tient en 2,5 s au plus, sinon on a déjà scrollé.')
}

/**
 * Le Reel TOUT EN VIDEO : chaque plan est filme par Higgsfield a partir d'une image de depart (le vrai
 * produit y est exact). Le BOS garde le montage, le texte (sauf s'il est dans la video), la carte de fin,
 * le son. La charpente vient du brief (pas de recette : ce sont des montages animes).
 */
export function verifierRenduVideo(options: OptionLivree[], d: Pick<DemandeDirection, 'recette'>) {
  if (d.recette) throw new Error('Rendu vidéo : pas de recette (les recettes sont des montages animés) ; construis la charpente à partir du brief.')
  options.forEach((o, i) => {
    const nom = `Plan ${i + 1}`
    if (!['zoom', 'fin', 'site'].includes(o.mouvement ?? '')) throw new Error(`${nom} : en rendu vidéo, un plan est un clip (« zoom »), la carte de fin (« fin ») ou le site (« site ») — pas « ${o.mouvement} ».`)
    // Le site (vraies captures) et une carte de fin sur un fond Shine dessine n'ont pas de clip.
    if (o.mouvement === 'site' || (o.mouvement === 'fin' && fondDessine(o.fond))) return
    if (String(o.clipPrompt ?? '').trim().length < 60) throw new Error(`${nom} : en rendu vidéo, chaque plan a sa consigne de mouvement (« clipPrompt », 60 caractères au moins).`)
    if (!o.sansDepart && o.prompt.trim().length < 120) throw new Error(`${nom} : l'image de départ a besoin d'une vraie consigne (« prompt », 120 caractères au moins) : c'est elle que Higgsfield anime (ou « sansDepart » pour un plan sans produit).`)
  })
  if (options.at(-1)?.mouvement !== 'fin') throw new Error('Rendu vidéo : le dernier plan est la carte de fin (« fin »), avec le bouton et l’offre.')
}

/** Les packs de la creation et leurs produits : { idDuPack: [composants] }. */
export type Packs = Record<number, number[]>

/**
 * Un pack se montre produit par produit. Le Reel #15 animait la photo du pack
 * (une seule image) et son etiquette ne citait que 3 des 4 soins.
 */
export function verifierPack(options: OptionLivree[], packs: Packs) {
  for (const [cle, comps] of Object.entries(packs)) {
    const id = Number(cle)
    if (!comps.length || comps.length > 4) continue
    const i = options.findIndex((o) => o.mouvement !== 'site' && o.animes?.includes(id))
    if (i >= 0) throw new Error(`Plan ${i + 1} : le pack #${id} a ${comps.length} produits — anime-les eux-mêmes (${comps.map((c) => `#${c}`).join(', ')}), pas la photo du pack.`)
    if (!options.some((o) => comps.every((c) => o.animes?.includes(c)))) throw new Error(`Le pack #${id} contient ${comps.length} produits : un plan (« etapes », « pop » ou « fin ») doit les montrer tous les ${comps.length}, aucun oublié.`)
  }
}

/** Ce que le brief d'Achraf demande en toutes lettres. */
export const VEUT_SITE = /\bsite\b|website|\bweb\b|panier|checkout|tunnel|[ée]tapes? d.?achat|buying steps|comment commander|commander en ligne/i
const VEUT_DM = /\b(dm|dms|chat|inbox|whatsapp)\b|message|conversation/i

/**
 * Pas deux fois la meme charpente. Trois Reels de suite ont ete « chute → etiquette
 * → DM → fin » : le brief changeait, pas le Reel. `recents` : les suites de
 * mouvements des derniers Reels, le plus recent d'abord.
 */
export function verifierVariete(suite: string[], recents: string[][], brief: string) {
  const cle = suite.join(' → ')
  if (recents.some((r) => r.join(' → ') === cle)) throw new Error(`Même charpente qu'un Reel récent (${cle}) : invente une autre suite de plans, à partir du brief.`)
  const derniers = recents.slice(0, 2)
  if (derniers.length === 2 && derniers.every((r) => r[0] === suite[0])) throw new Error(`Les deux derniers Reels s'ouvraient déjà par « ${suite[0]} » : ouvre autrement.`)
  if (suite.includes('dm') && !VEUT_DM.test(brief) && recents.slice(0, 3).some((r) => r.includes('dm'))) throw new Error('Pas de conversation DM : le brief ne la demande pas, et un Reel récent en avait déjà une.')
}

/** Les consignes d'un brief : une par ligne ou par puce. */
export function consignesBrief(brief: string | null | undefined): string[] {
  return String(brief ?? '').split(/\n|•/).map((x) => x.replace(/^[\s\-–*·]+/, '').trim()).filter((x) => x.length >= 4)
}

/** Chaque consigne du brief est tenue par un plan, ou respectee partout ([]). */
export function verifierCouverture(couverture: Livraison['couverture'], brief: string | null | undefined, n: number) {
  const consignes = consignesBrief(brief)
  if (consignes.length < 2) return
  if (!couverture?.length) throw new Error(`« couverture » manque : pour chacune des ${consignes.length} consignes du brief, dis quel(s) plan(s) la tiennent ([] si elle est respectée partout).`)
  if (couverture.length < consignes.length) throw new Error(`« couverture » : ${couverture.length} consigne(s) sur ${consignes.length} — chaque ligne du brief doit être tenue : ${consignes.map((c) => `« ${c.slice(0, 50)} »`).join(', ')}.`)
  const hors = couverture.flatMap((c) => c.plans).filter((p) => p > n)
  if (hors.length) throw new Error(`« couverture » : plan(s) ${hors.join(', ')} inexistant(s) (1 à ${n}).`)
}

/** Chaque case « a montrer » du brief se retrouve dans le Reel livre. */
export function verifierAMontrer(options: OptionLivree[], d: Pick<DemandeDirection, 'montrer' | 'brief' | 'objectif'> & { fond?: DemandeDirection['fond'] }, siteDispo: boolean) {
  const m = new Set(d.montrer ?? [])
  const fin = options.find((o) => o.mouvement === 'fin')
  if (siteDispo && (m.has('site') || VEUT_SITE.test(d.brief ?? '')) && !options.some((o) => o.mouvement === 'site')) throw new Error('Le brief demande les étapes du site : ajoute un plan « site » (les vraies captures, dans un téléphone), pas un texte posé sur un décor.')
  if (m.has('cod') && !fin?.confiance?.includes('cod')) throw new Error('Le brief demande « paiement à la livraison » : mets le badge « cod » sur le plan « fin ».')
  if (m.has('prix') && !fin?.prix) throw new Error('Le brief demande le prix : « prix: true » sur le plan « fin ».')
  if (m.has('texture') && !options.some((o) => o.mouvement === 'zoom')) throw new Error('Le brief demande la texture en gros plan : un plan « zoom » sur la matière (décor sans produit animé).')
  if (m.has('voix') && options.filter((o) => (o.voix?.fr ?? '').trim()).length < 2) throw new Error('Le brief demande une voix off : au moins deux plans avec « voix ».')
  const peints = options.map((o, i) => (fondDessine(o.fond) ? 0 : i + 1)).filter(Boolean)
  if (d.fond === 'shine' && peints.length) throw new Error(`Le brief demande le fond Shine (dégradé) : « fond » vert, aurore, prune ou crème sur chaque plan (plan(s) ${peints.join(', ')} en décor peint).`)
}

/** Controle de coherence entre la demande et la livraison (nombre, produits connus, plans de Reel complets). */
export function verifierLivraison(l: Livraison, d: DemandeDirection, produitsCreation: number[], avecCreation: boolean, contexte: { packs?: Packs; recents?: string[][]; siteDispo?: boolean; avisDispo?: boolean } = {}) {
  const nom = d.type === 'carrousel' ? 'Carte' : d.type === 'reel' ? 'Plan' : 'Option'
  if (l.options.length !== d.nombre) throw new Error(`${d.nombre} ${nom.toLowerCase()}(s) demandé(e)s, ${l.options.length} livré(e)s.`)
  if (!avecCreation && !l.creation) throw new Error('Cette demande ne part d’aucune création : ajoute « creation » (angle, accroche, textes).')
  const fautesCreation = [...new Set([l.creation?.accroche, l.creation?.texteFr, l.creation?.titre, l.creation?.cta].flatMap(fautesFrancais))]
  if (fautesCreation.length) throw new Error(`creation : français sans accents (${fautesCreation.map((f) => `« ${f} »`).join(', ')}).`)
  l.options.forEach((o, i) => verifierOption(o, i, d.type, produitsCreation))
  if (d.type === 'reel') {
    verifierMontage(l.options.map((o) => o.duree ?? 0))
    verifierPack(l.options, contexte.packs ?? {})
    if (d.rendu === 'video') verifierRenduVideo(l.options, d)
    else if (d.recette) verifierRecette(l.options, d.recette, contexte.avisDispo ?? true)
    else verifierVariete(l.options.map((o) => o.mouvement ?? ''), contexte.recents ?? [], d.brief ?? '')
    verifierAMontrer(l.options, d, Boolean(contexte.siteDispo))
  }
  verifierCouverture(l.couverture, d.brief, l.options.length)
}

/** « Refais ce plan » : une retouche ciblee, demandee a Claude avec la note d'Achraf. */
export const RetoucheSchema = z.object({ optionId: z.number().int().positive(), note: z.string().trim().min(5, 'Dis en une phrase ce qu’il faut changer.').max(1000) })
export type Retouche = z.infer<typeof RetoucheSchema>

/**
 * La consigne envoyee au modele d'image : celle de Claude, PUIS nos
 * garde-fous. Colles ici, ils ne dependent pas de ce que la consigne dit.
 */
export function promptFinal(o: { prompt: string; format: FormatImage; position: 'haut' | 'bas'; style: string | null; produits: number; styleCarte1: boolean; decorPourAnimation?: boolean }): string {
  const zone = o.format === 'story'
    // « plain background » donnait parfois une bande plate a bord net en haut de l'image (creation #28) : on dit « continu ».
    ? 'Keep the top 20% and the bottom 22% of the frame calm: softly out-of-focus background that continues the same scene (no band, no border, no hard horizontal edge), with nothing important in them.'
    : o.position === 'bas'
      ? 'Keep the bottom 30% of the frame as plain background with nothing important: a headline goes there.'
      : 'Keep the top 30% of the frame as plain background with nothing important: a headline goes there.'
  return [
    o.prompt.trim(),
    o.style ? `Shared art direction for the series: ${o.style.trim()}` : '',
    o.produits > 0 ? `The first ${o.produits === 1 ? 'attached image is the REAL product' : `${o.produits} attached images are the REAL products`}: reproduce ${o.produits === 1 ? 'it' : 'each one'} EXACTLY (shape, cap, colours, label layout and wording). Never invent packaging, never alter or misspell the label, never add another brand.` : 'No product, bottle, jar or packaging anywhere in this image.',
    o.decorPourAnimation ? 'This is a background plate for a motion ad: real product cut-outs will be placed on it later. Leave the centre and lower-middle of the frame as an empty, well-lit surface (shelf, counter, towel, sand…) with a soft natural shadow area, no clutter in front.' : '',
    o.styleCarte1 ? 'The LAST attached image is the first frame of the same series: match its set, surfaces, lighting, colour grading and mood so it feels like one photo shoot. Do NOT copy its composition, and show only the products this prompt asks for.' : '',
    'ABSOLUTELY NO TEXT anywhere in the image (no words, letters, numbers, prices, logos, watermarks), except what is printed on the real product label.',
    zone,
    'No before/after, no medical imagery, no exaggerated result, no distorted hands or faces.',
  ].filter(Boolean).join('\n')
}

/* ------------------------------------------------------------------ */
/* IDEES DE BRIEF : ce qu'on peut demander, tire des chiffres           */
/* ------------------------------------------------------------------ */

export type ProduitPourIdee = { id: number; nom: string; marque: string; categorie: string; margeShine: number | null; stockVendable: number; importBloque: boolean; vendus90j: number }
export type PubPourIdee = { nom: string | null; texte: string; raison: string }
export type Idee = {
  id: string; titre: string; pourquoi: string
  type: TypeDirection; nombre: number; format: FormatImage; styles: Style[]; qualite: 'medium' | 'high'
  produitIds: number[]; brief: string
  // Une proposition faite pour Shine : la recette, l'objectif, ce qui doit se voir, le fond.
  recette?: CleRecette; objectif?: 'site' | 'dm' | 'portee'; offre?: 'aucune' | 'bienvenue' | 'livraison' | 'pack'; montrer?: ('site' | 'cod' | 'prix' | 'pack' | 'texture' | 'voix')[]; fondShine?: boolean
}

/** La saison du Maroc qui parle aux cheveux et a la peau, mois par mois (0 = janvier). */
export function saison(mois: number): { nom: string; besoin: string; styles: Style[] } {
  if (mois >= 5 && mois <= 7) return { nom: 'été', besoin: 'protéger du soleil, du sel et du chlore', styles: ['ete', 'lifestyle'] }
  if (mois >= 8 && mois <= 10) return { nom: 'rentrée', besoin: 'réparer les cheveux abîmés par l’été', styles: ['zellige', 'texture'] }
  if (mois === 11 || mois <= 1) return { nom: 'hiver', besoin: 'nourrir les cheveux et la peau secs du froid', styles: ['zellige', 'mains'] }
  return { nom: 'printemps', besoin: 'alléger la routine avant l’été', styles: ['lifestyle', 'couleur'] }
}

// Le nom entier : un nom coupe (« …pour tous les types de ») trompe plus qu'il n'aide.
const nomCourt = (p: ProduitPourIdee) => `${p.marque} ${p.nom}`.replace(/\s+/g, ' ').trim()

/**
 * Des briefs prets a envoyer, du plus rentable au plus exploratoire. Un clic
 * les pose dans le formulaire ; Achraf les corrige avant d'envoyer.
 */
export function idees(o: { produits: ProduitPourIdee[]; pubsGagnantes: PubPourIdee[]; exclus?: number[]; mois: number }): Idee[] {
  const s = saison(o.mois)
  const vendables = o.produits
    .filter((p) => p.margeShine != null && p.margeShine > 0 && p.stockVendable > 0 && !p.importBloque && !(o.exclus ?? []).includes(p.id))
    .sort((a, b) => b.margeShine! * Math.max(1, b.vendus90j) - a.margeShine! * Math.max(1, a.vendus90j))
  const out: Idee[] = []
  const top = vendables[0]
  if (top) {
    out.push({
      id: `reel-${top.id}`, titre: `Reel « rebond » : ${nomCourt(top)}`,
      pourquoi: `Le produit qui laisse le plus d’argent : ${top.margeShine} DH de marge par vente, ${top.vendus90j} vendus en 90 jours, ${top.stockVendable} en stock.`,
      type: 'reel', nombre: 4, format: 'story', styles: s.styles, qualite: 'high', produitIds: [top.id],
      brief: `Reel de 10 à 12 s pour ${nomCourt(top)}. Plan 1 : une accroche-problème de ${s.nom} (${s.besoin}) qui arrête le pouce en 1 s. Plan 2 : le flacon tombe et rebondit sur un décor ${s.nom}. Plan 3 : le bénéfice principal, montré (texture, geste, cheveux). Plan 4 : fin avec « Écris-nous en DM · paiement à la livraison ».`,
    })
    out.push({
      id: `options-${top.id}`, titre: `3 visuels à tester : ${nomCourt(top)}`,
      pourquoi: 'Trois concepts vraiment différents (studio, en situation, style téléphone) pour laisser Meta trouver celui qui ramène des DM au moins cher.',
      type: 'options', nombre: 3, format: 'feed', styles: ['studio', 'lifestyle', 'ugc'], qualite: 'high', produitIds: [top.id],
      brief: `Trois visuels 4:5 pour ${nomCourt(top)} : un hero shot studio net, le produit dans une vraie routine de ${s.nom}, et une photo prise au téléphone comme par une cliente. Même accroche testée sur les trois.`,
    })
  }
  // Un comparatif « lequel pour toi ? » : la meme marque, la meme categorie, 2 ou 3 produits qui se vendent.
  const groupes = new Map<string, ProduitPourIdee[]>()
  for (const p of vendables) groupes.set(`${p.marque}|${p.categorie}`, [...(groupes.get(`${p.marque}|${p.categorie}`) ?? []), p])
  const trio = [...groupes.values()].filter((g) => g.length >= 2).sort((a, b) => b.length - a.length)[0]?.slice(0, 3)
  if (trio) {
    out.push({
      id: `carrousel-${trio.map((p) => p.id).join('-')}`, titre: `Carrousel « lequel pour tes cheveux ? » : ${trio[0].marque}`,
      pourquoi: 'Le comparatif fait swiper (chaque carte vue compte) et amène des DM qualifiés : « lequel pour moi ? ».',
      type: 'carrousel', nombre: trio.length + 2, format: 'feed', styles: ['studio', 'couleur'], qualite: 'high', produitIds: trio.map((p) => p.id),
      brief: `Carrousel ${trio.length + 2} cartes : carte 1 l’accroche « ${trio.length} soins ${trio[0].marque}, lequel pour toi ? » avec les produits ensemble ; puis une carte par produit (${trio.map(nomCourt).join(' ; ')}) avec pour qui il est fait ; dernière carte : « Dis-nous ton type de cheveux en DM, on te conseille ».`,
    })
    if (trio.length >= 2) out.push({
      id: `duo-${trio[0].id}-${trio[1].id}`, titre: `Reel « duo » : ${trio[0].nom} ou ${trio[1].nom} ?`,
      pourquoi: 'Deux produits qui rebondissent face à face : le format « lequel tu prends ? » fait commenter et écrire en DM.',
      type: 'reel', nombre: 4, format: 'story', styles: ['couleur'], qualite: 'high', produitIds: [trio[0].id, trio[1].id],
      brief: `Reel 10 s : plan 1 la question qui accroche ; plan 2 les deux produits rebondissent côte à côte (duo) ; plan 3 pour qui est chacun ; plan 4 fin « Écris-nous ton type de cheveux en DM ».`,
    })
  }
  // Refaire en neuf ce qui marche deja.
  const g = o.pubsGagnantes[0]
  if (g && top) out.push({
    id: 'gagnante', titre: `Nouvelle version de ta pub gagnante`,
    pourquoi: `${g.nom ?? 'Ta meilleure pub'} : ${g.raison} Garder l’angle qui marche, changer le visuel avant qu’il fatigue.`,
    type: 'options', nombre: 3, format: 'feed', styles: ['ugc', 'mains'], qualite: 'high', produitIds: [top.id],
    brief: `Même angle que la pub qui marche (« ${g.texte.slice(0, 160)} ») avec trois visuels neufs, dont un style téléphone.`,
  })
  // K-beauty : la routine en etapes se prete au carrousel.
  const kb = vendables.filter((p) => /joseon|cosrx|anua|skin1004|round lab|isntree|axis|torriden|beauty of/i.test(p.marque)).slice(0, 3)
  if (kb.length >= 2) out.push({
    id: `routine-${kb.map((p) => p.id).join('-')}`, titre: 'Carrousel routine K-beauty en étapes',
    pourquoi: 'Une routine numérotée se sauvegarde et se partage : de la portée gratuite en plus de la pub.',
    type: 'carrousel', nombre: kb.length + 2, format: 'feed', styles: ['texture', 'mains'], qualite: 'high', produitIds: kb.map((p) => p.id),
    brief: `Routine en ${kb.length} étapes : carte 1 « Ta routine en ${kb.length} gestes » ; une carte par étape avec la texture et le geste (${kb.map(nomCourt).join(' ; ')}) ; dernière carte : la routine complète + « commande en DM ».`,
  })
  return out.slice(0, 6)
}

/** Des morceaux de brief a ajouter d'un clic : ce qu'on veut voir, exactement. */
export const INGREDIENTS: { groupe: string; items: string[] }[] = [
  { groupe: 'Accroche', items: ['Un problème que la cliente reconnaît en 1 s', 'Une question directe : « lequel pour toi ? »', 'Un chiffre vrai (vendus ce mois, avis)', 'Un geste inattendu qui arrête le pouce'] },
  { groupe: 'À montrer', items: ['La texture en gros plan', 'Le geste d’application (mains)', 'Des cheveux en mouvement, brillants', 'Le produit dans la salle de bain', 'Le produit dans le sac de plage', 'Le colis Shine qui arrive'] },
  { groupe: 'Preuve', items: ['Paiement à la livraison', 'Livraison 24-48 h partout au Maroc', 'Conseil personnalisé en DM'] },
  { groupe: 'Fin', items: ['« Écris-nous en DM »', '« Commande sur le site, paiement à la livraison »', 'Les produits ensemble + le bouton'] },
]
