'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import BosShell from '@/components/BosShell'
import Markdown from '@/app/analytics/seo/concurrence/Markdown'
import type { Conseil } from '@/lib/ads/conseils'
import { Cockpit, Conseils } from './ui/Cockpit'
import { Ensemble } from './ui/Ensemble'
import { Campagnes, TiroirPub } from './ui/Campagnes'
import { Creations, Studio } from './ui/Creations'
import { AFaire, AgentOnglet, StrategieOnglet } from './ui/Onglets'
import { quand, type Donnees, type Onglet, type Rapport } from './ui/types'
import s from './agent.module.css'

/**
 * AGENT META ADS — cockpit, campagnes, studio de creation, strategie, agent.
 *
 * La page juge la pub a ce qu'elle rapporte en commandes LIVREES (tous
 * canaux, DM compris), pas au pixel. Les conseils sont des regles recalculees
 * a chaque ouverture ; l'agent (Claude, routines cloud) ecrit le brief, les
 * decisions et les creations ; OpenAI genere les visuels a partir des vraies
 * photos produit. Rien ne touche le compte Meta : Achraf decide.
 */

const ONGLETS: [Onglet, string][] = [['ensemble', 'Vue d’ensemble'], ['campagnes', 'Campagnes'], ['creations', 'Créations'], ['afaire', 'À faire'], ['strategie', 'Stratégie'], ['agent', 'Agent']]

export default function AgentMeta() {
  const [d, setD] = useState<Donnees | null>(null)
  const [jours, setJours] = useState(30)
  const [onglet, setOnglet] = useState<Onglet>('ensemble')
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [rapportOuvert, setRapportOuvert] = useState<(Rapport & { contenu: string }) | null>(null)
  const [pubOuverte, setPubOuverte] = useState<string | null>(null)
  const [creatifOuvert, setCreatifOuvert] = useState<number | null>(null)
  const [prerempli, setPrerempli] = useState<{ genre: string; sujet: string } | null>(null)

  const charger = useCallback(async () => {
    try {
      const r = await fetch(`/api/ops/ads/agent?jours=${jours}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Lecture impossible')
      setD(j); setErreur(null)
    } catch (e) { setErreur(e instanceof Error ? e.message : 'Lecture impossible') }
  }, [jours])
  useEffect(() => { void charger() }, [charger])
  // L'onglet se retient dans l'URL (#campagnes) : un lien ou un retour arriere retombe au bon endroit.
  useEffect(() => {
    const h = window.location.hash.slice(1) as Onglet
    if (ONGLETS.some(([k]) => k === h)) setOnglet(h)
  }, [])
  const aller = (o: Onglet) => { setOnglet(o); history.replaceState(null, '', `#${o}`) }
  const enFile = d?.demandes.some((x) => x.statut === 'en_attente' || x.statut === 'en_cours')
  useEffect(() => {
    if (!enFile) return
    const t = setInterval(() => void charger(), 30_000)
    return () => clearInterval(t)
  }, [enFile, charger])
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 6000)
    return () => clearTimeout(t)
  }, [message])
  // Echap ferme le panneau ouvert (sur telephone, le panneau prend tout l'ecran : pas de fond ou cliquer).
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setCreatifOuvert(null); setPubOuverte(null); setRapportOuvert(null)
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [])

  const envoyer = async (corps: unknown, succes: string) => {
    setOccupe(true); setMessage(null)
    try {
      const r = await fetch('/api/ops/ads/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Échec')
      setMessage({ ok: true, texte: succes })
      await charger()
      return j
    } catch (e) { setMessage({ ok: false, texte: e instanceof Error ? e.message : 'Échec' }); return null }
    finally { setOccupe(false) }
  }
  const ouvrirRapport = async (id: number) => {
    const r = await fetch(`/api/ops/ads/agent?rapport=${id}`, { cache: 'no-store' })
    if (r.ok) setRapportOuvert(await r.json())
  }
  const preparerDemande = (genre: string, sujet: string) => { setPrerempli({ genre, sujet }); setPubOuverte(null); aller('agent') }
  const agir = (c: Conseil) => {
    if (c.action?.demande) preparerDemande(c.action.demande.genre, c.action.demande.sujet)
    else if (c.action?.adId) setPubOuverte(c.action.adId)
    else if (c.action?.onglet) aller(c.action.onglet as Onglet)
  }

  const brief = d?.rapports.find((r) => r.source === 'quotidien' || r.source === 'hebdo') ?? d?.rapports[0]
  const ouvertes = d?.actions.filter((a) => a.statut === 'a_faire').length ?? 0
  const idees = d?.creatifs.filter((c) => c.statut === 'idee').length ?? 0
  const creatif = d?.creatifs.find((c) => c.id === creatifOuvert)

  return (
    <BosShell active="ads-agent" title="Agent Meta Ads" crumb="Croissance">
      <div className={s.page}>
        <header className={s.header}>
          <div>
            <p className={s.eyebrow}>Croissance · Meta Ads</p>
            <h1>Agent Meta Ads</h1>
            <p>Consultant, analyste et créatif. Chaque pub est jugée à ce qu’elle rapporte en commandes <b>livrées</b> (DM compris), pas à ce que voit Meta. Il ne touche jamais à ton compte : c’est toi qui décides.</p>
          </div>
          <div className={s.headerBtns}>
            <div className={s.periode} role="group" aria-label="Période">{[7, 30, 90].map((j) => <button key={j} type="button" aria-pressed={j === jours} onClick={() => setJours(j)}>{j} j</button>)}</div>
            <button type="button" className={s.ghost} disabled={occupe} onClick={() => void envoyer({ synchro: true }, 'Meta relu pub par pub.')}><RefreshCw size={13} className={occupe ? s.tourne : undefined} /> Relire Meta</button>
            <span className={`${s.small} ${s.muted}`}>Meta : {d?.synchro.le ? `${quand(d.synchro.le)}, jusqu’au ${d.synchro.jusquAu}` : 'jamais lu au niveau pub'}</span>
          </div>
        </header>

        {erreur && <p className={`${s.notice} ${s.error}`}>{erreur}</p>}
        {message && <p className={`${s.notice} ${s.toast} ${message.ok ? s.ok : s.error}`} role="status">{message.texte}</p>}
        {!d && !erreur && <div className={s.squelette} aria-busy="true"><i /><i /><i /><i /></div>}

        {d && <>
          <Cockpit d={d} />
          <Conseils liste={d.conseils} agir={agir} />
          {brief && (
            <section className={s.brief}>
              <div><p className={s.eyebrow}>{brief.source === 'hebdo' ? 'Audit de la semaine' : brief.source === 'quotidien' ? 'Brief du matin' : 'Dernier rapport'} · {quand(brief.cree_le)}</p><Markdown texte={brief.en_bref} /></div>
              <button type="button" className={s.ghost} onClick={() => void ouvrirRapport(brief.id)}>Rapport complet</button>
            </section>
          )}
          <nav className={s.tabs} aria-label="Sections">
            {ONGLETS.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={onglet === k} onClick={() => aller(k)}>
                {l}{k === 'afaire' && ouvertes ? <span className={s.pastille}>{ouvertes}</span> : null}{k === 'creations' && idees ? <span className={s.pastille}>{idees}</span> : null}
              </button>))}
          </nav>
          {onglet === 'ensemble' && <Ensemble d={d} />}
          {onglet === 'campagnes' && <Campagnes d={d} ouvrirPub={setPubOuverte} demander={preparerDemande} />}
          {onglet === 'creations' && <Creations d={d} ouvrir={setCreatifOuvert} demander={() => preparerDemande('creatifs', '')} maj={(id, statut) => void envoyer({ creatif: { id, statut } }, 'Création mise à jour.')} />}
          {onglet === 'afaire' && <AFaire actions={d.actions} ouvrirRapport={(id) => void ouvrirRapport(id)} cocher={(id, statut) => void envoyer({ action: { id, statut } }, statut === 'fait' ? 'Décision marquée faite : l’agent en mesurera l’effet.' : statut === 'ecarte' ? 'Décision écartée.' : 'Décision rouverte.')} />}
          {onglet === 'strategie' && <StrategieOnglet st={d.strategie} d={d} occupe={occupe} enregistrer={(config) => envoyer({ strategie: config }, 'Stratégie enregistrée : l’agent la suit dès son prochain passage.')} />}
          {onglet === 'agent' && <AgentOnglet d={d} occupe={occupe} prerempli={prerempli} ouvrir={(id) => void ouvrirRapport(id)} envoyer={(genre, sujet) => envoyer({ demande: { genre, sujet } }, 'Demande envoyée : réponse au prochain passage de l’agent (chaque heure, 8 h – 23 h).')} />}
        </>}

        {d && pubOuverte && <TiroirPub adId={pubOuverte} d={d} fermer={() => setPubOuverte(null)} demander={preparerDemande} />}
        {d && creatif && <Studio c={creatif} d={d} fermer={() => setCreatifOuvert(null)} rafraichir={charger} message={(ok, texte) => setMessage({ ok, texte })} maj={(id, statut) => void envoyer({ creatif: { id, statut } }, 'Création mise à jour.')} />}
        {rapportOuvert && (
          <div className={s.drawer} role="dialog" aria-modal="true" aria-label={rapportOuvert.titre} onClick={() => setRapportOuvert(null)}>
            <div className={s.drawerBody} onClick={(e) => e.stopPropagation()}>
              <div className={s.panelHeader} style={{ padding: 0 }}>
                <div><p className={s.eyebrow}>{rapportOuvert.source} · {quand(rapportOuvert.cree_le)}{rapportOuvert.modele ? ` · ${rapportOuvert.modele}` : ''}</p><h2>{rapportOuvert.titre}</h2></div>
                <button type="button" className={s.ghost} onClick={() => setRapportOuvert(null)} aria-label="Fermer"><X size={14} /></button>
              </div>
              <Markdown texte={rapportOuvert.contenu} />
            </div>
          </div>
        )}
      </div>
    </BosShell>
  )
}
