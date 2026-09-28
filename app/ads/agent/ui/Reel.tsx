'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bookmark, Camera, Download, Heart, Loader2, MessageCircle, MoreHorizontal, Music2, Pause, Play, RotateCcw, Send, Volume2, VolumeX } from 'lucide-react'
import { estRtl, type Langue } from '@/lib/ads/creatif-model'
import { H, IPS, W, douce, dureeTotale, etatPlan, nbImages, planA, transitionA, type EtatPlan, type Particule, type PlanReel } from '@/lib/ads/reel-model'
import { COULEURS, POLICES, policesPretes } from './polices'
import { TAUX, mixerPiste, type VoixPlacee } from './sons'
import s from './apercu.module.css'

/**
 * LE REEL ANIME : dessine en canvas, image par image, a partir de
 * lib/ads/reel-model.ts. L'apercu joue en direct ; l'export encode les memes
 * images en MP4 H.264 1080x1920 a 30 i/s (WebCodecs + mediabunny, dans le
 * navigateur : rien ne part sur un serveur).
 */

export type PlanDessin = PlanReel & { image: string | null; detourees: string[]; noms?: string[]; voixUrl?: string | null }
type Ressources = Map<string, HTMLImageElement>
type Ctx = CanvasRenderingContext2D

async function charger(urls: string[], res: Ressources) {
  await Promise.all(urls.filter((u) => u && !res.has(u)).map((u) => new Promise<void>((ok) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { res.set(u, img); ok() }
    img.onerror = () => ok()
    img.src = u
  })))
}

const OU: Record<Langue, string> = { fr: 'ou', darija: 'wla', ar: 'أو' }
const REPOND: Record<Langue, string> = { fr: 'Répond en quelques minutes', darija: 'Kanjawbo f d9aye9', ar: 'نرد خلال دقائق' }
const LIVRAISON: Record<Langue, string> = { fr: 'Livraison 24-48 h · paiement à la livraison', darija: 'Tawsil 24-48h · khelles mnin twsel', ar: 'توصيل 24-48 ساعة · الدفع عند الاستلام' }

function rondRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

function etoile(ctx: Ctx, x: number, y: number, r: number, rot: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath()
  for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, rr = k % 2 ? r * 0.28 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) }
  ctx.closePath(); ctx.fill(); ctx.restore()
}

/** Lignes d'un texte dans une largeur donnee (police deja posee). */
function couper(ctx: Ctx, texte: string, max: number): string[] {
  const out: string[] = []
  let l = ''
  for (const m of texte.split(/\s+/)) { const e = l ? `${l} ${m}` : m; if (ctx.measureText(e).width > max && l) { out.push(l); l = m } else l = e }
  if (l) out.push(l)
  return out
}

/* Un calque de travail reutilise (reflet des flacons, transitions). */
const calques = new Map<string, HTMLCanvasElement>()
function calque(nom: string, w: number, h: number) {
  let c = calques.get(nom)
  if (!c) { c = document.createElement('canvas'); calques.set(nom, c) }
  if (c.width !== Math.ceil(w)) c.width = Math.ceil(w)
  if (c.height !== Math.ceil(h)) c.height = Math.ceil(h)
  return c
}

/** Le flacon, avec la bande de lumiere de la signature Shine qui le traverse (clippee a sa silhouette). */
function flaconReflete(img: HTMLImageElement, w: number, h: number, p: number): HTMLCanvasElement {
  const c = calque('reflet', w, h)
  const x = c.getContext('2d')!
  x.clearRect(0, 0, c.width, c.height)
  x.globalCompositeOperation = 'source-over'
  x.drawImage(img, 0, 0, c.width, c.height)
  x.globalCompositeOperation = 'source-atop'
  const bx = -c.width * 0.7 + douce(p) * c.width * 2.4
  const g = x.createLinearGradient(bx - c.width * 0.35, 0, bx + c.width * 0.35, c.height * 0.45)
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.45, 'rgba(255,255,255,.12)')
  g.addColorStop(0.5, 'rgba(255,255,255,.7)'); g.addColorStop(0.55, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g; x.fillRect(0, 0, c.width, c.height)
  x.globalCompositeOperation = 'source-over'
  return c
}

function particulesAmbiance(ctx: Ctx, plan: PlanDessin, liste: Particule[]) {
  for (const q of liste) {
    if (q.alpha <= 0) continue
    ctx.save(); ctx.globalAlpha = q.alpha
    const x = q.x * W, y = q.y * H, r = q.r * W
    switch (plan.ambiance) {
      case 'etincelles': ctx.fillStyle = '#fff'; ctx.shadowColor = COULEURS.beurre; ctx.shadowBlur = r * 1.5; etoile(ctx, x, y, r, q.rot); break
      case 'gouttes':
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = r * 0.12
        ctx.beginPath(); ctx.moveTo(x, y - r * 1.8); ctx.quadraticCurveTo(x + r, y - r * 0.2, x, y + r); ctx.quadraticCurveTo(x - r, y - r * 0.2, x, y - r * 1.8); ctx.fill(); ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.1, r * 0.2, 0, Math.PI * 2); ctx.fill(); break
      case 'bulles':
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = Math.max(1.5, r * 0.08); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
        ctx.beginPath(); ctx.arc(x, y, r * 0.7, -2.4, -1.6); ctx.stroke(); break
      case 'sable': ctx.fillStyle = 'rgb(226,200,152)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); break
    }
    ctx.restore()
  }
}

/** Un plan, a son instant local, dans le repere 1080x1920. */
function dessinerPlan(ctx: Ctx, plans: PlanDessin[], i: number, local: number, res: Ressources, langue: Langue, bouton: string) {
  const k = ctx.canvas.width / W
  const plan = plans[i]
  const e: EtatPlan = etatPlan(plan, local, i === 0, i)
  const rtl = estRtl(langue)
  const police = rtl ? POLICES.arabe : POLICES.titre
  ctx.setTransform(k, 0, 0, k, e.secousse.dx * W * k, e.secousse.dy * H * k)

  // 1. Le decor (cover), ou le fond clair de la maison s'il n'est pas encore genere.
  const fond = plan.image ? res.get(plan.image) : undefined
  if (fond) {
    const ech = Math.max(W / fond.naturalWidth, H / fond.naturalHeight) * e.fond.echelle
    const w = fond.naturalWidth * ech, h = fond.naturalHeight * ech
    ctx.drawImage(fond, (W - w) / 2 + e.fond.dx * W, (H - h) / 2 + e.fond.dy * H, w, h)
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, COULEURS.creme); g.addColorStop(1, COULEURS.menthe)
    ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40)
    ctx.fillStyle = 'rgba(247,222,146,.55)'; ctx.beginPath(); ctx.arc(W * 0.82, H * 0.3, W * 0.32, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(155,48,112,.12)'; ctx.beginPath(); ctx.arc(W * 0.12, H * 0.62, W * 0.28, 0, Math.PI * 2); ctx.fill()
  }
  // Sur un decor : un voile en haut, le texte blanc reste lisible. Sur le fond clair : texte brun, sans voile.
  const clair = !fond
  if (!clair) {
    const voile = ctx.createLinearGradient(0, 0, 0, H * 0.46)
    voile.addColorStop(0, 'rgba(12,20,16,.5)'); voile.addColorStop(1, 'rgba(12,20,16,0)')
    ctx.fillStyle = voile; ctx.fillRect(0, 0, W, H * 0.46)
  }
  particulesAmbiance(ctx, plan, e.particules)

  // 2. La conversation DM : la carte, l'en-tete, les bulles, la fiche produit.
  if (e.dm) {
    const cx0 = W * 0.07, cw = W * 0.86, cy0 = H * 0.29, ch = H * 0.5
    ctx.save()
    ctx.globalAlpha = e.dm.carte
    ctx.translate(0, (1 - e.dm.carte) * H * 0.04)
    ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = W * 0.05; ctx.shadowOffsetY = W * 0.01
    ctx.fillStyle = '#fff'; rondRect(ctx, cx0, cy0, cw, ch, W * 0.045); ctx.fill()
    ctx.shadowColor = 'transparent'
    const av = W * 0.042, hy = cy0 + W * 0.075
    ctx.fillStyle = COULEURS.vert; ctx.beginPath(); ctx.arc(cx0 + W * 0.07, hy, av, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = `800 ${W * 0.04}px ${POLICES.titre}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('S', cx0 + W * 0.07, hy + W * 0.002)
    ctx.textAlign = 'left'; ctx.fillStyle = COULEURS.brun; ctx.font = `700 ${W * 0.036}px ${POLICES.titre}`; ctx.fillText('shinecosmetics.ma', cx0 + W * 0.13, hy - W * 0.016)
    ctx.fillStyle = '#7b857f'; ctx.font = `500 ${W * 0.027}px ${police}`; ctx.fillText(REPOND[langue], cx0 + W * 0.13, hy + W * 0.022)
    ctx.fillStyle = '#eceeed'; ctx.fillRect(cx0, cy0 + W * 0.15, cw, 2)
    // Les bulles, empilees ; si elles debordent, la conversation defile vers le haut.
    const ficheH = plan.produits ? H * 0.13 : 0
    const zoneY = cy0 + W * 0.18, zoneB = cy0 + ch - W * 0.04 - (ficheH ? ficheH + W * 0.03 : 0)
    const tb = W * 0.037, lh = tb * 1.3, pad = W * 0.03, maxW = cw * 0.68
    ctx.font = `500 ${tb}px ${police}`
    const blocs = e.dm.bulles.filter((b) => b.echelle > 0 || b.frappe > 0).map((b) => {
      const lignes = b.echelle > 0 ? couper(ctx, b.texte, maxW - pad * 2) : []
      const w = b.echelle > 0 ? Math.min(maxW, Math.max(...lignes.map((l) => ctx.measureText(l).width)) + pad * 2) : W * 0.16
      const h = b.echelle > 0 ? lignes.length * lh + pad * 1.2 : W * 0.085
      return { b, lignes, w, h }
    })
    const total = blocs.reduce((n, x) => n + x.h + W * 0.02, 0)
    let y = zoneY - Math.max(0, total - (zoneB - zoneY))
    ctx.save(); ctx.beginPath(); ctx.rect(cx0, zoneY - 2, cw, zoneB - zoneY + 4); ctx.clip()
    for (const { b, lignes, w, h } of blocs) {
      const droite = b.de === 'cliente'
      const x = droite ? cx0 + cw - W * 0.04 - w : cx0 + W * 0.04
      ctx.save()
      const sc = b.echelle > 0 ? b.echelle : 1
      ctx.translate(droite ? x + w : x, y + h); ctx.scale(sc, sc); ctx.translate(droite ? -(x + w) : -x, -(y + h))
      if (droite) { const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#8a3ffc'); g.addColorStop(1, '#3f6cf6'); ctx.fillStyle = g } else ctx.fillStyle = '#efefef'
      rondRect(ctx, x, y, w, h, Math.min(h / 2, W * 0.045)); ctx.fill()
      if (b.echelle > 0) {
        ctx.fillStyle = droite ? '#fff' : COULEURS.brun; ctx.font = `500 ${tb}px ${police}`; ctx.textBaseline = 'middle'
        ctx.textAlign = rtl ? 'right' : 'left'
        lignes.forEach((l, n) => ctx.fillText(l, rtl ? x + w - pad : x + pad, y + pad * 0.6 + lh * (n + 0.5)))
      } else {
        // Les trois points « en train d'ecrire ».
        ctx.fillStyle = droite ? 'rgba(255,255,255,.9)' : '#9aa19c'
        for (let d = 0; d < 3; d++) { const up = Math.max(0, Math.sin((b.frappe * 3 - d * 0.25) * Math.PI * 2)) * W * 0.008; ctx.beginPath(); ctx.arc(x + w * (0.3 + d * 0.2), y + h / 2 - up, W * 0.009, 0, Math.PI * 2); ctx.fill() }
      }
      ctx.restore()
      y += h + W * 0.02
    }
    ctx.restore()
    // La fiche produit envoyee par Shine (le flacon y est pose par l'etape 3).
    if (ficheH && e.dm.fiche > 0) {
      const fx = cx0 + W * 0.04, fy = cy0 + ch - W * 0.04 - ficheH, fw = cw * 0.8
      ctx.save(); ctx.translate(fx, fy + ficheH); ctx.scale(e.dm.fiche, e.dm.fiche); ctx.translate(-fx, -(fy + ficheH))
      ctx.fillStyle = '#f7f6f2'; ctx.strokeStyle = '#e4e1d8'; ctx.lineWidth = 2; rondRect(ctx, fx, fy, fw, ficheH, W * 0.035); ctx.fill(); ctx.stroke()
      ctx.fillStyle = COULEURS.brun; ctx.textAlign = rtl ? 'right' : 'left'; ctx.textBaseline = 'top'
      ctx.font = `700 ${W * 0.034}px ${police}`
      const tx = rtl ? fx + fw - W * 0.03 : fx + W * 0.27
      couper(ctx, plan.noms?.[0] || '', fw - W * 0.3).slice(0, 2).forEach((l, n) => ctx.fillText(l, tx, fy + W * 0.035 + n * W * 0.042))
      ctx.fillStyle = COULEURS.vert; ctx.font = `600 ${W * 0.026}px ${police}`; ctx.fillText(LIVRAISON[langue], tx, fy + ficheH - W * 0.06)
      ctx.restore()
    }
    ctx.restore()
  }

  // 3. Les vrais produits, detoures : trainee, ombre au sol, flacon (ecrase au contact), reflet.
  e.produits.forEach((p, j) => {
    const img = plan.detourees[j] ? res.get(plan.detourees[j]) : undefined
    if (!img || p.opacite <= 0) return
    const h = p.hauteur * H, w = (img.naturalWidth / img.naturalHeight) * h
    p.trainee.forEach((q, n) => {
      ctx.save(); ctx.globalAlpha = p.opacite * [0.14, 0.08, 0.04][n]
      ctx.translate(q.cx * W, q.bas * H); ctx.rotate((p.rotation * Math.PI) / 180); ctx.scale(p.echelle, p.echelle)
      ctx.drawImage(img, -w / 2, -h, w, h); ctx.restore()
    })
    if (p.ombre > 0 && plan.mouvement !== 'dm') {
      ctx.save()
      ctx.globalAlpha = 0.3 * Math.min(1, p.ombre)
      const g = ctx.createRadialGradient(p.cx * W, p.sol * H, 0, p.cx * W, p.sol * H, w * 0.45)
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.translate(p.cx * W, p.sol * H); ctx.scale(1, 0.16); ctx.translate(-p.cx * W, -p.sol * H)
      ctx.beginPath(); ctx.arc(p.cx * W, p.sol * H, w * 0.45, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
    ctx.save()
    ctx.globalAlpha = p.opacite
    ctx.translate(p.cx * W, p.bas * H)
    ctx.rotate((p.rotation * Math.PI) / 180)
    ctx.scale(p.echelle * (1 + p.ecrasement), p.echelle * (1 - p.ecrasement))
    ctx.drawImage(p.reflet != null ? flaconReflete(img, w * k, h * k, p.reflet) : img, -w / 2, -h, w, h)
    ctx.restore()
  })
  ctx.fillStyle = '#fff'
  for (const q of e.etincelles) { if (q.alpha <= 0) continue; ctx.save(); ctx.globalAlpha = q.alpha; ctx.shadowColor = COULEURS.beurre; ctx.shadowBlur = q.r * W * 1.2; etoile(ctx, q.x * W, q.y * H, q.r * W, q.rot); ctx.restore() }

  // 4. L'etiquette annotee : traits, pastilles.
  for (const pt of e.points) {
    if (pt.trait <= 0) continue
    ctx.save()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = W * 0.004; ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = W * 0.01
    ctx.beginPath(); ctx.moveTo(pt.px * W, pt.py * H); ctx.lineTo((pt.px + (pt.ax - pt.px) * pt.trait) * W, (pt.py + (pt.ay - pt.py) * pt.trait) * H); ctx.stroke()
    ctx.fillStyle = COULEURS.beurre; ctx.beginPath(); ctx.arc(pt.px * W, pt.py * H, W * 0.012, 0, Math.PI * 2); ctx.fill()
    ctx.lineWidth = W * 0.004; ctx.stroke()
    if (pt.etiquette > 0) {
      ctx.font = `700 ${W * 0.04}px ${police}`
      const tw = ctx.measureText(pt.texte).width + W * 0.065, th = W * 0.092
      const gauche = pt.ax < 0.5
      const x = gauche ? pt.ax * W - W * 0.05 : pt.ax * W - tw + W * 0.05, y = pt.ay * H - th / 2
      ctx.translate(pt.ax * W, pt.ay * H); ctx.scale(pt.etiquette, pt.etiquette); ctx.translate(-pt.ax * W, -pt.ay * H)
      ctx.shadowColor = 'rgba(0,0,0,.2)'; ctx.shadowBlur = W * 0.025
      ctx.fillStyle = COULEURS.creme; rondRect(ctx, x, y, tw, th, th / 2); ctx.fill()
      ctx.shadowColor = 'transparent'; ctx.fillStyle = COULEURS.brun; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(pt.texte, x + tw / 2, y + th / 2 + W * 0.002)
    }
    ctx.restore()
  }

  // 5. Le quiz : les reponses, le doigt qui touche.
  if (e.quiz) {
    e.quiz.choix.forEach((c, n) => {
      if (c.echelle <= 0) return
      ctx.save()
      ctx.font = `700 ${W * 0.042}px ${police}`
      const tw = Math.max(W * 0.56, ctx.measureText(c.texte).width + W * 0.2), th = W * 0.105
      const cx = W / 2, cy = H * (0.37 + n * 0.075)
      ctx.globalAlpha = 1 - 0.6 * c.eteint
      ctx.translate(cx, cy); ctx.scale(c.echelle, c.echelle)
      ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = W * 0.03
      ctx.fillStyle = c.choisi ? COULEURS.vert : '#fff'; rondRect(ctx, -tw / 2, -th / 2, tw, th, th / 2); ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.fillStyle = c.choisi ? '#fff' : COULEURS.prune; ctx.beginPath(); ctx.arc(-tw / 2 + th / 2, 0, th * 0.32, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = c.choisi ? COULEURS.vert : '#fff'; ctx.font = `800 ${W * 0.034}px ${POLICES.titre}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(c.choisi ? '✓' : 'ABC'[n], -tw / 2 + th / 2, W * 0.002)
      ctx.fillStyle = c.choisi ? '#fff' : COULEURS.brun; ctx.font = `700 ${W * 0.042}px ${police}`; ctx.fillText(c.texte, th * 0.3, W * 0.002)
      ctx.restore()
    })
    const d = e.quiz.doigt
    if (d) {
      ctx.save()
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = W * 0.005
      ctx.beginPath(); ctx.arc(d.x * W, d.y * H, W * (0.035 - 0.008 * d.appui), 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      if (d.appui > 0) { ctx.globalAlpha = d.appui; ctx.beginPath(); ctx.arc(d.x * W, d.y * H, W * (0.05 + 0.05 * (1 - d.appui)), 0, Math.PI * 2); ctx.stroke() }
      ctx.restore()
    }
  }

  // 6. Le « ou » du duo.
  if (e.chip && e.chip.echelle > 0) {
    ctx.save()
    ctx.translate(e.chip.cx * W, e.chip.cy * H); ctx.scale(e.chip.echelle, e.chip.echelle)
    ctx.fillStyle = COULEURS.prune; ctx.beginPath(); ctx.arc(0, 0, W * 0.07, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = `800 ${W * 0.052}px ${police}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(OU[langue], 0, W * 0.004)
    ctx.restore()
  }

  // 7. Le texte, mot par mot ; le mot mis en valeur sur un trait de surligneur beurre.
  const n = e.mots.length
  const taille = W * (n <= 4 ? 0.088 : n <= 7 ? 0.072 : 0.06)
  ctx.font = `800 ${taille}px ${police}`
  const espace = ctx.measureText(' ').width
  const largeurs = e.mots.map((m) => ctx.measureText(m.texte).width)
  const lignes: number[][] = [[]]
  let courante = 0
  largeurs.forEach((l, j) => {
    if (lignes[lignes.length - 1].length && courante + espace + l > W * 0.84) { lignes.push([]); courante = 0 }
    courante += (lignes[lignes.length - 1].length ? espace : 0) + l
    lignes[lignes.length - 1].push(j)
  })
  const hLigne = taille * 1.18
  lignes.forEach((ligne, li) => {
    const total = ligne.reduce((a, j, q) => a + largeurs[j] + (q ? espace : 0), 0)
    let x = rtl ? (W + total) / 2 : (W - total) / 2
    const y = e.texteHaut * H + li * hLigne + taille / 2
    for (const j of ligne) {
      const m = e.mots[j], l = largeurs[j]
      const cx = rtl ? x - l / 2 : x + l / 2
      if (m.opacite > 0) {
        ctx.save()
        ctx.globalAlpha = m.opacite
        ctx.translate(cx, y + m.dy * H); ctx.scale(m.echelle, m.echelle)
        if (m.accent) {
          ctx.save(); ctx.transform(1, 0, -0.12, 1, 0, 0)
          ctx.fillStyle = COULEURS.beurre; rondRect(ctx, -l / 2 - taille * 0.16, -taille * 0.5, l + taille * 0.32, taille * 1.02, taille * 0.14); ctx.fill()
          ctx.restore()
        }
        ctx.fillStyle = m.accent || clair ? COULEURS.brun : '#fff'
        ctx.shadowColor = m.accent || clair ? 'transparent' : 'rgba(0,0,0,.35)'; ctx.shadowBlur = taille * 0.25
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(m.texte, 0, taille * 0.04)
        ctx.restore()
      }
      x += rtl ? -(l + espace) : l + espace
    }
  })

  // 8. Carte de fin : le bouton vert qui pulse, et l'adresse.
  if (e.cta && e.cta.echelle > 0) {
    ctx.save()
    ctx.globalAlpha = e.cta.opacite
    ctx.translate(W / 2, e.cta.cy * H); ctx.scale(e.cta.echelle, e.cta.echelle)
    ctx.font = `800 ${W * 0.048}px ${police}`
    const lb = ctx.measureText(bouton).width + W * 0.12, hb = W * 0.12
    ctx.shadowColor = 'rgba(12,107,82,.45)'; ctx.shadowBlur = W * 0.04; ctx.shadowOffsetY = W * 0.008
    ctx.fillStyle = COULEURS.vert; rondRect(ctx, -lb / 2, -hb / 2, lb, hb, hb / 2); ctx.fill()
    ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(bouton, 0, W * 0.003)
    // L'adresse sur une pastille creme : lisible sur un decor sombre comme sur un fond clair.
    // Avec des badges de confiance, elle laisse la place (Instagram affiche deja le compte).
    if (!e.badges.length) {
      ctx.font = `700 ${W * 0.032}px ${POLICES.titre}`
      const la = ctx.measureText('shinecosmetics.ma').width + W * 0.05, ha = W * 0.06
      ctx.fillStyle = 'rgba(247,246,242,.94)'; rondRect(ctx, -la / 2, hb * 0.62, la, ha, ha / 2); ctx.fill()
      ctx.fillStyle = COULEURS.vert; ctx.fillText('shinecosmetics.ma', 0, hb * 0.62 + ha / 2 + W * 0.002)
    }
    ctx.restore()
  }

  // 8 bis. Les badges de confiance (entre les produits et le bouton) : la cliente marocaine
  // hesite a commander en ligne, on leve le frein la ou elle decide.
  if (e.badges.length) {
    let taille = W * 0.027
    ctx.font = `700 ${taille}px ${police}`
    const largeurs = () => e.badges.map((b) => ctx.measureText(`✓ ${b.texte}`).width + W * 0.045)
    let ls = largeurs()
    while (ls.reduce((n, l) => n + l, 0) + (ls.length - 1) * W * 0.015 > W * 0.92 && taille > W * 0.018) { taille -= W * 0.001; ctx.font = `700 ${taille}px ${police}`; ls = largeurs() }
    const hb = taille * 1.9, total = ls.reduce((n, l) => n + l, 0) + (ls.length - 1) * W * 0.015
    let x = (W - total) / 2
    const cy = H * 0.684
    e.badges.forEach((b, k) => {
      const l = ls[k]
      if (b.echelle > 0) {
        ctx.save()
        ctx.translate(x + l / 2, cy); ctx.scale(b.echelle, b.echelle)
        ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = W * 0.015
        ctx.fillStyle = 'rgba(247,246,242,.96)'; rondRect(ctx, -l / 2, -hb / 2, l, hb, hb / 2); ctx.fill()
        ctx.shadowColor = 'transparent'
        ctx.fillStyle = COULEURS.vert; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(`✓ ${b.texte}`, 0, taille * 0.05)
        ctx.restore()
      }
      x += l + W * 0.015
    })
  }

  // 8 ter. Le sticker de prix : une pastille prune qui tombe en tournant, en haut a droite des produits.
  if (e.sticker && e.sticker.echelle > 0) {
    const r = W * 0.088
    ctx.save()
    ctx.translate(W * 0.8, H * 0.4); ctx.rotate((e.sticker.rotation * Math.PI) / 180); ctx.scale(e.sticker.echelle, e.sticker.echelle)
    ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = W * 0.02; ctx.shadowOffsetY = W * 0.006
    ctx.fillStyle = COULEURS.prune; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
    ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = W * 0.004; ctx.setLineDash([W * 0.008, W * 0.007])
    ctx.beginPath(); ctx.arc(0, 0, r * 0.84, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
    const [montant, ...unite] = e.sticker.texte.split(' ')
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `800 ${W * (montant.length > 3 ? 0.047 : 0.055)}px ${POLICES.titre}`; ctx.fillText(montant, 0, -r * 0.1)
    ctx.font = `700 ${W * 0.026}px ${POLICES.titre}`; ctx.fillText(unite.join(' ') || 'DH', 0, r * 0.42)
    ctx.restore()
  }

  // 9. La coupe franche : un voile blanc tres bref, sur le temps.
  ctx.setTransform(k, 0, 0, k, 0, 0)
  if (e.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${e.flash})`; ctx.fillRect(0, 0, W, H) }
}

/** Une image du Reel a l'instant t, transitions comprises (le canvas peut etre plus petit que 1080x1920). */
export function dessiner(ctx: Ctx, plans: PlanDessin[], t: number, res: Ressources, langue: Langue, bouton: string) {
  const { i, local } = planA(plans, t)
  const tr = transitionA(plans, i, local)
  if (!tr) { dessinerPlan(ctx, plans, i, local, res, langue, bouton); return }
  // Pendant une transition : le plan d'avant (fige sur sa derniere image) et le nouveau, sur deux calques.
  const cw = ctx.canvas.width, chh = ctx.canvas.height
  const a = calque('avant', cw, chh), b = calque('apres', cw, chh)
  dessinerPlan(a.getContext('2d')!, plans, i - 1, plans[i - 1].duree, res, langue, bouton)
  dessinerPlan(b.getContext('2d')!, plans, i, local, res, langue, bouton)
  const p = douce(tr.p)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, cw, chh)
  switch (tr.type) {
    case 'traversee': {
      // On traverse le plan d'avant : il grossit et s'efface sur le nouveau.
      ctx.drawImage(b, 0, 0)
      const e = 1 + 2.4 * tr.p * tr.p
      ctx.globalAlpha = 1 - p
      ctx.drawImage(a, (cw - cw * e) / 2, (chh - chh * e) * 0.55, cw * e, chh * e)
      ctx.globalAlpha = 1
      break
    }
    case 'balayage': {
      // Whip pan : les deux plans filent vers la gauche, floutes par la vitesse (au plus fort a mi-course).
      const x = -cw * p
      ctx.filter = `blur(${Math.round(cw * 0.022 * Math.sin(Math.PI * tr.p))}px)`
      ctx.drawImage(a, x, 0)
      ctx.drawImage(b, x + cw, 0)
      ctx.filter = 'none'
      break
    }
    case 'revelation': {
      // Le nouveau plan s'ouvre en cercle depuis le centre, cerne d'un anneau beurre.
      ctx.drawImage(a, 0, 0)
      const r = Math.hypot(cw, chh) * 0.62 * p
      ctx.save(); ctx.beginPath(); ctx.arc(cw / 2, chh * 0.55, r, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(b, 0, 0); ctx.restore()
      ctx.strokeStyle = COULEURS.beurre; ctx.lineWidth = cw * 0.02 * (1 - p); ctx.beginPath(); ctx.arc(cw / 2, chh * 0.55, r, 0, Math.PI * 2); ctx.stroke()
      break
    }
    case 'vague': {
      // Une lame verte ondulee monte et devoile le nouveau plan.
      ctx.drawImage(a, 0, 0)
      const base = chh * (1.08 - 1.16 * p), amp = chh * 0.025
      const bord = (dy: number) => { ctx.beginPath(); ctx.moveTo(0, chh); for (let x = 0; x <= cw; x += cw / 24) ctx.lineTo(x, base + dy + amp * Math.sin((x / cw) * Math.PI * 3 + tr.p * 7)); ctx.lineTo(cw, chh); ctx.closePath() }
      ctx.fillStyle = COULEURS.vert; bord(-chh * 0.04); ctx.fill()
      ctx.save(); bord(0); ctx.clip(); ctx.drawImage(b, 0, 0); ctx.restore()
      break
    }
  }
}

const urlsDe = (plans: PlanDessin[]) => plans.flatMap((p) => [p.image, ...p.detourees]).filter((u): u is string => Boolean(u))
const debutDe = (plans: PlanDessin[], i: number) => plans.slice(0, i).reduce((n, p) => n + p.duree, 0)
/** Les voix off posees : 0,15 s apres le debut de leur plan. */
const voixDe = (plans: PlanDessin[]): VoixPlacee[] => plans.flatMap((p, i) => (p.voixUrl ? [{ url: p.voixUrl, debut: debutDe(plans, i) + 0.15 }] : []))

/**
 * L'interface d'Instagram par-dessus le Reel : ce qu'elle cache (le haut, la
 * colonne d'icones a droite, la legende et le bouton en bas). On voit ainsi,
 * avant de publier, si un texte ou un flacon passe dessous.
 */
function HabillageReel({ bouton, legende }: { bouton: string; legende: string }) {
  return (
    <div className={s.igReel} aria-hidden>
      <div className={s.igHaut}><b>Reels</b><Camera size={16} /></div>
      <div className={s.igDroite}><span><Heart size={18} /><small>2,4 k</small></span><span><MessageCircle size={18} /><small>86</small></span><span><Send size={18} /></span><span><Bookmark size={18} /></span><span><MoreHorizontal size={18} /></span></div>
      <div className={s.igBas}>
        <p className={s.igCompte}><i>S</i><b>shinecosmetics.ma</b><small>Sponsorisé</small></p>
        <p className={s.igLegende}>{legende.slice(0, 80)}{legende.length > 80 ? '… plus' : ''}</p>
        <p className={s.igSon}><Music2 size={11} /> Son original · shinecosmetics.ma</p>
        <span className={s.igBouton}>{bouton} ›</span>
      </div>
      <div className={s.igZones}><i style={{ top: '14%' }} /><i style={{ top: '80%' }} /></div>
    </div>
  )
}

export function LecteurReel({ plans: plansRecus, langue, bouton, largeur = 260, nom, selection, choisirPlan, habillage, legende = '' }: {
  plans: PlanDessin[]; langue: Langue; bouton: string; largeur?: number; nom: string
  selection?: number | null; choisirPlan?: (i: number) => void
  habillage?: boolean; legende?: string
}) {
  // Le parent refabrique ses plans a chaque rendu : sans cette cle, la lecture redemarrait
  // sans cesse (et l'apercu repeignait un instant proche de 0).
  const cleDessin = JSON.stringify(plansRecus)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plans = useMemo(() => plansRecus, [cleDessin])
  const canvas = useRef<HTMLCanvasElement>(null)
  const res = useRef<Ressources>(new Map())
  const [pret, setPret] = useState(false)
  const [lecture, setLecture] = useState(true)
  const [t, setT] = useState(0)
  const [export_, setExport] = useState<number | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  // Le son : coupe par defaut (un navigateur ne joue un son qu'apres un geste), bruitages et voix separables.
  const [son, setSon] = useState(false)
  const [bruitages, setBruitages] = useState(true)
  const [avecVoix, setAvecVoix] = useState(true)
  const [piste, setPiste] = useState<AudioBuffer | null>(null)
  const audio = useRef<{ ctx: AudioContext; source: AudioBufferSourceNode | null } | null>(null)
  const total = dureeTotale(plans)
  const cle = urlsDe(plans).join('|')
  const origine = useRef(0)
  // La boucle d'animation lit ces references : une pause decidee ailleurs (clic sur un plan)
  // s'applique tout de suite, sans qu'une image deja programmee ecrase la position choisie.
  const enLecture = useRef(lecture)
  enLecture.current = lecture
  const raf = useRef(0)
  const figer = (x: number) => { enLecture.current = false; cancelAnimationFrame(raf.current); setLecture(false); setT(x) }
  const voix = avecVoix ? voixDe(plans) : []
  const cleSon = JSON.stringify([plans.map((p) => [p.mouvement, p.duree, p.produits, p.transition, p.bulles?.length, p.points?.length, p.choix?.length]), bruitages, voix])

  useEffect(() => {
    let vivant = true
    setPret(false)
    void Promise.all([policesPretes(), charger(urlsDe(plans), res.current)]).then(() => { if (vivant) setPret(true) })
    return () => { vivant = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle])

  // La piste se refabrique quand le montage change (un peu apres la derniere retouche).
  useEffect(() => {
    let vivant = true
    const h = setTimeout(() => { void mixerPiste(plans, { bruitages, voix }).then((b) => { if (vivant) setPiste(b) }).catch(() => {}) }, 350)
    return () => { vivant = false; clearTimeout(h) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleSon])

  const couperSon = () => { try { audio.current?.source?.stop() } catch { /* deja arretee */ } if (audio.current) audio.current.source = null }
  const jouerSon = useCallback((depuis: number) => {
    couperSon()
    if (!son || !piste) return
    audio.current ||= { ctx: new AudioContext(), source: null }
    const { ctx } = audio.current
    void ctx.resume()
    const src = ctx.createBufferSource()
    src.buffer = piste; src.loop = true; src.loopStart = 0; src.loopEnd = Math.min(total, piste.duration)
    src.connect(ctx.destination); src.start(0, Math.max(0, depuis % total))
    audio.current.source = src
  }, [son, piste, total])
  useEffect(() => () => { couperSon(); void audio.current?.ctx.close() }, [])

  const peindre = useCallback((instant: number) => {
    const ctx = canvas.current?.getContext('2d')
    if (ctx && plans.length) dessiner(ctx, plans, instant, res.current, langue, bouton)
  }, [plans, langue, bouton])

  useEffect(() => {
    if (!pret) return
    if (!lecture) { couperSon(); peindre(t); return }
    origine.current = performance.now() - t * 1000
    jouerSon(t)
    const boucle = (now: number) => {
      if (!enLecture.current) return
      const instant = ((now - origine.current) / 1000) % total
      setT(instant); peindre(instant)
      raf.current = requestAnimationFrame(boucle)
    }
    raf.current = requestAnimationFrame(boucle)
    return () => { cancelAnimationFrame(raf.current); couperSon() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pret, lecture, peindre, total, jouerSon])

  // Choisir un plan dans la table de montage : l'apercu s'y place, en pause.
  useEffect(() => {
    if (selection == null || selection < 0 || selection >= plans.length) return
    const x = debutDe(plans, selection) + Math.min(0.9, plans[selection].duree * 0.4)
    figer(x); peindre(x)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection])

  const exporter = async () => {
    setErreur(null)
    if (typeof VideoEncoder === 'undefined') { setErreur('L’export vidéo demande Chrome ou Edge (sur ordinateur ou Android).'); return }
    setExport(0)
    try {
      const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource, QUALITY_HIGH, canEncodeVideo, canEncodeAudio } = await import('mediabunny')
      if (!(await canEncodeVideo('avc', { width: W, height: H }))) throw new Error('Ce navigateur ne sait pas encoder en H.264.')
      await policesPretes(); await charger(urlsDe(plans), res.current)
      const toile = document.createElement('canvas')
      toile.width = W; toile.height = H
      const ctx = toile.getContext('2d')!
      const sortie = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
      const source = new CanvasSource(toile, { codec: 'avc', quality: QUALITY_HIGH })
      sortie.addVideoTrack(source, { frameRate: IPS })
      // La bande-son : en AAC, le format qu'Instagram attend. Sans AAC, la video part muette (et on le dit).
      const bande = bruitages || voix.length ? await mixerPiste(plans, { bruitages, voix }) : null
      const avecSon = bande && (await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: TAUX }))
      const sonPiste = avecSon ? new AudioBufferSource({ codec: 'aac', quality: QUALITY_HIGH }) : null
      if (sonPiste) sortie.addAudioTrack(sonPiste)
      await sortie.start()
      if (sonPiste && bande) await sonPiste.add(bande)
      const n = nbImages(plans)
      for (let f = 0; f < n; f++) {
        dessiner(ctx, plans, f / IPS, res.current, langue, bouton)
        await source.add(f / IPS, 1 / IPS)
        if (f % 10 === 0) setExport(Math.round((f / n) * 100))
      }
      await sortie.finalize()
      const blob = new Blob([sortie.target.buffer!], { type: 'video/mp4' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = `${nom}.mp4`; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      if (bande && !avecSon) setErreur('Vidéo exportée sans le son : ce navigateur n’encode pas l’AAC.')
    } catch (e) { setErreur(e instanceof Error ? e.message : 'Export impossible') }
    finally { setExport(null) }
  }

  let debut = 0
  return (
    <div className={s.reel} style={{ width: largeur }}>
      <div className={`${s.telephone} ${s.story}`}>
        <canvas ref={canvas} width={540} height={960} className={s.reelCanvas} aria-label="Aperçu du Reel animé" />
        {habillage && pret && <HabillageReel bouton={bouton} legende={legende} />}
        {!pret && <div className={s.reelAttente}><Loader2 size={18} className={s.tourne} /> Détourage des produits…</div>}
      </div>
      <div className={s.reelFrise} role="group" aria-label="Plans du Reel">
        {plans.map((p, i) => {
          const d = debut; debut += p.duree
          const actif = t >= d && t < d + p.duree
          return <button key={i} type="button" style={{ flex: p.duree }} className={`${actif ? s.reelPlanActif : ''} ${selection === i ? s.reelPlanChoisi : ''}`} title={`Plan ${i + 1} · ${p.mouvement} · ${p.duree} s`}
            onClick={() => { if (choisirPlan) choisirPlan(i); else { figer(d + 0.6); peindre(d + 0.6) } }}><i style={{ width: actif ? `${((t - d) / p.duree) * 100}%` : t >= d + p.duree ? '100%' : 0 }} /></button>
        })}
      </div>
      <div className={s.reelBoutons}>
        <button type="button" onClick={() => setLecture((x) => !x)} aria-label={lecture ? 'Pause' : 'Lecture'}>{lecture ? <Pause size={14} /> : <Play size={14} />}</button>
        <button type="button" onClick={() => { setT(0); origine.current = performance.now(); if (lecture) jouerSon(0); else peindre(0) }} aria-label="Revenir au début"><RotateCcw size={14} /></button>
        <button type="button" onClick={() => setSon((x) => !x)} aria-pressed={son} aria-label={son ? 'Couper le son' : 'Écouter le son'} title={son ? 'Couper le son' : 'Écouter (bruitages et voix off)'}>{son ? <Volume2 size={14} /> : <VolumeX size={14} />}</button>
        <span>{t.toFixed(1)} / {total.toFixed(1)} s</span>
        <button type="button" className={s.reelExport} disabled={export_ != null || !pret} onClick={() => void exporter()}>
          {export_ != null ? <><Loader2 size={13} className={s.tourne} /> {export_} %</> : <><Download size={13} /> MP4</>}
        </button>
      </div>
      <div className={s.reelOptionsSon}>
        <label><input type="checkbox" checked={bruitages} onChange={(e) => setBruitages(e.target.checked)} /> Bruitages</label>
        <label><input type="checkbox" checked={avecVoix} onChange={(e) => setAvecVoix(e.target.checked)} disabled={!plans.some((p) => p.voixUrl)} /> Voix off{plans.some((p) => p.voixUrl) ? '' : ' (aucune)'}</label>
      </div>
      {erreur && <p className={s.reelErreur}>{erreur}</p>}
    </div>
  )
}
