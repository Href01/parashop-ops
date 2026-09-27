'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Send, Wand2 } from 'lucide-react'
import { OBJECTIFS, StrategieSchema, type Strategie } from '@/lib/ads/strategie-model'
import { TYPES_ACTION, dh, nb, quand, type Action, type Demande, type Donnees, type Rapport, type Verite } from './types'
import s from '../agent.module.css'

const TONS: Record<string, string> = { vert: s.chipVert, orange: s.chipOrange, rouge: s.chipRouge, bleu: s.chipBleu, gris: '' }

/* ------------------------------------------------------------------ */
/* A FAIRE                                                             */
/* ------------------------------------------------------------------ */

export function AFaire({ actions, ouvrirRapport, cocher }: { actions: Action[]; ouvrirRapport: (id: number) => void; cocher: (id: number, statut: 'fait' | 'ecarte' | 'a_faire') => void }) {
  const [voirFaites, setVoirFaites] = useState(false)
  const ouvertes = actions.filter((a) => a.statut === 'a_faire'), faites = actions.filter((a) => a.statut !== 'a_faire')
  const parType = useMemo(() => {
    const m = new Map<string, Action[]>()
    for (const a of ouvertes) m.set(a.type, [...(m.get(a.type) || []), a])
    const ordre = ['couper', 'reduire', 'corriger_suivi', 'augmenter', 'lancer', 'tester', 'offre', 'autre']
    return [...m.entries()].sort((a, b) => ordre.indexOf(a[0]) - ordre.indexOf(b[0]))
  }, [ouvertes])
  if (!actions.length) return <p className={s.notice}>Aucune décision pour l’instant : elles arrivent avec le brief de l’agent (chaque matin à 7 h 40).</p>
  const carte = (a: Action) => {
    const t = TYPES_ACTION[a.type] ?? TYPES_ACTION.autre
    return (
      <li key={a.id} className={`${s.carte} ${a.statut !== 'a_faire' ? s.faite : ''}`}>
        <div className={s.carteTop}><span className={`${s.chip} ${TONS[t.ton]}`}>{t.label}</span><span className={s.chip}>P{a.priorite}</span><span className={s.carteTexte}>{a.action}</span></div>
        <div className={s.meta}>{a.cible && <span><b>Cible</b> {a.cible}</span>}{a.effort && <span><b>Effort</b> {a.effort}</span>}<span><b>Rapport</b> {a.rapport_titre} · {quand(a.rapport_le)}</span></div>
        {(a.signal || a.effet) && <div className={s.preuve}>{a.signal && <p><b>Preuve</b> {a.signal}</p>}{a.effet && <p><b>Effet attendu</b> {a.effet}</p>}</div>}
        <div className={s.btns}>
          {a.statut === 'a_faire'
            ? <><button type="button" className={s.primary} onClick={() => cocher(a.id, 'fait')}><Check size={13} /> Fait</button><button type="button" className={s.ghost} onClick={() => cocher(a.id, 'ecarte')}>Écarter</button></>
            : <button type="button" className={s.ghost} onClick={() => cocher(a.id, 'a_faire')}>Rouvrir</button>}
          <button type="button" className={s.ghost} onClick={() => ouvrirRapport(a.rapport_id)}>Voir le rapport</button>
        </div>
      </li>)
  }
  return (
    <section className={s.panel} aria-labelledby="afaire">
      <div className={s.panelHeader}>
        <div><h2 id="afaire">Décisions à prendre ({ouvertes.length})</h2><p>Regroupées par type. Applique-les dans le gestionnaire de publicités Meta, puis coche « Fait » : l’agent mesure ensuite ce qu’elles ont changé.</p></div>
        {!!faites.length && <button type="button" className={s.ghost} onClick={() => setVoirFaites((x) => !x)}>{voirFaites ? 'Masquer' : 'Voir'} les traitées ({faites.length})</button>}
      </div>
      <div className={s.body}>
        {parType.map(([type, liste]) => (
          <div key={type} className={s.groupeActions}>
            <h3>{TYPES_ACTION[type]?.label ?? type} <span className={s.muted}>({liste.length})</span></h3>
            <ul className={s.liste}>{liste.map(carte)}</ul>
          </div>))}
        {voirFaites && <div className={s.groupeActions}><h3>Traitées</h3><ul className={s.liste}>{faites.map(carte)}</ul></div>}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* STRATEGIE                                                           */
/* ------------------------------------------------------------------ */

function Section({ titre, aide, children }: { titre: string; aide: string; children: React.ReactNode }) {
  return <fieldset className={s.section}><legend>{titre}</legend><p className={s.sectionAide}>{aide}</p><div className={s.form}>{children}</div></fieldset>
}

export function StrategieOnglet({ st, d, occupe, enregistrer }: { st: Donnees['strategie']; d: Donnees; occupe: boolean; enregistrer: (c: Strategie) => Promise<unknown> }) {
  const [c, setC] = useState<Strategie>(st.config)
  useEffect(() => setC(st.config), [st.config])
  const [erreur, setErreur] = useState<string | null>(null)
  const set = <K extends keyof Strategie>(k: K, v: Strategie[K]) => setC((x) => ({ ...x, [k]: v }))
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
  const ids = (v: string) => [...new Set(v.split(/[^0-9]+/).map(Number).filter((x) => Number.isInteger(x) && x > 0))]
  const v: Verite = d.verite
  // Suggestions tirees des chiffres reels : a appliquer d'un clic, jamais imposees.
  const sugg = {
    budgetMensuel: v.depense > 0 ? Math.round((v.depense / v.jours) * 30 / 50) * 50 : null,
    budgetJourMax: v.depense > 0 ? Math.max(20, Math.round(((v.depense / v.jours) * 1.5) / 10) * 10) : null,
    coutParCommandeMax: v.seuilParCommande ? Math.round(v.seuilParCommande / 3) : null,
    roasMin: v.seuilParCommande && v.panierMoyen ? Math.round((v.panierMoyen / (v.seuilParCommande / 3)) * 10) / 10 : null,
  }
  const produitsNoms = (liste: number[]) => liste.map((id) => d.produits.find((p) => p.id === id)?.nom || `#${id}`).join(' · ')
  const Suggestion = ({ valeur, appliquer, unite = 'DH' }: { valeur: number | null; appliquer: () => void; unite?: string }) =>
    valeur == null ? null : <button type="button" className={s.suggestion} onClick={appliquer}><Wand2 size={11} /> Suggestion : {nb(valeur, 1)} {unite}</button>
  const soumettre = async () => {
    const p = StrategieSchema.safeParse(c)
    if (!p.success) { setErreur(p.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`).join(' · ')); return }
    setErreur(null)
    await enregistrer(p.data)
  }
  return (
    <section className={s.panel} aria-labelledby="strat">
      <div className={s.panelHeader}>
        <div><h2 id="strat">Stratégie publicitaire</h2><p>Ce que l’agent doit servir, et ce qui déclenche les conseils de l’écran. Chaque enregistrement crée une version.{st.modifie_le ? ` Dernière : ${quand(st.modifie_le)}.` : ' Aucune version enregistrée : valeurs par défaut.'}</p></div>
        <button type="button" className={s.primary} disabled={occupe} onClick={() => void soumettre()}>Enregistrer</button>
      </div>
      <div className={s.body}>
        {erreur && <p className={`${s.notice} ${s.error}`}>{erreur}</p>}
        <p className={s.aide}>Tes repères sur {v.jours} jours : une commande livrée laisse <b>{dh(v.seuilParCommande)}</b> de marge ; la pub en coûte <b>{dh(v.coutParCommandeLivree)}</b> par commande ; le panier moyen est de <b>{dh(v.panierMoyen)}</b>. Les suggestions partent de ces chiffres.</p>
        <Section titre="Objectif et budget" aide="Ce que la pub doit accomplir, et combien tu acceptes d’y mettre.">
          <label className={`${s.champ} ${s.large}`}>Objectif<select value={c.objectif} onChange={(e) => set('objectif', e.target.value as Strategie['objectif'])}>{Object.entries(OBJECTIFS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className={s.champ}>Budget mensuel (DH)<input inputMode="decimal" value={c.budgetMensuel ?? ''} onChange={(e) => set('budgetMensuel', num(e.target.value))} /><Suggestion valeur={sugg.budgetMensuel} appliquer={() => set('budgetMensuel', sugg.budgetMensuel)} /></label>
          <label className={s.champ}>Budget par jour maximum (DH)<input inputMode="decimal" value={c.budgetJourMax ?? ''} onChange={(e) => set('budgetJourMax', num(e.target.value))} /><Suggestion valeur={sugg.budgetJourMax} appliquer={() => set('budgetJourMax', sugg.budgetJourMax)} /></label>
        </Section>
        <Section titre="Cibles de rentabilité" aide="Les seuils qui départagent une pub « à surveiller » d’une pub « à couper ».">
          <label className={s.champ}>Pub max par commande livrée (DH)<small>Un tiers de la marge laisse de quoi payer le reste.</small><input inputMode="decimal" value={c.cibles.coutParCommandeMax ?? ''} onChange={(e) => set('cibles', { ...c.cibles, coutParCommandeMax: num(e.target.value) })} /><Suggestion valeur={sugg.coutParCommandeMax} appliquer={() => set('cibles', { ...c.cibles, coutParCommandeMax: sugg.coutParCommandeMax })} /></label>
          <label className={s.champ}>CA livré minimum par dirham de pub (×)<input inputMode="decimal" value={c.cibles.roasMin ?? ''} onChange={(e) => set('cibles', { ...c.cibles, roasMin: num(e.target.value) })} /><Suggestion valeur={sugg.roasMin} unite="×" appliquer={() => set('cibles', { ...c.cibles, roasMin: sugg.roasMin })} /></label>
          <label className={s.champ}>Marge après pub minimum (% du CA)<input inputMode="decimal" value={c.cibles.margeApresPubMin ?? ''} onChange={(e) => set('cibles', { ...c.cibles, margeApresPubMin: num(e.target.value) })} /></label>
        </Section>
        <Section titre="Produits et marques" aide="Ce que l’agent doit pousser, et ce qu’il ne doit jamais mettre en pub (rupture, marge trop faible).">
          <label className={s.champ}>Marques à pousser<small>Séparées par des virgules.</small><input value={c.marquesPrioritaires.join(', ')} onChange={(e) => set('marquesPrioritaires', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="ex. Milk Shake, Olaplex" /></label>
          <label className={s.champ}>Produits à pousser (numéros de fiche)<small>{produitsNoms(c.produitsPrioritaires) || 'ex. 34, 2, 49'}</small><input value={c.produitsPrioritaires.join(', ')} onChange={(e) => set('produitsPrioritaires', ids(e.target.value))} /></label>
          <label className={`${s.champ} ${s.large}`}>Produits à ne jamais pousser<small>{produitsNoms(c.produitsExclus) || 'ex. produits en rupture ou à faible marge'}</small><input value={c.produitsExclus.join(', ')} onChange={(e) => set('produitsExclus', ids(e.target.value))} /></label>
        </Section>
        <Section titre="Public, langues et ton" aide="À qui l’on parle, et comment.">
          <label className={s.champ}>Zones<input value={c.zones} onChange={(e) => set('zones', e.target.value)} /></label>
          <div className={s.champ}>Langues des créations<div className={s.cases}>{(['fr', 'darija', 'ar'] as const).map((l) => <label key={l}><input type="checkbox" checked={c.langues.includes(l)} onChange={(e) => set('langues', e.target.checked ? [...c.langues, l] : c.langues.filter((x) => x !== l))} />{l === 'fr' ? 'Français' : l === 'darija' ? 'Darija' : 'Arabe'}</label>)}</div></div>
          <label className={`${s.champ} ${s.large}`}>Public visé<textarea rows={2} value={c.public} onChange={(e) => set('public', e.target.value)} /></label>
          <label className={`${s.champ} ${s.large}`}>Ton de la marque<textarea rows={2} value={c.ton} onChange={(e) => set('ton', e.target.value)} /></label>
        </Section>
        <Section titre="Canaux et offres" aide="Où les clientes commandent, et ce que les pubs ont le droit de promettre.">
          <div className={`${s.champ} ${s.large}`}>Où les clientes commandent<div className={s.cases}>{([['site', 'Site'], ['dmInstagram', 'DM Instagram'], ['whatsapp', 'WhatsApp']] as const).map(([k, l]) => <label key={k}><input type="checkbox" checked={c.canaux[k]} onChange={(e) => set('canaux', { ...c.canaux, [k]: e.target.checked })} />{l}</label>)}</div></div>
          <label className={`${s.champ} ${s.large}`}>Offres autorisées dans les pubs<small>ex. code BIENVENUE10, livraison offerte dès 650 DH à Casablanca, packs.</small><textarea rows={2} value={c.offres} onChange={(e) => set('offres', e.target.value)} /></label>
        </Section>
        <Section titre="Règles de décision" aide="Quand juger une pub, et quand la considérer fatiguée.">
          <label className={s.champ}>Fréquence maximale (7 j)<input inputMode="decimal" value={c.regles.frequenceMax} onChange={(e) => set('regles', { ...c.regles, frequenceMax: Number(e.target.value) || 3 })} /></label>
          <label className={s.champ}>Dépense minimale avant de juger une pub (DH)<input inputMode="decimal" value={c.regles.depenseMinAvantVerdict} onChange={(e) => set('regles', { ...c.regles, depenseMinAvantVerdict: Number(e.target.value) || 0 })} /></label>
          <label className={s.champ}>Durée d’un test de création (jours)<input inputMode="numeric" value={c.regles.joursTestCreatif} onChange={(e) => set('regles', { ...c.regles, joursTestCreatif: Math.round(Number(e.target.value)) || 4 })} /></label>
          <div className={s.champ}>Posts boostés (optimisés pour les likes)<div className={s.cases}><label><input type="checkbox" checked={c.regles.boostsAutorises} onChange={(e) => set('regles', { ...c.regles, boostsAutorises: e.target.checked })} />Autorisés</label></div></div>
        </Section>
        <Section titre="Calendrier" aide="Les temps forts : l’agent prépare les créations à l’avance.">
          <div className={`${s.champ} ${s.large}`}>
            {c.calendrier.map((ev, i) => (
              <div key={i} className={s.cases} style={{ alignItems: 'center' }}>
                <input value={ev.nom} onChange={(e) => set('calendrier', c.calendrier.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} placeholder="Nom (ex. Black Friday)" style={{ flex: 1, minWidth: 140 }} />
                <input type="date" value={ev.debut} onChange={(e) => set('calendrier', c.calendrier.map((x, j) => (j === i ? { ...x, debut: e.target.value } : x)))} />
                <input type="date" value={ev.fin} onChange={(e) => set('calendrier', c.calendrier.map((x, j) => (j === i ? { ...x, fin: e.target.value } : x)))} />
                <button type="button" className={s.ghost} onClick={() => set('calendrier', c.calendrier.filter((_, j) => j !== i))}>Retirer</button>
              </div>))}
            <div><button type="button" className={s.ghost} onClick={() => set('calendrier', [...c.calendrier, { nom: '', debut: new Date().toISOString().slice(0, 10), fin: new Date().toISOString().slice(0, 10), note: '' }])}>Ajouter un temps fort</button></div>
          </div>
        </Section>
        <Section titre="Notes pour l’agent" aide="Tout ce qu’il doit savoir : fournisseur bloqué, nouveauté, ce qui a déjà marché ou raté.">
          <label className={`${s.champ} ${s.large}`}><textarea rows={4} value={c.notes} onChange={(e) => set('notes', e.target.value)} /></label>
        </Section>
        <div className={s.btns}><button type="button" className={s.primary} disabled={occupe} onClick={() => void soumettre()}>Enregistrer la stratégie</button></div>
        {st.historique.length > 0 && <p className={`${s.small} ${s.muted}`} style={{ marginTop: 12 }}>Versions : {st.historique.map((h) => `#${h.id} ${quand(h.modifie_le)}`).join(' · ')}</p>}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* AGENT : demandes et rapports                                        */
/* ------------------------------------------------------------------ */

const GENRES: Record<string, string> = { analyse: 'Analyser', creatifs: 'Créations à produire', audit: 'Audit complet', question: 'Question' }
const SOURCES: Record<string, string> = { quotidien: 'Brief', hebdo: 'Audit hebdo', demande: 'Demande' }

export function AgentOnglet({ d, occupe, ouvrir, envoyer, prerempli }: { d: Donnees; occupe: boolean; ouvrir: (id: number) => void; envoyer: (genre: string, sujet: string) => Promise<unknown>; prerempli: { genre: string; sujet: string } | null }) {
  const [genre, setGenre] = useState(prerempli?.genre ?? 'analyse')
  const [sujet, setSujet] = useState(prerempli?.sujet ?? '')
  const [filtre, setFiltre] = useState<'tous' | string>('tous')
  useEffect(() => { if (prerempli) { setGenre(prerempli.genre); setSujet(prerempli.sujet) } }, [prerempli])
  const top = [...d.produits].filter((p) => p.margeShine != null && p.stockVendable >= 5 && !p.importBloque).sort((a, b) => b.margeShine! * Math.max(1, b.vendus90j) - a.margeShine! * Math.max(1, a.vendus90j))[0]
  const modeles: [string, string][] = [
    ['analyse', 'Quelles pubs couper ou augmenter aujourd’hui, et pourquoi ?'],
    ['creatifs', top ? `3 Reels et 2 visuels pour ${top.marque} « ${top.nom} » (fiche ${top.id}), campagne Messages, en darija et en français` : '3 Reels pour mon meilleur produit, en darija'],
    ['creatifs', 'Créations pour la K-beauty : crèmes solaires et anti-taches, public 20-35 ans'],
    ['question', 'Combien puis-je dépenser par jour en restant rentable ?'],
    ['audit', 'Audit complet : structure des campagnes, suivi des ventes DM, budget, publics'],
  ]
  const rapports = d.rapports.filter((r) => filtre === 'tous' || r.source === filtre)
  return (
    <section className={s.panel} aria-labelledby="demander">
      <div className={s.panelHeader}><div><h2 id="demander">Demander à l’agent</h2><p>Il passe chaque heure de 8 h à 23 h et publie ici son rapport : analyse, décisions, créations. Le brief du matin arrive chaque jour à 7 h 40.</p></div></div>
      <div className={s.body}>
        <div className={s.modeles}>{modeles.map(([g, t]) => <button key={t} type="button" className={s.modele} onClick={() => { setGenre(g); setSujet(t) }}><span>{GENRES[g]}</span>{t}</button>)}</div>
        <form className={s.demande} onSubmit={(e) => { e.preventDefault(); void envoyer(genre, sujet).then((ok) => { if (ok) setSujet('') }) }}>
          <select value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Type de demande" className={s.select}>{Object.entries(GENRES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <textarea value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder="Ta demande, en une ou deux phrases" aria-label="Ta demande" />
          <button type="submit" className={s.primary} disabled={occupe || sujet.trim().length < 3}><Send size={13} /> Envoyer</button>
        </form>
        {d.demandes.length > 0 && <ul className={s.file}>{d.demandes.map((x: Demande) => (
          <li key={x.id}>
            <span><b>{GENRES[x.genre] || x.genre}</b> · {x.sujet.slice(0, 120)} <span className={`${s.muted} ${s.small}`}>· {quand(x.demande_le)}</span></span>
            <span>{x.statut === 'termine' && x.rapport_id ? <button type="button" className={s.ghost} onClick={() => ouvrir(x.rapport_id!)}>Lire</button> : <span className={`${s.chip} ${x.statut === 'erreur' ? s.chipRouge : x.statut === 'en_cours' ? s.chipBleu : ''}`}>{x.statut === 'en_attente' ? 'En attente' : x.statut === 'en_cours' ? 'En cours' : x.statut === 'erreur' ? `Erreur : ${x.erreur || ''}` : 'Terminé'}</span>}</span>
          </li>))}</ul>}
        {d.rapports.length > 0 && <>
          <div className={s.titreAvecFiltres}><h3>Rapports</h3><div className={s.groupeFiltres}>{['tous', 'quotidien', 'hebdo', 'demande'].map((f) => <button key={f} type="button" className={s.filtre} aria-pressed={filtre === f} onClick={() => setFiltre(f)}>{f === 'tous' ? 'Tous' : SOURCES[f]}</button>)}</div></div>
          <ul className={s.file}>{rapports.map((r: Rapport) => <li key={r.id}><span><b>{r.titre}</b> <span className={`${s.muted} ${s.small}`}>· {SOURCES[r.source] ?? r.source} · {quand(r.cree_le)}</span></span><button type="button" className={s.ghost} onClick={() => ouvrir(r.id)}>Lire</button></li>)}</ul>
        </>}
      </div>
    </section>
  )
}
