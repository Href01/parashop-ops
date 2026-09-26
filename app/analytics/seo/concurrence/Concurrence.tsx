'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Check, Send, X } from 'lucide-react'
import Markdown from './Markdown'
import s from './concurrence.module.css'

/**
 * CONCURRENCE SEO — ce que l'agent Claude a trouve, et ce qu'on lui demande.
 *
 * L'agent tourne dans le cloud d'Anthropic (routines) : releve chaque matin,
 * demandes traitees au passage horaire suivant. Cet ecran ne parle qu'au BOS :
 * il affiche, il met en file, il coche. Pense pour le telephone d'abord.
 */

type Agregat = { impressions: number; clics: number; position: number | null }
type Gsc = { derniereJournee: string | null; exact28j: Agregat; variantes28j: Agregat; variantes7j: Agregat; variantes7jAvant: Agregat; topVariantes: { requete: string; impressions: number; position: number | null }[]; semaines?: { debut: string; impressions: number; clics: number; position: number | null; jours: number }[] }
type Requete = { requete: string; grappe: string; gsc?: Gsc; dernierReleve: { jour: string; domaines: string[]; shine_rang: number | null } | null }
type Grappe = { nom: string; priorite: number; pourquoi: string; analyse_le: string | null }
type Demande = { id: number; cible: string; genre: string; statut: string; demande_le: string; termine_le: string | null; erreur: string | null; rapport_id: number | null }
type RapportLigne = { id: number; source: string; cible: string; cree_le: string; modele: string | null; en_bref: string; concurrent: string | null }
type Changement =
  | { type: 'metaTitle'; produitId: number; valeur: string }
  | { type: 'faq'; produitId: number; questionFR: string; reponseFR: string; questionAR: string; reponseAR: string }
type Mesure = { impressions: number; clics: number; position: number | null }
type Impact = { tropTot: true; joursDispo: number; page: string | null } | { tropTot: false; jours: number; page: string | null; avant: Mesure; apres: Mesure }
type Action = { id: number; priorite: number; action: string; page: string | null; levier: string | null; effort: string | null; signal: string | null; effet: string | null; statut: string; rapport_id: number; cible: string; cree_le: string; changement?: Changement | null; applique_le?: string | null; fait_le?: string | null; impact?: Impact | null }
type Donnees = { opportunites?: Opportunite[]; grappes: Grappe[]; grappeDuJour: string | null; requetes: Requete[]; series: Record<string, { jour: string; shineRang: number | null; premier: string | null }[]>; demandes: Demande[]; rapports: RapportLigne[]; actions: Action[]; dernierPassage: string | null; rappel: string }
type RapportComplet = RapportLigne & { contenu: string; actions: Action[] }
type Opportunite = { requete: string; impressions: number; clics: number; position: number }

/** La grappe la plus probable d'une recherche, pour la suivre en un geste (modifiable ensuite). */
const grappeProbable = (q: string) =>
  /\bshine\b/i.test(q) ? 'marque-shine'
    : /salerm|biokera/i.test(q) ? 'salerm-biokera'
    : /milk/i.test(q) ? 'milk-shake'
    : /olaplex/i.test(q) ? 'olaplex'
    : /anua|medicube|joseon|cosrx|skin1004|cor[ée]en|k-?beauty|spf|solaire|s[ée]rum/i.test(q) ? 'k-beauty'
    : 'besoins-cheveux'

const quand = (d: string | null) => (d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
// « https://www.shinecosmetics.ma/products/34-… » → « /products/34-… » : le domaine n'apprend rien ici.
const chemin = (u: string) => u.replace(/^https?:\/\/(www\.)?shinecosmetics\.ma/, '') || '/'
const pos = (p: number | null | undefined) => (p == null ? '—' : p.toLocaleString('fr-FR', { maximumFractionDigits: 1 }))
const STATUTS: Record<string, [string, string]> = {
  en_attente: ['En attente', s.attente], en_cours: ['En cours', s.cours], termine: ['Terminé', s.termine], erreur: ['Erreur', s.erreurChip],
}

export default function Concurrence() {
  const [d, setD] = useState<Donnees | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  const [genre, setGenre] = useState<'requete' | 'grappe' | 'tout'>('requete')
  const [cible, setCible] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [ouvert, setOuvert] = useState<RapportComplet | null>(null)
  const [voirFaites, setVoirFaites] = useState(false)
  const [nouvelle, setNouvelle] = useState({ requete: '', grappe: '' })

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/ops/seo/agent', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Lecture impossible')
      setD(j)
      setErreur(null)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture impossible')
    }
  }, [])
  useEffect(() => { void charger() }, [charger])
  // Tant qu'une demande est en file, on repasse toutes les 30 s : le rapport arrive sans recharger.
  const enFile = d?.demandes.some((x) => x.statut === 'en_attente' || x.statut === 'en_cours')
  useEffect(() => {
    if (!enFile) return
    const t = setInterval(() => void charger(), 30_000)
    return () => clearInterval(t)
  }, [enFile, charger])

  const envoyer = async (g = genre, c = cible) => {
    setEnvoi(true)
    setMessage(null)
    try {
      const r = await fetch('/api/ops/seo/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demande: { genre: g, cible: g === 'tout' ? 'tout' : c } }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Envoi impossible')
      setMessage({ ok: true, texte: `Demande envoyée. L’agent passe chaque heure de 8 h à 23 h : le rapport apparaîtra ici.` })
      setCible('')
      await charger()
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : 'Envoi impossible' })
    } finally {
      setEnvoi(false)
    }
  }

  /* Appliquer ecrit sur la fiche en ligne : on le fait confirmer, et on dit
     comment revenir en arriere. */
  const operer = async (a: Action, operation: 'appliquer' | 'annuler') => {
    const question = operation === 'appliquer'
      ? `Appliquer sur la fiche #${a.changement?.produitId} ? Le site sera mis à jour tout de suite (annulable).`
      : 'Annuler ce changement et remettre la valeur d’avant sur la fiche ?'
    if (!window.confirm(question)) return
    setMessage(null)
    const r = await fetch(`/api/ops/seo/agent/actions/${a.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setMessage({ ok: false, texte: j.error || 'Échec' }); return }
    setMessage({ ok: true, texte: operation === 'appliquer' ? `Appliqué sur la fiche #${a.changement?.produitId} — en ligne sous une minute.` : 'Changement annulé, valeur d’avant remise.' })
    await charger()
  }

  const cocher = async (id: number, statut: 'fait' | 'ecarte' | 'a_faire') => {
    const r = await fetch(`/api/ops/seo/agent/actions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statut }) })
    if (r.ok) await charger()
  }

  const suivreRequete = async (requete: string, grappe: string) => {
    setMessage(null)
    const r = await fetch('/api/ops/seo/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ suivi: { requete, grappe, actif: true } }) })
    const j = await r.json()
    if (!r.ok) { setMessage({ ok: false, texte: j.error || 'Ajout impossible' }); return false }
    setMessage({ ok: true, texte: `« ${j.suivi.requete} » sera relevée chaque matin (grappe ${j.suivi.grappe}).` })
    await charger()
    return true
  }
  const suivre = async () => {
    if (await suivreRequete(nouvelle.requete, nouvelle.grappe)) setNouvelle({ requete: '', grappe: nouvelle.grappe })
  }

  const ouvrir = async (id: number) => {
    const r = await fetch(`/api/ops/seo/agent/rapports/${id}`, { cache: 'no-store' })
    if (r.ok) setOuvert(await r.json())
  }

  // Dans l'ordre des priorites (le BOS les renvoie triees), pas dans l'ordre alphabetique.
  const parGrappe = useMemo(() => {
    const m = new Map<string, Requete[]>()
    for (const g of d?.grappes ?? []) m.set(g.nom, [])
    for (const q of d?.requetes ?? []) m.set(q.grappe, [...(m.get(q.grappe) ?? []), q])
    return new Map([...m].filter(([, qs]) => qs.length))
  }, [d])

  const ouvertes = d?.actions.filter((a) => a.statut === 'a_faire') ?? []
  const faites = d?.actions.filter((a) => a.statut !== 'a_faire') ?? []

  return (
    <main className={s.page}>
      <header className={s.header}>
        <div>
          <p className={s.eyebrow}>ACQUISITION ORGANIQUE · AGENT CLAUDE</p>
          <h1>Concurrence SEO</h1>
          <p>Qui est premier sur nos requêtes, pourquoi, et comment le dépasser. Relevé chaque matin à 7 h ; les demandes sont traitées dans l’heure (8 h – 23 h).</p>
        </div>
        <Link className={s.back} href="/analytics/seo">← Search Console</Link>
      </header>

      {erreur && <div className={`${s.notice} ${s.error}`}>{erreur}</div>}
      {message && <div className={`${s.notice} ${message.ok ? s.ok : s.error}`} role="status">{message.texte}</div>}
      {d && (
        <div className={s.notice}>
          Dernier passage de l’agent : <b>{quand(d.dernierPassage)}</b>
          {d.grappeDuJour ? <> · analyse approfondie de demain : <b>{d.grappeDuJour}</b></> : null}. {d.rappel}
        </div>
      )}

      <section className={s.panel} aria-labelledby="demande">
        <div className={s.panelHeader}>
          <div><h2 id="demande">Demander une analyse</h2><p>Une requête précise, une grappe entière, ou tout le suivi.</p></div>
          <div className={s.segments} role="group" aria-label="Type d’analyse">
            {(['requete', 'grappe', 'tout'] as const).map((g) => (
              <button key={g} type="button" aria-pressed={genre === g} onClick={() => { setGenre(g); setCible(g === 'grappe' ? d?.grappes[0]?.nom ?? '' : '') }}>
                {g === 'requete' ? 'Requête' : g === 'grappe' ? 'Grappe' : 'Tout'}
              </button>
            ))}
          </div>
        </div>
        <div className={s.body}>
          <form className={s.form} onSubmit={(e) => { e.preventDefault(); void envoyer() }}>
            {genre === 'requete' && <input value={cible} onChange={(e) => setCible(e.target.value)} placeholder="ex. crème solaire coréenne maroc" aria-label="Requête à analyser" />}
            {genre === 'grappe' && (
              <select value={cible} onChange={(e) => setCible(e.target.value)} aria-label="Grappe à analyser">
                {d?.grappes.map((g) => <option key={g.nom} value={g.nom}>{g.nom} (priorité {g.priorite})</option>)}
              </select>
            )}
            {genre === 'tout' && <span className={s.muted} style={{ alignSelf: 'center', flex: 1 }}>Toutes les grappes, priorité 1 d’abord. Long : réservé aux bilans.</span>}
            <button className={s.primary} type="submit" disabled={envoi || (genre !== 'tout' && cible.trim().length < 2)}>
              <Send size={14} /> {envoi ? 'Envoi…' : 'Envoyer à l’agent'}
            </button>
          </form>
          {!!d?.demandes.length && (
            <ul className={s.queue} aria-label="File des demandes">
              {d.demandes.slice(0, 6).map((x) => {
                const [lib, cls] = STATUTS[x.statut] ?? [x.statut, '']
                return (
                  <li key={x.id}>
                    <span><b>{x.cible}</b> <span className={`${s.muted} ${s.small}`}>· {x.genre} · {quand(x.demande_le)}</span></span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {x.erreur && <span className={`${s.small} ${s.muted}`}>{x.erreur}</span>}
                      {x.rapport_id && <button type="button" className={s.ghost} onClick={() => void ouvrir(x.rapport_id!)}>Lire le rapport</button>}
                      <span className={`${s.chip} ${cls}`}>{lib}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <section className={s.panel} aria-labelledby="afaire">
        <div className={s.panelHeader}>
          <div><h2 id="afaire">À faire ({ouvertes.length})</h2><p>Les actions recommandées par l’agent, les plus rentables d’abord. Coche-les quand c’est fait.</p></div>
          {!!faites.length && <button type="button" className={s.ghost} onClick={() => setVoirFaites((v) => !v)}>{voirFaites ? 'Masquer' : 'Voir'} les faites ({faites.length})</button>}
        </div>
        <div className={s.body}>
          {!ouvertes.length && <p className={s.muted}>Aucune action ouverte. Elles apparaissent avec le premier rapport de l’agent.</p>}
          <ul className={s.actions}>
            {[...ouvertes, ...(voirFaites ? faites : [])].map((a) => (
              <li key={a.id} className={`${s.action} ${a.statut !== 'a_faire' ? s.faite : ''}`}>
                <div className={s.actionTop}>
                  <span className={`${s.prio} ${a.priorite === 2 ? s.prio2 : a.priorite >= 3 ? s.prio3 : ''}`}>P{a.priorite}</span>
                  <span className={s.actionText}>{a.action}</span>
                </div>
                <div className={s.meta}>
                  {a.page && <span><b>Page</b> {chemin(a.page)}</span>}
                  {a.levier && <span><b>Où</b> {a.levier}</span>}
                  {a.effort && <span><b>Effort</b> {a.effort}</span>}
                </div>
                {/* La preuve et l'effet sont longs : repliés, l'action reste lisible d'un coup d'oeil sur telephone. */}
                {(a.effet || a.signal) && (
                  <details className={s.details}>
                    <summary>Pourquoi · effet attendu</summary>
                    {a.signal && <p><b>Preuve</b> {a.signal}</p>}
                    {a.effet && <p><b>Effet</b> {a.effet}</p>}
                  </details>
                )}
                {a.changement && <ChangementPret c={a.changement} applique={a.applique_le ?? null} />}
                {a.statut === 'fait' && a.impact && <ImpactLigne impact={a.impact} />}
                <div className={s.actionBtns}>
                  {a.changement && !a.applique_le && a.statut === 'a_faire' && (
                    <button type="button" className={s.primary} onClick={() => void operer(a, 'appliquer')}>Appliquer</button>
                  )}
                  {a.applique_le && <button type="button" className={s.ghost} onClick={() => void operer(a, 'annuler')}>Annuler</button>}
                  {a.statut === 'a_faire' ? (
                    <>
                      <button type="button" className={s.ghost} onClick={() => void cocher(a.id, 'fait')}><Check size={12} /> Fait</button>
                      <button type="button" className={s.ghost} onClick={() => void cocher(a.id, 'ecarte')}>Écarter</button>
                    </>
                  ) : !a.applique_le && <button type="button" className={s.ghost} onClick={() => void cocher(a.id, 'a_faire')}>Rouvrir</button>}
                  {/* Une action appliquee se rouvre par « Annuler », qui remet aussi la fiche : « Rouvrir » laisserait le changement en ligne. */}
                  <button type="button" className={s.ghost} onClick={() => void ouvrir(a.rapport_id)}>Rapport « {a.cible} »</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {!!d?.opportunites?.length && (
        <section className={s.panel} aria-labelledby="opportunites">
          <div className={s.panelHeader}>
            <div>
              <h2 id="opportunites">Opportunités Search Console ({d.opportunites.length})</h2>
              <p>Recherches où Shine est déjà entre la 4e et la 20e place au Maroc (28 jours), avec du volume, mais que personne ne suit. Gagner quelques places ici rapporte le plus vite.</p>
            </div>
          </div>
          <div className={s.tableScroll}>
            <table className={s.table}>
              <thead><tr><th>Recherche</th><th>Position Google</th><th>Impressions</th><th>Clics</th><th /></tr></thead>
              <tbody>
                {d.opportunites.map((o) => (
                  <tr key={o.requete}>
                    <td className={s.req}>{o.requete}</td>
                    <td data-label="Position Google"><b>{pos(o.position)}</b></td>
                    <td data-label="Impressions">{o.impressions}</td>
                    <td data-label="Clics">{o.clics}</td>
                    <td className={s.cellAction}>
                      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button type="button" className={s.ghost} onClick={() => void envoyer('requete', o.requete)}>Analyser</button>
                        <button type="button" className={s.ghost} onClick={() => void suivreRequete(o.requete, grappeProbable(o.requete))}>Suivre · {grappeProbable(o.requete)}</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className={s.panel} aria-labelledby="suivi">
        <div className={s.panelHeader}>
          <div>
            <h2 id="suivi">Requêtes suivies</h2>
            <p>#1 et présence de Shine : moteur de l’agent (dernier relevé). Position Google : réelle, Search Console, Maroc, 28 jours, variantes comprises.</p>
          </div>
        </div>
        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead>
              <tr><th>Requête</th><th>#1 (moteur)</th><th>Shine (moteur)</th><th>Position Google</th><th>7 j vs 7 j avant</th><th>30 jours</th><th /></tr>
            </thead>
            <tbody>
              {[...parGrappe.entries()].map(([grappe, qs]) => {
                const g = d?.grappes.find((x) => x.nom === grappe)
                return [
                  <tr key={`g-${grappe}`} className={s.grappeRow}>
                    <td colSpan={7}>{grappe} · priorité {g?.priorite ?? '?'} <span className={s.muted} style={{ fontWeight: 400 }}>— {g?.pourquoi}</span></td>
                  </tr>,
                  ...qs.map((q) => {
                    const v = q.gsc?.variantes28j
                    const a = q.gsc?.variantes7j.position
                    const b = q.gsc?.variantes7jAvant.position
                    // Sous 30 impressions par semaine, un ecart de position est du bruit (une recherche a la 60e place suffit a le creer).
                    const volumeFaible = (q.gsc?.variantes7j.impressions ?? 0) < 30 || (q.gsc?.variantes7jAvant.impressions ?? 0) < 30
                    const delta = a != null && b != null && !volumeFaible ? Math.round((b - a) * 10) / 10 : null
                    const serie = d?.series[q.requete] ?? []
                    return (
                      <tr key={q.requete}>
                        <td className={s.req}>{q.requete}</td>
                        <td data-label="#1 (moteur)">{q.dernierReleve?.domaines[0] ?? <span className={s.muted}>pas encore relevé</span>}</td>
                        <td data-label="Shine (moteur)">{q.dernierReleve ? (q.dernierReleve.shine_rang ? <span className={s.present}>#{q.dernierReleve.shine_rang}</span> : <span className={s.absent}>absente</span>) : '—'}</td>
                        <td data-label="Position Google" title={q.gsc?.topVariantes.map((t) => `${t.requete} : ${pos(t.position)} (${t.impressions} imp.)`).join('\n')}>
                          {v?.impressions ? <span><b>{pos(v.position)}</b> <span className={`${s.muted} ${s.small}`}>{v.impressions} imp.</span></span> : <span className={s.muted}>aucune impression</span>}
                        </td>
                        <td data-label="7 j vs 7 j avant">{delta == null ? <span className={s.muted}>{volumeFaible && a != null ? 'faible volume' : '—'}</span> : delta > 0 ? <span className={s.up}><ArrowUp size={12} /> {delta}</span> : delta < 0 ? <span className={s.down}><ArrowDown size={12} /> {Math.abs(delta)}</span> : '='}</td>
                        <td data-label="30 jours">
                          <div className={s.dots} aria-label={`${serie.filter((x) => x.shineRang).length} relevés avec Shine dans le top 10 sur ${serie.length}`}>
                            {serie.slice(-30).map((x) => <span key={x.jour} className={`${s.dot} ${x.shineRang ? s.dotOn : ''}`} style={{ height: x.shineRang ? `${Math.max(4, 19 - x.shineRang * 1.5)}px` : '4px' }} title={`${x.jour} : ${x.shineRang ? '#' + x.shineRang : 'absente'} · #1 ${x.premier ?? '—'}`} />)}
                          </div>
                        </td>
                        <td className={s.cellAction}><button type="button" className={s.ghost} onClick={() => void envoyer('requete', q.requete)}>Analyser</button></td>
                      </tr>
                    )
                  }),
                ]
              })}
            </tbody>
          </table>
        </div>
        <div className={s.body}>
          <form className={s.form} onSubmit={(e) => { e.preventDefault(); void suivre() }}>
            <input value={nouvelle.requete} onChange={(e) => setNouvelle({ ...nouvelle, requete: e.target.value })} placeholder="Suivre une nouvelle requête (finir par « maroc »)" aria-label="Nouvelle requête à suivre" />
            <select value={nouvelle.grappe} onChange={(e) => setNouvelle({ ...nouvelle, grappe: e.target.value })} aria-label="Grappe">
              <option value="">Grappe…</option>
              {d?.grappes.map((g) => <option key={g.nom} value={g.nom}>{g.nom}</option>)}
            </select>
            <button type="submit" className={s.ghost} disabled={nouvelle.requete.trim().length < 2 || !nouvelle.grappe}>Suivre</button>
          </form>
        </div>
      </section>

      <section className={s.panel} aria-labelledby="rapports">
        <div className={s.panelHeader}><div><h2 id="rapports">Rapports</h2><p>Relevés quotidiens et analyses demandées, les plus récents d’abord.</p></div></div>
        <div className={s.body}>
          {!d?.rapports.length && <p className={s.muted}>Aucun rapport pour l’instant.</p>}
          <ul className={s.reports}>
            {d?.rapports.map((r) => (
              <li key={r.id}>
                <button type="button" className={s.report} onClick={() => void ouvrir(r.id)}>
                  <span className={s.reportTop}>
                    <span>{quand(r.cree_le)} · {r.source === 'quotidien' ? 'relevé quotidien' : 'demande'}{r.modele ? ` · ${r.modele}` : ''}</span>
                    {r.concurrent && <span>à battre : <b>{r.concurrent}</b></span>}
                  </span>
                  <span className={s.reportTitle}>{r.cible}</span>
                  <span className={s.clamp}>{r.en_bref}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {ouvert && (
        <div className={s.overlay} role="dialog" aria-modal="true" aria-label={`Rapport ${ouvert.cible}`} onClick={() => setOuvert(null)}>
          <div className={s.drawer} onClick={(e) => e.stopPropagation()}>
            <div className={s.drawerTop}>
              <div>
                <p className={s.eyebrow}>{ouvert.source === 'quotidien' ? 'RELEVÉ QUOTIDIEN' : 'ANALYSE DEMANDÉE'} · {quand(ouvert.cree_le)}</p>
                <h2 style={{ margin: 0, fontSize: 18 }}>{ouvert.cible}</h2>
              </div>
              <button type="button" className={s.ghost} onClick={() => setOuvert(null)} aria-label="Fermer"><X size={14} /></button>
            </div>
            <Markdown texte={ouvert.contenu} className={s.md} />
          </div>
        </div>
      )}
    </main>
  )
}

/** Ce que « Appliquer » va ecrire, mot pour mot : on ne publie rien qu'on n'a pas lu. */
function ChangementPret({ c, applique }: { c: Changement; applique: string | null }) {
  return (
    <div className={s.changement}>
      <div className={s.changementTete}>
        {applique ? <span className={`${s.chip} ${s.termine}`}>Appliqué le {quand(applique)}</span> : <span className={`${s.chip} ${s.cours}`}>Changement prêt</span>}
        <span className={s.small}>Fiche #{c.produitId}</span>
      </div>
      {c.type === 'metaTitle' ? (
        <p><b>Titre Google</b> → « {c.valeur} » <span className={s.muted}>({c.valeur.length} car.)</span></p>
      ) : (
        <>
          <p><b>Question ajoutée à la FAQ</b> : « {c.questionFR} »</p>
          <details className={s.details}>
            <summary>Lire la réponse (FR + AR)</summary>
            <p>{c.reponseFR}</p>
            <p dir="rtl"><b>{c.questionAR}</b><br />{c.reponseAR}</p>
          </details>
        </>
      )}
    </div>
  )
}

/** Search Console, N jours avant contre N jours apres le « Fait ». */
function ImpactLigne({ impact }: { impact: Impact }) {
  if (impact.tropTot) {
    const reste = Math.max(1, 7 - impact.joursDispo)
    return <div className={`${s.small} ${s.muted}`}>Impact : mesurable dans ~{reste} jour{reste > 1 ? 's' : ''} (Search Console a besoin de 7 jours de recul).</div>
  }
  const { avant: av, apres: ap } = impact
  const pos = av.position != null && ap.position != null ? Math.round((av.position - ap.position) * 10) / 10 : null
  return (
    <div className={s.impact}>
      <b>Impact</b> <span className={s.muted}>({impact.jours} j après vs {impact.jours} j avant, {impact.page})</span> :{' '}
      position {av.position ?? '—'} → <b>{ap.position ?? '—'}</b>
      {pos != null && pos !== 0 && <span className={pos > 0 ? s.up : s.down}> ({pos > 0 ? '+' : ''}{pos})</span>}
      {' · '}clics {av.clics} → <b>{ap.clics}</b>{' · '}impressions {av.impressions} → <b>{ap.impressions}</b>
    </div>
  )
}
