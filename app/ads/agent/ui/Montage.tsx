'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Copy, ImagePlus, Loader2, Mic, Plus, Save, Trash2, Undo2, Wand2, X } from 'lucide-react'
import type { Langue } from '@/lib/ads/creatif-model'
import { AMBIANCES, CONFIANCE, MOUVEMENTS, TRANSITIONS, dureeMinDm, dureeVoix, fautesFrancais, motMisEnValeurVide, motsVoixMax, voixTropLongue, type CleConfiance, type Mouvement } from '@/lib/ads/direction-model'
import { urlDetouree, type Ambiance, type Transition } from '@/lib/ads/reel-model'
import type { PlanDessin } from './Reel'
import type { BaseCreative, Creatif, Image, Option } from './types'
import s from '../agent.module.css'

/**
 * LA TABLE DE MONTAGE D'UN REEL : Achraf reprend la main plan par plan.
 * Chaque retouche s'affiche aussitot dans l'apercu (brouillon), puis
 * « Enregistrer » la valide cote serveur avec les memes regles que la livraison
 * de Claude (accents, lecture d'un DM, nombre de produits…). « Refaire avec
 * Claude » envoie une retouche ciblee au directeur artistique.
 */

type Multi = { fr: string; darija: string; ar: string }
export type Brouillon = {
  texte: Multi; position: 'haut' | 'bas'; mouvement: Mouvement; duree: number; animes: number[]
  transition: Transition; ambiance: Ambiance
  bulles: { de: 'cliente' | 'shine'; texte: Multi }[]; points: Multi[]; choix: Multi[]; voix: Multi
  confiance: CleConfiance[]; prix: boolean
}

/**
 * Des accroches qui marchent au Maroc, a completer (les « … »). Le style DM
 * (« Salam, 3andkom… ») est celui ou la vente se fait ; la question « lequel
 * pour toi ? » fait commenter ; le geste et le secret font rester.
 */
const ACCROCHES: { nom: string; texte: Multi }[] = [
  { nom: 'Style DM', texte: { fr: '*Salam*, vous avez un soin pour… ?', darija: '*Salam*, 3andkom chi 7aja l… ?', ar: '*السلام*، عندكم علاج لـ…؟' } },
  { nom: 'Le problème', texte: { fr: 'Cheveux *…* après l’été ?', darija: 'Cha3rek *…* mn b3d sif ?', ar: 'شعرك *…* بعد الصيف؟' } },
  { nom: 'Le choix', texte: { fr: '*Lequel* pour toi ?', darija: '*Achmen* wa7ed lik ?', ar: '*أيهما* لكِ؟' } },
  { nom: 'Le geste', texte: { fr: 'Avant de sortir : *1 geste*', darija: '9bel matkhrji : *geste wa7d*', ar: 'قبل الخروج: *خطوة واحدة*' } },
  { nom: 'Le secret', texte: { fr: 'Le *secret* des peaux coréennes', darija: '*Sir* dyal lbachra lcoréenne', ar: '*سر* البشرة الكورية' } },
  { nom: 'La routine', texte: { fr: '*3 étapes*, 5 minutes', darija: '*3 steps*, 5 d9aye9', ar: '*3 خطوات*، 5 دقائق' } },
  { nom: 'Stop à…', texte: { fr: 'Stop aux *frisottis*', darija: 'Safi m3a *nfoukh*', ar: 'وداعاً *للتجعد*' } },
]
const LANGUES: [Langue, string][] = [['fr', 'FR'], ['darija', 'Darija'], ['ar', 'عربي']]
const vide = (): Multi => ({ fr: '', darija: '', ar: '' })
const multi = (m?: { fr?: string; darija?: string; ar?: string } | null): Multi => ({ fr: m?.fr ?? '', darija: m?.darija ?? '', ar: m?.ar ?? '' })

export function depuisOption(o: Option): Brouillon {
  const m = o.motion ?? {}
  return {
    texte: multi(o.texte), position: o.position, mouvement: (o.mouvement ?? 'zoom') as Mouvement, duree: Number(o.duree) || 2.5, animes: o.animes ?? [],
    transition: m.transition ?? 'coupe', ambiance: m.ambiance ?? 'aucune',
    bulles: (m.bulles ?? []).map((b) => ({ de: b.de, texte: multi(b.texte) })), points: (m.points ?? []).map(multi), choix: (m.choix ?? []).map(multi), voix: multi(m.voix),
    confiance: (m.confiance ?? []) as CleConfiance[], prix: Boolean(m.prix),
  }
}

/** Le prix des produits animes, tel qu'il s'affiche sur le sticker (« 997 DH »). */
export const prixAnimes = (animes: number[], d: BaseCreative) => {
  const total = animes.reduce((n, id) => n + (d.catalogue.find((p) => p.id === id)?.prix ?? 0), 0)
  return total > 0 ? `${Math.round(total)} DH` : null
}

const imagesDe = (c: Creatif, o: Option): Image[] => c.images.filter((i) => i.option_id === o.id).sort((a, b) => Number(b.choisie) - Number(a.choisie) || b.cree_le.localeCompare(a.cree_le))

/** Un plan (et son eventuel brouillon) dans la forme que le lecteur dessine. */
export function planDessin(c: Creatif, o: Option, b: Brouillon, langue: Langue, d: BaseCreative): PlanDessin {
  const img = new Map(d.catalogue.map((p) => [p.id, p.image]))
  const nom = new Map(d.catalogue.map((p) => [p.id, `${p.marque} ${p.nom}`]))
  const dans = (x: Multi) => x[langue] || x.fr
  const voixUrl = o.motion?.voixUrl?.[langue]
  return {
    mouvement: b.mouvement, duree: b.duree, produits: b.animes.length, texte: dans(b.texte),
    image: imagesDe(c, o)[0]?.url ?? null, detourees: b.animes.map((id) => urlDetouree(img.get(id)) ?? ''), noms: b.animes.map((id) => nom.get(id) ?? ''),
    transition: b.transition, ambiance: b.ambiance,
    bulles: b.bulles.map((x) => ({ de: x.de, texte: dans(x.texte) })), points: b.points.map(dans), choix: b.choix.map(dans),
    // Une voix dont le texte a change depuis sa generation n'est plus jouee : elle ne dirait pas la meme chose.
    voixUrl: voixUrl && voixUrl.texte === b.voix[langue].trim() ? voixUrl.url : null,
    confiance: b.mouvement === 'fin' ? b.confiance.map((k) => CONFIANCE[k][langue]) : [],
    prix: b.mouvement === 'fin' && b.prix ? prixAnimes(b.animes, d) : null,
  }
}

/** Les avertissements immediats : accents, mot mis en valeur, lecture du DM, produits. */
function alertes(b: Brouillon, i: number): string[] {
  const out: string[] = []
  const fr = [b.texte.fr, ...b.bulles.map((x) => x.texte.fr), ...b.points.map((x) => x.fr), ...b.choix.map((x) => x.fr), b.voix.fr]
  const fautes = [...new Set(fr.flatMap(fautesFrancais))]
  if (fautes.length) out.push(`Accents manquants : ${fautes.map((f) => `« ${f} »`).join(', ')}`)
  const mv = motMisEnValeurVide(b.texte.fr)
  if (mv) out.push(`« ${mv} » est un mot vide : mets en valeur le mot qui porte le sens.`)
  if (b.mouvement === 'dm' && b.duree < dureeMinDm(b.bulles.length, b.animes.length > 0)) out.push(`${b.bulles.length} messages se lisent en ${dureeMinDm(b.bulles.length, b.animes.length > 0)} s au moins.`)
  for (const l of ['fr', 'darija', 'ar'] as const) {
    if (voixTropLongue(b.voix[l], b.duree)) out.push(`Voix off (${l}) : ~${dureeVoix(b.voix[l])} s chuchotée pour ${b.duree} s de plan — ${motsVoixMax(b.duree)} mots au plus.`)
  }
  if (i === 0 && b.transition !== 'coupe') out.push('Le premier plan entre en coupe franche.')
  if (i === 0 && b.duree > 2.5) out.push('L’accroche tient en 2,5 s au plus.')
  const n = b.animes.length
  if (b.mouvement === 'duo' && n !== 2) out.push('« duo » anime exactement 2 produits.')
  if (['etiquette', 'quiz', 'revele'].includes(b.mouvement) && n !== 1) out.push(`« ${b.mouvement} » anime 1 produit.`)
  if (!['zoom', 'dm'].includes(b.mouvement) && !n) out.push('Choisis au moins un produit à animer.')
  return out
}

function ChampsMulti({ valeur, changer, max, placeholder, lignes = 1 }: { valeur: Multi; changer: (m: Multi) => void; max: number; placeholder?: string; lignes?: number }) {
  return (
    <div className={s.montageMulti}>
      {LANGUES.map(([l, label]) => (
        <label key={l}><small>{label}</small>
          {lignes > 1
            ? <textarea rows={lignes} className={s.champTexte} dir={l === 'ar' ? 'rtl' : 'ltr'} value={valeur[l]} maxLength={max} placeholder={l === 'fr' ? placeholder : undefined} onChange={(e) => changer({ ...valeur, [l]: e.target.value })} />
            : <input className={s.champTexte} dir={l === 'ar' ? 'rtl' : 'ltr'} value={valeur[l]} maxLength={max} placeholder={l === 'fr' ? placeholder : undefined} onChange={(e) => changer({ ...valeur, [l]: e.target.value })} />}
        </label>))}
    </div>
  )
}

export function TableMontage({ c, d, opts, langue, brouillons, setBrouillon, selection, choisir, poster, rafraichir, message, generer, generation }: {
  c: Creatif; d: BaseCreative; opts: Option[]; langue: Langue
  brouillons: Record<number, Brouillon>; setBrouillon: (id: number, b: Brouillon | null) => void
  selection: number | null; choisir: (i: number | null) => void
  poster: (corps: unknown) => Promise<{ lancee?: boolean } & Record<string, unknown>>; rafraichir: () => Promise<void>; message: (ok: boolean, t: string) => void
  generer: (o: Option) => Promise<void>; generation: Record<number, number>
}) {
  const [occupe, setOccupe] = useState<string | null>(null)
  const [noteClaude, setNoteClaude] = useState('')
  const nom = new Map(d.catalogue.map((p) => [p.id, `${p.marque} ${p.nom}`]))
  const action = async (cle: string, corps: unknown, ok: string) => {
    setOccupe(cle)
    try { const j = await poster(corps); await rafraichir(); message(true, typeof ok === 'string' ? ok : ''); return j } catch (e) { message(false, e instanceof Error ? e.message : 'Échec'); return null } finally { setOccupe(null) }
  }
  return (
    <div className={s.montage}>
      <p className={`${s.small} ${s.muted}`}>Table de montage : clique un plan pour le retoucher. L’aperçu montre tes changements tout de suite ; « Enregistrer » les garde.</p>
      {opts.map((o, i) => {
        const b = brouillons[o.id] ?? depuisOption(o)
        const modifie = Boolean(brouillons[o.id])
        const ouvert = selection === i
        const img = imagesDe(c, o)[0]
        const maj = (patch: Partial<Brouillon>) => setBrouillon(o.id, { ...b, ...patch })
        const al = alertes(b, i)
        const voix = o.motion?.voixUrl?.[langue]
        const voixAJour = voix && voix.texte === b.voix[langue].trim()
        return (
          <article key={o.id} className={`${s.montagePlan} ${ouvert ? s.montagePlanOuvert : ''}`}>
            <div className={s.montageTete}>
              <button type="button" className={s.montageVignette} onClick={() => choisir(ouvert ? null : i)} aria-expanded={ouvert} aria-label={`Retoucher le plan ${i + 1}`}>
                {img ? <img src={img.url.replace('/upload/', '/upload/c_fill,w_90,h_160,f_auto/')} alt="" /> : <span />}
              </button>
              <button type="button" className={s.montageResume} onClick={() => choisir(ouvert ? null : i)}>
                <b>Plan {i + 1} · {b.mouvement} · {b.duree} s{modifie ? ' · modifié' : ''}</b>
                <span>{b.texte[langue] || b.texte.fr}</span>
                {al.length > 0 && <small className={s.montageAlerte}>⚠ {al[0]}{al.length > 1 ? ` (+${al.length - 1})` : ''}</small>}
              </button>
              <div className={s.montageOutils}>
                <button type="button" title="Monter" disabled={i === 0 || occupe != null} onClick={() => void action(`h${o.id}`, { planDeplace: { id: o.id, sens: -1 } }, 'Plan déplacé.')}><ArrowUp size={13} /></button>
                <button type="button" title="Descendre" disabled={i === opts.length - 1 || occupe != null} onClick={() => void action(`b${o.id}`, { planDeplace: { id: o.id, sens: 1 } }, 'Plan déplacé.')}><ArrowDown size={13} /></button>
                <button type="button" title="Dupliquer (ajouter un plan juste après)" disabled={occupe != null} onClick={() => void action(`d${o.id}`, { planDuplique: o.id }, 'Plan dupliqué : retouche la copie.')}><Copy size={13} /></button>
                <button type="button" title="Supprimer le plan" disabled={occupe != null} onClick={() => { if (window.confirm(`Supprimer le plan ${i + 1} ?`)) void action(`s${o.id}`, { planSupprime: o.id }, 'Plan supprimé.') }}><Trash2 size={13} /></button>
              </div>
            </div>
            {ouvert && (
              <div className={s.montageEditeur}>
                <fieldset className={s.reglage}><legend>Texte à l’écran <small className={s.muted}>— *mot* = mis en valeur</small></legend>
                  <ChampsMulti valeur={b.texte} changer={(texte) => maj({ texte })} max={120} placeholder="Cheveux *secs* après l’été ?" />
                  {i === 0 && <div className={s.montageAccroches}><small>Idées d’accroche :</small>{ACCROCHES.map((x) => (
                    <button key={x.nom} type="button" className={s.filtre} title={x.texte.fr} onClick={() => maj({ texte: { ...x.texte } })}>{x.nom}</button>))}</div>}
                </fieldset>
                <div className={s.montageGrille}>
                  <label className={s.champ}>Animation
                    <select className={s.select} value={b.mouvement} onChange={(e) => maj({ mouvement: e.target.value as Mouvement })}>
                      {(Object.keys(MOUVEMENTS) as Mouvement[]).map((m) => <option key={m} value={m}>{m} — {MOUVEMENTS[m]}</option>)}
                    </select></label>
                  <label className={s.champ}>Durée
                    <span className={s.montageDuree}>
                      <button type="button" onClick={() => maj({ duree: Math.max(1, b.duree - 0.5) })}>−</button><b>{b.duree.toLocaleString('fr-FR')} s</b><button type="button" onClick={() => maj({ duree: Math.min(6, b.duree + 0.5) })}>+</button>
                    </span></label>
                  <label className={s.champ}>Transition d’entrée
                    <select className={s.select} value={b.transition} disabled={i === 0} onChange={(e) => maj({ transition: e.target.value as Transition })}>
                      {(Object.keys(TRANSITIONS) as Transition[]).map((x) => <option key={x} value={x}>{TRANSITIONS[x]}</option>)}
                    </select></label>
                  <label className={s.champ}>Ambiance
                    <select className={s.select} value={b.ambiance} onChange={(e) => maj({ ambiance: e.target.value as Ambiance })}>
                      {(Object.keys(AMBIANCES) as Ambiance[]).map((x) => <option key={x} value={x}>{AMBIANCES[x]}</option>)}
                    </select></label>
                </div>
                {b.mouvement !== 'zoom' && <fieldset className={s.reglage}><legend>Produits animés ({b.animes.length}{b.mouvement === 'pop' || b.mouvement === 'fin' ? '/4' : ''})</legend>
                  <div className={s.dirChips}>{c.produit_ids.map((id) => (
                    <button key={id} type="button" className={s.filtre} aria-pressed={b.animes.includes(id)}
                      onClick={() => maj({ animes: b.animes.includes(id) ? b.animes.filter((x) => x !== id) : b.animes.length >= 4 ? b.animes : [...b.animes, id] })}>{nom.get(id) || `#${id}`}</button>))}
                  </div></fieldset>}
                {b.mouvement === 'dm' && <fieldset className={s.reglage}><legend>Conversation ({b.bulles.length} messages)</legend>
                  {b.bulles.map((x, k) => (
                    <div key={k} className={s.montageLigne}>
                      <div className={s.montageLigneTete}>
                        <button type="button" className={s.filtre} aria-pressed={x.de === 'shine'} title="Qui écrit ce message ?" onClick={() => maj({ bulles: b.bulles.map((y, j) => (j === k ? { ...y, de: y.de === 'shine' ? 'cliente' : 'shine' } : y)) })}>Message {k + 1} · {x.de === 'shine' ? 'Shine' : 'Cliente'}</button>
                        <button type="button" className={s.ghost} aria-label="Retirer ce message" onClick={() => maj({ bulles: b.bulles.filter((_, j) => j !== k) })}><X size={12} /></button>
                      </div>
                      <ChampsMulti valeur={x.texte} max={90} changer={(texte) => maj({ bulles: b.bulles.map((y, j) => (j === k ? { ...y, texte } : y)) })} />
                    </div>))}
                  {b.bulles.length < 5 && <button type="button" className={s.ghost} onClick={() => maj({ bulles: [...b.bulles, { de: b.bulles.at(-1)?.de === 'cliente' ? 'shine' : 'cliente', texte: vide() }] })}><Plus size={12} /> Message</button>}
                </fieldset>}
                {b.mouvement === 'etiquette' && <fieldset className={s.reglage}><legend>Atouts reliés au flacon (2 ou 3)</legend>
                  {b.points.map((x, k) => (
                    <div key={k} className={s.montageLigne}>
                      <div className={s.montageLigneTete}><small>Atout {k + 1}</small><button type="button" className={s.ghost} aria-label="Retirer cet atout" onClick={() => maj({ points: b.points.filter((_, j) => j !== k) })}><X size={12} /></button></div>
                      <ChampsMulti valeur={x} max={40} changer={(v) => maj({ points: b.points.map((y, j) => (j === k ? v : y)) })} />
                    </div>))}
                  {b.points.length < 3 && <button type="button" className={s.ghost} onClick={() => maj({ points: [...b.points, vide()] })}><Plus size={12} /> Atout</button>}
                </fieldset>}
                {b.mouvement === 'quiz' && <fieldset className={s.reglage}><legend>Réponses (la première mène au produit)</legend>
                  {b.choix.map((x, k) => (
                    <div key={k} className={s.montageLigne}>
                      <div className={s.montageLigneTete}><small>Réponse {'ABC'[k]}{k === 0 ? ' (mène au produit)' : ''}</small><button type="button" className={s.ghost} aria-label="Retirer cette réponse" onClick={() => maj({ choix: b.choix.filter((_, j) => j !== k) })}><X size={12} /></button></div>
                      <ChampsMulti valeur={x} max={40} changer={(v) => maj({ choix: b.choix.map((y, j) => (j === k ? v : y)) })} />
                    </div>))}
                  {b.choix.length < 3 && <button type="button" className={s.ghost} onClick={() => maj({ choix: [...b.choix, vide()] })}><Plus size={12} /> Réponse</button>}
                </fieldset>}
                {b.mouvement === 'fin' && <fieldset className={s.reglage}><legend>Rassurer la cliente (fin du Reel)</legend>
                  <div className={s.dirChips}>{(Object.keys(CONFIANCE) as CleConfiance[]).map((k) => (
                    <button key={k} type="button" className={s.filtre} aria-pressed={b.confiance.includes(k)}
                      onClick={() => maj({ confiance: b.confiance.includes(k) ? b.confiance.filter((x) => x !== k) : b.confiance.length >= 3 ? b.confiance : [...b.confiance, k] })}>✓ {CONFIANCE[k][langue]}</button>))}
                  </div>
                  <label className={s.caseInline}><input type="checkbox" checked={b.prix} onChange={(e) => maj({ prix: e.target.checked })} /> Afficher le prix{prixAnimes(b.animes, d) ? ` (${prixAnimes(b.animes, d)})` : ''}</label>
                  <small className={s.muted}>Au Maroc, « paiement à la livraison » lève le dernier frein. 2 badges se lisent mieux que 3.</small>
                </fieldset>}
                <fieldset className={s.reglage}><legend><Mic size={12} /> Voix off (ASMR) — facultative</legend>
                  <ChampsMulti valeur={b.voix} max={180} lignes={2} changer={(voix) => maj({ voix })} placeholder="Chuchoté, 1 phrase par plan : « Après l’été, tes longueurs ont soif… »" />
                  <div className={s.btns}>
                    <button type="button" className={s.ghost} disabled={occupe != null || modifie || b.voix[langue].trim().length < 3}
                      title={modifie ? 'Enregistre d’abord le plan' : undefined}
                      onClick={() => void action(`v${o.id}`, { voix: { optionId: o.id, langue } }, 'Voix off générée.')}>
                      {occupe === `v${o.id}` ? <Loader2 size={12} className={s.tourne} /> : <Mic size={12} />} {voix ? 'Refaire' : 'Générer'} la voix ({langue})</button>
                    {voix && <audio controls src={voix.url} className={s.montageAudio} />}
                    {voix && !voixAJour && <small className={s.montageAlerte}>Le texte a changé : refais la voix.</small>}
                  </div>
                </fieldset>
                {al.length > 0 && <ul className={s.montageAlertes}>{al.map((x) => <li key={x}>⚠ {x}</li>)}</ul>}
                <div className={s.btns}>
                  <button type="button" className={s.primary} disabled={!modifie || occupe != null} onClick={() => void (async () => {
                    const j = await action(`e${o.id}`, { option: { id: o.id, texte: b.texte, position: b.position, mouvement: b.mouvement, duree: b.duree, animes: b.animes, transition: b.transition, ambiance: b.ambiance, bulles: b.bulles, points: b.points, choix: b.choix, voix: b.voix, confiance: b.confiance, prix: b.prix } }, 'Plan enregistré.')
                    if (j) setBrouillon(o.id, null)
                  })()}>{occupe === `e${o.id}` ? <Loader2 size={13} className={s.tourne} /> : <Save size={13} />} Enregistrer</button>
                  {modifie && <button type="button" className={s.ghost} onClick={() => setBrouillon(o.id, null)}><Undo2 size={13} /> Annuler</button>}
                  <button type="button" className={s.ghost} disabled={generation[o.id] != null} onClick={() => void generer(o)}>{generation[o.id] != null ? <Loader2 size={13} className={s.tourne} /> : <ImagePlus size={13} />} {img ? 'Refaire le décor' : 'Peindre le décor'}</button>
                </div>
                <fieldset className={s.reglage}><legend><Wand2 size={12} /> Refaire ce plan avec Claude</legend>
                  <textarea rows={2} className={s.champTexte} value={noteClaude} maxLength={1000} onChange={(e) => setNoteClaude(e.target.value)} placeholder="Ex. : l’accroche est trop douce, montre le problème ; décor plus lumineux, vue de dessus." />
                  <button type="button" className={s.ghost} disabled={occupe != null || noteClaude.trim().length < 5} onClick={() => void (async () => {
                    setOccupe(`r${o.id}`)
                    try {
                      const j = await poster({ retouche: { optionId: o.id, note: noteClaude } })
                      setNoteClaude(''); await rafraichir()
                      message(true, j.lancee ? 'Retouche envoyée : Claude commence maintenant.' : 'Retouche envoyée : Claude la prend à son prochain passage (:35).')
                    } catch (e) { message(false, e instanceof Error ? e.message : 'Échec') } finally { setOccupe(null) }
                  })()}><Wand2 size={13} /> Envoyer à Claude</button>
                </fieldset>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
