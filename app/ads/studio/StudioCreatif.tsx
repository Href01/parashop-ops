'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, CheckCircle2, Circle, Clapperboard, Copy, Download, GalleryHorizontal, ImagePlus, Images, Link2, Loader2, Mic, Plus, Search, Sparkles, Wand2, X } from 'lucide-react'
import BosShell from '@/components/BosShell'
import { BOUTONS, FORMATS_IMAGE, formatParDefaut, type FormatImage, type Langue } from '@/lib/ads/creatif-model'
import { A_MONTRER, OBJECTIFS, OFFRES, RECETTES, consignesBrief, fautesFrancais, motsVoixMax, type AMontrer, type Idee } from '@/lib/ads/direction-model'
import { ApercuCarrousel, ApercuFeed, ApercuStory, telechargerPng, type Visuel } from '../agent/ui/Apercu'
import { LecteurReel } from '../agent/ui/Reel'
import { TableMontage, depuisOption, planDessin, type Brouillon } from '../agent/ui/Montage'
import { BriefDirection, CarteOption, DirectionsEnCours, avecGras, imagesDe, lisible, poster, texteDe, typeDeSerie, useActionsSerie } from '../agent/ui/Direction'
import { STATUTS_CREATIF, dh1, quand, type BaseCreative, type Creatif, type Demande, type Image, type Lecon, type Option } from '../agent/ui/types'
import { dureeVoixPlan, hashtags, verifierPublication } from './publier'
import a from '../agent/agent.module.css'
import s from './studio.module.css'

/**
 * LE STUDIO CREATIF — une page a lui, organisee comme un outil de creation :
 * la bibliotheque a gauche, la scene au centre (l'apercu tel qu'Instagram le
 * montrera, en francais, darija ou arabe), l'inspecteur a droite (plans,
 * textes, son, publication). Le parcours : brief → direction de Claude →
 * montage → verification → mise en ligne → resultats.
 */

type Resultat = { depense: number; messages: number; achats: number; coutParResultat: number | null; ctr: number | null; verdict: string | null; statut: string | null }
type CreatifStudio = Creatif & { resultat: Resultat | null }
type Donnees = BaseCreative & {
  strategie: { langues: string[]; ton: string; public: string }
  creatifs: CreatifStudio[]
  pubsEnLigne: { adId: string; nom: string | null; vignette: string | null }[]
  lecons: Lecon[]
}
type TypeCrea = 'reel' | 'carrousel' | 'options' | 'image'
type OngletInspecteur = 'brief' | 'plans' | 'textes' | 'son' | 'publier'

const ETAPES = ['idee', 'validee', 'produite', 'en_ligne'] as const
const LANGUES: [Langue, string][] = [['fr', 'Français'], ['darija', 'Darija'], ['ar', 'العربية']]
const ICONES: Record<TypeCrea, typeof Images> = { reel: Clapperboard, carrousel: GalleryHorizontal, options: Images, image: ImagePlus }
const NOMS: Record<TypeCrea, string> = { reel: 'Reel', carrousel: 'Carrousel', options: 'Options', image: 'Image' }

/** Les series d'une creation (la plus recente d'abord) et son type d'affichage. */
function seriesDe(c: Creatif) {
  const m = new Map<number, Option[]>()
  for (const o of c.options) m.set(o.serie, [...(m.get(o.serie) ?? []), o])
  return [...m.entries()].sort((x, y) => y[0] - x[0]).map(([serie, opts]) => ({ serie, opts: [...opts].sort((x, y) => (x.carte ?? x.id) - (y.carte ?? y.id)), type: typeDeSerie(opts) as TypeCrea }))
}
const typeDe = (c: Creatif): TypeCrea => seriesDe(c)[0]?.type ?? (c.format === 'carrousel' ? 'carrousel' : 'image')
const vignette = (c: Creatif): string | null => {
  const seules = c.images.filter((i) => i.carte == null)
  const img = seules.find((i) => i.choisie) ?? seules[0] ?? c.images.filter((i) => i.carte === 1).sort((x, y) => y.cree_le.localeCompare(x.cree_le))[0] ?? c.images[0]
  return img ? img.url.replace('/upload/', '/upload/c_fill,w_120,h_160,f_auto/') : null
}

export default function StudioCreatif() {
  const [d, setD] = useState<Donnees | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  // La creation ouverte se retient dans l'adresse (?c=12) : un lien ou un retour arriere y revient.
  // Rien ne s'affiche avant la lecture des donnees : l'etat lu ici ne change pas le premier rendu.
  const [choisi, setChoisi] = useState<number | null>(() => (typeof window === 'undefined' ? null : Number(new URLSearchParams(window.location.search).get('c')) || null))
  const [filtre, setFiltre] = useState<'tous' | TypeCrea>('tous')
  const [etape, setEtape] = useState<'actives' | (typeof ETAPES)[number] | 'ecartee'>('actives')
  const [recherche, setRecherche] = useState('')
  // Le brief s'ouvre vide (true) ou deja rempli par une idee.
  const [nouveauBrief, setNouveauBrief] = useState<boolean | Idee>(false)

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/ops/ads/agent?vue=studio', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Lecture impossible')
      setD(j); setErreur(null)
    } catch (e) { setErreur(e instanceof Error ? e.message : 'Lecture impossible') }
  }, [])
  useEffect(() => { void charger() }, [charger])
  const ouvrir = (id: number | null) => {
    setChoisi(id)
    const u = new URL(window.location.href)
    if (id) u.searchParams.set('c', String(id)); else u.searchParams.delete('c')
    history.replaceState(null, '', u.toString())
  }
  // Tant que Claude travaille, l'ecran se rafraichit seul.
  const enCours = d?.demandes.some((x) => x.statut === 'en_attente' || x.statut === 'en_cours')
  useEffect(() => {
    if (!enCours) return
    const t = setInterval(() => void charger(), 20_000)
    return () => clearInterval(t)
  }, [enCours, charger])
  const dire = (ok: boolean, texte: string) => { setMessage({ ok, texte }); setTimeout(() => setMessage(null), 6000) }

  const liste = useMemo(() => {
    if (!d) return []
    const q = recherche.trim().toLowerCase()
    const noms = new Map(d.catalogue.map((p) => [p.id, `${p.marque} ${p.nom}`.toLowerCase()]))
    return d.creatifs.filter((c) => (etape === 'actives' ? c.statut !== 'ecartee' : c.statut === etape)
      && (filtre === 'tous' || typeDe(c) === filtre)
      && (!q || `${c.accroche} ${c.angle} ${c.produit_ids.map((id) => noms.get(id) ?? '').join(' ')}`.toLowerCase().includes(q)))
  }, [d, etape, filtre, recherche])
  const creation = d?.creatifs.find((c) => c.id === choisi) ?? null

  return (
    <BosShell active="ads-studio" title="Studio créatif" crumb="Croissance">
      <div className={s.page}>
        {erreur && <p className={`${a.notice} ${a.error}`}>{erreur}</p>}
        {message && <p className={`${a.notice} ${a.toast} ${message.ok ? a.ok : a.error}`} role="status">{message.texte}</p>}
        {!d && !erreur && <div className={a.squelette} aria-busy="true"><i /><i /><i /></div>}
        {d && (
          <div className={`${s.studio} ${creation ? s.avecCreation : ''}`}>
            <aside className={s.biblio} aria-label="Bibliothèque">
              <div className={s.biblioTete}>
                <h1>Studio créatif</h1>
                <button type="button" className={a.primary} onClick={() => setNouveauBrief(true)}><Plus size={14} /> Nouveau brief</button>
              </div>
              <label className={s.recherche}><Search size={14} /><input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Produit, marque, accroche…" /></label>
              <div className={s.filtres}>
                {(['tous', 'reel', 'carrousel', 'options', 'image'] as const).map((f) => <button key={f} type="button" aria-pressed={filtre === f} onClick={() => setFiltre(f)}>{f === 'tous' ? 'Tout' : NOMS[f]}</button>)}
              </div>
              <select className={a.select} value={etape} onChange={(e) => setEtape(e.target.value as typeof etape)} aria-label="Étape">
                <option value="actives">En cours (hors écartées)</option>
                {ETAPES.map((x) => <option key={x} value={x}>{STATUTS_CREATIF[x]}</option>)}
                <option value="ecartee">Écartées</option>
              </select>
              <DirectionsEnCours demandes={d.demandes} creatifId={null} rafraichir={charger} dire={dire} />
              <ul className={s.liste}>
                {liste.map((c) => {
                  const t = typeDe(c), Icone = ICONES[t], img = vignette(c)
                  return (
                    <li key={c.id}>
                      <button type="button" className={`${s.item} ${choisi === c.id ? s.itemActif : ''}`} onClick={() => ouvrir(c.id)}>
                        <span className={s.itemVignette}>{img ? <img src={img} alt="" /> : <Icone size={18} />}</span>
                        <span className={s.itemTexte}>
                          <b>{lisible(c.accroche)}</b>
                          <small><Icone size={11} /> {NOMS[t]} · {STATUTS_CREATIF[c.statut]?.replace(/s$/, '')}{c.options.length ? ` · ${seriesDe(c)[0].opts.length} ${t === 'reel' ? 'plans' : t === 'carrousel' ? 'cartes' : 'options'}` : ''}</small>
                          {c.resultat && <small className={s.itemResultat}>{c.resultat.messages} DM · {dh1(c.resultat.coutParResultat)} / résultat{c.resultat.verdict === 'gagnante' ? ' · gagnante' : ''}</small>}
                        </span>
                      </button>
                    </li>)
                })}
                {!liste.length && <li className={s.vide}>Aucune création ici. Lance un brief : Claude écrit, OpenAI peint, tu montes.</li>}
              </ul>
            </aside>

            {creation
              ? <Espace key={creation.id} c={creation} d={d} fermer={() => ouvrir(null)} rafraichir={charger} dire={dire} />
              : <Accueil d={d} lancer={(i) => setNouveauBrief(i ?? true)} rafraichir={charger} dire={dire} />}
          </div>
        )}

        {d && nouveauBrief && (
          <div className={a.drawer} role="dialog" aria-modal="true" aria-label="Nouveau brief" onClick={() => setNouveauBrief(false)}>
            <div className={`${a.drawerBody} ${a.drawerLarge}`} onClick={(e) => e.stopPropagation()}>
              <div className={a.panelHeader} style={{ padding: 0 }}>
                <div><p className={a.eyebrow}>Nouvelle création</p><h2>Brief au directeur artistique</h2></div>
                <button type="button" className={a.ghost} onClick={() => setNouveauBrief(false)} aria-label="Fermer"><X size={14} /></button>
              </div>
              <BriefDirection d={d} idee={typeof nouveauBrief === 'object' ? nouveauBrief : undefined} envoye={(texte) => { setNouveauBrief(false); dire(true, texte); void charger() }} erreur={(texte) => dire(false, texte)} />
            </div>
          </div>
        )}
      </div>
    </BosShell>
  )
}

/** L'accueil du studio, sans creation ouverte : par ou commencer. */
function Accueil({ d, lancer, rafraichir, dire }: { d: Donnees; lancer: (i?: Idee) => void; rafraichir: () => Promise<void>; dire: (ok: boolean, t: string) => void }) {
  return (
    <main className={s.accueil}>
      <h2>Créer une pub qui vend au Maroc</h2>
      <ol className={s.parcours}>
        <li><b>1. Brief</b><span>Ce que tu veux, en une phrase — ou une idée prête ci-dessous.</span></li>
        <li><b>2. Direction</b><span>Claude regarde tes vrais produits et ce que font les meilleures pubs, te propose l’idée et les plans ; tu valides, il crée (animé ou filmé par Higgsfield).</span></li>
        <li><b>3. Montage</b><span>Tu retouches plan par plan : textes, animation, son, badges de confiance.</span></li>
        <li><b>4. Publier</b><span>La vérification, l’export MP4 ou PNG, la légende — puis tu relies la pub Meta pour voir ce qu’elle rapporte.</span></li>
      </ol>
      <button type="button" className={a.primary} onClick={() => lancer()}><Wand2 size={14} /> Lancer un brief</button>
      {d.idees.length > 0 && <>
        <h3><Sparkles size={14} /> Idées tirées de tes chiffres <small className={a.muted}>— un clic ouvre le brief déjà rempli</small></h3>
        <div className={s.idees}>{d.idees.map((i) => (
          <button key={i.id} type="button" className={s.idee} onClick={() => lancer(i)}><b>{i.titre}</b><small>{i.pourquoi}</small></button>))}
        </div>
      </>}
      <Lecons d={d} rafraichir={rafraichir} dire={dire} />
      <h3>Les vraies étapes du site <small className={a.muted}>— ce que le plan « site » peut montrer</small></h3>
      {(() => {
        const avec = d.catalogue.filter((p) => p.captures && Object.keys(p.captures).length >= 2)
        return avec.length
          ? <p className={a.small}>Captures prêtes pour {avec.length} produit(s) : {avec.slice(0, 12).map((p) => p.nom).join(' · ')}{avec.length > 12 ? '…' : ''}. Elles montrent le vrai site (fiche, panier, livraison), sans rien remplir ni commander.</p>
          : <p className={`${a.notice} ${a.warn}`} style={{ marginTop: 0 }}>Pas encore de capture du site : le plan « site » n’est pas disponible.</p>
      })()}
    </main>
  )
}

/** Ce que le directeur artistique doit retenir : relu avant CHAQUE direction, prioritaire sur ses habitudes. */
function Lecons({ d, rafraichir, dire, creatifId }: { d: Donnees; rafraichir: () => Promise<void>; dire: (ok: boolean, t: string) => void; creatifId?: number }) {
  const [texte, setTexte] = useState('')
  const [occupe, setOccupe] = useState(false)
  const liste = d.lecons.filter((l) => (creatifId ? l.creatif_id === creatifId : true))
  const envoyer = async () => {
    setOccupe(true)
    try { await poster({ lecon: { texte, creatifId } }); setTexte(''); await rafraichir(); dire(true, 'Retenu : le directeur artistique le relira avant chaque nouvelle pub.') }
    catch (e) { dire(false, (e as Error).message) } finally { setOccupe(false) }
  }
  const basculer = async (l: Lecon) => { try { await poster({ leconActive: { id: l.id, active: !l.active } }); await rafraichir() } catch (e) { dire(false, (e as Error).message) } }
  return (
    <div className={s.lecons}>
      <h3>{creatifId ? 'Ton avis au directeur artistique' : 'Ce que le directeur artistique a appris'}</h3>
      <p className={`${a.small} ${a.muted}`}>{creatifId ? 'Ce qui ne va pas (ou ce qu’il faut refaire) : il le relit avant chaque nouvelle pub, pas seulement celle-ci.' : 'Tes retours, relus avant chaque direction ; ils priment sur ses habitudes. Désactive ceux qui ne valent plus.'}</p>
      <div className={s.leconAjout}>
        <textarea rows={2} className={a.champTexte} maxLength={600} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Ex. : pas toujours le même style ; un pack de 4 produits se montre en entier ; les étapes du site = les vraies captures." />
        <button type="button" className={a.primary} disabled={occupe || texte.trim().length < 5} onClick={() => void envoyer()}>{occupe ? <Loader2 size={13} className={a.tourne} /> : <Check size={13} />} Retenir</button>
      </div>
      {liste.length > 0 && <ul className={s.leconListe}>{liste.map((l) => (
        <li key={l.id} className={l.active ? '' : s.leconInactive}>
          <span>{l.texte}<small className={a.muted}> · {quand(l.cree_le)}{l.creatif_id && !creatifId ? ` · création #${l.creatif_id}` : ''}</small></span>
          <button type="button" className={a.lienBouton} onClick={() => void basculer(l)}>{l.active ? 'Ne plus appliquer' : 'Réappliquer'}</button>
        </li>))}</ul>}
    </div>
  )
}

/** Le brief d'une direction : ce qu'Achraf a demande, et quel plan tient chaque consigne. */
function OngletBrief({ c, d, opts, rafraichir, dire }: { c: CreatifStudio; d: Donnees; opts: Option[]; rafraichir: () => Promise<void>; dire: (ok: boolean, t: string) => void }) {
  const [nouvelle, setNouvelle] = useState(!opts.length)
  const demandes = d.demandes.filter((x) => x.creatif_id === c.id && !x.parametres?.retouche) as Demande[]
  const dem = demandes.find((x) => x.id === opts[0]?.demande_id) ?? demandes[0]
  const p = dem?.parametres
  const consignes = consignesBrief(p?.brief)
  const couv = dem?.couverture ?? []
  return (
    <div className={s.bloc}>
      <div className={a.btns} style={{ marginTop: 0 }}>
        <button type="button" className={nouvelle ? a.ghost : a.primary} onClick={() => setNouvelle((x) => !x)}><Wand2 size={13} /> {nouvelle ? 'Fermer le brief' : 'Nouvelle direction pour cette création'}</button>
      </div>
      {nouvelle && <BriefDirection d={d} creatif={c} envoye={(texte) => { setNouvelle(false); dire(true, texte); void rafraichir() }} erreur={(texte) => dire(false, texte)} />}
      {p && <>
        <h3>Ce que tu as demandé <small className={a.muted}>· {quand(dem.demande_le)}</small></h3>
        <dl className={s.briefResume}>
          <dt>Style</dt><dd>{p.recette ? `${RECETTES[p.recette].nom} (recette)` : 'Libre'}</dd>
          <dt>Objectif</dt><dd>{p.objectif ? OBJECTIFS[p.objectif].label : '—'}</dd>
          <dt>Offre</dt><dd>{OFFRES[p.offre ?? 'aucune']}</dd>
          <dt>À montrer</dt><dd>{p.montrer?.length ? p.montrer.map((k) => A_MONTRER[k as AMontrer] ?? k).join(' · ') : '—'}</dd>
          <dt>Format</dt><dd>{p.type === 'reel' ? `Reel, ${p.nombre} plans` : p.type === 'carrousel' ? `Carrousel, ${p.nombre} cartes` : `${p.nombre} options`}</dd>
          {p.type === 'reel' && <><dt>Rendu</dt><dd>{p.rendu === 'video' ? 'Vidéo Higgsfield (chaque plan filmé)' : 'Motion Shine (animé par le BOS)'}</dd></>}
        </dl>
        {(dem.echanges?.length ?? 0) > 0 && <details className={s.briefDiscussion}><summary>La discussion avant la création ({dem.echanges!.length} message{dem.echanges!.length > 1 ? 's' : ''})</summary>
          {dem.echanges!.map((m, i) => <p key={i} className={a.small}><b>{m.auteur === 'agent' ? 'Directeur artistique' : 'Toi'}</b> <span className={a.muted}>· {quand(m.le)}</span><br /><span style={{ whiteSpace: 'pre-wrap' }}>{avecGras(m.texte)}</span></p>)}
        </details>}
        {consignes.length > 0 && <>
          <h3>Ton brief, consigne par consigne</h3>
          <ul className={s.couverture}>{consignes.map((cons, k) => {
            const tenue = couv[k]
            return (
              <li key={k} className={tenue ? s.ok : s.attention}>
                <span>{cons}</span>
                <small>{tenue ? (tenue.plans.length ? tenue.plans.map((n) => `plan ${n}`).join(', ') : 'partout') : 'pas indiqué par Claude'}</small>
              </li>)
          })}</ul>
        </>}
        {dem.resultat && <p className={`${a.small} ${a.muted}`}><b>Le mot de Claude :</b> {dem.resultat}</p>}
      </>}
      {!p && !nouvelle && <p className={`${a.small} ${a.muted}`}>Cette création ne vient pas d’un brief au directeur artistique.</p>}
      {d.higgsfield?.parCreation[c.id] && (() => {
        // Ce que cette pub a coute chez Higgsfield : le cout que le directeur artistique a note a chaque clip ou image.
        const h = d.higgsfield!.parCreation[c.id]
        return <p className={a.small}><b>Higgsfield : {h.credits.toLocaleString('fr-FR')} crédits</b> · {h.clips} clip{h.clips > 1 ? 's' : ''}{h.images ? `, ${h.images} image${h.images > 1 ? 's' : ''}` : ''}{h.nonChiffres ? ` (${h.nonChiffres} sans coût noté)` : ''}
          <br /><span className={a.muted}>{h.modeles.map((m) => `${m.modele} ×${m.n}${m.credits ? ` = ${m.credits.toLocaleString('fr-FR')}` : ''}`).join(' · ')}</span></p>
      })()}
      <Lecons d={d} rafraichir={rafraichir} dire={dire} creatifId={c.id} />
    </div>
  )
}

/** L'espace de travail d'une creation : la scene au centre, l'inspecteur a droite. */
function Espace({ c, d, fermer, rafraichir, dire }: { c: CreatifStudio; d: Donnees; fermer: () => void; rafraichir: () => Promise<void>; dire: (ok: boolean, t: string) => void }) {
  const series = seriesDe(c)
  const [serie, setSerie] = useState(series[0]?.serie ?? 0)
  const courante = series.find((x) => x.serie === serie) ?? series[0]
  const type: TypeCrea = courante?.type ?? (c.format === 'carrousel' ? 'carrousel' : 'image')
  const opts = courante?.opts ?? []
  const [langue, setLangue] = useState<Langue>('fr')
  const [canal, setCanal] = useState<'message' | 'site'>(/site|command/i.test(c.cta || '') ? 'site' : 'message')
  const [habillage, setHabillage] = useState(true)
  const [onglet, setOnglet] = useState<OngletInspecteur>(opts.length ? 'plans' : 'brief')
  const [brouillons, setBrouillons] = useState<Record<number, Brouillon>>({})
  const [ouvert, setOuvert] = useState<number | null>(null)
  const [imageApercu, setImageApercu] = useState<number | null>(null)
  const { generation, generer, genererManquants, a: actions, secondes } = useActionsSerie(c, rafraichir, dire, (img, o) => { setImageApercu(img.id); void o })
  const bouton = BOUTONS[canal][langue]
  const legende = (langue === 'fr' ? c.texte_fr : langue === 'darija' ? c.texte_darija : c.texte_ar) || c.texte_fr || ''
  const setBrouillon = (id: number, b: Brouillon | null) => setBrouillons((x) => { const n = { ...x }; if (b) n[id] = b; else delete n[id]; return n })
  const plans = type === 'reel' ? opts.map((o) => planDessin(c, o, brouillons[o.id] ?? depuisOption(o), langue, d)) : []
  const produits = c.produit_ids.map((id) => d.catalogue.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p))
  const packs = Object.fromEntries(d.catalogue.filter((p) => p.composants?.length).map((p) => [p.id, p.composants!]))
  const points = verifierPublication(c, opts, type, d.strategie.langues, packs)
  const aCorriger = points.filter((p) => !p.ok && p.bloquant).length
  const majStatut = async (statut: string, adId?: string | null) => {
    try { await poster({ creatif: { id: c.id, statut, adId: adId ?? undefined } }); await rafraichir(); dire(true, `Création : ${STATUTS_CREATIF[statut]?.replace(/s$/, '')}.`) } catch (e) { dire(false, (e as Error).message) }
  }
  const imageSeule = c.images.filter((i) => i.carte == null)
  const imgApercu: Image | undefined = imageSeule.find((i) => i.id === imageApercu) ?? imageSeule.find((i) => i.choisie) ?? imageSeule[0]
  const visuelSimple = (f: FormatImage): Visuel => ({ format: f, image: imgApercu?.url ?? null, accroche: lisible(c.accroche), langue, surimpression: true, position: 'haut' })
  const carte = (o: Option): Visuel => ({ format: o.format, image: imagesDe(c, o)[0]?.url ?? null, accroche: lisible(texteDe(o, langue)), langue, surimpression: true, position: o.position })
  const manquants = opts.filter((o) => !imagesDe(c, o).length && (!o.motion?.fond || o.motion.fond === 'decor') && !o.motion?.clip)

  return (
    <>
      <main className={s.scene} aria-label="Scène">
        <header className={s.sceneTete}>
          <div>
            <p className={a.eyebrow}>{NOMS[type]} · {c.angle} · {quand(c.cree_le)}</p>
            <h2>« {lisible(c.accroche)} »</h2>
            <p className={`${a.small} ${a.muted}`}>{produits.map((p) => `${p.marque} ${p.nom}`).join(' · ')}</p>
          </div>
          <button type="button" className={a.ghost} onClick={fermer} aria-label="Fermer la création"><X size={14} /></button>
        </header>
        <ol className={s.etapes} aria-label="Statut de la création">
          <li className={s.etapesTitre}>Statut</li>
          {ETAPES.map((e, k) => {
            const faite = ETAPES.indexOf(c.statut as (typeof ETAPES)[number]) >= k
            return <li key={e}><button type="button" className={faite ? s.etapeFaite : ''} aria-current={c.statut === e ? 'step' : undefined} onClick={() => void majStatut(e)}>{faite ? <CheckCircle2 size={14} /> : <Circle size={14} />} {STATUTS_CREATIF[e].replace(/s$/, '')}</button></li>
          })}
          <li><button type="button" className={s.etapeEcarter} onClick={() => void majStatut('ecartee')}>Écarter</button></li>
        </ol>
        <div className={s.barre}>
          <div className={s.segment} role="group" aria-label="Langue">{LANGUES.map(([l, nom]) => <button key={l} type="button" aria-pressed={langue === l} onClick={() => setLangue(l)}>{nom}</button>)}</div>
          <div className={s.segment} role="group" aria-label="Bouton de la pub">
            <button type="button" aria-pressed={canal === 'message'} onClick={() => setCanal('message')}>DM</button>
            <button type="button" aria-pressed={canal === 'site'} onClick={() => setCanal('site')}>Site</button>
          </div>
          {series.length > 1 && <select className={a.select} value={serie} onChange={(e) => setSerie(Number(e.target.value))} aria-label="Direction">{series.map((x) => <option key={x.serie} value={x.serie}>Direction {x.serie} · {NOMS[x.type]}</option>)}</select>}
          {type === 'reel' && <label className={a.caseInline}><input type="checkbox" checked={habillage} onChange={(e) => setHabillage(e.target.checked)} /> Interface Instagram</label>}
        </div>
        <div className={s.apercu}>
          {type === 'reel' && <LecteurReel plans={plans} langue={langue} bouton={bouton} largeur={300} nom={`shine-${c.id}-reel-${langue}`} selection={ouvert} choisirPlan={(i) => { setOuvert(i); setOnglet('plans') }} habillage={habillage} legende={legende} />}
          {type === 'carrousel' && <ApercuCarrousel cartes={opts.map(carte)} legende={legende} bouton={bouton} largeur={320} />}
          {(type === 'options' || type === 'image') && <div className={s.duo}><ApercuFeed v={visuelSimple('feed')} legende={legende} bouton={bouton} largeur={290} /><ApercuStory v={visuelSimple('story')} legende={legende} bouton={bouton} largeur={220} /></div>}
        </div>
        <p className={`${a.small} ${a.muted} ${s.aideScene}`}>{type === 'reel' ? 'Clique un plan dans la frise pour le retoucher. 🔊 pour écouter les bruitages et la voix off.' : 'L’aperçu suit la langue et le bouton choisis.'}</p>
      </main>

      <section className={s.inspecteur} aria-label="Inspecteur">
        <div className={s.onglets} role="tablist">
          {([['brief', 'Brief'], ['plans', type === 'reel' ? 'Plans' : type === 'carrousel' ? 'Cartes' : 'Visuels'], ['textes', 'Textes'], ...(type === 'reel' ? [['son', 'Son']] : []), ['publier', `Publier${aCorriger ? ` (${aCorriger})` : ''}`]] as [OngletInspecteur, string][]).map(([k, nom], i) => (
            <button key={k} type="button" role="tab" aria-selected={onglet === k} onClick={() => setOnglet(k)}><span className={s.ongletNum}>{i + 1}</span>{nom}</button>))}
        </div>
        <div className={s.inspecteurCorps}>
          <DirectionsEnCours demandes={d.demandes} creatifId={c.id} rafraichir={rafraichir} dire={dire} />
          {onglet === 'brief' && <OngletBrief c={c} d={d} opts={opts} rafraichir={rafraichir} dire={dire} />}
          {onglet === 'plans' && <>
            {!opts.length && <p className={`${a.small} ${a.muted}`}>Pas encore de plans : onglet 1 · Brief pour lancer une direction.</p>}
            {manquants.length > 0 && <div className={a.btns} style={{ marginTop: 0 }}>
              <button type="button" className={a.primary} disabled={Object.keys(generation).length > 0} onClick={() => void genererManquants(opts)}><ImagePlus size={13} /> Peindre {manquants.length === opts.length ? 'tous les décors' : `les ${manquants.length} décor(s) manquant(s)`}</button>
            </div>}
            {type === 'reel' && <TableMontage c={c} d={d} opts={opts} langue={langue} brouillons={brouillons} setBrouillon={setBrouillon} selection={ouvert} choisir={setOuvert} poster={poster} rafraichir={rafraichir} message={dire} generer={generer} generation={generation} />}
            {(type === 'carrousel' || type === 'options') && <div className={s.cartes}>{opts.map((o, i) => <CarteOption key={o.id} c={c} o={o} rang={i + 1} type={type} langue={langue} genere={secondes(o.id)} a={actions} largeur={300} noms={new Map(d.catalogue.map((p) => [p.id, `${p.marque} ${p.nom}`]))} />)}</div>}
            {type === 'image' && <VisuelRapide c={c} rafraichir={rafraichir} dire={dire} choisir={setImageApercu} />}
          </>}
          {onglet === 'textes' && <Textes c={c} d={d} rafraichir={rafraichir} dire={dire} />}
          {onglet === 'son' && type === 'reel' && <Son opts={opts} langue={langue} rafraichir={rafraichir} dire={dire} />}
          {onglet === 'publier' && <Publier c={c} d={d} points={points} type={type} opts={opts} langue={langue} legende={legende} carte={carte} visuelSimple={visuelSimple} majStatut={majStatut} dire={dire} />}
        </div>
      </section>
    </>
  )
}

/** Un visuel fixe tout de suite, a partir de la creation (sans direction). */
function VisuelRapide({ c, rafraichir, dire, choisir }: { c: Creatif; rafraichir: () => Promise<void>; dire: (ok: boolean, t: string) => void; choisir: (id: number) => void }) {
  const [format, setFormat] = useState<FormatImage>(formatParDefaut(c.format))
  const [qualite, setQualite] = useState<'medium' | 'high'>('high')
  const [precision, setPrecision] = useState('')
  const [occupe, setOccupe] = useState(false)
  const seules = c.images.filter((i) => i.carte == null)
  const generer = async () => {
    setOccupe(true)
    try { const j = await poster({ image: { creatifId: c.id, format, qualite, precision } }) as { image?: { id: number } }; await rafraichir(); if (j.image) choisir(j.image.id); dire(true, 'Visuel généré.') }
    catch (e) { dire(false, (e as Error).message) } finally { setOccupe(false) }
  }
  return (
    <div className={s.bloc}>
      <p className={`${a.small} ${a.muted}`}>Pour un visuel vite fait, à partir du brief visuel de la création. Pour des options, un carrousel ou un Reel : « Nouvelle direction ».</p>
      {seules.length > 0 && <div className={a.galerie}>{seules.map((i) => (
        <div key={i.id} className={`${a.miniature} ${i.choisie ? a.miniatureActive : ''}`}>
          <button type="button" onClick={() => choisir(i.id)} aria-label="Voir dans l’aperçu"><img src={i.url} alt="" /></button>
          <span className={a.miniatureInfos}>{FORMATS_IMAGE[i.format].label.split(' ')[0]}{i.choisie ? ' · choisi' : ''}</span>
        </div>))}</div>}
      <div className={a.genererLigne}>
        <select value={format} onChange={(e) => setFormat(e.target.value as FormatImage)} className={a.select} aria-label="Format">{(Object.keys(FORMATS_IMAGE) as FormatImage[]).map((f) => <option key={f} value={f}>{FORMATS_IMAGE[f].label}</option>)}</select>
        <select value={qualite} onChange={(e) => setQualite(e.target.value as 'medium' | 'high')} className={a.select} aria-label="Qualité"><option value="high">Haute</option><option value="medium">Standard</option></select>
      </div>
      <input value={precision} onChange={(e) => setPrecision(e.target.value)} className={a.champTexte} maxLength={500} placeholder="Précision (facultatif) : sur une étagère en zellige, lumière du matin…" />
      <button type="button" className={a.primary} disabled={occupe} onClick={() => void generer()}>{occupe ? <Loader2 size={14} className={a.tourne} /> : <ImagePlus size={14} />} Générer un visuel</button>
    </div>
  )
}

/** Les textes de la pub : accroche, legende en trois langues, titre, bouton, hashtags. */
function Textes({ c, d, rafraichir, dire }: { c: Creatif; d: Donnees; rafraichir: () => Promise<void>; dire: (ok: boolean, t: string) => void }) {
  const [v, setV] = useState({ accroche: lisible(c.accroche), texteFr: c.texte_fr ?? '', texteDarija: c.texte_darija ?? '', texteAr: c.texte_ar ?? '', titre: c.titre ?? '', cta: c.cta ?? '' })
  const [occupe, setOccupe] = useState(false)
  const initial = { accroche: lisible(c.accroche), texteFr: c.texte_fr ?? '', texteDarija: c.texte_darija ?? '', texteAr: c.texte_ar ?? '', titre: c.titre ?? '', cta: c.cta ?? '' }
  const modifie = JSON.stringify(v) !== JSON.stringify(initial)
  const fautes = [...new Set([v.accroche, v.texteFr, v.titre, v.cta].flatMap(fautesFrancais))]
  const produits = c.produit_ids.map((id) => d.catalogue.find((p) => p.id === id)).filter(Boolean) as { marque: string; categorie: string }[]
  const tags = hashtags([...new Set(produits.map((p) => p.marque))], [...new Set(produits.map((p) => p.categorie))])
  const ajouter = (tag: string) => setV((x) => ({ ...x, texteFr: x.texteFr.includes(tag) ? x.texteFr : `${x.texteFr.trimEnd()}${/#\w+$/.test(x.texteFr.trim()) ? ' ' : '\n\n'}${tag}` }))
  const sauver = async () => {
    setOccupe(true)
    try { await poster({ creatifTextes: { id: c.id, ...v } }); await rafraichir(); dire(true, 'Textes enregistrés.') } catch (e) { dire(false, (e as Error).message) } finally { setOccupe(false) }
  }
  const champ = (cle: keyof typeof v, titre: string, lignes: number, max: number, aide?: string, rtl = false) => (
    <label className={a.champ}>{titre}
      {lignes > 1 ? <textarea rows={lignes} dir={rtl ? 'rtl' : 'ltr'} maxLength={max} value={v[cle]} onChange={(e) => setV({ ...v, [cle]: e.target.value })} />
        : <input dir={rtl ? 'rtl' : 'ltr'} maxLength={max} value={v[cle]} onChange={(e) => setV({ ...v, [cle]: e.target.value })} />}
      {aide && <small>{aide}</small>}
    </label>)
  return (
    <div className={s.bloc}>
      {champ('accroche', 'Accroche (titre de la création)', 1, 500)}
      {champ('texteFr', 'Légende en français', 6, 2200, `${v.texteFr.length} caractères · les ~125 premiers se lisent avant « … plus » : mets-y l’essentiel.`)}
      {v.texteFr.length > 125 && <p className={s.avantPlus}><b>Visible :</b> {v.texteFr.slice(0, 125)}<span>… plus</span></p>}
      {champ('texteDarija', 'Légende en darija', 5, 2200)}
      {champ('texteAr', 'Légende en arabe', 5, 2200, undefined, true)}
      <div className={a.genererLigne}>{champ('titre', 'Titre (sous le visuel)', 1, 120)}{champ('cta', 'Bouton proposé', 1, 60)}</div>
      <div><small className={a.muted}>Hashtags (clic = ajouter à la légende française) :</small>
        <div className={a.dirChips}>{tags.map((t) => <button key={t} type="button" className={a.filtre} aria-pressed={v.texteFr.includes(t)} onClick={() => ajouter(t)}>{t}</button>)}</div></div>
      {fautes.length > 0 && <p className={`${a.notice} ${a.warn}`}>⚠ Accents manquants : {fautes.map((f) => `« ${f} »`).join(', ')}</p>}
      <div className={a.btns}>
        <button type="button" className={a.primary} disabled={!modifie || occupe} onClick={() => void sauver()}>{occupe ? <Loader2 size={13} className={a.tourne} /> : <Check size={13} />} Enregistrer les textes</button>
        {modifie && <button type="button" className={a.ghost} onClick={() => setV(initial)}>Annuler</button>}
      </div>
    </div>
  )
}

/** Le son du Reel : la voix off plan par plan, dans la langue choisie. */
function Son({ opts, langue, rafraichir, dire }: { opts: Option[]; langue: Langue; rafraichir: () => Promise<void>; dire: (ok: boolean, t: string) => void }) {
  const [occupe, setOccupe] = useState<number | null>(null)
  // Les voix generees avant qu'on mesure leur duree cote serveur : le navigateur la lit.
  const [mesures, setMesures] = useState<Record<number, number>>({})
  const aFaire = opts.filter((o) => (o.motion?.voix?.[langue] || '').trim().length >= 3 && o.motion?.voixUrl?.[langue]?.texte !== o.motion?.voix?.[langue]?.trim())
  const generer = async (o: Option) => {
    setOccupe(o.id)
    try { await poster({ voix: { optionId: o.id, langue } }); await rafraichir() } catch (e) { dire(false, (e as Error).message) } finally { setOccupe(null) }
  }
  const caler = async (o: Option, duree: number) => {
    setOccupe(o.id)
    try { await poster({ option: { id: o.id, duree } }); await rafraichir(); dire(true, `Plan allongé à ${duree} s.`) } catch (e) { dire(false, (e as Error).message) } finally { setOccupe(null) }
  }
  const totalVoix = opts.reduce((n, o) => n + dureeVoixPlan(o, langue, mesures[o.id]), 0)
  const totalReel = opts.reduce((n, o) => n + (Number(o.duree) || 0), 0)
  return (
    <div className={s.bloc}>
      <p className={`${a.small} ${a.muted}`}>Les bruitages sont faits pour chaque mouvement (choc, pop, « ding », souffle). La voix off est chuchotée façon ASMR par OpenAI ; son texte s’écrit dans chaque plan (onglet Plans). Une voix doit se taire avant la fin de son plan.</p>
      {totalVoix > 0 && <p className={`${a.notice} ${totalVoix > totalReel ? a.warn : a.ok}`} style={{ marginTop: 0 }}>Voix ({langue}) : <b>{totalVoix.toFixed(1)} s</b> pour un Reel de <b>{totalReel} s</b>{totalVoix > totalReel ? ' — trop de texte : raccourcis les phrases.' : '.'}</p>}
      {aFaire.length > 1 && <button type="button" className={a.primary} disabled={occupe != null} onClick={() => void (async () => { for (const o of aFaire) await generer(o); dire(true, 'Voix générées.') })()}><Mic size={13} /> Générer les {aFaire.length} voix ({langue})</button>}
      <ul className={s.voix}>{opts.map((o, i) => {
        const texte = (o.motion?.voix?.[langue] || '').trim(), faite = o.motion?.voixUrl?.[langue]
        const aJour = faite && faite.texte === texte
        const plan = Number(o.duree) || 0, voix = dureeVoixPlan(o, langue, mesures[o.id])
        const deborde = voix > plan + 0.3
        const mesuree = aJour && (faite?.duree ?? mesures[o.id]) != null
        // L'accroche ne s'allonge pas : au-dela de 2,5 s on a deja scrolle.
        const cible = Math.ceil((voix + 0.2) * 2) / 2
        return (
          <li key={o.id} className={deborde ? s.voixDeborde : ''}>
            <div className={s.voixTete}>
              <b>Plan {i + 1}</b>
              {texte && <span className={`${a.chip} ${deborde ? a.chipRouge : a.chipVert}`}>{mesuree ? '' : '~'}{voix.toFixed(1)} s de voix · plan {plan} s</span>}
            </div>
            <span>{texte || <em className={a.muted}>Pas de voix sur ce plan.</em>}</span>
            {aJour && <audio controls preload="metadata" src={faite!.url} onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setMesures((m) => (m[o.id] ? m : { ...m, [o.id]: Math.round(d * 10) / 10 })) }} />}
            {deborde && <small className={s.voixConseil}>{i === 0
              ? `L’accroche reste à ${plan} s : garde ${motsVoixMax(plan)} mots au plus (onglet Plans), puis régénère.`
              : `Elle déborde de ${(voix - plan).toFixed(1)} s sur le plan suivant.`}</small>}
            <div className={a.genererLigne}>
              {texte && !aJour && <button type="button" className={a.ghost} disabled={occupe != null} onClick={() => void generer(o)}>{occupe === o.id ? <Loader2 size={12} className={a.tourne} /> : <Mic size={12} />} {faite ? 'Refaire (texte changé)' : 'Générer'}</button>}
              {deborde && i > 0 && <button type="button" className={a.ghost} disabled={occupe != null} onClick={() => void caler(o, cible)}>Caler le plan sur la voix ({cible} s)</button>}
            </div>
          </li>)
      })}</ul>
    </div>
  )
}

/** Avant de publier : la verification, les fichiers, la legende a copier, le lien avec la pub Meta, les resultats. */
function Publier({ c, d, points, type, opts, langue, legende, carte, visuelSimple, majStatut, dire }: {
  c: CreatifStudio; d: Donnees; points: ReturnType<typeof verifierPublication>; type: TypeCrea; opts: Option[]; langue: Langue; legende: string
  carte: (o: Option) => Visuel; visuelSimple: (f: FormatImage) => Visuel; majStatut: (statut: string, adId?: string | null) => Promise<void>; dire: (ok: boolean, t: string) => void
}) {
  const [adId, setAdId] = useState(c.ad_id ?? '')
  const copier = (t: string) => { void navigator.clipboard?.writeText(t); dire(true, 'Copié.') }
  return (
    <div className={s.bloc}>
      <h3>Vérification</h3>
      <ul className={s.checklist}>{points.map((p) => (
        <li key={p.id} className={p.ok ? s.ok : p.bloquant ? s.ko : s.attention}>
          {p.ok ? <CheckCircle2 size={15} /> : <Circle size={15} />}
          <span><b>{p.titre}</b><small>{p.detail}</small></span>
        </li>))}</ul>
      <h3>Fichiers</h3>
      {type === 'reel' && <p className={a.small}>Le bouton <b>MP4</b> sous l’aperçu exporte le Reel en 1080×1920 avec les bruitages et la voix off (langue : {langue}).</p>}
      {type === 'carrousel' && <button type="button" className={a.ghost} onClick={() => void (async () => { for (const o of opts) if (imagesDe(c, o).length) await telechargerPng(carte(o), `shine-${c.id}-carte${o.carte}-${langue}.png`) })().catch((e) => dire(false, e.message))}><Download size={13} /> Les cartes (PNG 1080)</button>}
      {(type === 'image' || type === 'options') && <div className={a.groupeFiltres}>{(['feed', 'story', 'carre'] as FormatImage[]).map((f) => <button key={f} type="button" className={a.ghost} onClick={() => void telechargerPng(visuelSimple(f), `shine-${c.id}-${f}-${langue}.png`).catch((e) => dire(false, e.message))}><Download size={13} /> {FORMATS_IMAGE[f].export.join('×')}</button>)}</div>}
      <h3>Légende à coller dans Meta</h3>
      <p className={s.legende} dir={langue === 'ar' ? 'rtl' : 'ltr'}>{legende || <em className={a.muted}>Pas encore de légende : onglet Textes.</em>}</p>
      {legende && <button type="button" className={a.ghost} onClick={() => copier(legende)}><Copy size={13} /> Copier la légende</button>}
      <h3>Mise en ligne</h3>
      <p className={`${a.small} ${a.muted}`}>Une fois la pub créée dans Meta, relie-la : le studio affichera ce qu’elle rapporte (DM, coût par résultat) pour apprendre de ce qui marche.</p>
      <div className={a.genererLigne}>
        <select className={a.select} value={d.pubsEnLigne.some((p) => p.adId === adId) ? adId : ''} onChange={(e) => setAdId(e.target.value)} aria-label="Pub Meta active">
          <option value="">Choisir une pub active…</option>
          {d.pubsEnLigne.map((p) => <option key={p.adId} value={p.adId}>{(p.nom || p.adId).slice(0, 60)}</option>)}
        </select>
        <input className={a.champTexte} value={adId} onChange={(e) => setAdId(e.target.value.replace(/\D/g, ''))} placeholder="ou l’identifiant de la pub" />
      </div>
      <button type="button" className={a.primary} disabled={!/^\d{5,30}$/.test(adId)} onClick={() => void majStatut('en_ligne', adId)}><Link2 size={13} /> Marquer « en ligne » et relier</button>
      {c.resultat && (
        <div className={s.resultat}>
          <h3>Ce qu’elle rapporte (30 jours)</h3>
          <p><b>{dh1(c.resultat.depense)}</b> dépensés · <b>{c.resultat.messages}</b> DM · <b>{c.resultat.achats}</b> achats pixel · <b>{dh1(c.resultat.coutParResultat)}</b> par résultat{c.resultat.verdict ? ` · verdict : ${c.resultat.verdict}` : ''}</p>
        </div>
      )}
    </div>
  )
}
