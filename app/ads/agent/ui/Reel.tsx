'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Loader2, Pause, Play, RotateCcw } from 'lucide-react'
import { estRtl, type Langue } from '@/lib/ads/creatif-model'
import { H, IPS, W, disposition, dureeTotale, etatPlan, nbImages, planA, type PlanReel } from '@/lib/ads/reel-model'
import { COULEURS, POLICES, policesPretes } from './polices'
import s from './apercu.module.css'

/**
 * LE REEL ANIME : dessine en canvas, image par image, a partir de
 * lib/ads/reel-model.ts. L'apercu joue en direct ; l'export encode les memes
 * images en MP4 H.264 1080x1920 a 30 i/s (WebCodecs + mediabunny, dans le
 * navigateur : rien ne part sur un serveur).
 */

export type PlanDessin = PlanReel & { image: string | null; detourees: string[] }
type Ressources = Map<string, HTMLImageElement>

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

function rondRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

/** Une image du Reel, a l'instant t, dans le repere 1080x1920 (le canvas peut etre plus petit). */
export function dessiner(ctx: CanvasRenderingContext2D, plans: PlanDessin[], t: number, res: Ressources, langue: Langue, bouton: string) {
  const k = ctx.canvas.width / W
  ctx.setTransform(k, 0, 0, k, 0, 0)
  const { i, local } = planA(plans, t)
  const plan = plans[i]
  const e = etatPlan(plan, local, i === 0)
  const rtl = estRtl(langue)
  const police = rtl ? POLICES.arabe : POLICES.titre

  // 1. Le decor (cover), ou le degrade de la maison s'il n'est pas encore genere.
  const fond = plan.image ? res.get(plan.image) : undefined
  if (fond) {
    const ech = Math.max(W / fond.naturalWidth, H / fond.naturalHeight) * e.fond.echelle
    const w = fond.naturalWidth * ech, h = fond.naturalHeight * ech
    ctx.drawImage(fond, (W - w) / 2 + e.fond.dx * W, (H - h) / 2 + e.fond.dy * H, w, h)
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, COULEURS.creme); g.addColorStop(1, COULEURS.menthe)
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(247,222,146,.55)'; ctx.beginPath(); ctx.arc(W * 0.82, H * 0.3, W * 0.32, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(155,48,112,.12)'; ctx.beginPath(); ctx.arc(W * 0.12, H * 0.62, W * 0.28, 0, Math.PI * 2); ctx.fill()
  }
  // Sur un decor : un voile en haut, le texte blanc reste lisible sur n'importe quelle photo.
  // Sur le fond clair de la maison (decor pas encore genere) : texte brun, sans voile.
  const clair = !fond
  if (!clair) {
    const voile = ctx.createLinearGradient(0, 0, 0, H * 0.46)
    voile.addColorStop(0, 'rgba(12,20,16,.5)'); voile.addColorStop(1, 'rgba(12,20,16,0)')
    ctx.fillStyle = voile; ctx.fillRect(0, 0, W, H * 0.46)
  }

  // 2. Les vrais produits, detoures : ombre au sol, puis le flacon (ecrase au contact).
  const sol = disposition(plan.produits, plan.mouvement === 'fin')
  e.produits.forEach((p, j) => {
    const img = plan.detourees[j] ? res.get(plan.detourees[j]) : undefined
    if (!img || p.opacite <= 0) return
    const h = p.hauteur * H, w = (img.naturalWidth / img.naturalHeight) * h
    const base = sol[j] ?? sol[0]
    ctx.save()
    ctx.globalAlpha = 0.3 * Math.min(1, p.ombre)
    const ombre = ctx.createRadialGradient(p.cx * W, base.bas * H, 0, p.cx * W, base.bas * H, w * 0.45)
    ombre.addColorStop(0, 'rgba(0,0,0,1)'); ombre.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = ombre
    ctx.setTransform(k, 0, 0, k * 0.16, 0, base.bas * H * k * (1 - 0.16))
    ctx.beginPath(); ctx.arc(p.cx * W, base.bas * H, w * 0.45, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    ctx.save()
    ctx.globalAlpha = p.opacite
    ctx.translate(p.cx * W, p.bas * H)
    ctx.rotate((p.rotation * Math.PI) / 180)
    ctx.scale(p.echelle * (1 + p.ecrasement), p.echelle * (1 - p.ecrasement))
    ctx.drawImage(img, -w / 2, -h, w, h)
    ctx.restore()
  })

  // 3. Le « ou » du duo.
  if (e.chip && e.chip.echelle > 0) {
    ctx.save()
    ctx.translate(e.chip.cx * W, e.chip.cy * H); ctx.scale(e.chip.echelle, e.chip.echelle)
    ctx.fillStyle = COULEURS.prune; ctx.beginPath(); ctx.arc(0, 0, W * 0.07, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = `800 ${W * 0.052}px ${police}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(OU[langue], 0, W * 0.004)
    ctx.restore()
  }

  // 4. Le texte, mot par mot ; le mot mis en valeur sur un trait de surligneur beurre.
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

  // 5. Carte de fin : le bouton vert qui pulse, et l'adresse.
  if (e.cta && e.cta.echelle > 0) {
    ctx.save()
    ctx.globalAlpha = e.cta.opacite
    ctx.translate(W / 2, e.cta.cy * H); ctx.scale(e.cta.echelle, e.cta.echelle)
    ctx.font = `800 ${W * 0.048}px ${police}`
    const lb = ctx.measureText(bouton).width + W * 0.12, hb = W * 0.12
    ctx.shadowColor = 'rgba(12,107,82,.45)'; ctx.shadowBlur = W * 0.04; ctx.shadowOffsetY = W * 0.008
    ctx.fillStyle = COULEURS.vert; rondRect(ctx, -lb / 2, -hb / 2, lb, hb, hb / 2); ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(bouton, 0, W * 0.003)
    // L'adresse sur une pastille creme : lisible sur un decor sombre comme sur un fond clair.
    ctx.font = `700 ${W * 0.032}px ${POLICES.titre}`
    const la = ctx.measureText('shinecosmetics.ma').width + W * 0.05, ha = W * 0.06
    ctx.fillStyle = 'rgba(247,246,242,.94)'; rondRect(ctx, -la / 2, hb * 0.62, la, ha, ha / 2); ctx.fill()
    ctx.fillStyle = COULEURS.vert; ctx.fillText('shinecosmetics.ma', 0, hb * 0.62 + ha / 2 + W * 0.002)
    ctx.restore()
  }

  // 6. La coupe : un voile blanc tres bref, sur le temps.
  if (e.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${e.flash})`; ctx.fillRect(0, 0, W, H) }
}

const urlsDe = (plans: PlanDessin[]) => plans.flatMap((p) => [p.image, ...p.detourees]).filter((u): u is string => Boolean(u))

export function LecteurReel({ plans, langue, bouton, largeur = 260, nom }: { plans: PlanDessin[]; langue: Langue; bouton: string; largeur?: number; nom: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const res = useRef<Ressources>(new Map())
  const [pret, setPret] = useState(false)
  const [lecture, setLecture] = useState(true)
  const [t, setT] = useState(0)
  const [export_, setExport] = useState<number | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const total = dureeTotale(plans)
  const cle = urlsDe(plans).join('|')
  const origine = useRef(0)

  useEffect(() => {
    let vivant = true
    setPret(false)
    void Promise.all([policesPretes(), charger(urlsDe(plans), res.current)]).then(() => { if (vivant) setPret(true) })
    return () => { vivant = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle])

  const peindre = useCallback((instant: number) => {
    const ctx = canvas.current?.getContext('2d')
    if (ctx && plans.length) dessiner(ctx, plans, instant, res.current, langue, bouton)
  }, [plans, langue, bouton])

  useEffect(() => {
    if (!pret) return
    if (!lecture) { peindre(t); return }
    let id = 0
    origine.current = performance.now() - t * 1000
    const boucle = (now: number) => {
      const instant = ((now - origine.current) / 1000) % total
      setT(instant); peindre(instant)
      id = requestAnimationFrame(boucle)
    }
    id = requestAnimationFrame(boucle)
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pret, lecture, peindre, total])

  const exporter = async () => {
    setErreur(null)
    if (typeof VideoEncoder === 'undefined') { setErreur('L’export vidéo demande Chrome ou Edge (sur ordinateur ou Android).'); return }
    setExport(0)
    try {
      const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, QUALITY_HIGH, canEncodeVideo } = await import('mediabunny')
      if (!(await canEncodeVideo('avc', { width: W, height: H }))) throw new Error('Ce navigateur ne sait pas encoder en H.264.')
      await policesPretes(); await charger(urlsDe(plans), res.current)
      const toile = document.createElement('canvas')
      toile.width = W; toile.height = H
      const ctx = toile.getContext('2d')!
      const sortie = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
      const source = new CanvasSource(toile, { codec: 'avc', quality: QUALITY_HIGH })
      sortie.addVideoTrack(source, { frameRate: IPS })
      await sortie.start()
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
    } catch (e) { setErreur(e instanceof Error ? e.message : 'Export impossible') }
    finally { setExport(null) }
  }

  let debut = 0
  return (
    <div className={s.reel} style={{ width: largeur }}>
      <div className={`${s.telephone} ${s.story}`}>
        <canvas ref={canvas} width={540} height={960} className={s.reelCanvas} aria-label="Aperçu du Reel animé" />
        {!pret && <div className={s.reelAttente}><Loader2 size={18} className={s.tourne} /> Détourage des produits…</div>}
      </div>
      <div className={s.reelFrise} role="group" aria-label="Plans du Reel">
        {plans.map((p, i) => {
          const d = debut; debut += p.duree
          const actif = t >= d && t < d + p.duree
          return <button key={i} type="button" style={{ flex: p.duree }} className={actif ? s.reelPlanActif : undefined} title={`Plan ${i + 1} · ${p.duree} s`}
            onClick={() => { setLecture(false); setT(d + 0.6); peindre(d + 0.6) }}><i style={{ width: actif ? `${((t - d) / p.duree) * 100}%` : t >= d + p.duree ? '100%' : 0 }} /></button>
        })}
      </div>
      <div className={s.reelBoutons}>
        <button type="button" onClick={() => setLecture((x) => !x)} aria-label={lecture ? 'Pause' : 'Lecture'}>{lecture ? <Pause size={14} /> : <Play size={14} />}</button>
        <button type="button" onClick={() => { setT(0); origine.current = performance.now(); if (!lecture) peindre(0) }} aria-label="Revenir au début"><RotateCcw size={14} /></button>
        <span>{t.toFixed(1)} / {total.toFixed(1)} s</span>
        <button type="button" className={s.reelExport} disabled={export_ != null || !pret} onClick={() => void exporter()}>
          {export_ != null ? <><Loader2 size={13} className={s.tourne} /> {export_} %</> : <><Download size={13} /> MP4</>}
        </button>
      </div>
      {erreur && <p className={s.reelErreur}>{erreur}</p>}
    </div>
  )
}
