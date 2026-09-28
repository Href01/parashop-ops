'use client'

import { dureeTotale, evenementsSonores, graine, type EvenementSonore, type PlanReel, type Son } from '@/lib/ads/reel-model'

/**
 * LA BANDE-SON DU REEL — synthetisee dans le navigateur, aucune musique.
 *
 * Des bruitages courts et doux, cales sur l'animation (evenementsSonores) : le
 * choc du flacon, le pop, le « ding » d'un message, le souffle d'une transition,
 * le carillon du bouton. Aucun fichier, aucun droit : tout est fabrique ici,
 * avec une graine fixe, donc l'apercu et l'export sonnent pareil. La voix off de
 * chaque plan (OpenAI, ASMR) est posee a son debut. Le son tendance, lui,
 * s'ajoute dans Instagram.
 */

export const TAUX = 48000
export type VoixPlacee = { url: string; debut: number }
/** Le son propre d'un clip (Higgsfield, Veo…) : pose au debut de son plan, a partir de son « Départ », coupe a la fin du plan. */
export type SonClip = { url: string; debut: number; decalage: number; duree: number }

type Ctx = OfflineAudioContext

function bruit(ctx: Ctx, duree: number, seed: number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.max(1, Math.floor(duree * ctx.sampleRate)), ctx.sampleRate)
  const d = b.getChannelData(0), r = graine(seed)
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1
  return b
}

/** Une enveloppe : attaque, puis extinction exponentielle. */
function env(ctx: Ctx, t: number, niveau: number, attaque: number, extinction: number): GainNode {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, niveau), t + attaque)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attaque + extinction)
  return g
}

function osc(ctx: Ctx, sortie: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, glisse: number, niveau: number, attaque: number, extinction: number) {
  const o = ctx.createOscillator(); o.type = type
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + glisse)
  const g = env(ctx, t, niveau, attaque, extinction)
  o.connect(g).connect(sortie); o.start(t); o.stop(t + attaque + extinction + 0.05)
}

function souffle(ctx: Ctx, sortie: AudioNode, t: number, duree: number, f0: number, f1: number, niveau: number, seed: number, q = 1.2) {
  const s = ctx.createBufferSource(); s.buffer = bruit(ctx, duree + 0.05, seed)
  const filtre = ctx.createBiquadFilter(); filtre.type = 'bandpass'; filtre.Q.value = q
  filtre.frequency.setValueAtTime(f0, t); filtre.frequency.exponentialRampToValueAtTime(f1, t + duree)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(niveau, t + duree * 0.45); g.gain.linearRampToValueAtTime(0.0001, t + duree)
  s.connect(filtre).connect(g).connect(sortie); s.start(t); s.stop(t + duree + 0.05)
}

function jouer(ctx: Ctx, sortie: AudioNode, e: EvenementSonore, k: number) {
  const t = e.t, f = e.force
  const sons: Record<Son, () => void> = {
    choc: () => { osc(ctx, sortie, t, 'sine', 130, 42, 0.16, 0.9 * f, 0.003, 0.28); souffle(ctx, sortie, t, 0.06, 900, 300, 0.25 * f, k) },
    rebond: () => osc(ctx, sortie, t, 'sine', 170, 70, 0.1, 0.35 * f, 0.003, 0.16),
    pop: () => osc(ctx, sortie, t, 'sine', 360, 920, 0.06, 0.45 * f, 0.004, 0.1),
    glisse: () => souffle(ctx, sortie, t, 0.28, 420, 2600, 0.3 * f, k),
    souffle: () => souffle(ctx, sortie, t, 0.42, 300, 3200, 0.35 * f, k, 0.9),
    ding: () => { osc(ctx, sortie, t, 'sine', 1318.5, 1318.5, 0.01, 0.28 * f, 0.004, 0.55); osc(ctx, sortie, t + 0.07, 'sine', 1975.5, 1975.5, 0.01, 0.2 * f, 0.004, 0.6) },
    envoi: () => souffle(ctx, sortie, t, 0.14, 1600, 5200, 0.22 * f, k, 2),
    tic: () => osc(ctx, sortie, t, 'triangle', 2300, 2300, 0.01, 0.12 * f, 0.002, 0.03),
    clic: () => { souffle(ctx, sortie, t, 0.03, 2500, 1200, 0.35 * f, k, 0.7); osc(ctx, sortie, t, 'sine', 240, 160, 0.04, 0.3 * f, 0.002, 0.06) },
    scintille: () => { const r = graine(k * 17 + 3); for (let j = 0; j < 6; j++) osc(ctx, sortie, t + j * 0.06, 'sine', 2800 + r() * 2400, 2800 + r() * 2400, 0.01, 0.05 * f, 0.004, 0.09) },
    montee: () => { souffle(ctx, sortie, t, 0.95, 200, 1700, 0.22 * f, k, 1.5); osc(ctx, sortie, t, 'sine', 220, 440, 0.95, 0.08 * f, 0.5, 0.5) },
    cta: () => [1046.5, 1318.5, 1568].forEach((hz, j) => osc(ctx, sortie, t + j * 0.07, 'sine', hz, hz, 0.01, 0.2 * f, 0.004, 0.8)),
  }
  sons[e.son]()
}

async function decoder(ctx: BaseAudioContext, url: string): Promise<AudioBuffer | null> {
  try { const r = await fetch(url); if (!r.ok) return null; return await ctx.decodeAudioData(await r.arrayBuffer()) } catch { return null }
}

/**
 * La piste complete : bruitages (si demandes) + voix off posees au debut de leur
 * plan, a la suite l'une de l'autre. Les bruitages baissent sous une voix.
 */
export async function mixerPiste(plans: PlanReel[], o: { bruitages: boolean; voix: VoixPlacee[]; clips?: SonClip[] }): Promise<AudioBuffer> {
  const total = dureeTotale(plans)
  const ctx = new OfflineAudioContext(2, Math.ceil((total + 0.05) * TAUX), TAUX)
  const compresseur = ctx.createDynamicsCompressor()
  compresseur.threshold.value = -14; compresseur.ratio.value = 4
  compresseur.connect(ctx.destination)
  const sfx = ctx.createGain(); sfx.gain.value = o.voix.length || o.clips?.length ? 0.45 : 0.8
  sfx.connect(compresseur)
  if (o.bruitages) evenementsSonores(plans).forEach((e, k) => jouer(ctx, sfx, e, k + 1))
  const voix = ctx.createGain(); voix.gain.value = 1.1; voix.connect(compresseur)
  const buffers = await Promise.all(o.voix.map((v) => decoder(ctx, v.url)))
  // Deux chuchotements ne se chevauchent jamais : une voix trop longue decale la
  // suivante (le studio le signale et propose d'allonger le plan).
  let libre = 0
  buffers.forEach((b, k) => {
    if (!b) return
    const debut = Math.max(o.voix[k].debut, libre)
    if (debut >= total) return
    const s = ctx.createBufferSource(); s.buffer = b; s.connect(voix)
    s.start(debut, 0, total - debut)
    libre = debut + b.duration + 0.1
  })
  // Le son des clips : sous les voix, au-dessus des bruitages.
  const sonClips = ctx.createGain(); sonClips.gain.value = 0.9; sonClips.connect(compresseur)
  const pistes = await Promise.all((o.clips ?? []).map((c) => decoder(ctx, c.url)))
  pistes.forEach((b, k) => {
    const c = o.clips![k]
    if (!b || c.debut >= total || c.decalage >= b.duration) return
    const s = ctx.createBufferSource(); s.buffer = b; s.connect(sonClips)
    s.start(c.debut, c.decalage, Math.min(c.duree, b.duration - c.decalage, total - c.debut))
  })
  return ctx.startRendering()
}
