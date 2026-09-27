'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Download, ImagePlus, Loader2, Trash2, X } from 'lucide-react'
import { BOUTONS, FORMATS_IMAGE, formatParDefaut, type FormatImage, type Langue } from '@/lib/ads/creatif-model'
import { ApercuFeed, ApercuStory, telechargerPng, type Visuel } from './Apercu'
import { STATUTS_CREATIF, quand, type Creatif, type Donnees, type Image } from './types'
import s from '../agent.module.css'

const ETAPES = ['idee', 'validee', 'produite', 'en_ligne', 'ecartee'] as const
const LANGUES: Record<Langue, string> = { fr: 'Français', darija: 'Darija', ar: 'العربية' }
const texteDe = (c: Creatif, l: Langue) => (l === 'fr' ? c.texte_fr : l === 'darija' ? c.texte_darija : c.texte_ar) || ''
const premiere = (t: string) => t.split(/\n|(?<=[.!?؟])\s/)[0]?.trim() || ''
const accrocheDe = (c: Creatif, l: Langue) => (l === 'fr' ? c.accroche : premiere(texteDe(c, l)) || c.accroche)
const imageChoisie = (c: Creatif): Image | undefined => c.images.find((i) => i.choisie) ?? c.images[0]

export function Creations({ d, maj, ouvrir, demander }: { d: Donnees; maj: (id: number, statut: string) => void; ouvrir: (id: number) => void; demander: () => void }) {
  const [etape, setEtape] = useState<'toutes' | (typeof ETAPES)[number]>('toutes')
  const compte = useMemo(() => Object.fromEntries(ETAPES.map((e) => [e, d.creatifs.filter((c) => c.statut === e).length])), [d.creatifs])
  const liste = d.creatifs.filter((c) => (etape === 'toutes' ? c.statut !== 'ecartee' : c.statut === etape))
  const nom = new Map(d.produits.map((p) => [p.id, `${p.marque} ${p.nom}`]))
  return (
    <section className={s.panel} aria-labelledby="creas">
      <div className={s.panelHeader}>
        <div><h2 id="creas">Studio de création</h2><p>Les créations de l’agent, de l’idée à la mise en ligne. Ouvre-en une pour l’aperçu Instagram, générer le visuel à partir de la vraie photo du produit et télécharger l’image prête pour Meta.</p></div>
        <button type="button" className={s.primary} onClick={demander}><ImagePlus size={14} /> Demander des créations</button>
      </div>
      <div className={s.body}>
        <div className={s.filtres}><div className={s.groupeFiltres}>
          <button type="button" className={s.filtre} aria-pressed={etape === 'toutes'} onClick={() => setEtape('toutes')}>En cours ({d.creatifs.filter((c) => c.statut !== 'ecartee').length})</button>
          {ETAPES.map((e) => <button key={e} type="button" className={s.filtre} aria-pressed={etape === e} onClick={() => setEtape(e)}>{STATUTS_CREATIF[e]} ({compte[e]})</button>)}
        </div></div>
        {!liste.length && <div className={s.notice}>Aucune création ici. Demande à l’agent 3 à 6 créations sur un produit : il les écrit (accroche, script, textes en français, darija et arabe, brief visuel), et tu génères les visuels ici.</div>}
        <div className={s.grilleCreas}>{liste.map((c) => {
          const img = imageChoisie(c)
          const v: Visuel = { format: 'feed', image: img?.url ?? null, accroche: c.accroche, langue: 'fr', surimpression: true, position: 'haut' }
          return (
            <article key={c.id} className={s.carteCrea}>
              <button type="button" className={s.carteCreaApercu} onClick={() => ouvrir(c.id)} aria-label={`Ouvrir la création ${c.accroche}`}>
                <ApercuFeed v={v} legende={c.texte_fr || ''} bouton={BOUTONS.message.fr} largeur={236} />
              </button>
              <div className={s.carteCreaInfos}>
                <div className={s.carteTop}><span className={s.chip}>{c.format}</span><span className={`${s.chip} ${c.statut === 'en_ligne' ? s.chipVert : c.statut === 'validee' || c.statut === 'produite' ? s.chipBleu : ''}`}>{STATUTS_CREATIF[c.statut]?.replace(/s$/, '')}</span>{c.images.length > 0 && <span className={s.chip}>{c.images.length} visuel(s)</span>}</div>
                <p className={s.accroche}>« {c.accroche} »</p>
                <p className={`${s.small} ${s.muted}`}>{c.angle}{c.produit_ids.length ? ` · ${c.produit_ids.map((id) => nom.get(id) || `#${id}`).join(', ')}` : ''}</p>
                <div className={s.btns}>
                  <button type="button" className={s.primary} onClick={() => ouvrir(c.id)}>Ouvrir le studio</button>
                  {c.statut === 'idee' && <button type="button" className={s.ghost} onClick={() => maj(c.id, 'validee')}><Check size={13} /> Valider</button>}
                  {c.statut !== 'ecartee' && <button type="button" className={s.ghost} onClick={() => maj(c.id, 'ecartee')}>Écarter</button>}
                </div>
              </div>
            </article>)
        })}</div>
      </div>
    </section>
  )
}

export function Studio({ c, d, fermer, maj, rafraichir, message }: { c: Creatif; d: Donnees; fermer: () => void; maj: (id: number, statut: string) => void; rafraichir: () => Promise<void>; message: (ok: boolean, t: string) => void }) {
  const langues = (['fr', 'darija', 'ar'] as Langue[]).filter((l) => l === 'fr' || texteDe(c, l))
  const [langue, setLangue] = useState<Langue>('fr')
  const [accroche, setAccroche] = useState(accrocheDe(c, 'fr'))
  const [surimpression, setSurimpression] = useState(true)
  const [position, setPosition] = useState<'haut' | 'bas'>('haut')
  const [canal, setCanal] = useState<'message' | 'site'>('message')
  const [imageId, setImageId] = useState<number | null>(imageChoisie(c)?.id ?? null)
  const [format, setFormat] = useState<FormatImage>(formatParDefaut(c.format))
  const [qualite, setQualite] = useState<'low' | 'medium' | 'high'>('medium')
  const [precision, setPrecision] = useState('')
  const [genere, setGenere] = useState<number | null>(null)
  const debut = useRef(0)
  useEffect(() => { setAccroche(accrocheDe(c, langue)) }, [langue, c])
  useEffect(() => {
    if (genere == null) return
    const t = setInterval(() => setGenere(Math.round((Date.now() - debut.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [genere])
  const image = c.images.find((i) => i.id === imageId) ?? imageChoisie(c)
  const v = (f: FormatImage): Visuel => ({ format: f, image: image?.url ?? null, accroche, langue, surimpression, position })
  const legende = texteDe(c, langue) || c.texte_fr || ''
  const bouton = BOUTONS[canal][langue]
  const nom = new Map(d.produits.map((p) => [p.id, `${p.marque} ${p.nom}`]))

  const poster = async (corps: unknown) => {
    const r = await fetch('/api/ops/ads/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'Échec')
    return j
  }
  const generer = async () => {
    debut.current = Date.now(); setGenere(0)
    try {
      const j = await poster({ image: { creatifId: c.id, format, qualite, precision } })
      await rafraichir(); setImageId(j.image.id)
      message(true, `Visuel généré en ${Math.round((Date.now() - debut.current) / 1000)} s.`)
    } catch (e) { message(false, e instanceof Error ? e.message : 'Échec') }
    finally { setGenere(null) }
  }
  const choisir = async (id: number) => { try { await poster({ imageChoisie: id }); setImageId(id); await rafraichir() } catch (e) { message(false, (e as Error).message) } }
  const supprimer = async (id: number) => {
    if (!window.confirm('Supprimer ce visuel ?')) return
    try { await poster({ imageSupprimee: id }); if (imageId === id) setImageId(null); await rafraichir() } catch (e) { message(false, (e as Error).message) }
  }
  const copier = (t: string) => { void navigator.clipboard?.writeText(t); message(true, 'Copié.') }

  return (
    <div className={s.drawer} role="dialog" aria-modal="true" aria-label="Studio de création" onClick={fermer}>
      <div className={`${s.drawerBody} ${s.drawerLarge}`} onClick={(e) => e.stopPropagation()}>
        <div className={s.panelHeader} style={{ padding: 0 }}>
          <div><p className={s.eyebrow}>{c.format} · {c.angle} · {quand(c.cree_le)}</p><h2>« {c.accroche} »</h2>
            {c.produit_ids.length > 0 && <p className={`${s.small} ${s.muted}`}>{c.produit_ids.map((id) => nom.get(id) || `#${id}`).join(' · ')}{c.public ? ` · Pour : ${c.public}` : ''}</p>}</div>
          <button type="button" className={s.ghost} onClick={fermer} aria-label="Fermer"><X size={14} /></button>
        </div>
        <div className={s.btns} style={{ marginTop: 0 }}>{ETAPES.filter((e) => e !== c.statut).map((e) => <button key={e} type="button" className={e === 'ecartee' ? s.ghost : s.primary} onClick={() => maj(c.id, e)}>{e === 'ecartee' ? 'Écarter' : `Passer en « ${STATUTS_CREATIF[e].replace(/s$/, '')} »`}</button>)}</div>

        <div className={s.studio}>
          <div className={s.studioApercus}>
            <div><p className={s.legendeApercu}>Fil Instagram</p><ApercuFeed v={v('feed')} legende={legende} bouton={bouton} largeur={290} /></div>
            <div><p className={s.legendeApercu}>{c.format === 'reel' ? 'Reel' : 'Story'}</p><ApercuStory v={v('story')} legende={legende} bouton={bouton} largeur={230} reel={c.format === 'reel'} /></div>
          </div>
          <div className={s.studioReglages}>
            <fieldset className={s.reglage}><legend>Langue</legend><div className={s.groupeFiltres}>{langues.map((l) => <button key={l} type="button" className={s.filtre} aria-pressed={langue === l} onClick={() => setLangue(l)}>{LANGUES[l]}</button>)}</div></fieldset>
            <fieldset className={s.reglage}><legend>Texte sur l’image</legend>
              <textarea rows={2} value={accroche} onChange={(e) => setAccroche(e.target.value)} dir={langue === 'ar' ? 'rtl' : 'ltr'} className={s.champTexte} maxLength={120} />
              <div className={s.groupeFiltres}>
                <label className={s.caseInline}><input type="checkbox" checked={surimpression} onChange={(e) => setSurimpression(e.target.checked)} /> Afficher</label>
                <button type="button" className={s.filtre} aria-pressed={position === 'haut'} onClick={() => setPosition('haut')}>En haut</button>
                <button type="button" className={s.filtre} aria-pressed={position === 'bas'} onClick={() => setPosition('bas')}>En bas</button>
              </div>
              <p className={`${s.small} ${s.muted}`}>Court et lisible : 4 à 8 mots. Posé par le BOS, jamais par le modèle d’image : l’arabe s’affiche correctement.</p>
            </fieldset>
            <fieldset className={s.reglage}><legend>Bouton de la pub</legend><div className={s.groupeFiltres}>
              <button type="button" className={s.filtre} aria-pressed={canal === 'message'} onClick={() => setCanal('message')}>Envoyer un message</button>
              <button type="button" className={s.filtre} aria-pressed={canal === 'site'} onClick={() => setCanal('site')}>Commander sur le site</button>
            </div></fieldset>
            <fieldset className={s.reglage}><legend>Visuels ({c.images.length})</legend>
              {c.images.length > 0 && <div className={s.galerie}>{c.images.map((i) => (
                <div key={i.id} className={`${s.miniature} ${image?.id === i.id ? s.miniatureActive : ''}`}>
                  <button type="button" onClick={() => setImageId(i.id)} aria-label="Utiliser ce visuel dans l’aperçu"><img src={i.url} alt="" /></button>
                  <span className={s.miniatureInfos}>{FORMATS_IMAGE[i.format].label.split(' ')[0]}{i.choisie ? ' · choisi' : ''}</span>
                  <span className={s.miniatureBtns}>
                    {!i.choisie && <button type="button" onClick={() => void choisir(i.id)} title="Choisir pour la pub"><Check size={12} /></button>}
                    <button type="button" onClick={() => void supprimer(i.id)} title="Supprimer"><Trash2 size={12} /></button>
                  </span>
                </div>))}</div>}
              <div className={s.genererLigne}>
                <select value={format} onChange={(e) => setFormat(e.target.value as FormatImage)} className={s.select} aria-label="Format du visuel">{(Object.keys(FORMATS_IMAGE) as FormatImage[]).map((f) => <option key={f} value={f}>{FORMATS_IMAGE[f].label}</option>)}</select>
                <select value={qualite} onChange={(e) => setQualite(e.target.value as 'low' | 'medium' | 'high')} className={s.select} aria-label="Qualité">
                  <option value="low">Brouillon (rapide)</option><option value="medium">Standard</option><option value="high">Haute qualité</option>
                </select>
              </div>
              <input value={precision} onChange={(e) => setPrecision(e.target.value)} placeholder="Précision (facultatif) : ex. sur une étagère de salle de bain en zellige, lumière du matin" className={s.champTexte} maxLength={500} />
              <button type="button" className={s.primary} disabled={genere != null} onClick={() => void generer()}>{genere != null ? <><Loader2 size={14} className={s.tourne} /> Génération… {genere} s</> : <><ImagePlus size={14} /> Générer un visuel</>}</button>
              <p className={`${s.small} ${s.muted}`}>OpenAI part de la vraie photo de la fiche produit (le flacon reste le vôtre) et ne met aucun texte. 30 s à 2 min ; quelques centimes à ~0,20 $ selon la qualité.</p>
            </fieldset>
            <fieldset className={s.reglage}><legend>Télécharger pour Meta</legend><div className={s.groupeFiltres}>
              {(['feed', 'story', 'carre'] as FormatImage[]).map((f) => <button key={f} type="button" className={s.ghost} disabled={!image} onClick={() => void telechargerPng(v(f), `shine-${c.id}-${f}-${langue}.png`).catch((e) => message(false, e.message))}><Download size={13} /> {FORMATS_IMAGE[f].export.join('×')}</button>)}
            </div>{!image && <p className={`${s.small} ${s.muted}`}>Génère d’abord un visuel.</p>}</fieldset>
          </div>
        </div>

        <div className={s.studioTextes}>
          {(['fr', 'darija', 'ar'] as Langue[]).filter((l) => texteDe(c, l)).map((l) => (
            <div key={l} className={`${s.bloc} ${l === 'ar' ? s.rtl : ''}`} lang={l === 'ar' ? 'ar' : 'fr'}>
              <h4>Texte {LANGUES[l]} <button type="button" className={s.lienBouton} onClick={() => copier(texteDe(c, l))}><Copy size={11} /> Copier</button></h4>{texteDe(c, l)}
            </div>))}
          {(c.titre || c.cta) && <p className={s.small}>{c.titre && <><b>Titre</b> {c.titre} </>}{c.cta && <><b>Bouton proposé</b> {c.cta}</>}</p>}
          {c.script && <div className={s.bloc}><h4>Script / maquette</h4>{c.script}</div>}
          {c.visuel && <div className={s.bloc}><h4>Brief visuel</h4>{c.visuel}</div>}
        </div>
      </div>
    </div>
  )
}
