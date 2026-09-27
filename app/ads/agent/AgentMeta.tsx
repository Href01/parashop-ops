'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, RefreshCw, Send, X } from 'lucide-react'
import BosShell from '@/components/BosShell'
import Markdown from '@/app/analytics/seo/concurrence/Markdown'
import { OBJECTIFS, StrategieSchema, type Strategie } from '@/lib/ads/strategie-model'
import s from './agent.module.css'

/**
 * AGENT META ADS — consultant, analyste, createur.
 *
 * L'agent (Claude, routines cloud) lit ce que la pub coute contre ce qui est
 * LIVRE, pub par pub, et propose quoi couper, quoi pousser, quoi tester et
 * quelles creations faire. Il ne touche jamais au compte Meta : Achraf decide.
 * Cet ecran montre la verite, la strategie a servir, et la file des demandes.
 */

type Verite = {
  jours: number; depense: number; sourceDepense: string; pixel: { achats: number | null; valeur: number }
  livrees: number; annulees: number; ca: number; marge: number; parCanal: { canal: string; commandes: number; ca: number; marge: number }[]
  suiviesMeta: { commandes: number; ca: number }; profitApresPub: number; coutParCommandeLivree: number | null
  merLivre: number | null; seuilParCommande: number | null; panierMoyen: number | null
}
type Indic = { depense: number; impressions: number; clicsLien: number; messages: number; achats: number; valeurAchats: number; ctr: number | null; cpm: number | null; coutParResultat: number | null; roasPixel: number | null }
type Pub = { adId: string; nom: string | null; statut: string | null; campagne: string | null; objectif: string | null; format: string | null; texte: string; vignette: string | null; permalien: string | null; frequence7j: number | null; boost: boolean; fatigue: boolean; j30: Indic; j7: Indic }
type Produit = { id: number; nom: string; marque: string; prix: number; margeUnitaire: number | null; margeShine: number | null; partenaire: boolean; tauxMarge: number | null; stockVendable: number; importBloque: boolean; vendus90j: number; ca90j: number }
type Action = { id: number; priorite: number; type: string; action: string; cible: string | null; signal: string | null; effet: string | null; effort: string | null; statut: string; rapport_id: number; rapport_titre: string; rapport_le: string }
type Creatif = { id: number; rapport_id: number | null; produit_ids: number[]; angle: string; format: string; public: string | null; accroche: string; script: string | null; texte_fr: string | null; texte_darija: string | null; texte_ar: string | null; titre: string | null; cta: string | null; visuel: string | null; statut: string; ad_id: string | null; cree_le: string }
type Demande = { id: number; genre: string; sujet: string; statut: string; demande_le: string; termine_le: string | null; erreur: string | null; rapport_id: number | null }
type Rapport = { id: number; source: string; titre: string; cree_le: string; modele: string | null; en_bref: string }
type Donnees = {
  strategie: { config: Strategie; modifie_le: string | null; modifie_par: string | null; manques: string[]; historique: { id: number; modifie_le: string; modifie_par: string | null }[] }
  verite: Verite; pubs: Pub[]; produits: Produit[]; demandes: Demande[]; rapports: Rapport[]; actions: Action[]; creatifs: Creatif[]
  synchro: { le: string | null; jusquAu: string | null }
}
type Onglet = 'verite' | 'pubs' | 'actions' | 'creatifs' | 'strategie' | 'demander'

const dh = (v: number | null | undefined) => (v == null ? '—' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)} DH`)
const nb = (v: number | null | undefined, d = 1) => (v == null ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: d }))
const quand = (d: string | null) => (d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
const TYPES: Record<string, [string, string]> = {
  couper: ['Couper', s.chipRouge], reduire: ['Réduire', s.chipOrange], augmenter: ['Augmenter', s.chipVert], tester: ['Tester', s.chipBleu],
  lancer: ['Lancer', s.chipVert], corriger_suivi: ['Corriger le suivi', s.chipOrange], offre: ['Offre', s.chipBleu], autre: ['Autre', ''],
}
const GENRES: Record<string, string> = { analyse: 'Analyser', creatifs: 'Créations à produire', audit: 'Audit complet du compte', question: 'Question' }
/** Le statut Meta en francais : « CAMPAIGN_PAUSED » ne dit rien a personne. */
const statutPub = (x: string) => x === 'ACTIVE' ? 'Active' : /PAUSED/.test(x) ? (x.startsWith('CAMPAIGN') ? 'Campagne en pause' : x.startsWith('ADSET') ? 'Ensemble en pause' : 'En pause') : x === 'ARCHIVED' ? 'Archivée' : x === 'DELETED' ? 'Supprimée' : /REVIEW|PENDING/.test(x) ? 'En validation' : /DISAPPROVED|REJECTED/.test(x) ? 'Refusée' : x.toLowerCase()
const STATUTS_CREATIF: Record<string, string> = { idee: 'Idée', validee: 'Validée', produite: 'Produite', en_ligne: 'En ligne', ecartee: 'Écartée' }

export default function AgentMeta() {
  const [d, setD] = useState<Donnees | null>(null)
  const [jours, setJours] = useState(30)
  const [onglet, setOnglet] = useState<Onglet>('verite')
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [ouvert, setOuvert] = useState<(Rapport & { contenu: string }) | null>(null)

  const charger = useCallback(async () => {
    try {
      const r = await fetch(`/api/ops/ads/agent?jours=${jours}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Lecture impossible')
      setD(j); setErreur(null)
    } catch (e) { setErreur(e instanceof Error ? e.message : 'Lecture impossible') }
  }, [jours])
  useEffect(() => { void charger() }, [charger])
  const enFile = d?.demandes.some((x) => x.statut === 'en_attente' || x.statut === 'en_cours')
  useEffect(() => {
    if (!enFile) return
    const t = setInterval(() => void charger(), 30_000)
    return () => clearInterval(t)
  }, [enFile, charger])

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
  const ouvrir = async (id: number) => {
    const r = await fetch(`/api/ops/ads/agent?rapport=${id}`, { cache: 'no-store' })
    if (r.ok) setOuvert(await r.json())
  }

  const brief = d?.rapports.find((r) => r.source === 'quotidien') ?? d?.rapports[0]
  const ouvertes = d?.actions.filter((a) => a.statut === 'a_faire') ?? []

  return (
    <BosShell active="ads-agent" title="Agent Meta Ads" crumb="Croissance">
      <div className={s.page}>
        <header className={s.header}>
          <div>
            <p className={s.eyebrow}>Croissance · Meta Ads</p>
            <h1>Agent Meta Ads</h1>
            <p>Consultant, analyste et créatif : il juge chaque pub à ce qu’elle rapporte en commandes <b>livrées</b> et en marge, propose quoi couper, pousser et tester, et écrit les créations. Il ne touche jamais au compte Meta : c’est toi qui décides.</p>
          </div>
          <div className={s.headerBtns}>
            <span className={`${s.small} ${s.muted}`}>Données Meta : {d?.synchro.le ? `${quand(d.synchro.le)} (jusqu’au ${d.synchro.jusquAu})` : 'jamais synchronisées au niveau pub'}</span>
            <button type="button" className={s.ghost} disabled={occupe} onClick={() => void envoyer({ synchro: true }, 'Meta relu pub par pub.')}><RefreshCw size={13} /> Relire Meta</button>
          </div>
        </header>

        {erreur && <p className={`${s.notice} ${s.error}`}>{erreur}</p>}
        {message && <p className={`${s.notice} ${message.ok ? s.ok : s.error}`}>{message.texte}</p>}
        {d && d.strategie.manques.length > 0 && <p className={`${s.notice} ${s.warn}`}>La stratégie ne fixe pas encore : {d.strategie.manques.join(', ')}. L’agent fera des propositions, mais il travaille mieux avec tes cibles (onglet Stratégie).</p>}

        {brief && (
          <section className={s.panel} aria-labelledby="brief">
            <div className={s.panelHeader}>
              <div><h2 id="brief">{brief.source === 'quotidien' ? 'Brief du jour' : 'Dernier rapport'} · {brief.titre}</h2><p>{quand(brief.cree_le)}{brief.modele ? ` · ${brief.modele}` : ''}</p></div>
              <button type="button" className={s.ghost} onClick={() => void ouvrir(brief.id)}>Lire le rapport</button>
            </div>
            <div className={s.body}><Markdown texte={brief.en_bref} /></div>
          </section>
        )}

        <nav className={s.tabs} aria-label="Sections">
          {([['verite', 'Vérité'], ['pubs', `Pubs${d ? ` (${d.pubs.length})` : ''}`], ['actions', `À faire${ouvertes.length ? ` (${ouvertes.length})` : ''}`], ['creatifs', 'Créations'], ['strategie', 'Stratégie'], ['demander', 'Demander']] as [Onglet, string][]).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={onglet === k} onClick={() => setOnglet(k)}>{l}</button>
          ))}
        </nav>

        {!d && !erreur && <p className={s.notice}>Chargement…</p>}
        {d && onglet === 'verite' && <VeritePanel v={d.verite} jours={jours} setJours={setJours} produits={d.produits} />}
        {d && onglet === 'pubs' && <PubsPanel pubs={d.pubs} />}
        {d && onglet === 'actions' && <ActionsPanel actions={d.actions} ouvrir={ouvrir} cocher={(id, statut) => void envoyer({ action: { id, statut } }, statut === 'fait' ? 'Action marquée faite.' : statut === 'ecarte' ? 'Action écartée.' : 'Action rouverte.')} />}
        {d && onglet === 'creatifs' && <CreatifsPanel creatifs={d.creatifs} produits={d.produits} maj={(id, statut) => void envoyer({ creatif: { id, statut } }, `Création : ${STATUTS_CREATIF[statut]}.`)} demander={() => setOnglet('demander')} />}
        {d && onglet === 'strategie' && <StrategiePanel st={d.strategie} produits={d.produits} verite={d.verite} occupe={occupe} enregistrer={(config) => envoyer({ strategie: config }, 'Stratégie enregistrée : l’agent la suit dès son prochain passage.')} />}
        {d && onglet === 'demander' && <DemanderPanel demandes={d.demandes} rapports={d.rapports} occupe={occupe} ouvrir={ouvrir} envoyer={(genre, sujet) => envoyer({ demande: { genre, sujet } }, 'Demande envoyée : l’agent passe chaque heure de 8 h à 23 h, le rapport arrivera ici.')} />}

        {ouvert && (
          <div className={s.drawer} role="dialog" aria-modal="true" aria-label={ouvert.titre} onClick={() => setOuvert(null)}>
            <div className={s.drawerBody} onClick={(e) => e.stopPropagation()}>
              <div className={s.panelHeader} style={{ padding: 0 }}>
                <div><p className={s.eyebrow}>{ouvert.source} · {quand(ouvert.cree_le)}</p><h2>{ouvert.titre}</h2></div>
                <button type="button" className={s.ghost} onClick={() => setOuvert(null)} aria-label="Fermer"><X size={14} /></button>
              </div>
              <Markdown texte={ouvert.contenu} />
            </div>
          </div>
        )}
      </div>
    </BosShell>
  )
}

function VeritePanel({ v, jours, setJours, produits }: { v: Verite; jours: number; setJours: (j: number) => void; produits: Produit[] }) {
  const maxCa = Math.max(v.ca, v.pixel.valeur, 1)
  const top = [...produits].filter((p) => p.margeShine != null && p.stockVendable > 0 && !p.importBloque).sort((a, b) => (b.margeShine! * Math.max(1, b.vendus90j)) - (a.margeShine! * Math.max(1, a.vendus90j))).slice(0, 8)
  return (
    <section className={s.panel} aria-labelledby="verite">
      <div className={s.panelHeader}>
        <div><h2 id="verite">La vérité sur {jours} jours</h2><p>Ce que la pub a coûté contre ce qui a été <b>livré</b>, tous canaux confondus (site, DM Instagram, WhatsApp). La marge est celle du BOS : coût produit et livraison déduits.</p></div>
        <div className={s.headerBtns}>{[7, 30, 90].map((j) => <button key={j} type="button" className={j === jours ? s.primary : s.ghost} onClick={() => setJours(j)}>{j} j</button>)}</div>
      </div>
      <div className={s.body}>
        <div className={s.kpis}>
          <div className={s.kpi}><span>Dépense pub Meta</span><b>{dh(v.depense)}</b></div>
          <div className={s.kpi}><span>Commandes livrées</span><b>{v.livrees}</b><span>{v.annulees} annulée(s) ou retournée(s)</span></div>
          <div className={s.kpi}><span>CA livré</span><b>{dh(v.ca)}</b><span>panier moyen {dh(v.panierMoyen)}</span></div>
          <div className={`${s.kpi} ${v.profitApresPub >= 0 ? s.kpiBon : s.kpiMauvais}`}><span>Profit après pub</span><b>{dh(v.profitApresPub)}</b><span>marge {dh(v.marge)} − pub</span></div>
          <div className={s.kpi}><span>Coût pub par commande livrée</span><b>{dh(v.coutParCommandeLivree)}</b></div>
          <div className={s.kpi}><span>Seuil de rentabilité</span><b>{dh(v.seuilParCommande)}</b><span>marge moyenne d’une commande : au-delà, la pub perd de l’argent</span></div>
          <div className={s.kpi}><span>CA livré / dépense</span><b>{v.merLivre == null ? '—' : `× ${nb(v.merLivre)}`}</b></div>
          <div className={s.kpi}><span>Ce que Meta croit (pixel)</span><b>{dh(v.pixel.valeur)}</b><span>{v.depense ? `ROAS Meta × ${nb(v.pixel.valeur / v.depense)}` : ''}</span></div>
        </div>
        <div className={s.compare}>
          <div className={s.aide}><b>Ventes vues par Meta</b> · {dh(v.pixel.valeur)}<div className={`${s.barre} ${s.meta}`}><i style={{ width: `${(v.pixel.valeur / maxCa) * 100}%` }} /></div></div>
          <div className={s.aide}><b>Ventes réellement livrées</b> · {dh(v.ca)}<div className={s.barre}><i style={{ width: `${(v.ca / maxCa) * 100}%` }} /></div></div>
        </div>
        <h3 style={{ margin: '18px 0 6px', fontSize: 13 }}>D’où viennent les commandes livrées</h3>
        <div className={s.scroll}><table className={`${s.table} ${s.cartes}`}><thead><tr><th>Canal</th><th className={s.num}>Commandes</th><th className={s.num}>CA</th><th className={s.num}>Marge</th></tr></thead>
          <tbody>{v.parCanal.map((c) => <tr key={c.canal}><td className={s.pleine}><b>{c.canal}</b></td><td className={s.num} data-l="Commandes">{c.commandes}</td><td className={s.num} data-l="CA">{dh(c.ca)}</td><td className={s.num} data-l="Marge">{dh(c.marge)}</td></tr>)}</tbody></table></div>
        <p className={`${s.small} ${s.muted}`}>Les commandes Instagram et WhatsApp n’ont pas de lien de suivi : Meta ne les voit pas, même quand une pub les a déclenchées. Ajoute des UTM à chaque pub et note la campagne sur les commandes DM pour que l’agent les rattache.</p>
        <h3 style={{ margin: '18px 0 6px', fontSize: 13 }}>Produits qui peuvent porter une pub</h3>
        <p className={`${s.small} ${s.muted}`} style={{ marginTop: 0 }}>Marge unitaire × ventes, en stock. Une pub sur un produit à faible marge ou en rupture brûle de l’argent.</p>
        <div className={s.scroll}><table className={`${s.table} ${s.cartes}`}><thead><tr><th>Produit</th><th className={s.num}>Prix</th><th className={s.num}>Marge Shine / vente</th><th className={s.num}>Vendus 90 j</th><th className={s.num}>Stock</th></tr></thead>
          <tbody>{top.map((p) => <tr key={p.id}><td className={s.pleine}><b>{p.marque}</b> · {p.nom}</td><td className={s.num} data-l="Prix">{dh(p.prix)}</td><td className={s.num} data-l="Marge">{dh(p.margeShine)}{p.partenaire ? ' (dépôt-vente, ½)' : p.tauxMarge != null ? ` (${p.tauxMarge} %)` : ''}</td><td className={s.num} data-l="Vendus">{p.vendus90j}</td><td className={s.num} data-l="Stock">{p.stockVendable}</td></tr>)}</tbody></table></div>
      </div>
    </section>
  )
}

function PubsPanel({ pubs }: { pubs: Pub[] }) {
  if (!pubs.length) return <p className={`${s.notice} ${s.warn}`}>Aucune donnée au niveau des pubs pour l’instant. Clique « Relire Meta » : la synchro lit les 30 derniers jours, pub par pub.</p>
  return (
    <section className={s.panel} aria-labelledby="pubs">
      <div className={s.panelHeader}><div><h2 id="pubs">Chaque pub, 7 jours contre 30</h2><p>Résultat = achat vu par le pixel OU conversation démarrée (DM). « Boost » = optimisé pour les likes, pas pour vendre. « Fatigue » = vue trop souvent et clics en baisse.</p></div></div>
      <div className={s.body}>
        <div className={s.scroll}><table className={`${s.table} ${s.cartes}`}>
          <thead><tr><th>Pub</th><th className={s.num}>Dépense 30 j</th><th className={s.num}>Dépense 7 j</th><th className={s.num}>CTR 7 j</th><th className={s.num}>CPM</th><th className={s.num}>Fréq. 7 j</th><th className={s.num}>DM 30 j</th><th className={s.num}>Achats 30 j</th><th className={s.num}>Coût / résultat</th></tr></thead>
          <tbody>{pubs.map((p) => (
            <tr key={p.adId}>
              <td className={s.pleine}><div className={s.pubCell}>{p.vignette ? <img className={s.vignette} src={p.vignette} alt="" loading="lazy" /> : <span className={s.vignette} />}<div>
                <div className={s.pubNom}>{p.nom || p.adId}</div>
                <div className={s.meta} style={{ marginTop: 2 }}>{p.statut && <span className={`${s.chip} ${p.statut === 'ACTIVE' ? s.chipVert : /DISAPPROVED|REJECTED/.test(p.statut) ? s.chipRouge : ''}`}>{statutPub(p.statut)}</span>}{p.boost && <span className={`${s.chip} ${s.chipOrange}`}>Boost</span>}{p.fatigue && <span className={`${s.chip} ${s.chipRouge}`}>Fatigue</span>}{p.format && <span className={s.chip}>{p.format.toLowerCase()}</span>}</div>
                {p.texte && <div className={s.pubTexte}>{p.texte}</div>}
              </div></div></td>
              <td className={s.num} data-l="30 j">{dh(p.j30.depense)}</td><td className={s.num} data-l="7 j">{dh(p.j7.depense)}</td>
              <td className={s.num} data-l="CTR">{p.j7.ctr == null ? '—' : `${nb(p.j7.ctr, 2)} %`}</td><td className={s.num} data-l="CPM">{dh(p.j30.cpm)}</td>
              <td className={s.num} data-l="Fréq.">{nb(p.frequence7j)}</td><td className={s.num} data-l="DM">{p.j30.messages}</td><td className={s.num} data-l="Achats">{p.j30.achats}</td>
              <td className={s.num} data-l="Coût/résultat">{dh(p.j30.coutParResultat)}</td>
            </tr>))}</tbody>
        </table></div>
      </div>
    </section>
  )
}

function ActionsPanel({ actions, ouvrir, cocher }: { actions: Action[]; ouvrir: (id: number) => void; cocher: (id: number, statut: 'fait' | 'ecarte' | 'a_faire') => void }) {
  if (!actions.length) return <p className={s.notice}>Aucune action pour l’instant : elles arrivent avec le premier brief de l’agent.</p>
  return (
    <section className={s.panel} aria-labelledby="afaire">
      <div className={s.panelHeader}><div><h2 id="afaire">À faire</h2><p>Les décisions recommandées, les plus rentables d’abord. Tu les appliques dans le gestionnaire de publicités Meta, puis tu coches « Fait » : l’agent en mesure l’effet.</p></div></div>
      <div className={s.body}><ul className={s.liste}>{actions.map((a) => {
        const [label, classe] = TYPES[a.type] ?? [a.type, '']
        return (
          <li key={a.id} className={`${s.carte} ${a.statut !== 'a_faire' ? s.faite : ''}`}>
            <div className={s.carteTop}><span className={`${s.chip} ${classe}`}>{label}</span><span className={s.chip}>P{a.priorite}</span><span className={s.carteTexte}>{a.action}</span></div>
            <div className={s.meta}>{a.cible && <span><b>Cible</b> {a.cible}</span>}{a.effort && <span><b>Effort</b> {a.effort}</span>}<span><b>Rapport</b> {a.rapport_titre}</span></div>
            {(a.signal || a.effet) && <details className={s.small} style={{ marginTop: 6 }}><summary>Pourquoi · effet attendu</summary>{a.signal && <p><b>Preuve</b> {a.signal}</p>}{a.effet && <p><b>Effet</b> {a.effet}</p>}</details>}
            <div className={s.btns}>
              {a.statut === 'a_faire'
                ? <><button type="button" className={s.primary} onClick={() => cocher(a.id, 'fait')}><Check size={13} /> Fait</button><button type="button" className={s.ghost} onClick={() => cocher(a.id, 'ecarte')}>Écarter</button></>
                : <button type="button" className={s.ghost} onClick={() => cocher(a.id, 'a_faire')}>Rouvrir</button>}
              <button type="button" className={s.ghost} onClick={() => ouvrir(a.rapport_id)}>Voir le rapport</button>
            </div>
          </li>)
      })}</ul></div>
    </section>
  )
}

function CreatifsPanel({ creatifs, produits, maj, demander }: { creatifs: Creatif[]; produits: Produit[]; maj: (id: number, statut: string) => void; demander: () => void }) {
  const nom = useMemo(() => new Map(produits.map((p) => [p.id, `${p.marque} ${p.nom}`])), [produits])
  const copier = (t: string) => { void navigator.clipboard?.writeText(t) }
  if (!creatifs.length) return <div className={s.notice}>Aucune création pour l’instant. <button type="button" className={s.ghost} onClick={demander}>Demander des créations à l’agent</button></div>
  return (
    <section className={s.panel} aria-labelledby="creas">
      <div className={s.panelHeader}><div><h2 id="creas">Créations proposées</h2><p>Accroche, script, textes FR / darija / arabe et brief visuel, prêts à tourner ou à monter. Valide, produis, puis note-la « en ligne » : l’agent mesurera ce qu’elle rapporte.</p></div></div>
      <div className={s.body}><div className={s.creatifs}>{creatifs.map((c) => (
        <article key={c.id} className={`${s.carte} ${c.statut === 'ecartee' ? s.faite : ''}`}>
          <div className={s.carteTop}><span className={s.chip}>{c.format}</span><span className={`${s.chip} ${c.statut === 'en_ligne' ? s.chipVert : c.statut === 'validee' || c.statut === 'produite' ? s.chipBleu : ''}`}>{STATUTS_CREATIF[c.statut]}</span><span className={`${s.small} ${s.muted}`}>{c.angle}</span></div>
          <p className={s.accroche}>« {c.accroche} »</p>
          {c.produit_ids.length > 0 && <p className={`${s.small} ${s.muted}`}>{c.produit_ids.map((id) => nom.get(id) || `#${id}`).join(' · ')}</p>}
          {c.public && <p className={s.small}><b>Pour</b> {c.public}</p>}
          {c.script && <div className={s.bloc}><h4>Script / maquette</h4>{c.script}</div>}
          {c.texte_fr && <div className={s.bloc}><h4>Texte FR <button type="button" className={s.ghost} style={{ minHeight: 24, padding: '0 8px' }} onClick={() => copier(c.texte_fr!)}>Copier</button></h4>{c.texte_fr}</div>}
          {c.texte_darija && <div className={s.bloc}><h4>Darija <button type="button" className={s.ghost} style={{ minHeight: 24, padding: '0 8px' }} onClick={() => copier(c.texte_darija!)}>Copier</button></h4>{c.texte_darija}</div>}
          {c.texte_ar && <div className={`${s.bloc} ${s.rtl}`} lang="ar"><h4>العربية <button type="button" className={s.ghost} style={{ minHeight: 24, padding: '0 8px' }} onClick={() => copier(c.texte_ar!)}>Copier</button></h4>{c.texte_ar}</div>}
          {(c.titre || c.cta) && <p className={s.small} style={{ marginTop: 8 }}>{c.titre && <><b>Titre</b> {c.titre} </>}{c.cta && <><b>Bouton</b> {c.cta}</>}</p>}
          {c.visuel && <div className={s.bloc}><h4>Brief visuel</h4>{c.visuel}</div>}
          <div className={s.btns}>{(['validee', 'produite', 'en_ligne', 'ecartee'] as const).filter((x) => x !== c.statut).map((x) => <button key={x} type="button" className={x === 'ecartee' ? s.ghost : s.primary} onClick={() => maj(c.id, x)}>{STATUTS_CREATIF[x]}</button>)}</div>
        </article>))}</div></div>
    </section>
  )
}

function StrategiePanel({ st, produits, verite, occupe, enregistrer }: { st: Donnees['strategie']; produits: Produit[]; verite: Verite; occupe: boolean; enregistrer: (c: Strategie) => Promise<unknown> }) {
  const [c, setC] = useState<Strategie>(st.config)
  useEffect(() => setC(st.config), [st.config])
  const [erreur, setErreur] = useState<string | null>(null)
  const set = <K extends keyof Strategie>(k: K, v: Strategie[K]) => setC((x) => ({ ...x, [k]: v }))
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
  const liste = (ids: number[]) => ids.join(', ')
  const ids = (v: string) => [...new Set(v.split(/[^0-9]+/).map(Number).filter((x) => Number.isInteger(x) && x > 0))]
  const soumettre = async () => {
    const p = StrategieSchema.safeParse(c)
    if (!p.success) { setErreur(p.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`).join(' · ')); return }
    setErreur(null)
    await enregistrer(p.data)
  }
  return (
    <section className={s.panel} aria-labelledby="strat">
      <div className={s.panelHeader}>
        <div><h2 id="strat">Stratégie publicitaire</h2><p>Ce que l’agent doit servir. Chaque enregistrement crée une version : il lit toujours la dernière.{st.modifie_le ? ` Dernière version : ${quand(st.modifie_le)}.` : ' Aucune version enregistrée : valeurs par défaut.'}</p></div>
        <button type="button" className={s.primary} disabled={occupe} onClick={() => void soumettre()}>Enregistrer</button>
      </div>
      <div className={s.body}>
        {erreur && <p className={`${s.notice} ${s.error}`}>{erreur}</p>}
        <p className={s.aide}>Repères sur {verite.jours} jours : une commande livrée laisse en moyenne <b>{dh(verite.seuilParCommande)}</b> de marge (seuil de rentabilité), la pub coûte aujourd’hui <b>{dh(verite.coutParCommandeLivree)}</b> par commande livrée, pour un CA livré de <b>× {nb(verite.merLivre)}</b> la dépense.</p>
        <div className={s.form} style={{ marginTop: 14 }}>
          <label className={`${s.champ} ${s.large}`}>Objectif
            <select value={c.objectif} onChange={(e) => set('objectif', e.target.value as Strategie['objectif'])}>{Object.entries(OBJECTIFS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className={s.champ}>Budget mensuel (DH)<input inputMode="decimal" value={c.budgetMensuel ?? ''} onChange={(e) => set('budgetMensuel', num(e.target.value))} placeholder="ex. 3000" /></label>
          <label className={s.champ}>Budget par jour maximum (DH)<input inputMode="decimal" value={c.budgetJourMax ?? ''} onChange={(e) => set('budgetJourMax', num(e.target.value))} placeholder="ex. 120" /></label>
          <label className={s.champ}>Coût pub max par commande livrée (DH)<small>Sous le seuil de rentabilité ({dh(verite.seuilParCommande)}) pour rester gagnant.</small><input inputMode="decimal" value={c.cibles.coutParCommandeMax ?? ''} onChange={(e) => set('cibles', { ...c.cibles, coutParCommandeMax: num(e.target.value) })} /></label>
          <label className={s.champ}>CA livré minimum par dirham de pub (×)<small>ex. 4 = 4 DH de ventes livrées pour 1 DH de pub.</small><input inputMode="decimal" value={c.cibles.roasMin ?? ''} onChange={(e) => set('cibles', { ...c.cibles, roasMin: num(e.target.value) })} /></label>
          <label className={s.champ}>Marge après pub minimum (% du CA)<input inputMode="decimal" value={c.cibles.margeApresPubMin ?? ''} onChange={(e) => set('cibles', { ...c.cibles, margeApresPubMin: num(e.target.value) })} /></label>
          <label className={s.champ}>Marques à pousser<small>Séparées par des virgules.</small><input value={c.marquesPrioritaires.join(', ')} onChange={(e) => set('marquesPrioritaires', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="ex. Milk Shake, Olaplex" /></label>
          <label className={s.champ}>Produits à pousser (numéros)<small>{c.produitsPrioritaires.map((id) => produits.find((p) => p.id === id)?.nom || `#${id}`).join(' · ') || 'Numéros des fiches, ex. 34, 2'}</small><input value={liste(c.produitsPrioritaires)} onChange={(e) => set('produitsPrioritaires', ids(e.target.value))} /></label>
          <label className={s.champ}>Produits à ne jamais pousser (numéros)<small>{c.produitsExclus.map((id) => produits.find((p) => p.id === id)?.nom || `#${id}`).join(' · ') || 'ex. produits en rupture ou à faible marge'}</small><input value={liste(c.produitsExclus)} onChange={(e) => set('produitsExclus', ids(e.target.value))} /></label>
          <label className={s.champ}>Zones<input value={c.zones} onChange={(e) => set('zones', e.target.value)} /></label>
          <label className={`${s.champ} ${s.large}`}>Public visé<textarea rows={2} value={c.public} onChange={(e) => set('public', e.target.value)} /></label>
          <div className={s.champ}>Langues des créations<div className={s.cases}>{(['fr', 'darija', 'ar'] as const).map((l) => <label key={l}><input type="checkbox" checked={c.langues.includes(l)} onChange={(e) => set('langues', e.target.checked ? [...c.langues, l] : c.langues.filter((x) => x !== l))} />{l === 'fr' ? 'Français' : l === 'darija' ? 'Darija' : 'Arabe'}</label>)}</div></div>
          <div className={s.champ}>Où les clientes commandent<div className={s.cases}>{([['site', 'Site'], ['dmInstagram', 'DM Instagram'], ['whatsapp', 'WhatsApp']] as const).map(([k, l]) => <label key={k}><input type="checkbox" checked={c.canaux[k]} onChange={(e) => set('canaux', { ...c.canaux, [k]: e.target.checked })} />{l}</label>)}</div></div>
          <label className={`${s.champ} ${s.large}`}>Ton de la marque<textarea rows={2} value={c.ton} onChange={(e) => set('ton', e.target.value)} /></label>
          <label className={`${s.champ} ${s.large}`}>Offres autorisées dans les pubs<small>ex. code BIENVENUE10, livraison offerte dès 650 DH à Casablanca, packs.</small><textarea rows={2} value={c.offres} onChange={(e) => set('offres', e.target.value)} /></label>
          <label className={s.champ}>Fréquence maximale (7 j)<small>Au-delà, la pub fatigue : on change la création.</small><input inputMode="decimal" value={c.regles.frequenceMax} onChange={(e) => set('regles', { ...c.regles, frequenceMax: Number(e.target.value) || 3 })} /></label>
          <label className={s.champ}>Dépense minimale avant de juger une pub (DH)<input inputMode="decimal" value={c.regles.depenseMinAvantVerdict} onChange={(e) => set('regles', { ...c.regles, depenseMinAvantVerdict: Number(e.target.value) || 0 })} /></label>
          <label className={s.champ}>Durée d’un test de création (jours)<input inputMode="numeric" value={c.regles.joursTestCreatif} onChange={(e) => set('regles', { ...c.regles, joursTestCreatif: Math.round(Number(e.target.value)) || 4 })} /></label>
          <div className={s.champ}>Posts boostés (optimisés pour les likes)<div className={s.cases}><label><input type="checkbox" checked={c.regles.boostsAutorises} onChange={(e) => set('regles', { ...c.regles, boostsAutorises: e.target.checked })} />Autorisés</label></div></div>
          <div className={`${s.champ} ${s.large}`}>Calendrier (temps forts)
            {c.calendrier.map((ev, i) => (
              <div key={i} className={s.cases} style={{ alignItems: 'center' }}>
                <input value={ev.nom} onChange={(e) => set('calendrier', c.calendrier.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} placeholder="Nom" style={{ flex: 1, minWidth: 120 }} />
                <input type="date" value={ev.debut} onChange={(e) => set('calendrier', c.calendrier.map((x, j) => (j === i ? { ...x, debut: e.target.value } : x)))} />
                <input type="date" value={ev.fin} onChange={(e) => set('calendrier', c.calendrier.map((x, j) => (j === i ? { ...x, fin: e.target.value } : x)))} />
                <button type="button" className={s.ghost} onClick={() => set('calendrier', c.calendrier.filter((_, j) => j !== i))}>Retirer</button>
              </div>))}
            <div><button type="button" className={s.ghost} onClick={() => set('calendrier', [...c.calendrier, { nom: '', debut: new Date().toISOString().slice(0, 10), fin: new Date().toISOString().slice(0, 10), note: '' }])}>Ajouter un temps fort</button></div>
          </div>
          <label className={`${s.champ} ${s.large}`}>Notes pour l’agent<small>Tout ce qu’il doit savoir : fournisseur bloqué, nouveauté à lancer, ce qui a déjà marché ou raté.</small><textarea rows={4} value={c.notes} onChange={(e) => set('notes', e.target.value)} /></label>
        </div>
        {st.historique.length > 0 && <p className={`${s.small} ${s.muted}`} style={{ marginTop: 12 }}>Versions : {st.historique.map((h) => `#${h.id} ${quand(h.modifie_le)}`).join(' · ')}</p>}
      </div>
    </section>
  )
}

function DemanderPanel({ demandes, rapports, occupe, ouvrir, envoyer }: { demandes: Demande[]; rapports: Rapport[]; occupe: boolean; ouvrir: (id: number) => void; envoyer: (genre: string, sujet: string) => Promise<unknown> }) {
  const [genre, setGenre] = useState('analyse')
  const [sujet, setSujet] = useState('')
  const exemples: Record<string, string> = {
    analyse: 'ex. Pourquoi la campagne Olaplex coûte plus cher par commande depuis une semaine ?',
    creatifs: 'ex. 3 vidéos Reels pour le Leave In Milk Shake, public cheveux frisés, en darija',
    audit: 'ex. Audit complet : structure du compte, suivi, budget, ce qu’il faut arrêter',
    question: 'ex. Combien puis-je dépenser par jour sur la K-beauty en restant rentable ?',
  }
  return (
    <section className={s.panel} aria-labelledby="demander">
      <div className={s.panelHeader}><div><h2 id="demander">Demander à l’agent</h2><p>Il passe chaque heure de 8 h à 23 h et publie ici un rapport : analyse, décisions, créations.</p></div></div>
      <div className={s.body}>
        <form className={s.demande} onSubmit={(e) => { e.preventDefault(); void envoyer(genre, sujet).then((ok) => { if (ok) setSujet('') }) }}>
          <select value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Type de demande">{Object.entries(GENRES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <textarea value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder={exemples[genre]} aria-label="Ta demande" />
          <button type="submit" className={s.primary} disabled={occupe || sujet.trim().length < 3}><Send size={13} /> Envoyer</button>
        </form>
        {demandes.length > 0 && <ul className={s.file}>{demandes.map((x) => (
          <li key={x.id}>
            <span><b>{GENRES[x.genre] || x.genre}</b> · {x.sujet.slice(0, 120)} <span className={`${s.muted} ${s.small}`}>· {quand(x.demande_le)}</span></span>
            <span>{x.statut === 'termine' && x.rapport_id ? <button type="button" className={s.ghost} onClick={() => ouvrir(x.rapport_id!)}>Lire</button> : <span className={`${s.chip} ${x.statut === 'erreur' ? s.chipRouge : x.statut === 'en_cours' ? s.chipBleu : ''}`}>{x.statut === 'en_attente' ? 'En attente' : x.statut === 'en_cours' ? 'En cours' : x.statut === 'erreur' ? `Erreur : ${x.erreur || ''}` : 'Terminé'}</span>}</span>
          </li>))}</ul>}
        {rapports.length > 0 && <>
          <h3 style={{ margin: '18px 0 6px', fontSize: 13 }}>Rapports</h3>
          <ul className={s.file}>{rapports.map((r) => <li key={r.id}><span><b>{r.titre}</b> <span className={`${s.muted} ${s.small}`}>· {r.source} · {quand(r.cree_le)}</span></span><button type="button" className={s.ghost} onClick={() => ouvrir(r.id)}>Lire</button></li>)}</ul>
        </>}
      </div>
    </section>
  )
}
