/**
 * LE MOTEUR DES REELS ANIMES — pur, sans DOM (teste seul).
 *
 * Pas de video generee par une IA (le rendu « IA generique » que les clientes
 * reconnaissent) : un decor genere, les VRAIS produits detoures poses dessus et
 * animes comme en motion design. Claude compose chaque Reel avec ce vocabulaire :
 *   - des plans : chute qui rebondit, pop, glisse, duo « lequel pour toi ? »,
 *     revelation premium, etiquette annotee, quiz, conversation DM, zoom, fin,
 *     routine numerotee (etapes), et les vraies captures du site dans un telephone ;
 *   - des transitions : coupe, traversee (zoom a travers), balayage (whip pan),
 *     revelation (cercle), vague (lame de couleur) ;
 *   - une signature Shine : le reflet de lumiere qui balaie chaque flacon quand
 *     il se pose, des etincelles, la secousse a l'impact, les trainees ;
 *   - des ambiances : etincelles, gouttes, bulles, sable.
 * Pour chaque instant t, ce module dit ou est chaque element ; le canvas du BOS
 * dessine (apercu) et encode (export MP4 1080x1920) exactement la meme chose.
 *
 * Coordonnees en fractions de l'ecran (0..1), temps en secondes.
 * Zones sures d'un Reel : le haut 14 % et le bas 20 % sont couverts par
 * l'interface d'Instagram ; rien d'important n'y va.
 */

export type Mouvement = 'rebond' | 'pop' | 'glisse' | 'zoom' | 'duo' | 'fin' | 'revele' | 'etiquette' | 'quiz' | 'dm' | 'etapes' | 'site'
/**
 * Les schemas animes : ils montrent ce que le texte dit. Le probleme (le soleil qui
 * fait monter les taches, le citron qui les fonce, le cheveu que l'ete ouvre) et la
 * reponse (le pigment freine, le bouclier SPF, la fibre gainee). Des dessins, jamais
 * une photo avant/apres (Meta les refuse, et une promesse de resultat n'est pas tenable).
 */
export const ILLUSTRATIONS = ['taches', 'citron', 'barriere', 'bouclier', 'cheveu-abime', 'cheveu-repare'] as const
export type Illustration = (typeof ILLUSTRATIONS)[number]

/** Le bouton touche dans une capture du site, en fractions de la capture. */
export type Cible = { x: number; y: number; w: number; h: number }
export type Transition = 'coupe' | 'traversee' | 'balayage' | 'revelation' | 'vague'
export type Ambiance = 'aucune' | 'etincelles' | 'gouttes' | 'bulles' | 'sable'
export type Bulle = { de: 'cliente' | 'shine'; texte: string }
export type PlanReel = {
  mouvement: Mouvement; duree: number; produits: number; texte: string
  transition?: Transition; ambiance?: Ambiance
  bulles?: Bulle[]        // dm : la conversation, dans l'ordre
  points?: string[]       // etiquette : 2 ou 3 atouts ; etapes : le nom de chaque produit ; site : le libelle de chaque ecran
  ecrans?: { cible: Cible }[]   // site : les captures, dans l'ordre, et le bouton que le doigt touche
  choix?: string[]        // quiz : 2 ou 3 reponses ; la premiere est celle qui mene au produit
  ouvert?: boolean        // quiz ouvert : pas de doigt ni de reponse, « Commente ta réponse » ; la reponse vient plus loin
  melange?: boolean       // pop : le bonneteau — le premier produit est entoure, tout le monde echange de place, on le retrouve
  marques?: string[]      // la marque de chaque produit anime (etapes : dans l'etiquette ; fin : au-dessus du produit)
  illustration?: Illustration | null   // zoom : un schema anime qui MONTRE le probleme ou la reponse (pas un avant/apres)
  cache?: boolean         // revele, pop, rebond : le produit est cache sous un post-it « ? » qui s'arrache (le masquage)
  avis?: { texte: string; note: number } | null   // zoom : un VRAI avis client (resolu par le BOS depuis la table des avis)
  texteVideo?: boolean    // le texte est deja dans la video (genere par Higgsfield) : le BOS ne l'ecrit pas
  appel?: string | null   // quiz ouvert : l'appel a commenter, deja traduit
  confiance?: string[]    // fin : badges de confiance deja traduits (« Paiement à la livraison »…)
  prix?: string | null    // fin : le sticker de prix (« 997 DH »)
  prixBarre?: string | null   // fin : l'ancien prix, barre sur le sticker (un pack : la somme de ses produits)
  fond?: 'decor' | 'vert' | 'aurore' | 'prune' | 'creme' | 'nuit'   // un fond Shine dessine a la place du decor peint
  lettres?: boolean       // A, B, C au-dessus des produits (et a la place des numeros des etapes)
}

export const IPS = 30
export const W = 1080, H = 1920
export const ZONE = { haut: 0.14, bas: 0.8 }
export const DUREE_TRANSITION = 0.38

/* --------------------------- courbes --------------------------- */

export const borne = (x: number) => Math.min(1, Math.max(0, x))
/** Chute qui rebondit (easeOutBounce) : 0 → 1, premier contact a x ≈ 0,36. */
export function rebondir(x: number): number {
  const n = 7.5625, d = 2.75
  x = borne(x)
  if (x < 1 / d) return n * x * x
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375
  return n * (x -= 2.625 / d) * x + 0.984375
}
/** Ressort amorti : depasse de ~20 % puis se pose. x en « temps de ressort » (≈ 1 : pose). */
export function ressort(x: number): number {
  return x <= 0 ? 0 : 1 - Math.exp(-6 * x) * Math.cos(12 * x)
}
/** Arrivee qui depasse un peu puis revient (easeOutBack). */
export function arriere(x: number): number {
  x = borne(x)
  const c1 = 1.70158, c3 = c1 + 1
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
}
export const douce = (x: number) => { x = borne(x); return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2 }
export const sortie = (x: number) => 1 - (1 - borne(x)) ** 3

/** Aleatoire reproductible : l'apercu et l'export tirent les memes particules. */
export function graine(n: number) {
  let s = n >>> 0
  return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296 }
}

/* --------------------------- timeline --------------------------- */

export const dureeTotale = (plans: PlanReel[]) => plans.reduce((n, p) => n + p.duree, 0)
export const nbImages = (plans: PlanReel[]) => Math.round(dureeTotale(plans) * IPS)

/** Le plan joue a l'instant t, et le temps ecoule dans ce plan. */
export function planA(plans: PlanReel[], t: number): { i: number; local: number } {
  let debut = 0
  for (const [i, p] of plans.entries()) {
    if (t < debut + p.duree || i === plans.length - 1) return { i, local: Math.max(0, Math.min(p.duree, t - debut)) }
    debut += p.duree
  }
  return { i: 0, local: 0 }
}

/* --------------------------- etat d'un plan --------------------------- */

export type EtatProduit = {
  cx: number; bas: number; hauteur: number; echelle: number; rotation: number; opacite: number; ecrasement: number; ombre: number; sol: number
  reflet: number | null          // la signature : 0..1, la bande de lumiere qui traverse le flacon
  trainee: { cx: number; bas: number }[]   // positions juste avant : le flou de mouvement
}
export type EtatMot = { texte: string; echelle: number; opacite: number; dy: number; accent: boolean }
export type EtatBulle = { de: Bulle['de']; texte: string; echelle: number; frappe: number }   // frappe : les trois points « en train d'ecrire » (0..1)
export type EtatPoint = { texte: string; trait: number; etiquette: number; ax: number; ay: number; px: number; py: number }
export type EtatChoix = { texte: string; echelle: number; choisi: boolean; eteint: number }
export type Particule = { x: number; y: number; r: number; alpha: number; rot: number }
export type EtatPlan = {
  fond: { echelle: number; dx: number; dy: number }
  secousse: { dx: number; dy: number }
  produits: EtatProduit[]
  mots: EtatMot[]
  texteHaut: number
  chip: { echelle: number; cx: number; cy: number } | null
  cta: { echelle: number; opacite: number; cy: number } | null
  dm: { carte: number; bulles: EtatBulle[]; fiche: number } | null   // conversation : la carte, les bulles, la fiche produit envoyee
  points: EtatPoint[]
  quiz: { choix: EtatChoix[]; doigt: { x: number; y: number; appui: number } | null; appel: { texte: string; echelle: number } | null } | null
  particules: Particule[]
  etincelles: Particule[]        // autour du flacon, apres le reflet
  flash: number
  badges: { texte: string; echelle: number }[]            // fin : les badges de confiance, l'un apres l'autre
  sticker: { texte: string; barre: string | null; echelle: number; rotation: number } | null   // fin : le prix, qui tombe en tournant
  etapes: EtatEtape[]                                     // etapes : le numero et le nom de chaque produit
  site: EtatSite | null                                   // site : le telephone, l'ecran, le doigt
  anneau: { cx: number; cy: number; r: number; alpha: number } | null   // bonneteau : le produit a suivre
  sceau: { echelle: number; rotation: number; cx: number } | null      // fin : la spirale Shine, en sceau
  appel: { texte: string; echelle: number; cy: number } | null           // pop, zoom : « Commente… 👇 », qui bat
  illustration: { type: Illustration; t: number; p: number; labels: string[] } | null   // le schema, a son instant
  postit: { rotation: number; dx: number; dy: number; opacite: number; cx: number; cy: number; taille: number } | null
  avis: { texte: string; note: number; etoiles: number; echelle: number } | null
}
export type EtatEtape = { numero: number; texte: string; cx: number; cy: number; echelle: number; grand: boolean; vers?: { cx: number; cy: number } }
export type EtatSite = {
  telephone: number                                       // entree du telephone (0..1, ressort)
  ecran: number; precedent: number | null; glisse: number // l'ecran montre, celui qui sort, l'avancee du glissement (0..1)
  doigt: { x: number; y: number; appui: number } | null   // en fractions de la capture
  onde: { x: number; y: number; r: number; alpha: number } | null
  etiquette: { numero: number; texte: string; echelle: number }
}

/** La routine numerotee : le produit en vedette, puis la rangee ou chacun se range. */
/** La routine : l'etiquette de la solution du produit en cours, au-dessus de la rangee (les produits restent grands). */
export const ETAPES_ETIQUETTE = 0.385
export function etapesCreneaux(plan: PlanReel) {
  const n = Math.max(1, plan.produits)
  const pas = Math.max(0.6, (plan.duree - 0.75) / n)
  const debut = (k: number) => 0.15 + k * pas
  // Le produit presente a l'instant t (null avant le premier et pendant la rangee finale).
  const actif = (t: number): number | null => { const k = Math.floor((t - 0.15) / pas); return k >= 0 && k < n ? k : null }
  return { n, pas, debut, actif }
}
/** Le tunnel : un creneau par ecran ; le doigt touche aux trois quarts. */
export function siteCreneaux(plan: PlanReel) {
  const m = Math.max(1, plan.ecrans?.length ?? 0)
  const pas = Math.max(0.9, (plan.duree - 0.3) / m)
  const debut = (j: number) => 0.2 + j * pas
  return { m, pas, debut, touche: (j: number) => debut(j) + Math.max(0.75, pas * 0.72) }
}

/** Ou poser n produits : centres, ligne de sol, hauteur. */
export function disposition(n: number, mouvement: Mouvement = 'rebond'): { cx: number; bas: number; hauteur: number }[] {
  // La routine : les produits GRANDS, chacun a sa place, du debut a la fin (Achraf : « laisser les produits
  // big avec bon placement »). Celui qu'on presente grandit, les autres s'effacent un peu.
  if (mouvement === 'etapes') {
    const xs = n <= 2 ? [0.3, 0.7] : n === 3 ? [0.19, 0.5, 0.81] : [0.15, 0.383, 0.617, 0.85]
    const h = n <= 2 ? 0.34 : n === 3 ? 0.29 : 0.25
    return xs.slice(0, Math.max(1, n)).map((cx) => ({ cx, bas: 0.76, hauteur: h }))
  }
  if (mouvement === 'etiquette' || mouvement === 'revele') return [{ cx: 0.5, bas: 0.76, hauteur: mouvement === 'etiquette' ? 0.44 : 0.46 }]
  if (mouvement === 'quiz') return [{ cx: 0.5, bas: 0.78, hauteur: 0.24 }]
  // Dans la fiche produit envoyee en DM (a gauche de la carte, sous les bulles).
  if (mouvement === 'dm') return [{ cx: 0.215, bas: 0.758, hauteur: 0.11 }]
  const fin = mouvement === 'fin'
  const bas = fin ? 0.66 : 0.78
  // Jusqu'a 4 produits : une routine complete tient dans un seul plan (le premier Reel en perdait un).
  // Plus grands qu'avant : sur un telephone, un flacon a 18 % de l'ecran ne se reconnait pas.
  // Quatre produits : resserres (15-85 %) pour qu'aucun ne sorte de l'ecran ni ne passe sous les boutons d'Instagram.
  const h = fin ? [0.34, 0.3, 0.26, 0.24] : [0.44, 0.36, 0.3, 0.25]
  const xs = n <= 1 ? [0.5] : n === 2 ? [0.3, 0.7] : n === 3 ? [0.19, 0.5, 0.81] : [0.15, 0.383, 0.617, 0.85]
  return xs.slice(0, Math.max(1, n)).map((cx) => ({ cx, bas, hauteur: h[Math.min(3, Math.max(0, n - 1))] }))
}

/** Les mots du texte ; *mot* marque le mot mis en valeur (sinon, le dernier). */
export function mots(texte: string): { texte: string; accent: boolean }[] {
  // « sont… ? » : la ponctuation isolee reste collee au mot d'avant (jamais seule en debut de ligne).
  const brut = texte.trim().split(/\s+/).filter(Boolean)
    .reduce<string[]>((acc, m) => (/^[?!:;؟…»]+$/.test(m) && acc.length ? [...acc.slice(0, -1), `${acc[acc.length - 1]} ${m}`] : [...acc, m]), [])
  // *mot* ou *plusieurs mots* : tout ce qui est entre les etoiles est mis en valeur (« *897 DH* », « *4 soins coréens* »).
  const marques = /\*[^*]+\*/.test(brut.join(' '))
  let dedans = false
  return brut.map((m, i) => {
    const ouvre = m.startsWith('*'), ferme = /\*[\s.,!?؟…»:;]*$/.test(m) && (m.length > 1)
    const accent = marques ? dedans || ouvre : i === brut.length - 1
    if (ouvre) dedans = true
    if (ferme) dedans = false
    return { texte: m.replace(/\*/g, ''), accent }
  })
}

/** Le post-it s'arrache aux deux tiers du plan (1,6 s au plus tard) : le temps de se demander ce qu'il cache. */
export const postitArrache = (plan: PlanReel) => Math.min(1.6, plan.duree * 0.62)

/** Le bonneteau : des echanges de places (paires d'emplacements), un toutes les 0,26 s. */
// L'ordre fait finir le produit suivi au centre (place 1 ou 2) apres 2 a 6 echanges : jamais sous les boutons d'Instagram.
const ECHANGES: [number, number][] = [[0, 3], [1, 3], [0, 2], [1, 2], [0, 3], [1, 2]]
export function melangeCreneaux(plan: PlanReel) {
  const debut = 0.85, pas = 0.26
  const n = Math.min(ECHANGES.length, Math.max(0, Math.floor((plan.duree - debut - 0.55) / pas)))
  return { debut, pas, n, revele: debut + n * pas + 0.05 }
}
/** L'emplacement de chaque produit apres k echanges (les paires qui depassent le nombre de produits sont sautees). */
export function emplacements(nProduits: number, k: number): number[] {
  const pos = Array.from({ length: nProduits }, (_, i) => i)
  for (const [a, b] of ECHANGES.slice(0, k)) {
    if (a >= nProduits || b >= nProduits) continue
    const pa = pos.indexOf(a), pb = pos.indexOf(b)
    pos[pa] = b; pos[pb] = a
  }
  return pos
}

/** Quand le produit i se pose (le reflet part a ce moment-la). */
function pose(mouvement: Mouvement, i: number, plan: PlanReel): number {
  const d = 0.1 + i * 0.14
  switch (mouvement) {
    case 'rebond': return d + 0.3
    case 'pop': case 'fin': return d + 0.35
    case 'glisse': return d + 0.45
    case 'duo': return d + 0.5
    case 'revele': return 0.95
    case 'etiquette': return 0.45
    case 'quiz': return quizTap(plan) + 0.55
    case 'dm': return dmFiche(plan) + 0.4
    case 'etapes': return etapesCreneaux(plan).debut(i) + 0.35
    default: return 0
  }
}
const quizTap = (plan: PlanReel) => 0.35 + (plan.choix?.length ?? 2) * 0.22 + 0.35
function dmCreneaux(plan: PlanReel) {
  const n = plan.bulles?.length ?? 0
  const reserve = plan.produits ? 0.9 : 0.3
  const pas = n ? Math.max(0.45, (plan.duree - 0.45 - reserve) / n) : 0
  return { n, pas }
}
const dmFiche = (plan: PlanReel) => { const { n, pas } = dmCreneaux(plan); return 0.35 + n * pas }

function produitA(plan: PlanReel, p: { cx: number; bas: number; hauteur: number }, i: number, t: number): Omit<EtatProduit, 'reflet' | 'trainee'> {
  const e = { ...p, echelle: 1, rotation: 0, opacite: 1, ecrasement: 0, ombre: 1, sol: p.bas }
  const d = 0.1 + i * 0.14
  const x = t - d
  switch (plan.mouvement) {
    case 'rebond': {
      if (x < 0) return { ...e, opacite: 0, ombre: 0 }
      const k = borne(x / 0.75)
      const r = rebondir(k)
      // La chute part du haut de l'ecran ; au contact, le flacon s'ecrase un instant.
      const ecr = 0.07 * Math.exp(-(((k - 0.364) / 0.045) ** 2)) + 0.03 * Math.exp(-(((k - 0.727) / 0.035) ** 2))
      const flotte = x > 0.75 ? -0.005 * Math.sin(2 * Math.PI * 0.7 * (x - 0.75)) : 0
      return { ...e, bas: p.bas - (1 - r) * 0.8 + flotte, rotation: -7 * (1 - r), ecrasement: ecr, ombre: r }
    }
    case 'pop': case 'fin': {
      if (x < 0) return { ...e, opacite: 0, ombre: 0 }
      const s = ressort(x * 2.3)
      const base = { ...e, echelle: Math.max(0, s), rotation: -10 * (1 - Math.min(1, s)), opacite: borne(x / 0.08), ombre: borne(s) }
      if (plan.mouvement !== 'pop' || !plan.melange || plan.produits < 3) return base
      // Le bonneteau : chacun glisse vers sa nouvelle place en arc (l'un passe dessus, l'autre dessous).
      const { debut, pas, n, revele } = melangeCreneaux(plan)
      const place = disposition(plan.produits, 'pop')
      const k = Math.floor((t - debut) / pas)
      const avant = emplacements(plan.produits, Math.max(0, Math.min(n, k)))[i], apres = emplacements(plan.produits, Math.max(0, Math.min(n, k + 1)))[i]
      const u = k >= 0 && k < n ? douce((t - debut - k * pas) / pas) : 0
      const sens = apres > avant ? 1 : -1
      const cx = place[avant].cx + (place[apres].cx - place[avant].cx) * u
      const bas = p.bas - (avant !== apres ? sens * 0.07 * Math.sin(Math.PI * u) : 0)
      // La revelation : le produit suivi grandit, les autres s'effacent.
      const r = t > revele ? ressort((t - revele) * 2.4) : 0
      return { ...base, cx, bas, sol: p.bas, echelle: base.echelle * (i === 0 ? 1 + 0.16 * Math.min(1, r) : 1), opacite: base.opacite * (i === 0 ? 1 : 1 - 0.55 * Math.min(1, r)) }
    }
    case 'glisse': {
      if (x < 0) return { ...e, opacite: 0, ombre: 0 }
      const a = arriere(x / 0.55)
      return { ...e, cx: p.cx + (1 - a) * 0.75, rotation: 12 * (1 - a), opacite: borne(x / 0.1), ombre: borne(a) }
    }
    case 'duo': {
      if (x < 0) return { ...e, opacite: 0, ombre: 0 }
      const a = arriere(x / 0.6)
      const cote = i === 0 ? -1 : 1
      const r = rebondir(borne(x / 0.6))
      return { ...e, cx: p.cx + cote * (1 - a) * 0.6, bas: p.bas - (1 - r) * 0.12, rotation: cote * 10 * (1 - a), opacite: borne(x / 0.1), ombre: borne(a) }
    }
    case 'revele': {
      // Le flacon monte lentement du bas, comme sur un socle : le plan « premium ».
      const u = sortie(t / 0.95)
      return { ...e, bas: p.bas + (1 - u) * 0.5, echelle: 0.92 + 0.08 * u, opacite: borne(t / 0.2), ombre: u, rotation: 0 }
    }
    case 'etiquette': {
      // Le produit est deja la ; la camera avance doucement vers l'etiquette.
      const u = sortie(t / 0.45)
      return { ...e, echelle: 0.85 + 0.15 * u + 0.05 * douce(t / plan.duree), opacite: borne(t / 0.15), ombre: u }
    }
    case 'quiz': {
      // Ouvert : le produit ne repond pas ici (la reponse vient dans un plan suivant).
      if (plan.ouvert) return { ...e, opacite: 0, ombre: 0 }
      const y = t - quizTap(plan) - 0.1
      if (y < 0) return { ...e, opacite: 0, ombre: 0 }
      const s = ressort(y * 2.2)
      return { ...e, echelle: Math.max(0, s), rotation: -8 * (1 - Math.min(1, s)), opacite: borne(y / 0.08), ombre: borne(s) }
    }
    case 'dm': {
      const y = t - dmFiche(plan)
      if (y < 0) return { ...e, opacite: 0, ombre: 0 }
      const s = ressort(y * 2.4)
      return { ...e, echelle: Math.max(0, s), opacite: borne(y / 0.08), ombre: 0 }
    }
    case 'etapes': {
      // Chacun son tour : il surgit a SA place, grand ; tant qu'on le presente, il grandit encore et les autres
      // s'effacent un peu ; a la fin, les quatre ensemble, pleins.
      const { pas, debut, actif } = etapesCreneaux(plan)
      const y = t - debut(i)
      if (y < 0) return { ...e, opacite: 0, ombre: 0 }
      const s = ressort(y * 2.4)
      const a = actif(t)
      const mise = a === i ? 1 + 0.13 * Math.min(1, ressort((t - debut(i)) * 2)) : 1
      const efface = a != null && a !== i ? 0.5 : 1
      return { ...e, echelle: Math.max(0, s) * mise, rotation: -8 * (1 - Math.min(1, s)), opacite: borne(y / 0.08) * efface, ombre: borne(s) }
    }
    default:
      return e
  }
}

const AMBIANCES_N: Record<Exclude<Ambiance, 'aucune'>, number> = { etincelles: 16, gouttes: 11, bulles: 14, sable: 34 }

/** Les particules d'ambiance a l'instant t (graine fixe par plan). */
export function particules(ambiance: Ambiance | undefined, t: number, graineN: number): Particule[] {
  if (!ambiance || ambiance === 'aucune') return []
  const r = graine(graineN * 7919 + 13)
  const out: Particule[] = []
  for (let k = 0; k < AMBIANCES_N[ambiance]; k++) {
    const x0 = r(), y0 = r(), v = r(), phase = r(), taille = r()
    switch (ambiance) {
      case 'etincelles':
        out.push({ x: 0.08 + x0 * 0.84, y: 0.2 + y0 * 0.58, r: 0.008 + taille * 0.016, alpha: Math.max(0, Math.sin(2 * Math.PI * (0.7 * t + phase))) ** 3, rot: t * 0.8 + phase * 6 })
        break
      case 'gouttes': {
        const y = (y0 + t * (0.05 + v * 0.07)) % 1
        out.push({ x: 0.05 + x0 * 0.9 + 0.006 * Math.sin(3 * t + phase * 9), y: 0.12 + y * 0.72, r: 0.008 + taille * 0.012, alpha: 0.75, rot: 0 })
        break
      }
      case 'bulles': {
        const y = 1 - ((y0 + t * (0.06 + v * 0.08)) % 1)
        out.push({ x: 0.05 + x0 * 0.9 + 0.02 * Math.sin(2 * t + phase * 9), y: 0.1 + y * 0.8, r: 0.01 + taille * 0.025, alpha: 0.55, rot: 0 })
        break
      }
      case 'sable': {
        const u = (x0 + t * (0.03 + v * 0.05)) % 1
        out.push({ x: u, y: 0.15 + y0 * 0.7 + 0.01 * Math.sin(t + phase * 7), r: 0.0025 + taille * 0.004, alpha: 0.5 + 0.3 * taille, rot: 0 })
        break
      }
    }
  }
  return out
}

export function etatPlan(plan: PlanReel, t: number, premier: boolean, indice = 0): EtatPlan {
  const u = plan.duree ? borne(t / plan.duree) : 0
  const place = disposition(plan.produits, plan.mouvement)
  const anime = plan.mouvement !== 'zoom' && plan.mouvement !== 'site'
  const zoomLent = plan.mouvement === 'zoom' ? 0.14 * douce(u) : plan.mouvement === 'revele' ? 0.07 * douce(u) : 0.035 * u
  const fond = { echelle: 1 + 0.07 * (1 - douce(t / 0.35)) + zoomLent, dx: plan.mouvement === 'zoom' ? -0.025 * douce(u) : 0, dy: 0 }
  const flash = premier || (plan.transition && plan.transition !== 'coupe') ? 0 : Math.max(0, 1 - t / 0.12) * 0.35

  const produits: EtatProduit[] = !anime || plan.produits === 0 ? [] : place.slice(0, plan.produits).map((p, i) => {
    const e = produitA(plan, p, i, t)
    const tp = pose(plan.mouvement, i, plan)
    const reflet = t >= tp && t <= tp + 0.6 ? (t - tp) / 0.6 : null
    // Trainee : ou etait le produit 20, 40 et 60 ms plus tot, seulement s'il va vite.
    const avant = [0.02, 0.04, 0.06].map((dt) => produitA(plan, p, i, Math.max(0, t - dt)))
    const vite = Math.abs(avant[0].bas - e.bas) + Math.abs(avant[0].cx - e.cx) > 0.012
    return { ...e, reflet, trainee: vite && e.opacite > 0 ? avant.map((a) => ({ cx: a.cx, bas: a.bas })) : [] }
  })

  // Secousse a l'impact (premier contact d'une chute), amortie en 0,25 s.
  let secousse = { dx: 0, dy: 0 }
  if (plan.mouvement === 'rebond') {
    const impact = 0.1 + 0.75 * 0.364
    const x = t - impact
    if (x >= 0 && x < 0.25) { const a = 0.007 * Math.exp(-14 * x); secousse = { dx: a * Math.sin(70 * x) * 0.6, dy: a * Math.cos(55 * x) } }
  }

  const liste = plan.texteVideo ? [] : mots(plan.texte)
  const debutTexte = plan.mouvement === 'rebond' || plan.mouvement === 'duo' ? 0.35 : 0.15
  const etatsMots: EtatMot[] = liste.map((m, i) => {
    const x = t - debutTexte - i * 0.075
    const s = ressort(x * 3)
    return { ...m, echelle: x <= 0 ? 0 : 0.55 + 0.45 * s, opacite: borne(x / 0.1), dy: (1 - Math.min(1, s)) * 0.02 }
  })

  const chip = plan.mouvement === 'duo' && t > 0.55
    ? { echelle: ressort((t - 0.55) * 2.5) * (1 + 0.05 * Math.sin(2 * Math.PI * 1.2 * Math.max(0, t - 1))), cx: 0.5, cy: place[0].bas - place[0].hauteur * 0.45 }
    : null
  const cta = plan.mouvement === 'fin' && t > 0.45
    ? { echelle: ressort((t - 0.45) * 2.4) * (t > 1 ? 1 + 0.045 * Math.sin(2 * Math.PI * 1.4 * (t - 1)) : 1), opacite: borne((t - 0.45) / 0.1), cy: 0.735 }
    : null

  // La conversation DM : chaque message arrive a son creneau, precede des trois points.
  let dm: EtatPlan['dm'] = null
  if (plan.mouvement === 'dm') {
    const { pas } = dmCreneaux(plan)
    dm = {
      carte: sortie(t / 0.35),
      bulles: (plan.bulles ?? []).map((b, i) => {
        const debut = 0.35 + i * pas
        const frappe = t >= debut && t < debut + 0.38 ? borne((t - debut) / 0.38) : 0
        const x = t - debut - 0.38
        return { ...b, frappe, echelle: x <= 0 ? 0 : Math.min(1.08, ressort(x * 2.6)) }
      }),
      fiche: t >= dmFiche(plan) ? ressort((t - dmFiche(plan)) * 2.4) : 0,
    }
  }

  // L'etiquette annotee : un trait part du produit, puis l'atout apparait au bout.
  const ancres = [{ ax: 0.12, ay: 0.4, px: 0.42, py: 0.46 }, { ax: 0.88, ay: 0.5, px: 0.58, py: 0.54 }, { ax: 0.12, ay: 0.61, px: 0.43, py: 0.64 }]
  const points: EtatPoint[] = plan.mouvement === 'etiquette' ? (plan.points ?? []).slice(0, 3).map((texte, i) => {
    const d = 0.6 + i * 0.38
    return { texte, ...ancres[i], trait: sortie((t - d) / 0.25), etiquette: t < d + 0.2 ? 0 : Math.min(1.06, ressort((t - d - 0.2) * 2.6)) }
  }) : []

  // Le quiz : les reponses tombent, un doigt touche la premiere, le produit repond.
  let quiz: EtatPlan['quiz'] = null
  if (plan.mouvement === 'quiz') {
    // Un quiz ouvert n'est jamais touche : la question reste posee jusqu'a la fin du plan.
    const tap = plan.ouvert ? Infinity : quizTap(plan)
    const choix = (plan.choix ?? []).slice(0, 3).map((texte, i) => {
      const x = t - 0.35 - i * 0.22
      return { texte, echelle: x <= 0 ? 0 : Math.min(1.08, ressort(x * 2.6)) * (i === 0 && t > tap ? 1 + 0.06 * Math.exp(-6 * (t - tap)) : 1), choisi: i === 0 && t > tap, eteint: i > 0 ? borne((t - tap) / 0.3) : 0 }
    })
    const vu = t > tap - 0.35 && t < tap + 0.5
    const finChoix = 0.35 + (plan.choix?.length ?? 2) * 0.22
    quiz = {
      choix, doigt: vu ? { x: 0.72 - 0.1 * sortie((t - tap + 0.35) / 0.35), y: 0.42 + 0.03 * sortie((t - tap + 0.35) / 0.35), appui: borne(1 - Math.abs(t - tap) / 0.12) } : null,
      // L'appel a commenter arrive quand toutes les reponses sont la, et bat doucement.
      appel: plan.ouvert && plan.appel && t > finChoix ? { texte: plan.appel, echelle: Math.min(1.06, ressort((t - finChoix) * 2.6)) * (1 + 0.04 * Math.sin(2 * Math.PI * 1.6 * Math.max(0, t - finChoix - 0.4))) } : null,
    }
  }

  // Etincelles de la signature, autour du produit principal, apres le reflet.
  const p0 = produits[0]
  const tp0 = anime && p0 ? pose(plan.mouvement, 0, plan) + 0.35 : Infinity
  const r = graine(indice * 131 + 7)
  const etincelles: Particule[] = p0 && t > tp0 ? Array.from({ length: 5 }, (_, k) => {
    const ph = r(), ox = r(), oy = r()
    const x = t - tp0 - k * 0.12
    return { x: p0.cx + (ox - 0.5) * p0.hauteur * 0.6, y: p0.bas - p0.hauteur * (0.25 + oy * 0.7), r: 0.012 + ph * 0.012, alpha: x > 0 ? Math.max(0, Math.sin(Math.PI * borne(x / 0.7))) : 0, rot: x * 2 }
  }) : []

  const badges = plan.mouvement === 'fin'
    ? (plan.confiance ?? []).slice(0, 3).map((texte, k) => { const x = t - 0.75 - k * 0.15; return { texte, echelle: x <= 0 ? 0 : Math.min(1.06, ressort(x * 2.6)) } })
    : []
  const sticker = plan.mouvement === 'fin' && plan.prix && t > 0.6
    ? { texte: plan.prix, barre: plan.prixBarre ?? null, echelle: Math.min(1.1, ressort((t - 0.6) * 2.4)), rotation: -12 + 14 * (1 - Math.min(1, ressort((t - 0.6) * 2.4))) }
    : null

  // Le bonneteau : un anneau beurre autour du produit a suivre, avant le melange et a la revelation.
  let anneau: EtatPlan['anneau'] = null
  if (plan.mouvement === 'pop' && plan.melange && plan.produits >= 3 && produits[0]) {
    const { debut, revele } = melangeCreneaux(plan)
    const p0 = produits[0]
    const vu = t > 0.5 && t < debut ? borne((t - 0.5) / 0.15) * borne((debut - t) / 0.1) : t > revele ? borne((t - revele) / 0.15) : 0
    if (vu > 0) anneau = { cx: p0.cx, cy: p0.bas - p0.hauteur * p0.echelle * 0.5, r: p0.hauteur * p0.echelle * 0.62, alpha: vu * (0.75 + 0.25 * Math.sin(t * 12)) }
  }
  // Le sceau Shine : la spirale de la marque tombe en tournant a gauche du bouton (a droite, les boutons d'Instagram ;
  // au-dessus des produits, les etiquettes et le prix).
  const sceau = plan.mouvement === 'fin' && t > 0.3 ? { echelle: Math.min(1.08, ressort((t - 0.3) * 2.2)), rotation: -40 * (1 - Math.min(1, ressort((t - 0.3) * 2.2))), cx: 0.15 } : null

  // Le schema anime d'un plan « zoom » : son temps et son avancement ; le dessin est dans ui/illustrations.ts.
  const illustration = plan.mouvement === 'zoom' && plan.illustration
    ? { type: plan.illustration, t, p: plan.duree ? borne(t / plan.duree) : 0, labels: plan.points ?? [] }
    : null

  // Le masquage : un post-it « ? » couvre le produit, tremble, puis s'arrache (le cerveau veut voir ce qu'il cache).
  let postit: EtatPlan['postit'] = null
  if (plan.cache && produits[0] && ['revele', 'pop', 'rebond'].includes(plan.mouvement)) {
    const arrache = postitArrache(plan)
    const x = borne((t - arrache) / 0.4)
    const p0 = produits[0]
    // Il suit le produit (qui monte ou tombe) et le couvre en entier : on ne devine rien avant l'arrachage.
    if (x < 1) postit = {
      cx: p0.cx, cy: p0.bas - p0.hauteur * p0.echelle * 0.5, taille: Math.min(0.29, p0.hauteur * p0.echelle * 0.74),
      rotation: t < arrache ? -4 + 3 * Math.sin(t * 9) : -4 - 38 * sortie(x),
      dx: 0.36 * sortie(x), dy: -0.22 * sortie(x) + (t < arrache ? 0.004 * Math.sin(t * 13) : 0), opacite: (1 - x) * Math.min(1, p0.opacite * 1.4 + 0.3),
    }
  }

  // Un vrai avis : la carte monte, les etoiles s'allument l'une apres l'autre.
  const avis = plan.mouvement === 'zoom' && plan.avis && t > 0.2
    ? { texte: plan.avis.texte, note: plan.avis.note, echelle: Math.min(1.04, ressort((t - 0.2) * 2.4)), etoiles: Math.min(plan.avis.note, Math.max(0, Math.floor((t - 0.45) / 0.12) + 1)) }
    : null

  // L'appel a commenter (hors quiz) : quand les produits (ou le texte) sont la, il bat doucement.
  const tAppel = plan.mouvement === 'pop' ? 0.1 + plan.produits * 0.14 + 0.45 : 0.7
  const appel = plan.appel && plan.mouvement !== 'quiz' && t > tAppel
    ? { texte: plan.appel, cy: plan.mouvement === 'zoom' ? 0.55 : 0.35, echelle: Math.min(1.06, ressort((t - tAppel) * 2.6)) * (1 + 0.04 * Math.sin(2 * Math.PI * 1.6 * Math.max(0, t - tAppel - 0.4))) }
    : null

  // La routine : le numero et le nom du produit en vedette ; puis un petit numero au-dessus de chacun dans la rangee.
  const etapes: EtatEtape[] = []
  if (plan.mouvement === 'etapes') {
    const { debut, actif } = etapesCreneaux(plan)
    const a = actif(t)
    produits.forEach((pr, k) => {
      const y = t - debut(k)
      if (y < 0.12) return
      // Le numero, au-dessus de chaque produit deja la.
      etapes.push({ numero: k + 1, texte: '', cx: pr.cx, cy: pr.bas - pr.hauteur * pr.echelle - 0.022, echelle: Math.min(1.06, ressort((y - 0.12) * 3)), grand: false })
    })
    // La solution du produit presente : une grande etiquette, reliee a lui par un trait.
    if (a != null && produits[a]) {
      const pr = produits[a], y = t - debut(a)
      etapes.push({ numero: a + 1, texte: [plan.points?.[a], plan.marques?.[a]].filter(Boolean).join(' · '), cx: 0.5, cy: ETAPES_ETIQUETTE, echelle: Math.min(1.06, ressort((y - 0.1) * 2.8)), grand: true, vers: { cx: pr.cx, cy: pr.bas - pr.hauteur * pr.echelle - 0.045 } })
    }
  }

  // Le site : le telephone arrive, chaque ecran glisse, le doigt vise le bouton et touche.
  let site: EtatSite | null = null
  if (plan.mouvement === 'site' && plan.ecrans?.length) {
    const { m, debut, touche } = siteCreneaux(plan)
    let j = 0
    for (let q = 1; q < m; q++) if (t >= debut(q)) j = q
    const glisse = j > 0 ? douce((t - debut(j)) / 0.32) : 1
    const c = plan.ecrans[j].cible
    const vise = { x: c.x + c.w / 2, y: c.y + c.h / 2 }
    const tp = touche(j)
    const depart = t - (debut(j) + 0.3)
    const approche = sortie(depart / 0.45)
    const doigt = depart > 0 && t < tp + 0.35
      ? { x: 0.82 + (vise.x - 0.82) * approche, y: 1.08 + (vise.y - 1.08) * approche, appui: borne(1 - Math.abs(t - tp) / 0.12) }
      : null
    const o = t - tp
    site = {
      telephone: Math.min(1.04, ressort(t * 2.2)),
      ecran: j, precedent: j > 0 && glisse < 1 ? j - 1 : null, glisse,
      doigt,
      onde: o > 0 && o < 0.45 ? { x: vise.x, y: vise.y, r: 0.04 + 0.16 * sortie(o / 0.45), alpha: 1 - o / 0.45 } : null,
      etiquette: { numero: j + 1, texte: plan.points?.[j] ?? '', echelle: Math.min(1.06, ressort((t - debut(j) - 0.08) * 2.8)) },
    }
  }

  return {
    fond, secousse, produits, mots: etatsMots, texteHaut: ZONE.haut + 0.035, chip, cta, dm, points, quiz,
    particules: particules(plan.ambiance, t, indice + 1), etincelles, flash, badges, sticker, etapes, site, anneau, sceau, appel, illustration, postit, avis,
  }
}

/* --------------------------- le son --------------------------- */

/**
 * Les bruitages du Reel, cales sur l'animation : la meme horloge que l'image,
 * donc le « ding » tombe quand la bulle apparait, le choc quand le flacon touche.
 * Pas de musique (droits, et le son tendance s'ajoute dans Instagram) : des sons
 * courts, doux, synthetises par le BOS (ui/sons.ts).
 */
export type Son = 'choc' | 'rebond' | 'pop' | 'glisse' | 'souffle' | 'ding' | 'envoi' | 'tic' | 'clic' | 'scintille' | 'montee' | 'cta'
export type EvenementSonore = { t: number; son: Son; force: number }

export function evenementsSonores(plans: PlanReel[]): EvenementSonore[] {
  const out: EvenementSonore[] = []
  let debut = 0
  for (const [i, plan] of plans.entries()) {
    const ev = (t: number, son: Son, force = 1) => { if (t >= 0 && t < plan.duree) out.push({ t: Math.round((debut + t) * 1000) / 1000, son, force }) }
    if (i > 0 && plan.transition && plan.transition !== 'coupe') ev(0, 'souffle')
    const n = plan.produits
    for (let k = 0; k < n; k++) {
      const d = 0.1 + k * 0.14
      switch (plan.mouvement) {
        case 'rebond': ev(d + 0.75 * 0.364, 'choc', 1 - k * 0.15); ev(d + 0.75 * 0.727, 'rebond', 0.5); break
        case 'pop': case 'fin': ev(d + 0.05, 'pop', 0.9 - k * 0.1); break
        case 'glisse': ev(d + 0.2, 'glisse'); break
        case 'duo': ev(d + 0.3, 'glisse', 0.8); break
        default: break
      }
    }
    switch (plan.mouvement) {
      case 'duo': ev(0.6, 'pop'); break
      case 'revele': ev(0, 'montee'); break
      case 'etiquette': ev(0.1, 'pop', 0.6); (plan.points ?? []).slice(0, 3).forEach((_, k) => ev(0.6 + k * 0.38 + 0.2, 'tic')); break
      case 'quiz':
        (plan.choix ?? []).slice(0, 3).forEach((_, k) => ev(0.35 + k * 0.22, 'pop', 0.5))
        if (plan.ouvert) ev(0.35 + (plan.choix?.length ?? 2) * 0.22, 'tic', 0.8)
        else { ev(quizTap(plan), 'clic'); if (n) ev(quizTap(plan) + 0.12, 'pop') }
        break
      case 'dm': {
        const { pas } = dmCreneaux(plan)
        ;(plan.bulles ?? []).forEach((b, k) => ev(0.35 + k * pas + 0.38, b.de === 'cliente' ? 'envoi' : 'ding'))
        if (n) ev(dmFiche(plan), 'ding', 0.8)
        break
      }
      case 'fin': ev(0.45, 'cta'); if (plan.prix) ev(0.6, 'pop', 0.8); (plan.confiance ?? []).slice(0, 3).forEach((_, k) => ev(0.75 + k * 0.15, 'tic', 0.8)); break
      case 'zoom': {
        const ill = plan.illustration
        if (ill === 'taches') for (let k = 0; k < 7; k++) ev(0.45 + k * 0.3, 'tic', 0.5)
        if (ill === 'citron') { ev(0.35, 'glisse', 0.7); ev(Math.min(plan.duree - 0.2, 2.1), 'clic') }
        if (ill === 'barriere') ev(0.95, 'montee', 0.7)
        if (ill === 'bouclier') { ev(0.55, 'montee', 0.6); for (let k = 0; k < 3; k++) ev(1.1 + k * 0.45, 'ding', 0.4) }
        if (ill === 'cheveu-abime') ev(0.8, 'choc', 0.5)
        if (ill === 'cheveu-repare') ev(0.45, 'scintille', 0.8)
        if (plan.avis) for (let k = 0; k < plan.avis.note; k++) ev(0.45 + k * 0.12, 'tic', 0.7)
        break
      }
      case 'pop': {
        if (!plan.melange || n < 3) break
        const { debut, pas, n: m, revele } = melangeCreneaux(plan)
        for (let s = 0; s < m; s++) ev(debut + s * pas, 'glisse', 0.45)
        ev(revele, 'ding', 0.9)
        break
      }
      case 'etapes': {
        const { debut } = etapesCreneaux(plan)
        for (let k = 0; k < n; k++) { ev(debut(k) + 0.05, 'pop', 0.9); ev(debut(k) + 0.2, 'tic', 0.7) }
        break
      }
      case 'site': {
        const { m, debut, touche } = siteCreneaux(plan)
        for (let j = 0; j < m; j++) { if (j) ev(debut(j), 'glisse', 0.6); ev(touche(j), 'clic') }
        ev(touche(m - 1) + 0.12, 'ding', 0.8)
        break
      }
      default: break
    }
    if (plan.cache && n && ['revele', 'pop', 'rebond'].includes(plan.mouvement)) { ev(postitArrache(plan), 'glisse', 0.9); ev(postitArrache(plan) + 0.12, 'pop', 0.7) }
    // La signature : le reflet qui traverse le flacon se fait entendre, doucement.
    if (n && plan.mouvement !== 'zoom' && plan.mouvement !== 'site' && !(plan.mouvement === 'quiz' && plan.ouvert)) ev(pose(plan.mouvement, 0, plan), 'scintille', 0.5)
    debut += plan.duree
  }
  return out.sort((a, b) => a.t - b.t)
}

/** La transition d'entree d'un plan : type et avancement (null hors de la fenetre). */
export function transitionA(plans: PlanReel[], i: number, local: number): { type: Exclude<Transition, 'coupe'>; p: number } | null {
  const tr = plans[i]?.transition
  if (i === 0 || !tr || tr === 'coupe' || local >= DUREE_TRANSITION) return null
  return { type: tr, p: local / DUREE_TRANSITION }
}

/* --------------------------- detourage --------------------------- */

/**
 * Un clip video du Cloudinary de Shine, recadre en 9:16, sans son (la bande-son du Reel
 * est faite par le BOS), en H.264 : 720x1280 pour l'apercu, 1080x1920 pour l'export.
 */
export function urlClip(url: string, hd = false): string {
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.+?)(\.[a-z0-9]{2,4})?$/i.exec(url)
  if (!m) return url
  const [w, h] = hd ? [1080, 1920] : [720, 1280]
  return `${m[1]}c_fill,w_${w},h_${h},ac_none,q_auto:good,vc_h264/${m[2].replace(/^(?:[a-z]{1,3}_[^/]*\/)+/, '')}.mp4`
}

/** Le son d'un clip (Cloudinary extrait la piste audio d'une video en changeant l'extension). */
export function urlSonClip(url: string): string {
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.+?)(\.[a-z0-9]{2,4})?$/i.exec(url)
  return m ? `${m[1]}${m[2].replace(/^(?:[a-z]{1,3}_[^/]*\/)+/, '')}.mp3` : url
}

/** L'instant du clip a montrer, `local` secondes apres le debut du plan (il boucle s'il est plus court). */
export function instantClip(local: number, debut: number, duree: number | null | undefined): number {
  const t = Math.max(0, debut + local)
  return duree && duree > 0 ? Math.min(duree - 0.001, t % duree) : t
}

/**
 * La photo de fiche, detouree par l'IA de Cloudinary (fond transparent, PNG).
 * Le premier appel calcule le detourage (quelques secondes), les suivants
 * viennent du cache de Cloudinary.
 */
export function urlDetouree(url: string | null | undefined, largeur = 900): string | null {
  if (!url) return null
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/.exec(url)
  if (!m) return null
  return `${m[1]}e_background_removal/c_limit,w_${largeur},h_${largeur}/f_png/${m[2].replace(/^(?:[a-z]_[^/]*\/)+/, '')}`
}
