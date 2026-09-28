import { W, H, borne, douce, graine, ressort, sortie, type Illustration } from '@/lib/ads/reel-model'
import { COULEURS, POLICES } from './polices'

/**
 * LES SCHEMAS ANIMES DES REELS — ils MONTRENT le probleme et la reponse.
 *
 * Achraf : « pas de problème clair et de réponse visuellement claire ». Un texte
 * sur un degrade ne se voit pas ; un soleil qui fait monter des taches sur une
 * peau, oui. Des dessins pedagogiques (comme les schemas d'ingredients des grandes
 * marques), jamais une photo avant/apres : Meta les refuse et ce serait une promesse.
 *
 * Tout est fonction du temps local du plan (t, en secondes) : l'apercu et l'export
 * MP4 dessinent exactement la meme image.
 */

type Ctx = CanvasRenderingContext2D

// Une peau marocaine mate, pas une peau de catalogue europeen.
const PEAU = { clair: '#F2CFAE', base: '#DDA77F', ombre: '#B97F58', tache: '92,55,33' }
const SOLEIL = '#F7C948'

function pastille(ctx: Ctx, texte: string, x: number, y: number, police: string, fond: string = COULEURS.creme, couleur: string = COULEURS.brun, echelle = 1) {
  if (!texte || echelle <= 0) return
  ctx.save()
  ctx.font = `800 ${W * 0.036}px ${police}`
  const l = ctx.measureText(texte).width + W * 0.06, h = W * 0.075
  const cx = Math.min(W - l / 2 - W * 0.04, Math.max(l / 2 + W * 0.04, x))
  ctx.translate(cx, y); ctx.scale(echelle, echelle)
  ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = W * 0.02
  ctx.fillStyle = fond
  ctx.beginPath(); ctx.roundRect(-l / 2, -h / 2, l, h, h / 2); ctx.fill()
  ctx.shadowColor = 'transparent'; ctx.fillStyle = couleur; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(texte, 0, W * 0.003)
  ctx.restore()
}

/** Un disque de peau : degrade mat, reflet doux, grain de pores reproductible. */
function disquePeau(ctx: Ctx, cx: number, cy: number, r: number, entree: number) {
  ctx.save()
  ctx.translate(cx, cy); ctx.scale(entree, entree); ctx.translate(-cx, -cy)
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = W * 0.05; ctx.shadowOffsetY = W * 0.012
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r)
  g.addColorStop(0, PEAU.clair); g.addColorStop(0.55, PEAU.base); g.addColorStop(1, PEAU.ombre)
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
  ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip()
  const rnd = graine(42)
  ctx.fillStyle = 'rgba(120,70,45,.13)'
  for (let k = 0; k < 90; k++) { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, W * (0.002 + rnd() * 0.002), 0, Math.PI * 2); ctx.fill() }
  ctx.restore()
  ctx.restore()
}

/** Une tache : trois ellipses floues superposees, irreguliere comme une vraie. */
function tache(ctx: Ctx, x: number, y: number, r: number, alpha: number, graineN: number) {
  if (alpha <= 0) return
  const rnd = graine(graineN)
  ctx.save()
  ctx.filter = `blur(${Math.max(1, r * 0.18)}px)`
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = `rgba(${PEAU.tache},${alpha * (0.55 + rnd() * 0.3)})`
    ctx.beginPath(); ctx.ellipse(x + (rnd() - 0.5) * r * 0.6, y + (rnd() - 0.5) * r * 0.5, r * (0.6 + rnd() * 0.5), r * (0.45 + rnd() * 0.4), rnd() * Math.PI, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

/** Le soleil : un disque, un halo, des rayons qui tournent. */
function soleil(ctx: Ctx, x: number, y: number, r: number, t: number, entree: number) {
  if (entree <= 0) return
  ctx.save()
  ctx.translate(x, y); ctx.scale(entree, entree)
  const h = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2.6)
  h.addColorStop(0, 'rgba(247,201,72,.55)'); h.addColorStop(1, 'rgba(247,201,72,0)')
  ctx.fillStyle = h; ctx.beginPath(); ctx.arc(0, 0, r * 2.6, 0, Math.PI * 2); ctx.fill()
  ctx.rotate(t * 0.6)
  ctx.strokeStyle = SOLEIL; ctx.lineWidth = r * 0.16; ctx.lineCap = 'round'
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, l = r * (1.35 + 0.12 * Math.sin(t * 5 + k)); ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15); ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l); ctx.stroke() }
  ctx.fillStyle = SOLEIL; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

/** Des rayons qui filent du soleil vers une cible (tirets qui avancent). */
function rayons(ctx: Ctx, x0: number, y0: number, cibles: [number, number][], t: number, alpha: number) {
  if (alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = 'rgba(247,201,72,.9)'; ctx.lineWidth = W * 0.007; ctx.lineCap = 'round'
  ctx.setLineDash([W * 0.03, W * 0.025]); ctx.lineDashOffset = -t * W * 0.25
  for (const [x, y] of cibles) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke() }
  ctx.setLineDash([])
  ctx.restore()
}

/** Une rondelle de citron vue de dessus. */
function citron(ctx: Ctx, x: number, y: number, r: number, rot: number) {
  ctx.save()
  ctx.translate(x, y); ctx.rotate(rot)
  ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = W * 0.03
  ctx.fillStyle = '#F2D23C'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = '#FFF6C9'; ctx.beginPath(); ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2); ctx.fill()
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2
    ctx.fillStyle = '#F6DC55'
    ctx.beginPath(); ctx.moveTo(Math.cos(a + 0.06) * r * 0.12, Math.sin(a + 0.06) * r * 0.12)
    ctx.arc(0, 0, r * 0.8, a + 0.08, a + (Math.PI * 2) / 9 - 0.08); ctx.closePath(); ctx.fill()
  }
  ctx.restore()
}

/** La croix rouge du « à ne pas faire ». */
function interdit(ctx: Ctx, x: number, y: number, r: number, echelle: number) {
  if (echelle <= 0) return
  ctx.save()
  ctx.translate(x, y); ctx.scale(echelle, echelle); ctx.rotate(-0.12)
  ctx.strokeStyle = '#D6453A'; ctx.lineWidth = r * 0.16; ctx.lineCap = 'round'
  ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = W * 0.02
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(-r * 0.62, -r * 0.62); ctx.lineTo(r * 0.62, r * 0.62); ctx.stroke()
  ctx.restore()
}

/** La ligne de la meche : une S souple qui respire a peine. */
function meche(t: number) {
  const pts: [number, number][] = []
  for (let k = 0; k <= 48; k++) {
    const u = k / 48
    pts.push([W * (0.08 + 0.84 * u), H * (0.5 + 0.085 * Math.sin(u * Math.PI * 1.55 + 0.35) + 0.004 * Math.sin(t * 2 + u * 6))])
  }
  return pts
}

/**
 * Une meche de cheveux : cinq brins chatain chaud, un halo clair (lisible sur un
 * fond sombre), des frisottis, des pointes qui s'ouvrent en eventail. Gainee, elle
 * se resserre, lisse, et un reflet la parcourt.
 */
function dessinerMeche(ctx: Ctx, pts: [number, number][], abime: number, repare: number, t: number) {
  const n = pts.length - 1
  const ouvert = abime * (1 - repare)
  const normale = (k: number): [number, number] => {
    const [x0, y0] = pts[Math.max(0, k - 1)], [x1, y1] = pts[Math.min(n, k + 1)]
    const l = Math.hypot(x1 - x0, y1 - y0) || 1
    return [-(y1 - y0) / l, (x1 - x0) / l]
  }
  const brins = [-2, -1, 0, 1, 2]
  const ecart = W * 0.011 * (1 - 0.35 * repare)
  const chemin = (o: number, rnd: () => number) => {
    const bruit = rnd() * 10
    return pts.map(([x, y], k) => {
      const [nx, ny] = normale(k), u = k / n
      // Les pointes s'ouvrent en eventail sur le dernier cinquieme de la meche.
      const eventail = u > 0.8 ? ((u - 0.8) / 0.2) ** 1.6 * ouvert * (o * W * 0.03 + (o === 0 ? W * 0.012 : 0)) : 0
      const d = o * ecart + eventail + Math.sin(u * 9 + bruit) * W * 0.002 * (1 + 2 * ouvert)
      return [x + nx * d, y + ny * d] as [number, number]
    })
  }
  ctx.save()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  // Le halo : une ombre claire derriere la meche, pour qu'elle se detache du fond.
  ctx.strokeStyle = 'rgba(255,236,214,.16)'; ctx.lineWidth = W * 0.1
  ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke()
  const rnd = graine(21)
  const couleurs = ['#6B3E24', '#8A5634', '#A86E45', '#8A5634', '#6B3E24']
  brins.forEach((o, b) => {
    const c = chemin(o, rnd)
    ctx.strokeStyle = couleurs[b]; ctx.lineWidth = W * (b === 2 ? 0.014 : 0.012)
    ctx.beginPath(); c.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke()
  })
  // Les frisottis : des brins courts et clairs qui s'echappent de la meche.
  const rf = graine(7)
  ctx.strokeStyle = 'rgba(196,140,98,.95)'; ctx.lineWidth = W * 0.0045
  for (let k = 0; k < 44; k++) {
    const i = 3 + Math.floor(rf() * (n - 12)), [x, y] = pts[i], [nx, ny] = normale(i), cote = rf() > 0.5 ? 1 : -1
    const l = W * (0.025 + rf() * 0.045) * ouvert
    if (l < 1.5) { rf(); continue }
    const bx = x + nx * cote * W * 0.022, by = y + ny * cote * W * 0.022
    ctx.beginPath(); ctx.moveTo(bx, by)
    ctx.quadraticCurveTo(bx + nx * cote * l * 0.6 + (rf() - 0.5) * W * 0.03, by + ny * cote * l * 0.6, bx + nx * cote * l, by + ny * cote * l + (rf() - 0.5) * W * 0.02)
    ctx.stroke()
  }
  // Les ecailles soulevees : la cuticule ouverte, en petits chevrons clairs.
  ctx.strokeStyle = `rgba(245,214,186,${0.8 * ouvert})`; ctx.lineWidth = W * 0.004
  for (let k = 5; k < n - 10; k += 3) {
    const [x, y] = pts[k], [nx, ny] = normale(k)
    ctx.beginPath(); ctx.moveTo(x - nx * W * 0.03, y - ny * W * 0.03); ctx.lineTo(x - nx * W * (0.03 + 0.022 * ouvert) + W * 0.012, y - ny * W * (0.03 + 0.022 * ouvert)); ctx.stroke()
  }
  // Le gainage : un vernis qui avance de la racine a la pointe, puis un reflet qui court.
  if (repare > 0) {
    const jusque = Math.max(2, Math.floor(n * repare))
    ctx.strokeStyle = 'rgba(255,248,235,.5)'; ctx.lineWidth = W * 0.012
    ctx.beginPath(); pts.slice(0, jusque).forEach(([x, y], k) => { const [nx, ny] = normale(k); const px = x - nx * W * 0.012, py = y - ny * W * 0.012; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py) }); ctx.stroke()
    const [bx, by] = pts[Math.min(n, jusque)]
    const halo = ctx.createRadialGradient(bx, by, 0, bx, by, W * 0.08)
    halo.addColorStop(0, `rgba(247,222,146,${0.95 * (1 - repare * 0.6)})`); halo.addColorStop(1, 'rgba(247,222,146,0)')
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(bx, by, W * 0.08, 0, Math.PI * 2); ctx.fill()
    if (repare >= 1) {
      const k = Math.floor(((t * 0.8) % 1) * n), [rx, ry] = pts[k]
      const r = ctx.createRadialGradient(rx, ry - W * 0.01, 0, rx, ry - W * 0.01, W * 0.06)
      r.addColorStop(0, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = r; ctx.beginPath(); ctx.arc(rx, ry - W * 0.01, W * 0.06, 0, Math.PI * 2); ctx.fill()
    }
  }
  ctx.restore()
}

/** La loupe : un cercle blanc et un manche, pour lire « on zoome sur la peau ». */
function loupe(ctx: Ctx, cx: number, cy: number, r: number, entree: number) {
  if (entree <= 0) return
  ctx.save()
  ctx.translate(cx, cy); ctx.scale(entree, entree)
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = W * 0.03
  ctx.strokeStyle = '#F7F6F2'; ctx.lineWidth = W * 0.022
  ctx.beginPath(); ctx.arc(0, 0, r + W * 0.011, 0, Math.PI * 2); ctx.stroke()
  ctx.lineCap = 'round'; ctx.lineWidth = W * 0.05; ctx.strokeStyle = '#0C6B52'
  const a = Math.PI * 0.72
  ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r + W * 0.03), Math.sin(a) * (r + W * 0.03)); ctx.lineTo(Math.cos(a) * (r + W * 0.2), Math.sin(a) * (r + W * 0.2)); ctx.stroke()
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = W * 0.008
  ctx.beginPath(); ctx.arc(0, 0, r * 0.82, -2.6, -1.7); ctx.stroke()
  ctx.restore()
}

/**
 * Le schema d'un plan, dans le repere 1080x1920. `labels` : les etiquettes ecrites
 * par le directeur artistique (points du plan), dans la langue de l'apercu.
 */
export function dessinerIllustration(ctx: Ctx, type: Illustration, t: number, duree: number, labels: string[], police: string) {
  const entree = Math.min(1.04, ressort(t * 2.4))
  switch (type) {
    case 'taches': {
      // Le soleil tape, les taches montent une a une sur la peau.
      const cx = W * 0.47, cy = H * 0.55, r = W * 0.28
      disquePeau(ctx, cx, cy, r, entree)
      loupe(ctx, cx, cy, r, entree)
      const rnd = graine(11)
      const pos = Array.from({ length: 7 }, () => { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * 0.72; return [cx + Math.cos(a) * d, cy + Math.sin(a) * d, W * (0.022 + rnd() * 0.022)] as const })
      soleil(ctx, W * 0.82, H * 0.31, W * 0.055, t, borne((t - 0.15) / 0.3))
      rayons(ctx, W * 0.8, H * 0.33, pos.slice(0, 4).map(([x, y]) => [x, y]), t, borne((t - 0.35) / 0.3))
      pos.forEach(([x, y, rr], k) => tache(ctx, x, y, rr * (0.7 + 0.3 * borne((t - 0.45 - k * 0.3) / 0.5)), 0.75 * borne((t - 0.45 - k * 0.3) / 0.5), 100 + k))
      pastille(ctx, labels[0], W * 0.82, H * 0.395, police, COULEURS.beurre, COULEURS.brun, Math.min(1.04, ressort((t - 0.6) * 2.6)))
      pastille(ctx, labels[1], W * 0.68, H * 0.76, police, COULEURS.creme, COULEURS.brun, Math.min(1.04, ressort((t - 1.6) * 2.6)))
      break
    }
    case 'citron': {
      // La rondelle vient frotter la peau, le soleil tape : les taches foncent. Croix rouge.
      const cx = W * 0.4, cy = H * 0.56, r = W * 0.24
      disquePeau(ctx, cx, cy, r, entree)
      loupe(ctx, cx, cy, r, entree)
      const fonce = borne((t - 1.1) / 1.0)
      ;[[cx - r * 0.3, cy - r * 0.15, W * 0.035], [cx + r * 0.25, cy + r * 0.2, W * 0.03], [cx + r * 0.05, cy - r * 0.45, W * 0.026]].forEach(([x, y, rr], k) => tache(ctx, x, y, rr * (1 + 0.25 * fonce), 0.45 + 0.45 * fonce, 200 + k))
      const va = sortie(borne((t - 0.2) / 0.6))
      const frotte = t > 0.8 && t < 1.7 ? Math.sin((t - 0.8) * 16) * W * 0.012 : 0
      citron(ctx, W * (0.92 - 0.22 * va) + frotte, H * (0.5 + 0.03 * va), W * 0.11, t * 0.8)
      soleil(ctx, W * 0.78, H * 0.3, W * 0.045, t, borne((t - 0.9) / 0.3))
      rayons(ctx, W * 0.76, H * 0.32, [[cx - r * 0.3, cy - r * 0.15], [cx + r * 0.25, cy + r * 0.2]], t, borne((t - 1.0) / 0.3))
      interdit(ctx, W * 0.7, H * 0.52, W * 0.13, Math.min(1.08, ressort((t - Math.min(duree - 0.6, 2.0)) * 2.8)))
      pastille(ctx, labels[0], W * 0.7, H * 0.7, police, COULEURS.creme, COULEURS.brun, Math.min(1.04, ressort((t - 0.7) * 2.6)))
      break
    }
    case 'barriere': {
      // Coupe de peau : le pigment monte ; la barriere verte (les actifs) le freine.
      const x0 = W * 0.1, x1 = W * 0.9, y0 = H * 0.36, y1 = H * 0.76, haut = y0 + (y1 - y0) * 0.36
      ctx.save()
      ctx.globalAlpha = Math.min(1, entree)
      ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = W * 0.04
      ctx.fillStyle = '#E3AE8B'; ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, y1 - y0, W * 0.05); ctx.fill()
      ctx.shadowColor = 'transparent'
      const epi = ctx.createLinearGradient(0, y0, 0, haut)
      epi.addColorStop(0, '#F5D4B6'); epi.addColorStop(1, '#EBC09D')
      ctx.fillStyle = epi; ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, haut - y0, [W * 0.05, W * 0.05, 0, 0]); ctx.fill()
      ctx.restore()
      const bar = sortie(borne((t - 0.9) / 0.5))
      const yb = haut + (y1 - haut) * 0.22
      // Le pigment : des grains qui montent du fond, reproductibles.
      const rnd = graine(5)
      for (let k = 0; k < 22; k++) {
        const x = x0 + (x1 - x0) * (0.08 + 0.84 * rnd()), v = 0.11 + rnd() * 0.08, ph = rnd()
        const cycle = ((t * v + ph) % 1)
        let y = y1 - (y1 - y0) * 0.05 - cycle * (y1 - y0) * 0.95
        let a = 0.85
        if (bar > 0.5 && y < yb) { a = Math.max(0, 0.85 - (yb - y) / (H * 0.03)); y = Math.max(y, yb - H * 0.03) }
        if (a <= 0) continue
        ctx.fillStyle = `rgba(${PEAU.tache},${a})`; ctx.beginPath(); ctx.arc(x, y, W * (0.008 + 0.004 * ((k * 7) % 3)), 0, Math.PI * 2); ctx.fill()
      }
      if (bar > 0) {
        ctx.save()
        ctx.globalAlpha = bar
        const bg = ctx.createLinearGradient(0, yb - H * 0.02, 0, yb + H * 0.02)
        bg.addColorStop(0, 'rgba(12,107,82,0)'); bg.addColorStop(0.5, 'rgba(12,107,82,.85)'); bg.addColorStop(1, 'rgba(12,107,82,0)')
        ctx.fillStyle = bg; ctx.fillRect(x0 + W * 0.02, yb - H * 0.02, (x1 - x0 - W * 0.04) * bar, H * 0.04)
        ctx.strokeStyle = 'rgba(247,222,146,.9)'; ctx.lineWidth = W * 0.004; ctx.setLineDash([W * 0.02, W * 0.012]); ctx.lineDashOffset = -t * W * 0.1
        ctx.beginPath(); ctx.moveTo(x0 + W * 0.02, yb); ctx.lineTo(x0 + W * 0.02 + (x1 - x0 - W * 0.04) * bar, yb); ctx.stroke(); ctx.setLineDash([])
        ctx.restore()
      }
      pastille(ctx, labels[0], W * 0.24, y1 + H * 0.025, police, COULEURS.creme, COULEURS.brun, Math.min(1.04, ressort((t - 0.3) * 2.6)))
      pastille(ctx, labels[1], W * 0.5, yb, police, COULEURS.vert, '#fff', Math.min(1.04, ressort((t - 1.25) * 2.6)))
      break
    }
    case 'bouclier': {
      // Les rayons tombent ; le bouclier SPF se leve, ils rebondissent.
      const cx = W * 0.5, sol = H * 0.74
      ctx.save()
      ctx.globalAlpha = Math.min(1, entree)
      const g = ctx.createLinearGradient(0, sol, 0, H * 0.8)
      g.addColorStop(0, PEAU.base); g.addColorStop(1, PEAU.ombre)
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, sol + H * 0.05, W * 0.46, H * 0.07, 0, Math.PI, 0); ctx.fill()
      ctx.restore()
      soleil(ctx, cx, H * 0.33, W * 0.065, t, entree)
      const dome = sortie(borne((t - 0.5) / 0.45))
      for (let k = 0; k < 5; k++) {
        const x = cx + (k - 2) * W * 0.15, ph = ((t * 0.9 + k * 0.23) % 1)
        const yImpact = sol - H * 0.07 - Math.cos(((k - 2) / 2.6) * Math.PI / 2) * H * 0.1 * dome
        const y = H * 0.4 + ph * (yImpact - H * 0.4)
        ctx.strokeStyle = 'rgba(247,201,72,.95)'; ctx.lineWidth = W * 0.007; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(x, Math.max(H * 0.4, y - H * 0.05)); ctx.lineTo(x, y); ctx.stroke()
        if (dome > 0.6 && ph > 0.85) { ctx.globalAlpha = (1 - ph) * 6; ctx.beginPath(); ctx.moveTo(x, yImpact); ctx.lineTo(x + (k - 2 || 1) * W * 0.05, yImpact - H * 0.05); ctx.stroke(); ctx.globalAlpha = 1 }
      }
      if (dome > 0) {
        ctx.save()
        ctx.globalAlpha = dome
        const d = ctx.createLinearGradient(0, sol - H * 0.2, 0, sol)
        d.addColorStop(0, 'rgba(255,255,255,.55)'); d.addColorStop(1, 'rgba(159,227,197,.2)')
        ctx.fillStyle = d; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = W * 0.006
        ctx.beginPath(); ctx.ellipse(cx, sol, W * 0.44 * dome, H * 0.17, 0, Math.PI, 0); ctx.fill(); ctx.stroke()
        ctx.restore()
      }
      pastille(ctx, labels[0], cx, sol - H * 0.1, police, COULEURS.vert, '#fff', Math.min(1.04, ressort((t - 0.85) * 2.6)))
      break
    }
    case 'cheveu-abime':
    case 'cheveu-repare': {
      const pts = meche(t)
      const abime = type === 'cheveu-abime' ? douce(borne((t - 0.3) / 1.1)) : 1
      const repare = type === 'cheveu-repare' ? douce(borne((t - 0.45) / 1.4)) : 0
      ctx.save(); ctx.globalAlpha = Math.min(1, entree); dessinerMeche(ctx, pts, abime, repare, t); ctx.restore()
      if (type === 'cheveu-abime') {
        soleil(ctx, W * 0.82, H * 0.3, W * 0.05, t, borne((t - 0.1) / 0.3))
        labels.slice(0, 3).forEach((l, k) => pastille(ctx, l, W * (0.22 + k * 0.28), H * 0.7, police, COULEURS.creme, COULEURS.brun, Math.min(1.04, ressort((t - 0.6 - k * 0.25) * 2.6))))
      } else {
        labels.slice(0, 2).forEach((l, k) => pastille(ctx, l, W * (0.3 + k * 0.4), H * 0.69, police, k ? COULEURS.beurre : COULEURS.vert, k ? COULEURS.brun : '#fff', Math.min(1.04, ressort((t - 1.0 - k * 0.3) * 2.6))))
      }
      break
    }
  }
}

/** Le post-it « ? » qui cache le produit, puis s'arrache. */
export function dessinerPostIt(ctx: Ctx, p: { rotation: number; dx: number; dy: number; opacite: number; cx: number; cy: number; taille: number }) {
  if (p.opacite <= 0) return
  const c = p.taille * H
  ctx.save()
  ctx.globalAlpha = p.opacite
  ctx.translate((p.cx + p.dx) * W, (p.cy + p.dy) * H); ctx.rotate((p.rotation * Math.PI) / 180)
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = W * 0.04; ctx.shadowOffsetY = W * 0.012
  ctx.fillStyle = COULEURS.beurre; ctx.beginPath(); ctx.moveTo(-c / 2, -c / 2); ctx.lineTo(c / 2, -c / 2); ctx.lineTo(c / 2, c / 2 - c * 0.14); ctx.lineTo(c / 2 - c * 0.14, c / 2); ctx.lineTo(-c / 2, c / 2); ctx.closePath(); ctx.fill()
  ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.moveTo(c / 2, c / 2 - c * 0.14); ctx.lineTo(c / 2 - c * 0.14, c / 2 - c * 0.14); ctx.lineTo(c / 2 - c * 0.14, c / 2); ctx.closePath(); ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(-c / 2, -c / 2, c, c * 0.12)
  ctx.fillStyle = COULEURS.prune; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 ${c * 0.62}px ${POLICES.titre}`
  ctx.fillText('?', 0, c * 0.04)
  ctx.restore()
}

/** Un vrai avis client : la carte, les etoiles une a une, la citation. */
export function dessinerAvis(ctx: Ctx, a: { texte: string; note: number; etoiles: number; echelle: number }, police: string, source: string) {
  if (a.echelle <= 0) return
  const l = W * 0.8, x = W * 0.1
  ctx.save()
  ctx.font = `700 ${W * 0.05}px ${police}`
  const mots = `« ${a.texte} »`.split(' ')
  const lignes: string[] = []
  let cur = ''
  for (const m of mots) { const e = cur ? `${cur} ${m}` : m; if (ctx.measureText(e).width > l - W * 0.12 && cur) { lignes.push(cur); cur = m } else cur = e }
  if (cur) lignes.push(cur)
  const hL = W * 0.066, h = W * 0.2 + lignes.length * hL + W * 0.09
  const y = H * 0.52 - h / 2
  ctx.translate(W / 2, H * 0.52); ctx.scale(a.echelle, a.echelle); ctx.translate(-W / 2, -H * 0.52)
  ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = W * 0.05; ctx.shadowOffsetY = W * 0.015
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(x, y, l, h, W * 0.05); ctx.fill()
  ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0
  for (let k = 0; k < 5; k++) {
    const sx = W / 2 + (k - 2) * W * 0.085, sy = y + W * 0.1, on = k < a.etoiles
    ctx.save(); ctx.translate(sx, sy); ctx.scale(on ? 1 : 0.85, on ? 1 : 0.85)
    ctx.fillStyle = on ? '#F2B01E' : '#E6E1D6'; ctx.beginPath()
    for (let i = 0; i < 10; i++) { const r = i % 2 ? W * 0.016 : W * 0.036, an = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r) }
    ctx.closePath(); ctx.fill(); ctx.restore()
  }
  ctx.fillStyle = COULEURS.brun; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${W * 0.05}px ${police}`
  lignes.forEach((ln, k) => ctx.fillText(ln, W / 2, y + W * 0.2 + k * hL + hL / 2))
  ctx.fillStyle = COULEURS.vert; ctx.font = `700 ${W * 0.03}px ${POLICES.titre}`
  ctx.fillText(source, W / 2, y + h - W * 0.06)
  ctx.restore()
}
