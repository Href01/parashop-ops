import { z } from 'zod'
import type { FormatImage } from './creatif-model'

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
  reel: { min: 3, max: 6, defaut: 4, formats: ['story'] },
}

/** Les animations d'un plan de Reel (dessinees par le BOS, lib/ads/reel-model.ts). */
export const MOUVEMENTS = {
  rebond: 'Le produit tombe et rebondit sur le décor',
  pop: 'Les produits surgissent l’un après l’autre',
  glisse: 'Le produit entre en glissant, le texte en face',
  zoom: 'Zoom lent sur le décor (le produit est dans l’image)',
  duo: 'Deux produits côte à côte : « lequel pour toi ? »',
  fin: 'Carte de fin : les produits + le bouton qui pulse',
} as const
export type Mouvement = keyof typeof MOUVEMENTS

export const DemandeDirectionSchema = z.object({
  creatifId: z.number().int().positive().optional(),
  produitIds: z.array(z.number().int().positive()).max(6).optional(),
  type: z.enum(['options', 'carrousel', 'reel']),
  nombre: z.number().int(),
  format: z.enum(['feed', 'story', 'carre']),
  styles: z.array(z.string()).max(4).default([]),
  qualite: z.enum(['medium', 'high']).default('high'),
  brief: z.string().trim().max(2000).default(''),
})
export type DemandeDirection = z.infer<typeof DemandeDirectionSchema>

/** Valide un brief et le rend coherent (bornes, format, styles connus). */
export function validerDemande(entree: unknown): DemandeDirection {
  const p = DemandeDirectionSchema.safeParse(entree)
  if (!p.success) throw new Error(p.error.issues.map((i) => `${i.path.join('.') || 'demande'} : ${i.message}`).join(' · '))
  const d = p.data
  const b = BORNES[d.type]
  if (d.nombre < b.min || d.nombre > b.max) throw new Error(d.type === 'carrousel' ? `Un carrousel a de ${b.min} à ${b.max} cartes.` : d.type === 'reel' ? `Un Reel a de ${b.min} à ${b.max} plans.` : `De ${b.min} à ${b.max} options.`)
  if (!b.formats.includes(d.format)) throw new Error(d.type === 'reel' ? 'Un Reel est vertical (9:16).' : 'Un carrousel Instagram est carré (1:1) ou vertical (4:5) : pas de format Story.')
  if (!d.creatifId && !d.produitIds?.length) throw new Error('Choisis au moins un produit, ou pars d’une création existante.')
  if (!d.creatifId && d.brief.length < 10) throw new Error('Pour une nouvelle création, décris en une phrase ce que tu veux (10 caractères au moins).')
  return { ...d, styles: d.styles.filter((s): s is Style => s in STYLES) }
}

/** Le sujet lisible de la demande, dans la file de l'agent. */
export function sujetDemande(d: DemandeDirection): string {
  const quoi = d.type === 'carrousel' ? `Carrousel de ${d.nombre} cartes` : d.type === 'reel' ? `Reel animé en ${d.nombre} plans` : `${d.nombre} options de visuel`
  const format = { feed: '4:5', story: '9:16', carre: '1:1' }[d.format]
  return `${quoi} (${format})${d.brief ? ` — ${d.brief}` : ''}`.slice(0, 1500)
}

const Texte = z.object({ fr: z.string().trim().max(120).default(''), darija: z.string().trim().max(120).default(''), ar: z.string().trim().max(120).default('') })

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
    prompt: z.string().trim().min(200, 'prompt : une consigne de photographe complete (200 caracteres au moins)').max(4000),
    texte: Texte,
    position: z.enum(['haut', 'bas']).default('haut'),
    // Produits PEINTS dans l'image. Absent = tous ceux de la creation ; [] = aucun (decor vide, texture).
    produitIds: z.array(z.number().int().positive()).max(3).nullable().optional(),
    // Reel seulement : les vrais produits detoures, animes par-dessus le decor.
    animes: z.array(z.number().int().positive()).max(3).optional(),
    mouvement: z.enum(['rebond', 'pop', 'glisse', 'zoom', 'duo', 'fin']).optional(),
    duree: z.number().min(1).max(6).optional(),
  })).min(1).max(10),
})
export type Livraison = z.infer<typeof LivraisonDirection>

/** Controle de coherence entre la demande et la livraison (nombre, produits connus, plans de Reel complets). */
export function verifierLivraison(l: Livraison, d: DemandeDirection, produitsCreation: number[], avecCreation: boolean) {
  const nom = d.type === 'carrousel' ? 'Carte' : d.type === 'reel' ? 'Plan' : 'Option'
  if (l.options.length !== d.nombre) throw new Error(`${d.nombre} ${nom.toLowerCase()}(s) demandé(e)s, ${l.options.length} livré(e)s.`)
  if (!avecCreation && !l.creation) throw new Error('Cette demande ne part d’aucune création : ajoute « creation » (angle, accroche, textes).')
  for (const [i, o] of l.options.entries()) {
    const inconnus = [...(o.produitIds ?? []), ...(o.animes ?? [])].filter((id) => !produitsCreation.includes(id))
    if (inconnus.length) throw new Error(`${nom} ${i + 1} : produit(s) ${inconnus.join(', ')} hors de la création (${produitsCreation.join(', ') || 'aucun'}).`)
    if (!o.texte.fr) throw new Error(`${nom} ${i + 1} : le texte à poser en français manque.`)
    if (d.type === 'reel') {
      if (!o.mouvement || !o.duree) throw new Error(`Plan ${i + 1} : « mouvement » et « duree » sont obligatoires dans un Reel.`)
      if (o.mouvement !== 'zoom' && !o.animes?.length) throw new Error(`Plan ${i + 1} : le mouvement « ${o.mouvement} » anime des produits : remplis « animes ».`)
      if (o.mouvement === 'duo' && o.animes!.length !== 2) throw new Error(`Plan ${i + 1} : « duo » anime exactement deux produits.`)
      // Un produit anime ET peint dans le decor apparaitrait deux fois.
      if (o.animes?.length && (o.produitIds === undefined || o.produitIds === null || o.produitIds.length)) throw new Error(`Plan ${i + 1} : les produits sont animés par-dessus : le décor doit être vide (« produitIds »: []).`)
    } else if (o.animes?.length || o.mouvement) {
      throw new Error(`${nom} ${i + 1} : « animes » et « mouvement » ne servent que dans un Reel.`)
    }
  }
  if (d.type === 'reel') {
    const total = l.options.reduce((n, o) => n + (o.duree ?? 0), 0)
    if (total < 6 || total > 20) throw new Error(`Un Reel de ${total} s : vise 8 à 15 s (6 à 20 au plus).`)
    if ((l.options[0].duree ?? 0) > 2.5) throw new Error('Plan 1 : l’accroche tient en 2,5 s au plus, sinon on a déjà scrollé.')
  }
}

/**
 * La consigne envoyee au modele d'image : celle de Claude, PUIS nos
 * garde-fous. Colles ici, ils ne dependent pas de ce que la consigne dit.
 */
export function promptFinal(o: { prompt: string; format: FormatImage; position: 'haut' | 'bas'; style: string | null; produits: number; styleCarte1: boolean; decorPourAnimation?: boolean }): string {
  const zone = o.format === 'story'
    ? 'Keep the top 20% and the bottom 22% of the frame as plain background with nothing important in them.'
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
