'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, Clapperboard, Download, ExternalLink, Film, GalleryHorizontal, ImagePlus, Images, Loader2, MessageCircle, Paperclip, Send, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { FORMATS_IMAGE, type FormatImage, type Langue } from '@/lib/ads/creatif-model'
import { A_MONTRER, BORNES, INGREDIENTS, MOUVEMENTS, OBJECTIFS, OFFRES, RECETTES, STYLES, etapeDirection, type Message, type CleRecette, type AMontrer, type Idee, type Objectif, type Offre, type Style, type TypeDirection } from '@/lib/ads/direction-model'
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

const TYPES: Record<TypeDirection, { label: string; aide: string; effet: string; Icone: typeof Images }> = {
  reel: { label: 'Reel', aide: 'Vertical 9:16, 12 à 25 s, un MP4 prêt pour Instagram et les pubs.', effet: 'Le format qui va le plus loin (portée) et qui vend : il se regarde jusqu’au bout.', Icone: Clapperboard },
  carrousel: { label: 'Carrousel', aide: 'Des cartes cohérentes (même décor, même lumière), une idée par carte.', effet: 'On swipe et on l’enregistre : idéal pour une routine ou un comparatif.', Icone: GalleryHorizontal },
  options: { label: 'Images à tester', aide: 'Plusieurs concepts vraiment différents pour une même pub.', effet: 'Meta trouve celui qui ramène des commandes au moins cher.', Icone: Images },
}
/** Comment le Reel est fabrique : le plus gros effet sur le rendu, le temps et le cout. */
const RENDUS = {
  motion: {
    label: 'Motion Shine', Icone: Sparkles,
    aide: 'Tes vrais produits détourés, animés par le BOS sur des fonds Shine ou des décors peints ; schémas, post-it, étapes du site.',
    attendre: '5 à 15 min · quelques images OpenAI',
    ideal: 'Routines, packs, offres, explications (problème → solution).',
  },
  video: {
    label: 'Vidéo Higgsfield', Icone: Film,
    aide: 'Chaque plan est filmé par l’IA vidéo (Kling, Veo, Seedance…) depuis une image avec ton vrai produit : textures, mains, lumière réelle. Le directeur artistique choisit le modèle, le son et où va le texte.',
    attendre: '20 à 45 min · ≈ 50 à 120 crédits Higgsfield (chiffrés plan par plan dans sa proposition)',
    ideal: 'Une accroche visuelle forte, la texture, un rendu « pub télé ».',
  },
} as const
type Rendu = keyof typeof RENDUS
/** Ce que chaque objectif change dans la pub livree. */
const EFFET_OBJECTIF: Record<Objectif, string> = {
  site: 'Bouton « Commander », le prix, les vraies étapes du site si tu les coches.',
  dm: 'Bouton « Envoyer un message » : la fin invite à demander conseil en DM.',
  portee: 'Un appel à envoyer à une amie ou à enregistrer : c’est ce qu’Instagram pousse aux non-abonnées.',
}
const FORMAT_DEFAUT: Record<TypeDirection, FormatImage> = { options: 'feed', carrousel: 'feed', reel: 'story' }
const COURT: Record<FormatImage, string> = { feed: '4:5', story: '9:16', carre: '1:1' }
/** Une ligne « ce que ce choix change » sous chaque etape du brief. */
const Effet = ({ children }: { children: React.ReactNode }) => <small className={s.dirEffet}>→ {children}</small>

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
  const depart: TypeDirection = creatif?.format === 'carrousel' ? 'carrousel' : creatif?.format === 'reel' || creatif?.format === 'video' ? 'reel' : creatif ? 'options' : 'reel'
  // Une idee choisie ailleurs (l'accueil du studio) arrive deja appliquee.
  const [type, setType] = useState<TypeDirection>(idee?.type ?? depart)
  const [nombre, setNombre] = useState(idee?.nombre ?? BORNES[idee?.type ?? depart].defaut)
  const [format, setFormat] = useState<FormatImage>(idee?.format ?? FORMAT_DEFAUT[idee?.type ?? depart])
  const [styles, setStyles] = useState<Style[]>(idee?.styles ?? [])
  const [qualite, setQualite] = useState<'medium' | 'high'>(idee?.qualite ?? 'high')
  const [brief, setBrief] = useState(idee?.brief ?? '')
  const [produits, setProduits] = useState<number[]>(!creatif && idee ? idee.produitIds : [])
  // Ce que la pub doit obtenir : Shine vend sur le site ET en DM, ce ne sont pas les memes pubs.
  const [objectif, setObjectif] = useState<Objectif>(idee?.objectif ?? (creatif && /message|dm/i.test(creatif.cta || '') ? 'dm' : 'site'))
  const [offre, setOffre] = useState<Offre>(idee?.offre ?? 'aucune')
  const [montrer, setMontrer] = useState<AMontrer[]>(idee?.montrer ?? ['cod'])
  const [langue, setLangue] = useState<'fr' | 'darija' | 'mix'>('mix')
  const [fondShine, setFondShine] = useState(Boolean(idee?.fondShine))
  // Le style : une recette prouvee (sa charpente est imposee) ou « libre » (le directeur artistique invente).
  const [recette, setRecette] = useState<CleRecette | null>(idee?.recette ?? null)
  // Le rendu d'un Reel : l'animation Shine, ou tout filme par Higgsfield.
  const [rendu, setRendu] = useState<Rendu>('motion')
  // Discuter avant de creer : le directeur artistique propose d'abord, Achraf valide.
  const [alignement, setAlignement] = useState(true)
  // En video : le storyboard (images + accroche filmee) avant de depenser le reste des credits.
  const [storyboard, setStoryboard] = useState(true)
  const video = type === 'reel' && rendu === 'video'
  const choisirRecette = (r: CleRecette | null) => {
    setRecette(r)
    if (r) { setType('reel'); setRendu('motion'); setNombre(RECETTES[r].plans.length); setFormat('story'); setFondShine(true) }
  }
  const choisirRendu = (r: Rendu) => { setRendu(r); if (r === 'video') { setRecette(null); setFondShine(false); setNombre((n) => Math.max(n, 5)) } }
  const choisirObjectif = (o: Objectif) => { setObjectif(o); if (o !== 'site') setMontrer((m) => m.filter((x) => x !== 'site')) }
  const basculerMontrer = (m: AMontrer) => setMontrer((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m]))
  const [recherche, setRecherche] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const b = BORNES[type]

  const changerType = (x: TypeDirection) => { setType(x); setNombre(BORNES[x].defaut); setFormat(FORMAT_DEFAUT[x]); if (x !== 'reel') setRecette(null) }
  const appliquer = (i: Idee) => {
    setType(i.type); setNombre(i.nombre); setFormat(i.format); setStyles(i.styles); setQualite(i.qualite); setBrief(i.brief)
    if (!creatif) setProduits(i.produitIds)
    setRecette(i.recette ?? null)
    if (i.recette) setRendu('motion')
    if (i.objectif) setObjectif(i.objectif)
    if (i.offre) setOffre(i.offre)
    if (i.montrer) setMontrer(i.montrer)
    if (i.fondShine != null) setFondShine(i.fondShine)
  }
  const ajouter = (x: string) => setBrief((y) => (y.trim() ? `${y.trim()}\n• ${x}` : `• ${x}`))
  const basculer = (id: number) => setProduits((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 6 ? p : [...p, id]))
  const trouves = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return d.catalogue.filter((p) => !q || `${p.marque} ${p.nom}`.toLowerCase().includes(q)).slice(0, 40)
  }, [d.catalogue, recherche])
  const nomProduit = new Map(d.catalogue.map((p) => [p.id, `${p.marque} ${p.nom}`]))
  // Les etapes se numerotent dans l'ordre ou elles s'affichent.
  let etape = 0
  const num = () => <span className={s.etapeNum}>{++etape}</span>

  // « Ce que tu vas recevoir » : tout ce que les choix ci-dessus decident, en clair.
  const duree = Math.round(nombre * (video ? 3.5 : 3))
  const livrable = type === 'reel'
    ? `Un Reel 9:16 de ${nombre} plans (~${duree} s)${video ? ', chaque plan filmé par Higgsfield' : recette ? `, recette « ${RECETTES[recette].nom} »` : ', charpente inventée pour ton brief'}`
    : type === 'carrousel' ? `Un carrousel de ${nombre} cartes (${COURT[format]})` : `${nombre} images à tester (${COURT[format]})`
  const verifie = [
    ...(type === 'reel' ? montrer.filter((m) => m !== 'site' || objectif === 'site').map((m) => A_MONTRER[m]) : []),
    ...(offre !== 'aucune' ? [OFFRES[offre]] : []),
    ...(type === 'reel' && fondShine && !video ? ['Fond Shine sur tous les plans'] : []),
    ...(!creatif && produits.some((id) => d.catalogue.find((p) => p.id === id)?.composants) ? ['Chaque produit du pack, aucun oublié'] : []),
  ]
  const delai = type === 'reel' ? RENDUS[rendu].attendre : '5 à 15 min · une image OpenAI par visuel'
  const manque = !creatif && !produits.length ? 'Choisis au moins un produit.' : !creatif && brief.trim().length < 10 ? 'Écris ton idée en une phrase au moins.' : null

  const envoyer = async () => {
    setEnvoi(true)
    try {
      const j = await poster({ direction: {
        type, nombre, format, styles, qualite, brief, objectif, offre, montrer, langue, rendu: type === 'reel' ? rendu : 'motion', alignement, storyboard,
        fond: type === 'reel' && !video && fondShine ? 'shine' : 'libre', ...(recette && !video ? { recette } : {}), ...(creatif ? { creatifId: creatif.id } : { produitIds: produits }),
      } })
      envoye(alignement
        ? (j.lancee ? 'Brief envoyé : le directeur artistique prépare sa proposition (≈ 5 min). Elle arrive dans « En cours » : tu réponds ou tu valides, puis il crée.' : 'Brief envoyé : le directeur artistique te fait sa proposition à son prochain passage (chaque heure, de 8 h à 23 h).')
        : (j.lancee ? `Brief envoyé : Claude crée maintenant (${delai.split(' · ')[0]}).` : 'Brief envoyé : Claude le prend à son prochain passage (chaque heure, de 8 h à 23 h).'))
    } catch (e) { erreur(e instanceof Error ? e.message : 'Échec') } finally { setEnvoi(false) }
  }

  return (
    <div className={s.dirBrief}>
      <ol className={s.dirDeroule}>
        <li><b>Tu fais le brief</b><small>Les choix ci-dessous, et ton idée en toutes lettres.</small></li>
        <li><b>Vous vous alignez</b><small>Il te propose l’idée, l’accroche et les plans ; tu réponds ou tu valides.</small></li>
        <li><b>Il crée, tu retouches</b><small>La pub arrive dans le Studio : plan par plan, tu corriges ou tu lui fais refaire.</small></li>
      </ol>

      {d.idees.length > 0 && !creatif && <details className={s.dirPlie}><summary><Sparkles size={13} /> Idées prêtes, tirées de tes chiffres ({d.idees.length}) — un clic remplit le brief</summary>
        <div className={s.dirIdees}>{d.idees.map((i) => (
          <button key={i.id} type="button" className={s.dirIdee} onClick={() => appliquer(i)}>
            <span className={s.carteTop}>{i.recette ? <span className={`${s.chip} ${s.chipVert}`}>Recette · {RECETTES[i.recette].nom}</span> : <><span className={s.chip}>{TYPES[i.type].label}</span><span className={s.chip}>{COURT[i.format]}</span></>}</span>
            <b>{i.titre}</b><small>{i.pourquoi}</small>
          </button>))}
        </div>
      </details>}

      {!creatif && <fieldset className={s.reglage}><legend>{num()} Quoi vendre ({produits.length}/6)</legend>
        <Effet>Le vrai produit est reproduit à l’identique (photo de la fiche) ; un pack est montré produit par produit.</Effet>
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

      <fieldset className={s.reglage}><legend>{num()} Pour obtenir quoi ?</legend>
        <div className={s.dirTypes}>{(Object.keys(OBJECTIFS) as Objectif[]).map((o) => (
          <button key={o} type="button" aria-pressed={objectif === o} onClick={() => choisirObjectif(o)}><b>{OBJECTIFS[o].label}</b><small>{EFFET_OBJECTIF[o]}</small></button>))}
        </div>
      </fieldset>

      <fieldset className={s.reglage}><legend>{num()} Le format</legend>
        <div className={s.dirTypes}>{(['reel', 'carrousel', 'options'] as TypeDirection[]).map((x) => {
          const { label, aide, effet, Icone } = TYPES[x]
          return <button key={x} type="button" aria-pressed={type === x} onClick={() => changerType(x)}><span className={s.carteTop}><Icone size={15} /><b>{label}</b></span><small>{aide}</small><small className={s.dirEffetCarte}>→ {effet}</small></button>
        })}</div>
      </fieldset>

      {type === 'reel' && <fieldset className={s.reglage}><legend>{num()} Le rendu</legend>
        <Effet>Le choix qui change le plus le résultat : le look, le temps de fabrication et ce que ça coûte.</Effet>
        {d.higgsfield && (d.higgsfield.mois > 0 || d.higgsfield.nonChiffresMois > 0) && <small className={s.muted}>Higgsfield depuis le 1er du mois : {d.higgsfield.mois.toLocaleString('fr-FR')} crédits notés par le directeur artistique{d.higgsfield.nonChiffresMois ? ` (+ ${d.higgsfield.nonChiffresMois} génération(s) non chiffrée(s))` : ''}.</small>}
        <div className={s.dirRendus}>{(Object.keys(RENDUS) as Rendu[]).map((r) => {
          const x = RENDUS[r]
          return (
            <button key={r} type="button" aria-pressed={rendu === r} onClick={() => choisirRendu(r)}>
              <span className={s.carteTop}><x.Icone size={15} /><b>{x.label}</b></span>
              <small>{x.aide}</small>
              <small><b>Idéal :</b> {x.ideal}</small>
              <small className={s.dirEffetCarte}>⏱ {x.attendre}</small>
            </button>)
        })}</div>
      </fieldset>}

      {type === 'reel' && !video && <fieldset className={s.reglage}><legend>{num()} Le style : le mécanisme qui fait regarder puis acheter</legend>
        <Effet>Une recette impose la charpente plan par plan (celles qui t’ont plu) ; « Libre » laisse le directeur artistique l’inventer à partir de ton idée.</Effet>
        <div className={s.dirRecettes}>
          <button type="button" className={s.dirRecette} aria-pressed={recette === null} onClick={() => choisirRecette(null)}>
            <span className={s.carteTop}><b>Libre</b><span className={s.chip}>Sur mesure</span></span>
            <small>Il invente la charpente à partir de ton idée, sans reprendre celle d’un Reel récent.</small>
          </button>
          {(Object.keys(RECETTES) as CleRecette[]).map((r) => {
            const x = RECETTES[r]
            return (
              <button key={r} type="button" className={s.dirRecette} aria-pressed={recette === r} onClick={() => choisirRecette(recette === r ? null : r)}>
                <span className={s.carteTop}><b>{x.nom}</b><span className={s.chip}>{x.pour}</span><small className={s.muted}>{x.exemple}</small></span>
                <small>{x.mecanisme}</small>
                <small className={s.muted}>Idéal : {x.ideal}</small>
                <small className={s.muted}>{x.plans.length} plans · ~{Math.round(x.plans.reduce((n, pl) => n + pl.duree, 0))} s : {x.plans.map((pl) => pl.role.split(' :')[0]).join(' → ')}</small>
              </button>)
          })}
        </div>
      </fieldset>}

      {!recette && <fieldset className={s.reglage}><legend>{num()} La taille</legend>
        <div className={s.genererLigne}>
          <label className={s.champ}>{type === 'carrousel' ? 'Cartes' : type === 'reel' ? 'Plans' : 'Images'}
            <select className={s.select} value={nombre} onChange={(e) => setNombre(Number(e.target.value))}>
              {Array.from({ length: b.max - (video ? 2 : b.min) + 1 }, (_, i) => (video ? 2 : b.min) + i).map((x) => <option key={x} value={x}>{x}{type === 'reel' ? ` plans (~${Math.round(x * (video ? 3.5 : 3))} s)` : ''}</option>)}
            </select></label>
          {type !== 'reel' && <label className={s.champ}>Format
            <select className={s.select} value={format} onChange={(e) => setFormat(e.target.value as FormatImage)}>
              {b.formats.map((f) => <option key={f} value={f}>{FORMATS_IMAGE[f].label}</option>)}
            </select></label>}
          <label className={s.champ}>Qualité des images
            <select className={s.select} value={qualite} onChange={(e) => setQualite(e.target.value as 'medium' | 'high')}>
              <option value="high">Haute (la pub)</option><option value="medium">Standard (pour tester)</option>
            </select></label>
        </div>
        <Effet>{type === 'reel' ? `Plus de plans = une histoire plus complète ; l’accroche tient en 2,5 s et le tout reste entre 12 et 25 s.${video ? ' En vidéo, chaque plan est un clip (des crédits).' : ''}` : 'Chaque carte ou image est peinte avec ton vrai produit.'}</Effet>
      </fieldset>}

      <fieldset className={s.reglage}><legend>{num()} Ce qui doit se voir</legend>
        <Effet>{type === 'reel' ? 'Chaque case est vérifiée par le BOS : un Reel qui en oublie une est refusé et refait.' : 'Le directeur artistique en tient compte dans chaque visuel.'}</Effet>
        <div className={s.dirChips}>{(Object.keys(A_MONTRER) as AMontrer[]).map((m) => (
          <button key={m} type="button" className={s.filtre} aria-pressed={montrer.includes(m)} disabled={m === 'site' && (type !== 'reel' || objectif !== 'site')} onClick={() => basculerMontrer(m)}>{montrer.includes(m) ? '✓ ' : ''}{A_MONTRER[m]}</button>))}
        </div>
        <div className={s.genererLigne}>
          <label className={s.champ}>Offre à mettre en avant
            <select className={s.select} value={offre} onChange={(e) => setOffre(e.target.value as Offre)}>
              {(Object.keys(OFFRES) as Offre[]).map((o) => <option key={o} value={o}>{OFFRES[o]}</option>)}
            </select></label>
          <label className={s.champ}>Langue du texte
            <select className={s.select} value={langue} onChange={(e) => setLangue(e.target.value as 'fr' | 'darija' | 'mix')}>
              <option value="mix">Français + darija</option><option value="fr">Français</option><option value="darija">Darija</option>
            </select></label>
        </div>
        {type === 'reel' && !video && <label className={s.caseInline}><input type="checkbox" checked={fondShine} onChange={(e) => setFondShine(e.target.checked)} /> Fond Shine : un dégradé vert aux couleurs de la maison sur tous les plans (aucun décor peint)</label>}
        <small className={s.muted}>Les offres viennent des vraies règles de la boutique (livraison, code de bienvenue) : rien d’inventé.</small>
      </fieldset>

      <fieldset className={s.reglage}><legend>{num()} Ton idée, en toutes lettres</legend>
        <Effet>Chaque ligne est une consigne qu’un plan doit tenir (tu verras lequel dans l’onglet Brief). Plus tu es précis, moins il invente.</Effet>
        <textarea rows={5} className={s.champTexte} value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={2000}
          placeholder={video ? 'Ex. : une goutte de sérum tombe au ralenti sur une main au soleil ; la texture qui s’étale ; elle sourit dans son miroir ; fin avec le prix du pack.' : type === 'reel' ? 'Ex. : accroche « Cheveux secs après la plage ? » ; le flacon tombe sur une serviette ; la texture ; les étapes du site ; fin avec le prix.' : 'Ex. : le flacon sur une étagère en zellige, lumière du matin, des mains qui l’appliquent sur des cheveux bouclés.'} />
        <details className={s.dirPlie}><summary>Ajouter des morceaux d’idée d’un clic</summary>
          <div className={s.dirIngredients}>{INGREDIENTS.map((g) => (
            <div key={g.groupe}><small>{g.groupe}</small>{g.items.map((x) => <button key={x} type="button" className={s.filtre} onClick={() => ajouter(x)}>+ {x}</button>)}</div>))}
          </div>
          <div><small className={s.muted}>Ambiance du décor :</small>
            <div className={s.dirChips}>{(Object.keys(STYLES) as Style[]).map((x) => (
              <button key={x} type="button" className={s.filtre} aria-pressed={styles.includes(x)} onClick={() => setStyles((y) => (y.includes(x) ? y.filter((z) => z !== x) : y.length >= 4 ? y : [...y, x]))}>{STYLES[x]}</button>))}
            </div></div>
        </details>
      </fieldset>

      <fieldset className={s.reglage}><legend>{num()} Avant de créer</legend>
        <label className={s.caseInline}><input type="checkbox" checked={alignement} onChange={(e) => setAlignement(e.target.checked)} /> <b>Discuter d’abord avec le directeur artistique</b></label>
        <Effet>{alignement ? `Il te propose l’idée, l’accroche et chaque plan${video ? ' (avec les modèles vidéo et le coût en crédits)' : ''}, avec ses questions. Rien n’est créé avant ton « Valider ».` : 'Il crée directement à partir du brief : plus rapide, mais tu découvres l’idée à l’arrivée.'}</Effet>
        {video && alignement && <label className={s.caseInline}><input type="checkbox" checked={storyboard} onChange={(e) => setStoryboard(e.target.checked)} /> <b>Storyboard avant de filmer</b></label>}
        {video && alignement && <Effet>{storyboard ? 'Après ton OK sur l’idée, il fait toutes les images de départ et ne filme que l’accroche (≈ 20 à 40 crédits). Tu regardes le tout dans le Studio ; le reste n’est filmé qu’après ton second OK.' : 'Après ton OK sur l’idée, il filme tous les plans d’un coup.'}</Effet>}
      </fieldset>

      <section className={s.dirRecap} aria-label="Ce que tu vas recevoir">
        <b>Ce que tu vas recevoir</b>
        <ul>
          <li>{livrable}.</li>
          <li>{OBJECTIFS[objectif].label} : {EFFET_OBJECTIF[objectif]}</li>
          {verifie.length > 0 && <li>Vérifié avant livraison : {verifie.join(' · ')}.</li>}
          <li>{alignement ? (video && storyboard ? 'Sa proposition (≈ 5 min), puis le storyboard (images + accroche filmée, ≈ 20 à 40 crédits), chacun à valider, puis la vidéo' : 'D’abord sa proposition (≈ 5 min) à valider, puis la création') : 'La création directement'} : {delai}.</li>
        </ul>
        <div className={s.btns}>
          <button type="button" className={s.primary} disabled={envoi || Boolean(manque)} onClick={() => void envoyer()}>
            {envoi ? <Loader2 size={14} className={s.tourne} /> : <Wand2 size={14} />} {alignement ? 'Envoyer et discuter' : 'Envoyer et créer'}
          </button>
          {manque && <span className={`${s.small} ${s.muted}`}>{manque}</span>}
        </div>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* LES DEMANDES EN COURS                                               */
/* ------------------------------------------------------------------ */

const ENCOURS = ['en_attente', 'en_cours', 'a_valider']
/** Le texte d'un message : seul le **gras** du directeur artistique est interprete (le reste reste du texte). */
export const avecGras = (texte: string) => texte.split(/\*\*(.+?)\*\*/g).map((x, i) => (i % 2 ? <b key={i}>{x}</b> : x))

export function DirectionsEnCours({ demandes, creatifId, rafraichir, dire }: { demandes: Demande[]; creatifId: number | null; rafraichir?: () => Promise<void> | void; dire?: (ok: boolean, t: string) => void }) {
  const [ouverte, setOuverte] = useState<number | null>(null)
  const liste = demandes.filter((x) => x.genre === 'direction' && (creatifId == null ? !x.creatif_id || ENCOURS.includes(x.statut) : x.creatif_id === creatifId)
    && (ENCOURS.includes(x.statut) || (x.statut === 'erreur' && Date.now() - new Date(x.termine_le || x.demande_le).getTime() < 864e5)))
  if (!liste.length) return null
  const courante = liste.find((x) => x.id === ouverte)
  const derniere = (x: Demande) => [...(x.echanges ?? [])].reverse().find((m) => m.auteur === 'agent')
  const titre = (x: Demande) => x.statut === 'a_valider' ? (derniere(x)?.palier === 'storyboard' ? 'Le storyboard t’attend' : 'Sa proposition t’attend')
    : x.statut === 'en_attente' ? (x.valide_le ? 'Validé : la création va partir' : x.echanges?.length ? 'Il relit ta réponse' : x.parametres?.alignement ? 'Il prépare sa proposition' : 'En attente du directeur artistique')
      : x.statut === 'en_cours' ? (x.valide_le || !x.parametres?.alignement ? 'Claude crée la pub' : 'Il prépare sa proposition') : 'Direction impossible'
  return (
    <div className={s.dirAttentes}>{liste.map((x) => (
      <div key={x.id} className={`${s.notice} ${x.statut === 'erreur' ? s.error : x.statut === 'a_valider' ? s.warn : ''}`}>
        {x.statut === 'erreur' ? <AlertTriangle size={14} /> : x.statut === 'a_valider' ? <MessageCircle size={14} /> : <Loader2 size={14} className={s.tourne} />}{' '}
        <b>{titre(x)}</b> — {x.sujet.length > 160 ? `${x.sujet.slice(0, 160)}…` : x.sujet}
        <span className={s.muted}> · demandée {quand(x.demande_le)}</span>{x.erreur ? <><br />{x.erreur}</> : null}
        {(x.statut === 'a_valider' || (x.echanges?.length ?? 0) > 0) && x.statut !== 'erreur' && (
          <div className={s.btns}>
            <button type="button" className={x.statut === 'a_valider' ? s.primary : s.ghost} onClick={() => setOuverte(x.id)}><MessageCircle size={13} /> {x.statut === 'a_valider' ? 'Lire et répondre' : 'Voir la discussion'}</button>
            {x.creatif_id && x.statut === 'a_valider' && derniere(x)?.palier === 'storyboard' && <a className={s.ghost} href={`/ads/studio?c=${x.creatif_id}`}><ExternalLink size={13} /> Voir le storyboard</a>}
          </div>)}
      </div>))}
      {/* Au-dessus de tout (la bibliotheque du studio a son propre empilement : le bandeau du BOS couvrait le titre). */}
      {courante && createPortal(<Discussion x={courante} fermer={() => setOuverte(null)} rafraichir={rafraichir} dire={dire} />, document.body)}
    </div>
  )
}

/** Un message : le **gras** du directeur artistique, et les liens cliquables. */
const avecLiens = (texte: string) => texte.split(/(https:\/\/[^\s)»"]+)/g).map((x, i) => (i % 2 ? <a key={i} href={x} target="_blank" rel="noreferrer">{x.length > 60 ? `${x.slice(0, 57)}…` : x}</a> : <span key={i}>{avecGras(x)}</span>))
type PieceJointe = { type: 'image' | 'video' | 'lien'; url: string }
const miniature = (url: string) => url.replace('/image/upload/', '/image/upload/c_limit,w_320,h_320,f_auto/')

function Pieces({ pieces }: { pieces?: PieceJointe[] }) {
  if (!pieces?.length) return null
  return (
    <div className={s.dirPieces}>{pieces.map((p, i) => p.type === 'image'
      ? <a key={i} href={p.url} target="_blank" rel="noreferrer"><img src={miniature(p.url)} alt="Pièce jointe" /></a>
      : p.type === 'video'
        ? <video key={i} src={p.url} controls muted playsInline preload="metadata" />
        : <a key={i} className={s.dirLien} href={p.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> {p.url.replace(/^https:\/\/(www\.)?/, '').slice(0, 48)}</a>)}
    </div>
  )
}

/** La discussion avant la creation : la proposition du directeur artistique, les reponses d'Achraf, les paliers, les pieces jointes. */
function Discussion({ x, fermer, rafraichir, dire }: { x: Demande; fermer: () => void; rafraichir?: () => Promise<void> | void; dire?: (ok: boolean, t: string) => void }) {
  const [texte, setTexte] = useState('')
  const [jointes, setJointes] = useState<PieceJointe[]>([])
  const [envoiPiece, setEnvoiPiece] = useState<number | null>(null)
  const [envoi, setEnvoi] = useState<null | 'reponse' | 'valide' | 'abandon'>(null)
  const peutRepondre = x.statut === 'a_valider'
  const p = x.parametres
  const derniere = [...(x.echanges ?? [])].reverse().find((m) => m.auteur === 'agent')
  const surStoryboard = derniere?.palier === 'storyboard'
  const etat = etapeDirection(p ?? {}, (x.echanges ?? []) as Message[])
  // Les photos et videos partent du navigateur vers Cloudinary (signees par le BOS), puis vont dans le message.
  const joindre = async (fichiers: FileList | null) => {
    for (const f of Array.from(fichiers ?? []).slice(0, 8 - jointes.length)) {
      const video = f.type.startsWith('video/')
      if (f.size > (video ? 95 : 15) * 1048576) { dire?.(false, `${f.name} : trop lourd (${video ? '95' : '15'} Mo au plus).`); continue }
      setEnvoiPiece(0)
      try {
        const sig = (await poster({ pieceSignature: video ? 'video' : 'image' })) as { url: string; apiKey: string; timestamp: string; folder: string; signature: string }
        const fd = new FormData()
        fd.append('file', f); fd.append('api_key', sig.apiKey); fd.append('timestamp', sig.timestamp); fd.append('folder', sig.folder); fd.append('signature', sig.signature)
        const r = await new Promise<{ secure_url?: string; error?: { message?: string } }>((ok, ko) => {
          const q = new XMLHttpRequest()
          q.open('POST', sig.url)
          q.upload.onprogress = (e) => { if (e.lengthComputable) setEnvoiPiece(Math.round((e.loaded / e.total) * 100)) }
          q.onload = () => { try { ok(JSON.parse(q.responseText)) } catch { ko(new Error('Réponse de Cloudinary illisible.')) } }
          q.onerror = () => ko(new Error('Envoi interrompu (réseau).'))
          q.send(fd)
        })
        if (!r.secure_url) throw new Error(`Cloudinary : ${r.error?.message ?? 'envoi refusé'}`)
        setJointes((j) => [...j, { type: video ? 'video' : 'image', url: r.secure_url! }])
      } catch (e) { dire?.(false, e instanceof Error ? e.message : 'Envoi impossible') } finally { setEnvoiPiece(null) }
    }
  }
  const agir = async (quoi: 'reponse' | 'valide' | 'abandon') => {
    if (quoi === 'abandon' && !window.confirm(x.creatif_id ? 'Abandonner ce brief ? Ce qui est déjà créé reste dans la bibliothèque.' : 'Abandonner ce brief ? Rien n’a encore été créé.')) return
    setEnvoi(quoi)
    try {
      const corps = { id: x.id, texte, pieces: jointes }
      const j = await poster(quoi === 'reponse' ? { directionReponse: corps } : quoi === 'valide' ? { directionValidee: corps } : { directionAbandonnee: x.id })
      dire?.(true, quoi === 'reponse' ? (j.lancee ? 'Réponse envoyée : il ajuste (≈ 5 min).' : 'Réponse envoyée : il la lit à son prochain passage.')
        : quoi === 'valide' ? (surStoryboard ? (j.lancee ? 'Storyboard validé : il filme le reste maintenant.' : 'Storyboard validé : il filme le reste à son prochain passage.') : (j.lancee ? 'Validé : il commence maintenant.' : 'Validé : il commence à son prochain passage.')) : 'Brief abandonné.')
      setTexte(''); setJointes([])
      fermer()
      await rafraichir?.()
    } catch (e) { dire?.(false, e instanceof Error ? e.message : 'Échec') } finally { setEnvoi(null) }
  }
  return (
    <div className={s.drawer} role="dialog" aria-modal="true" aria-label="Discussion avec le directeur artistique" onClick={fermer}>
      <div className={s.drawerBody} onClick={(e) => e.stopPropagation()}>
        <div className={s.panelHeader} style={{ padding: 0 }}>
          <div><p className={s.eyebrow}>Avant la création</p><h2>Discussion avec le directeur artistique</h2></div>
          <button type="button" className={s.ghost} onClick={fermer} aria-label="Fermer"><X size={14} /></button>
        </div>
        <p className={`${s.small} ${s.muted}`}>{x.sujet}</p>
        {p && <p className={s.dirChips}>
          <span className={s.chip}>{p.type === 'reel' ? (p.rendu === 'video' ? 'Reel vidéo Higgsfield' : 'Reel motion') : p.type === 'carrousel' ? 'Carrousel' : 'Images à tester'} · {p.nombre}</span>
          {p.objectif && <span className={s.chip}>{OBJECTIFS[p.objectif].label}</span>}
          {p.recette && <span className={`${s.chip} ${s.chipVert}`}>{RECETTES[p.recette].nom}</span>}
          {p.offre && p.offre !== 'aucune' && <span className={s.chip}>{OFFRES[p.offre]}</span>}
        </p>}
        {p?.alignement && <ol className={s.dirPaliers}>
          <li data-etat={etat.idee ? 'fait' : 'encours'}>① L’idée</li>
          {etat.storyboard !== null && <li data-etat={etat.storyboard ? 'fait' : etat.idee ? 'encours' : 'avenir'}>② Le storyboard</li>}
          <li data-etat={etat.etape === 'creer' ? 'encours' : 'avenir'}>{etat.storyboard !== null ? '③' : '②'} {p.rendu === 'video' ? 'La vidéo' : 'La création'}</li>
        </ol>}
        <div className={s.dirFil}>
          {(x.echanges ?? []).map((m, i) => (
            <div key={i} className={m.auteur === 'agent' ? s.dirMsgAgent : s.dirMsgMoi}>
              <small className={s.muted}>{m.auteur === 'agent' ? (m.palier === 'storyboard' ? 'Directeur artistique · storyboard' : 'Directeur artistique') : 'Toi'} · {quand(m.le)}</small>
              <div className={s.dirMsgTexte}>{avecLiens(m.texte)}</div>
              <Pieces pieces={m.pieces} />
            </div>))}
          {!peutRepondre && <p className={`${s.small} ${s.muted}`}><Loader2 size={12} className={s.tourne} /> {x.valide_le ? 'Validé : il est au travail.' : 'Il prépare sa réponse…'}</p>}
        </div>
        {peutRepondre && <div className={s.dirReponse}>
          {surStoryboard && x.creatif_id && <p className={`${s.notice} ${s.warn}`} style={{ marginTop: 0 }}>Regarde le storyboard dans le Studio (images de départ, accroche filmée, textes, carte de fin) avant de valider : <a href={`/ads/studio?c=${x.creatif_id}`}>ouvrir la création</a>. Le reste des crédits ne part qu’après ton « Valider ».</p>}
          <textarea rows={4} className={s.champTexte} value={texte} onChange={(e) => setTexte(e.target.value)} maxLength={4000}
            placeholder={surStoryboard ? 'Plan par plan : ce qui va, ce qu’il faut refaire avant de filmer (« plan 3 : tube plus grand »)… Colle aussi des liens.' : 'Ta réponse : ce qui te plaît, ce qu’il faut changer, tes réponses à ses questions… Colle aussi des liens (TikTok, Instagram, Ad Library).'} />
          {(jointes.length > 0 || envoiPiece != null) && <div className={s.dirPieces}>
            {jointes.map((j, i) => (
              <span key={j.url} className={s.dirPieceJointe}>
                {j.type === 'image' ? <img src={miniature(j.url)} alt="" /> : <video src={j.url} muted playsInline preload="metadata" />}
                <button type="button" onClick={() => setJointes((y) => y.filter((_, k) => k !== i))} aria-label="Retirer"><X size={11} /></button>
              </span>))}
            {envoiPiece != null && <span className={s.dirPieceJointe}><Loader2 size={14} className={s.tourne} /> {envoiPiece} %</span>}
          </div>}
          <div className={s.btns}>
            <button type="button" className={s.primary} disabled={envoi != null || envoiPiece != null} onClick={() => void agir('valide')}>{envoi === 'valide' ? <Loader2 size={14} className={s.tourne} /> : <Check size={14} />} {surStoryboard ? 'Valider et filmer le reste' : etat.storyboard !== null ? 'Valider l’idée (storyboard ensuite)' : 'Valider et lancer la création'}</button>
            <button type="button" className={s.ghost} disabled={envoi != null || envoiPiece != null || texte.trim().length < 2} onClick={() => void agir('reponse')}>{envoi === 'reponse' ? <Loader2 size={14} className={s.tourne} /> : <Send size={14} />} Répondre (il ajuste)</button>
            <label className={`${s.ghost} ${s.clipEnvoi}`} aria-disabled={envoiPiece != null || jointes.length >= 8}>
              <input type="file" accept="image/*,video/*" multiple disabled={envoiPiece != null || jointes.length >= 8} onChange={(e) => { const f = e.target.files; void joindre(f).finally(() => { e.target.value = '' }) }} />
              <Paperclip size={13} /> Joindre photo / vidéo
            </label>
            <button type="button" className={s.ghost} disabled={envoi != null} onClick={() => void agir('abandon')}><Trash2 size={13} /> Abandonner</button>
          </div>
          <small className={s.muted}>{surStoryboard ? '« Valider » : il filme les plans restants, avec tes remarques ci-dessus. « Répondre » : il corrige le storyboard et te le renvoie.' : '« Valider » : il avance à l’étape suivante (ton texte compte comme dernière consigne). « Répondre » : il revient avec une proposition ajustée.'} Il regarde tes photos et vidéos, et ouvre les liens publics (Instagram et TikTok bloquent souvent les robots : une capture d’écran passe toujours).</small>
        </div>}
      </div>
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
    const manquants = opts.filter((o) => !imagesDe(c, o).length && (!o.motion?.fond || o.motion.fond === 'decor') && !o.motion?.clip && !o.motion?.sansDepart)
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
