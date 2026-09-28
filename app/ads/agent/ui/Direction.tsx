'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Clapperboard, Download, GalleryHorizontal, ImagePlus, Images, Loader2, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { FORMATS_IMAGE, type FormatImage, type Langue } from '@/lib/ads/creatif-model'
import { A_MONTRER, BORNES, INGREDIENTS, MOUVEMENTS, OBJECTIFS, OFFRES, RECETTES, STYLES, type CleRecette, type AMontrer, type Idee, type Objectif, type Offre, type Style, type TypeDirection } from '@/lib/ads/direction-model'
import { urlDetouree } from '@/lib/ads/reel-model'
import { ApercuCarrousel, CreatifVisuel, telechargerPng, type Visuel } from './Apercu'
import { LecteurReel } from './Reel'
import { TableMontage, depuisOption, planDessin, type Brouillon } from './Montage'
import { quand, type BaseCreative, type Creatif, type Demande, type Image, type Option } from './types'
import s from '../agent.module.css'

/**
 * LE DIRECTEUR ARTISTIQUE, A L'ECRAN.
 * Achraf ecrit (ou choisit) un brief ; Claude ecrit les consignes et fait
 * peindre les images ; ici on compare les options, on feuillette le carrousel,
 * on regarde le Reel bouger, on retouche une consigne, on regenere, on exporte.
 */

const TYPES: Record<TypeDirection, { label: string; aide: string; Icone: typeof Images }> = {
  options: { label: 'Options d’image', aide: 'Plusieurs concepts vraiment différents pour une même pub : tu gardes celui qui arrête le pouce.', Icone: Images },
  carrousel: { label: 'Carrousel', aide: 'Des cartes cohérentes (même décor, même lumière), une idée par carte : on swipe, on écrit en DM.', Icone: GalleryHorizontal },
  reel: { label: 'Reel animé', aide: 'Tes vrais produits détourés qui rebondissent sur un décor, le texte mot par mot : un MP4 prêt pour Instagram, sans rendu « IA ».', Icone: Clapperboard },
}
const FORMAT_DEFAUT: Record<TypeDirection, FormatImage> = { options: 'feed', carrousel: 'feed', reel: 'story' }
const COURT: Record<FormatImage, string> = { feed: '4:5', story: '9:16', carre: '1:1' }

export async function poster(corps: unknown) {
  const r = await fetch('/api/ops/ads/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Échec')
  return j
}

export const texteDe = (o: Option, l: Langue) => o.texte?.[l] || o.texte?.fr || ''
// *mot* : le mot mis en valeur dans un Reel ; a l'ecran et sur les images fixes, sans les etoiles.
export const lisible = (t: string) => t.replace(/\*/g, '')
export const imagesDe = (c: Creatif, o: Option) => c.images.filter((i) => i.option_id === o.id).sort((a, b) => Number(b.choisie) - Number(a.choisie) || b.cree_le.localeCompare(a.cree_le))
export const typeDeSerie = (opts: Option[]): TypeDirection => (opts.some((o) => o.mouvement) ? 'reel' : opts.some((o) => o.carte != null) ? 'carrousel' : 'options')

/* ------------------------------------------------------------------ */
/* LE BRIEF                                                            */
/* ------------------------------------------------------------------ */

export function BriefDirection({ d, creatif, idee, envoye, erreur }: { d: BaseCreative; creatif?: Creatif; idee?: Idee; envoye: (texte: string) => void; erreur: (texte: string) => void }) {
  const depart: TypeDirection = creatif?.format === 'carrousel' ? 'carrousel' : creatif?.format === 'reel' || creatif?.format === 'video' ? 'reel' : 'options'
  // Une idee choisie ailleurs (l'accueil du studio) arrive deja appliquee.
  const [type, setType] = useState<TypeDirection>(idee?.type ?? depart)
  const [nombre, setNombre] = useState(idee?.nombre ?? BORNES[depart].defaut)
  const [format, setFormat] = useState<FormatImage>(idee?.format ?? FORMAT_DEFAUT[depart])
  const [styles, setStyles] = useState<Style[]>(idee?.styles ?? [])
  const [qualite, setQualite] = useState<'medium' | 'high'>(idee?.qualite ?? 'high')
  const [brief, setBrief] = useState(idee?.brief ?? '')
  const [produits, setProduits] = useState<number[]>(!creatif && idee ? idee.produitIds : [])
  // Ce que la pub doit obtenir : Shine vend sur le site ET en DM, ce ne sont pas les memes pubs.
  const [objectif, setObjectif] = useState<Objectif>(creatif && /message|dm/i.test(creatif.cta || '') ? 'dm' : 'site')
  const [offre, setOffre] = useState<Offre>('aucune')
  const [montrer, setMontrer] = useState<AMontrer[]>(['cod'])
  const [langue, setLangue] = useState<'fr' | 'darija' | 'mix'>('mix')
  const [fondShine, setFondShine] = useState(Boolean(idee?.fondShine))
  // Le style : une recette prouvee (sa charpente est imposee) ou « libre » (le directeur artistique invente).
  const [recette, setRecette] = useState<CleRecette | null>(idee?.recette ?? null)
  const choisirRecette = (r: CleRecette | null) => {
    setRecette(r)
    if (r) { setType('reel'); setNombre(RECETTES[r].plans.length); setFormat('story'); setFondShine(true) }
  }
  const choisirObjectif = (k: Objectif) => { setObjectif(k); if (k !== 'site') setMontrer((m) => m.filter((x) => x !== 'site')) }
  const basculerMontrer = (k: AMontrer) => setMontrer((m) => (m.includes(k) ? m.filter((x) => x !== k) : [...m, k]))
  const n = (etape: number) => (creatif ? etape - 1 : etape)
  const [recherche, setRecherche] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const b = BORNES[type]

  const changerType = (t: TypeDirection) => { setType(t); setNombre(BORNES[t].defaut); setFormat(FORMAT_DEFAUT[t]) }
  const appliquer = (i: Idee) => {
    setType(i.type); setNombre(i.nombre); setFormat(i.format); setStyles(i.styles); setQualite(i.qualite); setBrief(i.brief)
    if (!creatif) setProduits(i.produitIds)
    setRecette(i.recette ?? null)
    if (i.objectif) setObjectif(i.objectif)
    if (i.offre) setOffre(i.offre)
    if (i.montrer) setMontrer(i.montrer)
    if (i.fondShine != null) setFondShine(i.fondShine)
  }
  const ajouter = (x: string) => setBrief((t) => (t.trim() ? `${t.trim()}\n• ${x}` : `• ${x}`))
  const basculer = (id: number) => setProduits((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 6 ? p : [...p, id]))
  const trouves = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return d.catalogue.filter((p) => !q || `${p.marque} ${p.nom}`.toLowerCase().includes(q)).slice(0, 40)
  }, [d.catalogue, recherche])
  const nomProduit = new Map(d.catalogue.map((p) => [p.id, `${p.marque} ${p.nom}`]))

  const envoyer = async () => {
    setEnvoi(true)
    try {
      const j = await poster({ direction: { type, nombre, format, styles, qualite, brief, objectif, offre, montrer, langue, fond: type === 'reel' && fondShine ? 'shine' : 'libre', ...(recette ? { recette } : {}), ...(creatif ? { creatifId: creatif.id } : { produitIds: produits }) } })
      envoye(j.lancee
        ? 'Brief envoyé : Claude commence maintenant. Compte 5 à 15 minutes avec les images.'
        : 'Brief envoyé : Claude le prend à son prochain passage (chaque heure, de 8 h à 23 h).')
    } catch (e) { erreur(e instanceof Error ? e.message : 'Échec') } finally { setEnvoi(false) }
  }

  return (
    <div className={s.dirBrief}>
      <p className={s.aide}><Wand2 size={13} /> <b>Claude</b> dirige (idée, plans, textes, consignes d’image) à partir de tes vrais produits et de tes retours ; OpenAI peint les décors ; le BOS vérifie que tout ce que tu coches est bien dans la pub.</p>

      {d.idees.length > 0 && !creatif && <fieldset className={s.reglage}><legend><Sparkles size={13} /> Idées prêtes, tirées de tes chiffres (un clic remplit le brief)</legend>
        <div className={s.dirIdees}>{d.idees.map((i) => (
          <button key={i.id} type="button" className={s.dirIdee} onClick={() => appliquer(i)}>
            <span className={s.carteTop}>{i.recette ? <span className={`${s.chip} ${s.chipVert}`}>Recette · {RECETTES[i.recette].nom}</span> : <><span className={s.chip}>{TYPES[i.type].label}</span><span className={s.chip}>{COURT[i.format]}</span></>}</span>
            <b>{i.titre}</b><small>{i.pourquoi}</small>
          </button>))}
        </div>
      </fieldset>}

      {!creatif && <fieldset className={s.reglage}><legend><span className={s.etapeNum}>1</span> Quoi vendre ({produits.length}/6)</legend>
        {produits.length > 0 && <div className={s.dirChips}>{produits.map((id) => <button key={id} type="button" className={`${s.chip} ${s.chipVert}`} onClick={() => basculer(id)}>{nomProduit.get(id) || `#${id}`} ×</button>)}</div>}
        <input className={s.champTexte} value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher un produit, un pack ou une marque…" />
        <div className={s.dirProduits}>{trouves.map((p) => (
          <label key={p.id} className={s.dirProduit}>
            <input type="checkbox" checked={produits.includes(p.id)} onChange={() => basculer(p.id)} />
            {p.image ? <img src={p.image.replace('/upload/', '/upload/c_limit,w_80,h_80,f_auto/')} alt="" /> : <span />}
            <span><b>{p.marque}</b> {p.nom}{p.composants ? <small className={s.muted}> · pack de {p.composants.length}</small> : null}</span>
            {(p.importBloque || p.stockVendable <= 0) && <span className={`${s.chip} ${s.chipOrange}`}>{p.importBloque ? 'bloqué' : 'rupture'}</span>}
          </label>))}
        </div>
      </fieldset>}

      <fieldset className={s.reglage}><legend><span className={s.etapeNum}>{n(2)}</span> Pour obtenir quoi ?</legend>
        <div className={s.dirTypes}>{(Object.keys(OBJECTIFS) as Objectif[]).map((k) => (
          <button key={k} type="button" aria-pressed={objectif === k} onClick={() => choisirObjectif(k)}><b>{OBJECTIFS[k].label}</b><small>{OBJECTIFS[k].aide}</small></button>))}
        </div>
      </fieldset>

      <fieldset className={s.reglage}><legend><span className={s.etapeNum}>{n(3)}</span> Le style (le mécanisme qui fait regarder et acheter)</legend>
        <div className={s.dirRecettes}>
          {(Object.keys(RECETTES) as CleRecette[]).map((k) => {
            const r = RECETTES[k]
            return (
              <button key={k} type="button" className={s.dirRecette} aria-pressed={recette === k} onClick={() => choisirRecette(recette === k ? null : k)}>
                <span className={s.carteTop}><b>{r.nom}</b><span className={s.chip}>{r.pour}</span><small className={s.muted}>{r.exemple}</small></span>
                <small>{r.mecanisme}</small>
                <small className={s.muted}>Idéal : {r.ideal}</small>
                <ol>{r.plans.map((pl, j) => <li key={j}>{pl.role}</li>)}</ol>
                <small className={s.muted}>{r.plans.length} plans · ~{Math.round(r.plans.reduce((x, pl) => x + pl.duree, 0))} s</small>
              </button>)
          })}
          <button type="button" className={s.dirRecette} aria-pressed={recette === null} onClick={() => choisirRecette(null)}>
            <span className={s.carteTop}><b>Libre</b></span>
            <small>Le directeur artistique invente la charpente à partir de ton idée (sans jamais reprendre celle d’un Reel récent).</small>
          </button>
        </div>
      </fieldset>

      {!recette && <fieldset className={s.reglage}><legend><span className={s.etapeNum}>{n(3)}</span> Le format</legend>
        <div className={s.dirTypes}>{(Object.keys(TYPES) as TypeDirection[]).map((t) => {
          const { label, aide, Icone } = TYPES[t]
          return <button key={t} type="button" aria-pressed={type === t} onClick={() => changerType(t)}><Icone size={16} /><b>{label}</b><small>{aide}</small></button>
        })}</div>
        <div className={s.genererLigne}>
          <label className={s.champ}>{type === 'carrousel' ? 'Cartes' : type === 'reel' ? 'Plans' : 'Options'}
            <select className={s.select} value={nombre} onChange={(e) => setNombre(Number(e.target.value))}>
              {Array.from({ length: b.max - b.min + 1 }, (_, i) => b.min + i).map((n) => <option key={n} value={n}>{n}{type === 'reel' ? ` plans (~${n * 3} s)` : ''}</option>)}
            </select></label>
          <label className={s.champ}>Format
            <select className={s.select} value={format} onChange={(e) => setFormat(e.target.value as FormatImage)}>
              {b.formats.map((f) => <option key={f} value={f}>{FORMATS_IMAGE[f].label}</option>)}
            </select></label>
          <label className={s.champ}>Qualité
            <select className={s.select} value={qualite} onChange={(e) => setQualite(e.target.value as 'medium' | 'high')}>
              <option value="high">Haute (la pub)</option><option value="medium">Standard (pour tester)</option>
            </select></label>
        </div>
      </fieldset>}

      <fieldset className={s.reglage}><legend><span className={s.etapeNum}>{n(4)}</span> Ce qui doit se voir</legend>
        <div className={s.dirChips}>{(Object.keys(A_MONTRER) as AMontrer[]).map((k) => (
          <button key={k} type="button" className={s.filtre} aria-pressed={montrer.includes(k)} disabled={k === 'site' && type !== 'reel'} onClick={() => basculerMontrer(k)}>{montrer.includes(k) ? '✓ ' : ''}{A_MONTRER[k]}</button>))}
        </div>
        <div className={s.genererLigne}>
          <label className={s.champ}>Offre à mettre en avant
            <select className={s.select} value={offre} onChange={(e) => setOffre(e.target.value as Offre)}>
              {(Object.keys(OFFRES) as Offre[]).map((k) => <option key={k} value={k}>{OFFRES[k]}</option>)}
            </select></label>
          <label className={s.champ}>Langue du texte
            <select className={s.select} value={langue} onChange={(e) => setLangue(e.target.value as 'fr' | 'darija' | 'mix')}>
              <option value="mix">Français + darija</option><option value="fr">Français</option><option value="darija">Darija</option>
            </select></label>
        </div>
        {type === 'reel' && <label className={s.caseInline}><input type="checkbox" checked={fondShine} onChange={(e) => setFondShine(e.target.checked)} /> Fond Shine : un dégradé vert aux couleurs de la maison sur tous les plans (aucun décor IA)</label>}
        <small className={s.muted}>{type === 'reel' ? 'Chaque case cochée est vérifiée : un Reel qui l’oublie est refusé et refait. ' : ''}Les offres viennent des vraies règles de la boutique (livraison, code de bienvenue) : rien d’inventé.</small>
      </fieldset>

      <fieldset className={s.reglage}><legend><span className={s.etapeNum}>{n(5)}</span> Ton idée, en toutes lettres</legend>
        <textarea rows={5} className={s.champTexte} value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={2000}
          placeholder={type === 'reel' ? 'Ex. : Reel de 10 s pour Sun And More. Plan 1 : « Cheveux secs après la plage ? ». Plan 2 : le flacon tombe sur une serviette au bord de la piscine. Plan 3 : la texture. Fin : écris-nous en DM.' : 'Ex. : le flacon sur une étagère en zellige, lumière du matin, des mains qui l’appliquent sur des cheveux bouclés.'} />
        <div className={s.dirIngredients}>{INGREDIENTS.map((g) => (
          <div key={g.groupe}><small>{g.groupe}</small>{g.items.map((x) => <button key={x} type="button" className={s.filtre} onClick={() => ajouter(x)}>+ {x}</button>)}</div>))}
        </div>
        <div><small className={s.muted}>Ambiance du décor (facultatif) :</small>
          <div className={s.dirChips}>{(Object.keys(STYLES) as Style[]).map((k) => (
            <button key={k} type="button" className={s.filtre} aria-pressed={styles.includes(k)} onClick={() => setStyles((x) => (x.includes(k) ? x.filter((y) => y !== k) : x.length >= 4 ? x : [...x, k]))}>{STYLES[k]}</button>))}
          </div></div>
        <small className={s.muted}>Une consigne par ligne : chacune doit être tenue par un plan (tu verras lequel dans l’onglet Brief).</small>
      </fieldset>

      <div className={s.btns}>
        <button type="button" className={s.primary} disabled={envoi || (!creatif && !produits.length)} onClick={() => void envoyer()}>
          {envoi ? <Loader2 size={14} className={s.tourne} /> : <Wand2 size={14} />} Envoyer au directeur artistique
        </button>
        <span className={`${s.small} ${s.muted}`}>{nombre} image{nombre > 1 ? 's' : ''} {type === 'reel' ? 'de décor' : ''} générée{nombre > 1 ? 's' : ''} · plafond 40 par jour</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* LES DEMANDES EN COURS                                               */
/* ------------------------------------------------------------------ */

export function DirectionsEnCours({ demandes, creatifId }: { demandes: Demande[]; creatifId: number | null }) {
  const liste = demandes.filter((x) => x.genre === 'direction' && (creatifId == null ? !x.creatif_id || x.statut === 'en_attente' || x.statut === 'en_cours' : x.creatif_id === creatifId)
    && (x.statut === 'en_attente' || x.statut === 'en_cours' || (x.statut === 'erreur' && Date.now() - new Date(x.termine_le || x.demande_le).getTime() < 864e5)))
  if (!liste.length) return null
  return (
    <div className={s.dirAttentes}>{liste.map((x) => (
      <p key={x.id} className={`${s.notice} ${x.statut === 'erreur' ? s.error : ''}`}>
        {x.statut === 'erreur' ? <AlertTriangle size={14} /> : <Loader2 size={14} className={s.tourne} />}{' '}
        <b>{x.statut === 'en_attente' ? 'En attente du directeur artistique' : x.statut === 'en_cours' ? 'Claude dirige les images' : 'Direction impossible'}</b> — {x.sujet}
        <span className={s.muted}> · demandée {quand(x.demande_le)}</span>{x.erreur ? <><br />{x.erreur}</> : null}
      </p>))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* LES SERIES LIVREES                                                  */
/* ------------------------------------------------------------------ */

export type Actions = {
  generer: (o: Option) => Promise<void>
  choisir: (i: Image) => Promise<void>
  supprimer: (i: Image) => Promise<void>
  sauver: (o: Option, prompt: string) => Promise<void>
  utiliser?: (i: Image, o: Option) => void
}

export function CarteOption({ c, o, rang, type, langue, genere, a, largeur, noms }: { c: Creatif; o: Option; rang: number; type: TypeDirection; langue: Langue; genere: number | undefined; a: Actions; largeur: number; noms: Map<number, string> }) {
  const images = imagesDe(c, o)
  const img = images[0]
  const [prompt, setPrompt] = useState(o.prompt)
  useEffect(() => setPrompt(o.prompt), [o.prompt])
  const v: Visuel = { format: o.format, image: img?.url ?? null, accroche: type === 'reel' ? '' : lisible(texteDe(o, langue)), langue, surimpression: type !== 'reel', position: o.position }
  return (
    <article className={s.dirOption} style={{ width: largeur }}>
      <div className={s.dirOptionVisuel}>
        <CreatifVisuel v={v} largeur={largeur} />
        {genere != null && <span className={s.dirGeneration}><Loader2 size={16} className={s.tourne} /> {genere} s</span>}
      </div>
      <div className={s.dirOptionInfos}>
        <p className={s.carteTop}><span className={s.chip}>{type === 'carrousel' ? `Carte ${o.carte}` : type === 'reel' ? `Plan ${o.carte}` : `Option ${rang}`}</span>
          {o.role && <span className={s.chip}>{o.role}</span>}
          {o.mouvement && <span className={`${s.chip} ${s.chipBleu}`}>{o.mouvement} · {Number(o.duree)} s</span>}
          {o.motion?.transition && o.motion.transition !== 'coupe' && <span className={s.chip}>↪ {o.motion.transition}</span>}
          {o.motion?.ambiance && o.motion.ambiance !== 'aucune' && <span className={s.chip}>✦ {o.motion.ambiance}</span>}</p>
        <b>{o.concept}</b>
        {o.pourquoi && <p className={s.small}>{o.pourquoi}</p>}
        {type === 'reel' && o.mouvement && <p className={`${s.small} ${s.muted}`}>{MOUVEMENTS[o.mouvement]}{o.animes?.length ? ` · produits ${o.animes.map((id) => noms.get(id) || `#${id}`).join(', ')}` : ''}</p>}
        <p className={s.dirTexte} dir={langue === 'ar' ? 'rtl' : 'ltr'}>« {lisible(texteDe(o, langue))} »</p>
        {o.note && <p className={s.dirNote}><Check size={12} /> {o.note}</p>}
        {images.length > 1 && <div className={s.dirVariantes}>{images.map((i) => (
          <button key={i.id} type="button" className={i.choisie ? s.miniatureActive : undefined} onClick={() => void a.choisir(i)} title={i.choisie ? 'Visuel retenu' : 'Retenir ce visuel'}><img src={i.url} alt="" /></button>))}</div>}
        <div className={s.btns}>
          <button type="button" className={img ? s.ghost : s.primary} disabled={genere != null} onClick={() => void a.generer(o)}><ImagePlus size={13} /> {img ? 'Régénérer' : 'Générer'}</button>
          {img && a.utiliser && <button type="button" className={s.ghost} onClick={() => a.utiliser!(img, o)}>Dans l’aperçu</button>}
          {img && <button type="button" className={s.ghost} onClick={() => void a.supprimer(img)} aria-label="Supprimer ce visuel"><Trash2 size={13} /></button>}
        </div>
        <details className={s.dirPrompt}><summary>Consigne écrite par Claude{o.modele ? ` (${o.modele})` : ''}</summary>
          <textarea rows={7} className={s.champTexte} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <button type="button" className={s.ghost} disabled={prompt.trim() === o.prompt.trim() || prompt.trim().length < 200} onClick={() => void a.sauver(o, prompt)}>Enregistrer la consigne</button>
        </details>
      </div>
    </article>
  )
}

/** Les gestes sur les visuels d'une creation (partages par l'agent et le studio). */
export function useActionsSerie(c: Creatif, rafraichir: () => Promise<void>, message: (ok: boolean, t: string) => void, utiliser?: (i: Image, o: Option) => void) {
  const [generation, setGeneration] = useState<Record<number, number>>({})
  const [, tic] = useState(0)
  useEffect(() => {
    if (!Object.keys(generation).length) return
    const t = setInterval(() => tic((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [generation])
  const generer = async (o: Option) => {
    setGeneration((g) => ({ ...g, [o.id]: Date.now() }))
    try { await poster({ image: { optionId: o.id, qualite: o.qualite === 'medium' ? 'medium' : 'high' } }); await rafraichir() }
    catch (e) { message(false, `${o.concept} : ${e instanceof Error ? e.message : 'échec'}`) }
    finally { setGeneration((g) => { const n = { ...g }; delete n[o.id]; return n }) }
  }
  // La carte 1 d'abord : elle donne le decor aux suivantes ; puis le reste en parallele.
  const genererManquants = async (opts: Option[]) => {
    const manquants = opts.filter((o) => !imagesDe(c, o).length && (!o.motion?.fond || o.motion.fond === 'decor'))
    const premiere = manquants.find((o) => o.carte === 1)
    if (premiere) await generer(premiere)
    await Promise.all(manquants.filter((o) => o !== premiere).map(generer))
  }
  const a: Actions = {
    generer,
    choisir: async (i) => { try { await poster({ imageChoisie: i.id }); await rafraichir() } catch (e) { message(false, (e as Error).message) } },
    supprimer: async (i) => { if (!window.confirm('Supprimer ce visuel ?')) return; try { await poster({ imageSupprimee: i.id }); await rafraichir() } catch (e) { message(false, (e as Error).message) } },
    sauver: async (o, prompt) => { try { await poster({ option: { id: o.id, prompt } }); await rafraichir(); message(true, 'Consigne enregistrée : régénère pour voir le résultat.') } catch (e) { message(false, (e as Error).message) } },
    utiliser,
  }
  const secondes = (id: number) => (generation[id] ? Math.round((Date.now() - generation[id]) / 1000) : undefined)
  return { generation, generer, genererManquants, a, secondes }
}

export function SeriesDirection({ c, d, langue, bouton, legende, rafraichir, message, utiliser }: {
  c: Creatif; d: BaseCreative; langue: Langue; bouton: string; legende: string
  rafraichir: () => Promise<void>; message: (ok: boolean, t: string) => void; utiliser: (i: Image, o: Option) => void
}) {
  const { generation, generer, genererManquants, a } = useActionsSerie(c, rafraichir, message, utiliser)
  // La table de montage : les retouches non enregistrees (par plan) et le plan ouvert (par serie).
  const [brouillons, setBrouillons] = useState<Record<number, Brouillon>>({})
  const [ouvert, setOuvert] = useState<Record<number, number | null>>({})
  const setBrouillon = (id: number, b: Brouillon | null) => setBrouillons((x) => { const n = { ...x }; if (b) n[id] = b; else delete n[id]; return n })
  const series = useMemo(() => {
    const m = new Map<number, Option[]>()
    for (const o of c.options) m.set(o.serie, [...(m.get(o.serie) ?? []), o])
    return [...m.entries()].sort((x, y) => y[0] - x[0]).map(([serie, opts]) => ({ serie, opts: opts.sort((x, y) => (x.carte ?? x.id) - (y.carte ?? y.id)) }))
  }, [c.options])
  const imageDe = new Map(d.catalogue.map((p) => [p.id, p.image]))
  const noms = new Map(d.catalogue.map((p) => [p.id, `${p.marque} ${p.nom}`]))

  const supprimerSerie = async (serie: number) => {
    if (!window.confirm('Supprimer cette série ? Les visuels déjà générés restent dans la galerie.')) return
    try { await poster({ serieSupprimee: { creatifId: c.id, serie } }); await rafraichir() } catch (e) { message(false, (e as Error).message) }
  }

  if (!series.length) return null
  return (
    <div className={s.dirSeries}>
      {series.map(({ serie, opts }) => {
        const type = typeDeSerie(opts)
        const manquants = opts.filter((o) => !imagesDe(c, o).length).length
        const visuel = (o: Option): Visuel => ({ format: o.format, image: imagesDe(c, o)[0]?.url ?? null, accroche: lisible(texteDe(o, langue)), langue, surimpression: true, position: o.position })
        // L'apercu montre les retouches en cours (brouillons), avant meme qu'elles soient enregistrees.
        const plans = type === 'reel' ? opts.map((o) => planDessin(c, o, brouillons[o.id] ?? depuisOption(o), langue, d)) : []
        const { Icone, label } = TYPES[type]
        return (
          <section key={serie} className={s.dirSerie}>
            <div className={s.dirSerieTete}>
              <div>
                <h3><Icone size={15} /> {label} · {opts.length} {type === 'carrousel' ? 'cartes' : type === 'reel' ? `plans · ${plans.reduce((n, p) => n + p.duree, 0)} s` : 'options'}</h3>
                <p className={`${s.small} ${s.muted}`}>Série {serie} · {quand(opts[0].cree_le)}{opts[0].brief ? ` · « ${opts[0].brief.slice(0, 140)}${opts[0].brief.length > 140 ? '…' : ''} »` : ''}</p>
              </div>
              <div className={s.btns} style={{ marginTop: 0 }}>
                {manquants > 0 && <button type="button" className={s.primary} disabled={Object.keys(generation).length > 0} onClick={() => void genererManquants(opts)}><ImagePlus size={13} /> Générer {manquants === opts.length ? 'tout' : `les ${manquants} manquant(s)`}</button>}
                {type === 'carrousel' && manquants < opts.length && <button type="button" className={s.ghost} onClick={() => void (async () => { for (const o of opts) if (imagesDe(c, o).length) await telechargerPng(visuel(o), `shine-${c.id}-s${serie}-carte${o.carte}-${langue}.png`) })().catch((e) => message(false, e.message))}><Download size={13} /> Les {opts.length - manquants} cartes (PNG)</button>}
                <button type="button" className={s.ghost} onClick={() => void supprimerSerie(serie)} aria-label="Supprimer la série"><Trash2 size={13} /></button>
              </div>
            </div>
            {opts[0].style && <details className={s.dirPrompt}><summary>Direction artistique commune</summary><p className={s.small}>{opts[0].style}</p></details>}
            {type === 'options' && <div className={s.dirOptions}>{opts.map((o, i) => <CarteOption key={o.id} c={c} o={o} rang={i + 1} type={type} langue={langue} genere={generation[o.id] ? Math.round((Date.now() - generation[o.id]) / 1000) : undefined} a={a} largeur={250} noms={noms} />)}</div>}
            {type !== 'options' && (
              <div className={s.dirMontage}>
                <div className={s.dirApercu}>
                  {type === 'carrousel'
                    ? <ApercuCarrousel cartes={opts.map(visuel)} legende={legende} bouton={bouton} largeur={290} />
                    : <LecteurReel plans={plans} langue={langue} bouton={bouton} largeur={250} nom={`shine-${c.id}-reel-s${serie}-${langue}`}
                        selection={ouvert[serie] ?? null} choisirPlan={(i) => setOuvert((x) => ({ ...x, [serie]: i }))} />}
                  {type === 'reel' && <p className={`${s.small} ${s.muted}`}>Ajoute un son tendance dans Instagram au moment de publier : les Reels avec son vont plus loin.</p>}
                </div>
                {type === 'reel'
                  ? <TableMontage c={c} d={d} opts={opts} langue={langue} brouillons={brouillons} setBrouillon={setBrouillon}
                      selection={ouvert[serie] ?? null} choisir={(i) => setOuvert((x) => ({ ...x, [serie]: i }))}
                      poster={poster} rafraichir={rafraichir} message={message} generer={generer} generation={generation} />
                  : <div className={s.dirBande}>{opts.map((o, i) => <CarteOption key={o.id} c={c} o={o} rang={i + 1} type={type} langue={langue} genere={generation[o.id] ? Math.round((Date.now() - generation[o.id]) / 1000) : undefined} a={{ ...a, utiliser: undefined }} largeur={210} noms={noms} />)}</div>}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
