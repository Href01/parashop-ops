/**
 * LES FORMATS D'UNE PUB ET LA CONSIGNE DU VISUEL — pur, partage par l'ecran
 * (apercus, export) et le serveur (generation).
 *
 * Le modele d'image recoit la PHOTO REELLE du produit en reference : la pub
 * doit montrer le vrai flacon, pas un produit invente. Et il ne met AUCUN
 * texte : l'accroche, le bouton et la marque sont poses ensuite par le BOS,
 * dans la bonne langue et le bon sens (l'arabe s'ecrit de droite a gauche,
 * ce que les modeles d'image ne savent pas faire).
 */

export type FormatImage = 'feed' | 'story' | 'carre'

export const FORMATS_IMAGE: Record<FormatImage, { label: string; taille: string; export: [number, number]; ratio: number }> = {
  // Tailles de generation : multiples de 16, rapport exact. Export : ce que Meta recommande.
  feed: { label: 'Fil Instagram 4:5', taille: '1024x1280', export: [1080, 1350], ratio: 4 / 5 },
  story: { label: 'Story / Reel 9:16', taille: '1008x1792', export: [1080, 1920], ratio: 9 / 16 },
  carre: { label: 'Carré 1:1', taille: '1024x1024', export: [1080, 1080], ratio: 1 },
}
/** Une image faite ailleurs tient-elle dans le format (12 % d'ecart au plus) ? Une image 1:1 animee donnerait un clip 1:1. */
export const formatProche = (largeur: number, hauteur: number, format: FormatImage) =>
  largeur > 0 && hauteur > 0 && Math.abs(largeur / hauteur - FORMATS_IMAGE[format].ratio) / FORMATS_IMAGE[format].ratio <= 0.12

/** Le format d'image par defaut d'une creation : vertical pour les Reels et Stories. */
export function formatParDefaut(formatCreatif: string): FormatImage {
  return ['reel', 'story', 'video'].includes(formatCreatif) ? 'story' : formatCreatif === 'carrousel' ? 'carre' : 'feed'
}

export type CreatifPourImage = { angle: string; accroche: string; visuel: string | null; public: string | null; format: string }
export type ProduitPourImage = { nom: string; marque: string; categorie?: string | null }

/**
 * La consigne envoyee au modele d'image. En anglais : c'est la langue ou ces
 * modeles suivent le mieux les consignes fines. Le brief visuel de l'agent
 * (en francais) est cite tel quel : le modele le comprend.
 */
export function consigneImage(c: CreatifPourImage, produits: ProduitPourImage[], format: FormatImage, precision?: string): string {
  const produitsTexte = produits.length
    ? produits.map((p) => `${p.marque} « ${p.nom} »`).join(', ')
    : 'the beauty product described in the brief'
  // Premier visuel reel (27/09) : les flacons montaient jusqu'en haut du cadre et l'accroche couvrait
  // leurs bouchons. La zone libre est donc explicite, et le produit tient dans la partie basse.
  const zones = format === 'story'
    ? 'Composition: place the product(s) between 25% and 75% of the frame height. The top 22% and the bottom 22% must be plain soft background only (wall, light, fabric), with no product, no bottle cap, no object: a headline and a button will be added there later.'
    : 'Composition: place the product(s) entirely in the lower 65% of the frame, fully visible. The top 32% must be plain soft background only (wall, light), with no product, no bottle cap, no object: a headline will be added there later.'
  return [
    `Premium advertising photograph for Instagram (${FORMATS_IMAGE[format].label}) for Shine Cosmetics, a beauty shop in Morocco.`,
    produits.length
      ? `The reference image(s) show the REAL product(s): ${produitsTexte}. Reproduce the product EXACTLY as in the reference: same bottle or jar shape, same colours, same label layout. Never invent a different package, never change or misspell the label, never add a second brand.`
      : `Subject: ${produitsTexte}.`,
    `Creative angle: ${c.angle}. Opening line of the ad (context only, do NOT write it in the image): « ${c.accroche} ».`,
    c.visuel ? `Art direction from our creative director (in French): ${c.visuel}` : '',
    c.public ? `Audience: ${c.public}.` : '',
    'Style: natural soft light, clean and warm, modern Moroccan touch only if it fits (warm light, zellige or plaster textures, never a cliché). Realistic skin and hands if any, no distortion.',
    'ABSOLUTELY NO TEXT in the image: no words, letters, numbers, prices, logos, watermarks or captions, except the text already printed on the real product label.',
    zones,
    'No before/after comparison, no medical imagery, no exaggerated result.',
    precision ? `Extra instruction: ${precision}` : '',
  ].filter(Boolean).join('\n')
}

/**
 * La taille de l'accroche, en fraction de la largeur : une accroche longue
 * retrecit pour tenir en deux ou trois lignes au lieu d'envahir l'image.
 * Meme fonction pour l'apercu (HTML) et l'export (canvas).
 */
export function tailleAccroche(format: FormatImage, accroche: string): number {
  const base = { feed: 0.068, story: 0.074, carre: 0.07 }[format]
  const n = accroche.trim().length
  return base * (n > 70 ? 0.68 : n > 50 ? 0.78 : n > 34 ? 0.88 : 1)
}

/** Le texte du bouton selon le canal de commande, dans la langue de la creation. */
export const BOUTONS = {
  message: { fr: 'Envoyer un message', darija: 'Sift lina message', ar: 'أرسلي رسالة' },
  site: { fr: 'Commander', darija: 'Commandi daba', ar: 'اطلبي الآن' },
} as const

export type Langue = 'fr' | 'darija' | 'ar'
export const estRtl = (l: Langue) => l === 'ar'
