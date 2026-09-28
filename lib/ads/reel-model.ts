/**
 * LE MOTEUR DES REELS ANIMES — pur, sans DOM (teste seul).
 *
 * Pas de video generee par une IA (le rendu « IA generique » que les clientes
 * reconnaissent) : un decor genere, les VRAIS produits detoures poses dessus et
 * animes comme en motion design. Claude compose chaque Reel avec ce vocabulaire :
 *   - des plans : chute qui rebondit, pop, glisse, duo « lequel pour toi ? »,
 *     revelation premium, etiquette annotee, quiz, conversation DM, zoom, fin ;
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

export type Mouvement = 'rebond' | 'pop' | 'glisse' | 'zoom' | 'duo' | 'fin' | 'revele' | 'etiquette' | 'quiz' | 'dm'
export type Transition = 'coupe' | 'traversee' | 'balayage' | 'revelation' | 'vague'
export type Ambiance = 'aucune' | 'etincelles' | 'gouttes' | 'bulles' | 'sable'
export type Bulle = { de: 'cliente' | 'shine'; texte: string }
export type PlanReel = {
  mouvement: Mouvement; duree: number; produits: number; texte: string
  transition?: Transition; ambiance?: Ambiance
  bulles?: Bulle[]        // dm : la conversation, dans l'ordre
  points?: string[]       // etiquette : 2 ou 3 atouts montres autour du produit
  choix?: string[]        // quiz : 2 ou 3 reponses ; la premiere est celle qui mene au produit
  confiance?: string[]    // fin : badges de confiance deja traduits (« Paiement à la livraison »…)
  prix?: string | null    // fin : le sticker de prix (« 997 DH »)
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
  quiz: { choix: EtatChoix[]; doigt: { x: number; y: number; appui: number } | null } | null
  particules: Particule[]
  etincelles: Particule[]        // autour du flacon, apres le reflet
  flash: number
  badges: { texte: string; echelle: number }[]            // fin : les badges de confiance, l'un apres l'autre
  sticker: { texte: string; echelle: number; rotation: number } | null   // fin : le prix, qui tombe en tournant
}

/** Ou poser n produits : centres, ligne de sol, hauteur. */
export function disposition(n: number, mouvement: Mouvement = 'rebond'): { cx: number; bas: number; hauteur: number }[] {
  if (mouvement === 'etiquette' || mouvement === 'revele') return [{ cx: 0.5, bas: 0.76, hauteur: mouvement === 'etiquette' ? 0.44 : 0.46 }]
  if (mouvement === 'quiz') return [{ cx: 0.5, bas: 0.78, hauteur: 0.24 }]
  // Dans la fiche produit envoyee en DM (a gauche de la carte, sous les bulles).
  if (mouvement === 'dm') return [{ cx: 0.215, bas: 0.758, hauteur: 0.11 }]
  const fin = mouvement === 'fin'
  const bas = fin ? 0.66 : 0.78
  // Jusqu'a 4 produits : une routine complete tient dans un seul plan (le premier Reel en perdait un).
  const h = fin ? [0.3, 0.25, 0.21, 0.18] : [0.4, 0.31, 0.25, 0.21]
  const xs = n <= 1 ? [0.5] : n === 2 ? [0.31, 0.69] : n === 3 ? [0.2, 0.5, 0.8] : [0.14, 0.38, 0.62, 0.86]
  return xs.slice(0, Math.max(1, n)).map((cx) => ({ cx, bas, hauteur: h[Math.min(3, Math.max(0, n - 1))] }))
}

/** Les mots du texte ; *mot* marque le mot mis en valeur (sinon, le dernier). */
export function mots(texte: string): { texte: string; accent: boolean }[] {
  // « sont… ? » : la ponctuation isolee reste collee au mot d'avant (jamais seule en debut de ligne).
  const brut = texte.trim().split(/\s+/).filter(Boolean)
    .reduce<string[]>((acc, m) => (/^[?!:;؟…»]+$/.test(m) && acc.length ? [...acc.slice(0, -1), `${acc[acc.length - 1]} ${m}`] : [...acc, m]), [])
  const marques = brut.some((m) => /^\*.+\*[\s.,!?؟…»:;]*$/.test(m))
  return brut.map((m, i) => ({ texte: m.replace(/\*/g, ''), accent: marques ? /^\*.+\*/.test(m) : i === brut.length - 1 }))
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
      return { ...e, echelle: Math.max(0, s), rotation: -10 * (1 - Math.min(1, s)), opacite: borne(x / 0.08), ombre: borne(s) }
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
  const anime = plan.mouvement !== 'zoom'
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

  const liste = mots(plan.texte)
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
    const tap = quizTap(plan)
    const choix = (plan.choix ?? []).slice(0, 3).map((texte, i) => {
      const x = t - 0.35 - i * 0.22
      return { texte, echelle: x <= 0 ? 0 : Math.min(1.08, ressort(x * 2.6)) * (i === 0 && t > tap ? 1 + 0.06 * Math.exp(-6 * (t - tap)) : 1), choisi: i === 0 && t > tap, eteint: i > 0 ? borne((t - tap) / 0.3) : 0 }
    })
    const vu = t > tap - 0.35 && t < tap + 0.5
    quiz = { choix, doigt: vu ? { x: 0.72 - 0.1 * sortie((t - tap + 0.35) / 0.35), y: 0.42 + 0.03 * sortie((t - tap + 0.35) / 0.35), appui: borne(1 - Math.abs(t - tap) / 0.12) } : null }
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
    ? { texte: plan.prix, echelle: Math.min(1.1, ressort((t - 0.6) * 2.4)), rotation: -12 + 14 * (1 - Math.min(1, ressort((t - 0.6) * 2.4))) }
    : null

  return {
    fond, secousse, produits, mots: etatsMots, texteHaut: ZONE.haut + 0.035, chip, cta, dm, points, quiz,
    particules: particules(plan.ambiance, t, indice + 1), etincelles, flash, badges, sticker,
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
      case 'quiz': (plan.choix ?? []).slice(0, 3).forEach((_, k) => ev(0.35 + k * 0.22, 'pop', 0.5)); ev(quizTap(plan), 'clic'); if (n) ev(quizTap(plan) + 0.12, 'pop'); break
      case 'dm': {
        const { pas } = dmCreneaux(plan)
        ;(plan.bulles ?? []).forEach((b, k) => ev(0.35 + k * pas + 0.38, b.de === 'cliente' ? 'envoi' : 'ding'))
        if (n) ev(dmFiche(plan), 'ding', 0.8)
        break
      }
      case 'fin': ev(0.45, 'cta'); if (plan.prix) ev(0.6, 'pop', 0.8); (plan.confiance ?? []).slice(0, 3).forEach((_, k) => ev(0.75 + k * 0.15, 'tic', 0.8)); break
      default: break
    }
    // La signature : le reflet qui traverse le flacon se fait entendre, doucement.
    if (n && plan.mouvement !== 'zoom') ev(pose(plan.mouvement, 0, plan), 'scintille', 0.5)
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
