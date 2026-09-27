'use client'

import { Bookmark, ChevronRight, Heart, MessageCircle, MoreHorizontal, Send } from 'lucide-react'
import { FORMATS_IMAGE, estRtl, type FormatImage, type Langue } from '@/lib/ads/creatif-model'
import s from './apercu.module.css'

/**
 * L'APERCU D'UNE PUB TELLE QU'ELLE APPARAITRA SUR INSTAGRAM — et l'export du
 * visuel pret a charger dans Meta.
 *
 * Le visuel (image + accroche + marque) est dessine deux fois avec les MEMES
 * proportions : en HTML pour l'apercu, en canvas pour le fichier. Ce que l'on
 * voit est ce que l'on telecharge. L'accroche est posee par nous, jamais par le
 * modele d'image : l'arabe s'ecrit de droite a gauche, correctement.
 */

export type Visuel = { format: FormatImage; image: string | null; accroche: string; langue: Langue; surimpression: boolean; position: 'haut' | 'bas' }

const POLICE_AR = '"Noto Naskh Arabic", "Segoe UI", Tahoma, "Geeza Pro", sans-serif'
const POLICE = '"DM Sans", "Segoe UI", system-ui, sans-serif'

// Proportions communes a l'apercu et a l'export (en fraction de la largeur).
const P = { marge: 0.075, titre: { feed: 0.068, story: 0.074, carre: 0.07 }, marque: 0.026, degrade: 0.42 }

/** Le visuel seul (image + surimpression), a la largeur de son conteneur. */
export function CreatifVisuel({ v, largeur }: { v: Visuel; largeur: number }) {
  const rtl = estRtl(v.langue)
  const taille = largeur * P.titre[v.format]
  return (
    <div className={s.visuel} style={{ aspectRatio: String(FORMATS_IMAGE[v.format].ratio) }}>
      {v.image ? <img src={v.image} alt="" className={s.image} crossOrigin="anonymous" /> : <div className={s.vide}>Pas encore de visuel</div>}
      {v.surimpression && v.accroche && (
        <>
          <div className={s.degrade} style={{ [v.position === 'haut' ? 'top' : 'bottom']: 0, height: `${P.degrade * 100}%`, background: `linear-gradient(${v.position === 'haut' ? '180deg' : '0deg'}, rgba(0,0,0,.62), rgba(0,0,0,0))` }} />
          <p className={s.titre} dir={rtl ? 'rtl' : 'ltr'} style={{ fontSize: taille, lineHeight: 1.12, padding: `0 ${largeur * P.marge}px`, [v.position === 'haut' ? 'top' : 'bottom']: largeur * (v.format === 'story' ? 0.2 : P.marge), fontFamily: rtl ? POLICE_AR : POLICE, textAlign: rtl ? 'right' : 'left' }}>{v.accroche}</p>
        </>
      )}
      <span className={s.marque} style={{ fontSize: largeur * P.marque, [rtl ? 'left' : 'right']: largeur * P.marge, bottom: largeur * (v.format === 'story' ? 0.2 : 0.045) }}>shinecosmetics.ma</span>
    </div>
  )
}

function Tete({ rtl }: { rtl: boolean }) {
  return (
    <div className={s.tete} dir="ltr">
      <span className={s.avatar}>S</span>
      <span className={s.nom}><b>shinecosmetics.ma</b><small>{rtl ? 'ممول' : 'Sponsorisé'}</small></span>
      <MoreHorizontal size={16} />
    </div>
  )
}

/** Fil Instagram (4:5 ou carre) : en-tete, visuel, bouton, icones, legende. */
export function ApercuFeed({ v, legende, bouton, largeur = 320 }: { v: Visuel; legende: string; bouton: string; largeur?: number }) {
  const rtl = estRtl(v.langue)
  return (
    <div className={s.telephone} style={{ width: largeur }}>
      <Tete rtl={rtl} />
      <CreatifVisuel v={v} largeur={largeur} />
      <div className={s.bouton} dir={rtl ? 'rtl' : 'ltr'}><span>{bouton}</span><ChevronRight size={16} style={rtl ? { transform: 'scaleX(-1)' } : undefined} /></div>
      <div className={s.icones}><Heart size={20} /><MessageCircle size={20} /><Send size={20} /><Bookmark size={20} className={s.droite} /></div>
      <p className={s.legende} dir={rtl ? 'rtl' : 'ltr'}><b dir="ltr">shinecosmetics.ma</b> {legende.length > 140 ? <>{legende.slice(0, 140)}<span className={s.plus}>… {rtl ? 'المزيد' : 'plus'}</span></> : legende}</p>
    </div>
  )
}

/** Story ou Reel (9:16) : plein ecran, barre de progression, bouton en bas. */
export function ApercuStory({ v, legende, bouton, largeur = 250, reel = false }: { v: Visuel; legende: string; bouton: string; largeur?: number; reel?: boolean }) {
  const rtl = estRtl(v.langue)
  return (
    <div className={`${s.telephone} ${s.story}`} style={{ width: largeur }}>
      <CreatifVisuel v={{ ...v, format: 'story' }} largeur={largeur} />
      <div className={s.storyHaut}>
        {!reel && <div className={s.progression}><i /></div>}
        <div className={s.teteStory} dir="ltr"><span className={s.avatar}>S</span><b>shinecosmetics.ma</b><small>{rtl ? 'ممول' : 'Sponsorisé'}</small></div>
      </div>
      <div className={s.storyBas} dir={rtl ? 'rtl' : 'ltr'}>
        {reel && <p className={s.legendeReel}><b dir="ltr">shinecosmetics.ma</b> {legende.slice(0, 90)}{legende.length > 90 ? '…' : ''}</p>}
        <span className={s.pilule}>{bouton}</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* EXPORT : le meme visuel, dessine en canvas a la taille Meta          */
/* ------------------------------------------------------------------ */

function lignes(ctx: CanvasRenderingContext2D, texte: string, max: number): string[] {
  const mots = texte.split(/\s+/)
  const out: string[] = []
  let ligne = ''
  for (const m of mots) {
    const essai = ligne ? `${ligne} ${m}` : m
    if (ctx.measureText(essai).width > max && ligne) { out.push(ligne); ligne = m } else ligne = essai
  }
  if (ligne) out.push(ligne)
  return out.slice(0, 5)
}

export async function composerPng(v: Visuel): Promise<Blob> {
  const [W, H] = FORMATS_IMAGE[v.format].export
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#eef2ee'; ctx.fillRect(0, 0, W, H)
  if (v.image) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = v.image
    await img.decode()
    // Remplissage « cover » : le visuel couvre tout le cadre, recadre au centre.
    const e = Math.max(W / img.naturalWidth, H / img.naturalHeight)
    const w = img.naturalWidth * e, h = img.naturalHeight * e
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
  }
  const rtl = estRtl(v.langue)
  const marge = W * P.marge
  if (v.surimpression && v.accroche) {
    const hDeg = H * P.degrade
    const g = v.position === 'haut' ? ctx.createLinearGradient(0, 0, 0, hDeg) : ctx.createLinearGradient(0, H, 0, H - hDeg)
    g.addColorStop(0, 'rgba(0,0,0,0.62)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, v.position === 'haut' ? 0 : H - hDeg, W, hDeg)
    const taille = W * P.titre[v.format]
    ctx.font = `700 ${taille}px ${rtl ? POLICE_AR : POLICE}`
    ctx.fillStyle = '#fff'
    ctx.direction = rtl ? 'rtl' : 'ltr'
    ctx.textAlign = rtl ? 'right' : 'left'
    ctx.textBaseline = 'top'
    ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = taille * 0.25
    const ls = lignes(ctx, v.accroche, W - 2 * marge)
    const hauteurTexte = ls.length * taille * 1.12
    const decalage = W * (v.format === 'story' ? 0.2 : P.marge)
    const y0 = v.position === 'haut' ? decalage : H - decalage - hauteurTexte
    ls.forEach((l, i) => ctx.fillText(l, rtl ? W - marge : marge, y0 + i * taille * 1.12))
    ctx.shadowBlur = 0
  }
  ctx.font = `600 ${W * P.marque}px ${POLICE}`
  ctx.fillStyle = 'rgba(255,255,255,.85)'
  ctx.direction = 'ltr'
  ctx.textAlign = rtl ? 'left' : 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillText('shinecosmetics.ma', rtl ? marge : W - marge, H - W * (v.format === 'story' ? 0.2 : 0.045))
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('Export impossible'))), 'image/png'))
}

export async function telechargerPng(v: Visuel, nomFichier: string) {
  const blob = await composerPng(v)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nomFichier
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
