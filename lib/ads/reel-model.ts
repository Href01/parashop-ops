/**
 * LE MOTEUR DES REELS ANIMES — pur, sans DOM (teste seul).
 *
 * Pas de video generee par une IA (le rendu « IA generique » que les clientes
 * reconnaissent) : un decor genere, les VRAIS produits detoures poses dessus et
 * animes comme en motion design (chute avec rebond, pop en ressort, glisse,
 * duo, carte de fin), le texte qui arrive mot par mot. Pour chaque instant t,
 * ce module dit ou est chaque element ; le canvas du BOS dessine (apercu) et
 * encode (export MP4 1080x1920) exactement la meme chose.
 *
 * Coordonnees en fractions de l'ecran (0..1), temps en secondes.
 * Zones sures d'un Reel : le haut 14 % et le bas 20 % sont couverts par
 * l'interface d'Instagram ; rien d'important n'y va.
 */

export type Mouvement = 'rebond' | 'pop' | 'glisse' | 'zoom' | 'duo' | 'fin'
export type PlanReel = { mouvement: Mouvement; duree: number; produits: number; texte: string }

export const IPS = 30
export const W = 1080, H = 1920
export const ZONE = { haut: 0.14, bas: 0.8 }

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

export type EtatProduit = { cx: number; bas: number; hauteur: number; echelle: number; rotation: number; opacite: number; ecrasement: number; ombre: number }
export type EtatMot = { texte: string; echelle: number; opacite: number; dy: number; accent: boolean }
export type EtatPlan = {
  fond: { echelle: number; dx: number; dy: number }
  produits: EtatProduit[]
  mots: EtatMot[]
  texteHaut: number                      // ordonnee du haut du bloc de texte
  chip: { echelle: number; cx: number; cy: number } | null   // duo : « ou » entre les deux produits
  cta: { echelle: number; opacite: number; cy: number } | null   // carte de fin : le bouton
  flash: number                          // voile blanc de la coupe (0..1)
}

/** Ou poser n produits : centres, ligne de sol, hauteur. */
export function disposition(n: number, fin = false): { cx: number; bas: number; hauteur: number }[] {
  const bas = fin ? 0.66 : 0.78
  const h = fin ? [0.3, 0.25, 0.21] : [0.4, 0.31, 0.25]
  const xs = n <= 1 ? [0.5] : n === 2 ? [0.31, 0.69] : [0.2, 0.5, 0.8]
  return xs.slice(0, Math.max(1, n)).map((cx) => ({ cx, bas, hauteur: h[Math.min(2, Math.max(0, n - 1))] }))
}

/** Les mots du texte ; *mot* marque le mot mis en valeur (sinon, le dernier). */
export function mots(texte: string): { texte: string; accent: boolean }[] {
  const brut = texte.trim().split(/\s+/).filter(Boolean)
  const marques = brut.some((m) => /^\*.+\*[.,!?؟]*$/.test(m))
  return brut.map((m, i) => ({ texte: m.replace(/\*/g, ''), accent: marques ? /^\*.+\*/.test(m) : i === brut.length - 1 }))
}

export function etatPlan(plan: PlanReel, t: number, premier: boolean): EtatPlan {
  const u = plan.duree ? borne(t / plan.duree) : 0
  // La coupe : le decor arrive un peu zoome et se pose (punch-in), puis derive lentement.
  const zoomLent = plan.mouvement === 'zoom' ? 0.14 * douce(u) : 0.035 * u
  const fond = { echelle: 1 + 0.07 * (1 - douce(t / 0.35)) + zoomLent, dx: plan.mouvement === 'zoom' ? -0.025 * douce(u) : 0, dy: 0 }
  const flash = premier ? 0 : Math.max(0, 1 - t / 0.12) * 0.35

  const place = disposition(plan.produits, plan.mouvement === 'fin')
  const produits: EtatProduit[] = plan.mouvement === 'zoom' ? [] : place.map((p, i) => {
    const e: EtatProduit = { ...p, echelle: 1, rotation: 0, opacite: 1, ecrasement: 0, ombre: 1 }
    const d = 0.1 + i * 0.14
    const x = t - d
    if (x < 0) return { ...e, opacite: 0, ombre: 0 }
    switch (plan.mouvement) {
      case 'rebond': {
        const k = borne(x / 0.75)
        const r = rebondir(k)
        // La chute part du haut de l'ecran ; au contact, le flacon s'ecrase un instant.
        const ecr = 0.07 * Math.exp(-(((k - 0.364) / 0.045) ** 2)) + 0.03 * Math.exp(-(((k - 0.727) / 0.035) ** 2))
        const flotte = x > 0.75 ? -0.005 * Math.sin(2 * Math.PI * 0.7 * (x - 0.75)) : 0
        return { ...e, bas: p.bas - (1 - r) * 0.8 + flotte, rotation: -7 * (1 - r), ecrasement: ecr, ombre: r }
      }
      case 'pop': case 'fin': {
        const s = ressort(x * 2.3)
        return { ...e, echelle: Math.max(0, s), rotation: -10 * (1 - Math.min(1, s)), opacite: borne(x / 0.08), ombre: borne(s) }
      }
      case 'glisse': {
        const a = arriere(x / 0.55)
        return { ...e, cx: p.cx + (1 - a) * 0.75, rotation: 12 * (1 - a), opacite: borne(x / 0.1), ombre: borne(a) }
      }
      case 'duo': {
        const a = arriere(x / 0.6)
        const cote = i === 0 ? -1 : 1
        const r = rebondir(borne(x / 0.6))
        return { ...e, cx: p.cx + cote * (1 - a) * 0.6, bas: p.bas - (1 - r) * 0.12, rotation: cote * 10 * (1 - a), opacite: borne(x / 0.1), ombre: borne(a) }
      }
      default:
        return e
    }
  })

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

  return { fond, produits, mots: etatsMots, texteHaut: ZONE.haut + 0.035, chip, cta, flash }
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
