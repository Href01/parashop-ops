'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Search, Send } from 'lucide-react'
import type { ReglesAvis } from '@/lib/avis-demandes'
import { LIBELLES_MESSAGE, depuis, type FileEnvoi as File, type LigneFile } from '@/lib/avis-suivi'

type Props = {
  file: File | null
  erreur: string | null
  regles: ReglesAvis
  selection: Set<number>
  setSelection: (s: Set<number>) => void
  recharger: () => Promise<void>
  /** Clientes dont la demande en cours n'est jamais partie : la raison, en clair. */
  echecs: Map<number, string>
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`
const premieres = (n: number) => `${n} ${n > 1 ? '1res demandes' : '1re demande'}`

/** Onglet « À envoyer » : qui recevra quoi, et l'envoi à une sélection. */
export default function FileEnvoi({ file, erreur, regles, selection, setSelection, recharger, echecs }: Props) {
  const [type, setType] = useState<'toutes' | 'nouvelle' | 'relance'>('toutes')
  const [etat, setEtat] = useState<'tous' | 'prets' | 'bloques'>('tous')
  const [bonus, setBonus] = useState<number | null>(null)
  const [recherche, setRecherche] = useState('')
  const [ouvert, setOuvert] = useState<number | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)

  if (!file) {
    return <div className="card" style={{ padding: 18, fontSize: 13, color: erreur ? 'var(--red, #B91C1C)' : 'var(--tx-faint)' }}>
      {erreur ? `File d’envoi indisponible : ${erreur}` : 'Chargement de la file d’envoi…'}
    </div>
  }

  const lignes = file.file
  const q = recherche.trim().toLowerCase()
  const visibles = lignes.filter(l =>
    (type === 'toutes' || l.type === type)
    && (etat === 'tous' || (etat === 'prets') === l.envoyable)
    && (bonus === null || l.bonusDh === bonus)
    && (!q || (l.name ?? '').toLowerCase().includes(q) || l.produits.some(p => p.name.toLowerCase().includes(q))))
  const montants = [...new Set(lignes.map(l => l.bonusDh))].sort((a, b) => b - a)

  const cochables = visibles.filter(l => l.envoyable)
  const toutCoche = cochables.length > 0 && cochables.every(l => selection.has(l.userId))
  // Dans l'ordre de la file, qui est aussi l'ordre d'envoi de la boutique.
  const choisies = lignes.filter(l => l.envoyable && selection.has(l.userId))
  const plafond = regles.lotParJour
  const partiront = choisies.slice(0, plafond)
  const nNouvelles = partiront.filter(l => l.type === 'nouvelle').length

  const cocher = (ids: number[], oui: boolean) => {
    const s = new Set(selection)
    for (const id of ids) { if (oui) s.add(id); else s.delete(id) }
    setSelection(s)
  }

  async function envoyer() {
    if (partiront.length === 0) return
    const detail = `${premieres(nNouvelles)} · ${pluriel(partiront.length - nNouvelles, 'relance')}`
    const reste = choisies.length > plafond ? `\n${choisies.length - plafond} resteront cochées (plafond de ${plafond} par envoi).` : ''
    if (!confirm(`Envoyer ${pluriel(partiront.length, 'message')} WhatsApp maintenant ?\n${detail}${reste}`)) return
    setOccupe(true); setMessage(null)
    try {
      const r = await fetch('/api/ops/avis/demandes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'envoyer', userIds: partiront.map(l => l.userId) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Échec')
      const echecs = Array.isArray(d.echecs) ? d.echecs.length : 0
      const nonParties = partiront.length - (d.envoyees ?? 0) - echecs - (d.attenteModele ?? 0)
      setMessage({
        ok: echecs === 0,
        texte: `${pluriel(d.envoyees ?? 0, 'message')} envoyé${(d.envoyees ?? 0) > 1 ? 's' : ''} (${premieres(d.nouvelles ?? 0)}, ${pluriel(d.relances ?? 0, 'relance')})`
          + (d.attenteModele ? ` · ${d.attenteModele} en attente du modèle Meta` : '')
          + (echecs ? ` · ${pluriel(echecs, 'échec')} (voir l’onglet Suivi)` : '')
          + (nonParties > 0 ? ` · ${nonParties} plus éligible${nonParties > 1 ? 's' : ''} entre-temps` : '') + '.',
      })
      cocher(partiront.map(l => l.userId), false)
      await recharger()
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : 'Échec' })
    } finally { setOccupe(false) }
  }

  const filtre = <T,>(valeur: T, actuel: T, set: (v: T) => void, libelle: string, n?: number) => (
    <button type="button" key={String(valeur)} className={`btn-modern btn-sm ${actuel === valeur ? 'btn-primary' : 'btn-subtle'}`} aria-pressed={actuel === valeur} onClick={() => set(valeur)}>
      {libelle}{n !== undefined && <span style={{ marginLeft: 5, opacity: 0.8 }}>{n}</span>}
    </button>
  )

  return (
    <div>
      <p style={{ fontSize: 12.5, color: 'var(--tx-lo)', margin: '0 0 12px', lineHeight: 1.55 }}>
        Les clientes qui recevraient une demande d’avis aujourd’hui, avec le message exact qui partirait.
        Cochez-les puis « Envoyer à la sélection », ou laissez l’envoi automatique s’en charger
        ({regles.envoiAuto ? <b style={{ color: 'var(--green)' }}>activé, chaque jour à 11 h</b> : <b>désactivé</b>}).
        {file.dernierPassage && <> Dernier envoi : {new Date(file.dernierPassage.at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}, {pluriel(file.dernierPassage.envoyees, 'message')}.</>}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div className="search-box" style={{ minWidth: 240, maxWidth: 360 }}>
          <Search />
          <input type="text" placeholder="Cliente ou produit…" value={recherche} onChange={e => setRecherche(e.target.value)} aria-label="Rechercher une cliente ou un produit" />
        </div>
        <div className="filter-strip inline-flex gap-1 p-1 bg-bg-2 rounded-lg" role="group" aria-label="Type de demande">
          {filtre('toutes', type, setType, 'Toutes', lignes.length)}
          {filtre('nouvelle', type, setType, '1res demandes', file.nouvelles)}
          {filtre('relance', type, setType, 'Relances', file.relances)}
        </div>
        <div className="filter-strip inline-flex gap-1 p-1 bg-bg-2 rounded-lg" role="group" aria-label="Message">
          {filtre('tous', etat, setEtat, 'Tous messages')}
          {filtre('prets', etat, setEtat, 'Prêts', lignes.length - file.bloquees)}
          {filtre('bloques', etat, setEtat, 'Bloqués', file.bloquees)}
        </div>
        {montants.length > 1 && <div className="filter-strip inline-flex gap-1 p-1 bg-bg-2 rounded-lg" role="group" aria-label="Bonus">
          {filtre<number | null>(null, bonus, setBonus, 'Tous bonus')}
          {montants.map(m => filtre<number | null>(m, bonus, setBonus, `${m} DH`, lignes.filter(l => l.bonusDh === m).length))}
        </div>}
      </div>

      <div className="card-modern" style={{ padding: 0 }}>
        <div className="overflow-x-auto">
          <table className="table-modern" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input type="checkbox" checked={toutCoche} disabled={cochables.length === 0} onChange={() => cocher(cochables.map(l => l.userId), !toutCoche)}
                    aria-label="Tout cocher (filtre en cours)" style={{ width: 16, height: 16 }} />
                </th>
                <th>Cliente</th>
                <th>Demande</th>
                <th>Produits à noter</th>
                <th className="r">Bonus</th>
                <th>Message</th>
                <th>Dernier message</th>
                <th aria-label="Aperçu" />
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 36, color: 'var(--tx-faint)' }}>
                  {lignes.length === 0 ? 'Personne à solliciter aujourd’hui.' : 'Aucune cliente ne correspond à ces filtres.'}
                </td></tr>
              ) : visibles.map(l => <Ligne key={l.userId} l={l} regles={regles} coche={selection.has(l.userId)}
                onCocher={oui => cocher([l.userId], oui)} echec={echecs.get(l.userId)} ouvert={ouvert === l.userId} onOuvrir={() => setOuvert(ouvert === l.userId ? null : l.userId)} />)}
            </tbody>
          </table>
        </div>

        <div className="table-foot" style={{ position: 'sticky', bottom: 0, zIndex: 3, background: 'var(--bg-1)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 12.5, color: 'var(--tx-mid)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <b style={{ color: 'var(--tx-hi)' }}>{pluriel(choisies.length, 'cliente')} cochée{choisies.length > 1 ? 's' : ''}</b>
            {choisies.length > 0 && <button type="button" className="btn-modern btn-sm btn-subtle" onClick={() => setSelection(new Set())}>Tout décocher</button>}
            {choisies.length === 0 && lignes.some(l => l.envoyable) && (
              <button type="button" className="btn-modern btn-sm btn-subtle"
                onClick={() => cocher(lignes.filter(l => l.envoyable).slice(0, plafond).map(l => l.userId), true)}>
                Cocher les {Math.min(plafond, lignes.length - file.bloquees)} premières de la file
              </button>
            )}
            {choisies.length > plafond && <span style={{ color: 'var(--amber, #B45309)', fontWeight: 600 }}>
              Plafond de {plafond} par envoi : les {plafond} premières partent, les autres restent cochées (réglable dans Réglages).
            </span>}
          </div>
          <button type="button" className="btn-modern btn-sm btn-primary" disabled={occupe || partiront.length === 0} onClick={() => void envoyer()}>
            <Send style={{ width: 14, height: 14 }} /> {occupe ? 'Envoi en cours…' : `Envoyer à la sélection (${partiront.length})`}
          </button>
        </div>
      </div>

      {message && <p role="status" style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: message.ok ? 'var(--green)' : 'var(--red, #B91C1C)' }}>{message.texte}</p>}
    </div>
  )
}

function Ligne({ l, regles, coche, onCocher, echec, ouvert, onOuvrir }: {
  l: LigneFile; regles: ReglesAvis; coche: boolean; onCocher: (oui: boolean) => void; echec?: string; ouvert: boolean; onOuvrir: () => void
}) {
  const nom = l.name?.trim() || 'Cliente sans nom'
  const premiers = l.produits.slice(0, 2).map(p => p.name).join(', ')
  return (
    <Fragment>
      <tr style={ouvert ? { background: 'var(--bg-2)' } : undefined}>
        <td>
          <input type="checkbox" checked={coche} disabled={!l.envoyable} onChange={e => onCocher(e.target.checked)}
            aria-label={`Cocher ${nom}`} title={l.envoyable ? undefined : 'Aucun modèle WhatsApp approuvé pour ce message'} style={{ width: 16, height: 16 }} />
        </td>
        <td>
          <div style={{ fontWeight: 600, color: 'var(--tx-hi)' }}>{nom}</div>
          <div style={{ fontSize: 11.5, color: 'var(--tx-faint)' }}>
            {l.phone} · <Link href={`/customers/${l.userId}`} style={{ color: 'var(--blue)' }}>Fiche</Link>
          </div>
        </td>
        <td>
          {l.type === 'nouvelle'
            ? <span className="badge-modern badge-sm badge-info" style={{ whiteSpace: 'nowrap' }}>1re demande</span>
            : <span className="badge-modern badge-sm badge-neutral" style={{ whiteSpace: 'nowrap' }}>Relance {l.messagesTour}/{regles.relancesMax}</span>}
        </td>
        <td style={{ maxWidth: 260 }}>
          <span style={{ color: 'var(--tx-hi)' }}>{premiers || '—'}</span>
          {l.produits.length > 2 && <span style={{ color: 'var(--tx-faint)' }}> +{l.produits.length - 2}</span>}
        </td>
        <td className="r" style={{ fontWeight: 700, color: 'var(--tx-hi)', whiteSpace: 'nowrap' }}>{l.bonusDh} DH</td>
        <td>
          {l.modele
            ? <span style={{ fontSize: 12.5 }}>{LIBELLES_MESSAGE[l.modele]}</span>
            : <span className="badge-modern badge-sm badge-warning">Bloquée : modèle Meta pas approuvé</span>}
        </td>
        <td style={{ color: 'var(--tx-mid)' }}>
          <span style={{ whiteSpace: 'nowrap' }}>{depuis(l.dernierMessage)}</span>
          {echec && <div style={{ fontSize: 11.5, color: 'var(--red, #B91C1C)', marginTop: 2, maxWidth: 200 }}>Dernier envoi échoué : {echec}</div>}
        </td>
        <td>
          <button type="button" className="btn-modern btn-sm btn-subtle" aria-expanded={ouvert} onClick={onOuvrir} style={{ whiteSpace: 'nowrap' }}>
            {ouvert ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />} Aperçu
          </button>
        </td>
      </tr>
      {ouvert && (
        <tr>
          <td colSpan={8} style={{ background: 'var(--bg-2)', padding: '4px 16px 18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, maxWidth: 860 }}>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--tx-lo)', marginBottom: 6 }}>Message WhatsApp</div>
                {l.texte ? <>
                  <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: '4px 12px 12px 12px', padding: '10px 12px', fontSize: 13, lineHeight: 1.5, color: 'var(--tx-hi)', whiteSpace: 'pre-wrap' }}>
                    {l.texte}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    <span className="chip">Noter mes produits</span>
                    {l.modele === 'rappel' && <span className="chip">Ne plus recevoir d’offres</span>}
                  </div>
                  {l.modele === 'historique' && <p style={{ fontSize: 11.5, color: 'var(--tx-faint)', margin: '6px 0 0' }}>Ancien modèle : son texte exact est chez Meta, voici sa teneur.</p>}
                </> : <p style={{ fontSize: 12.5, color: 'var(--amber, #B45309)', margin: 0 }}>
                  Aucun message ne partira tant que le modèle WhatsApp n’est pas approuvé chez Meta (onglet Réglages).
                </p>}
              </div>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--tx-lo)', marginBottom: 6 }}>
                  Produits à noter ({l.produits.length})
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--tx-hi)', lineHeight: 1.6 }}>
                  {l.produits.map(p => <li key={p.id}>{p.name}</li>)}
                </ul>
                <p style={{ fontSize: 12, color: 'var(--tx-lo)', margin: '8px 0 0' }}>
                  Bonus {l.bonusDh} DH {l.deja ? '(a déjà reçu un bonus d’avis)' : '(premier bonus d’avis)'} · solde actuel {Math.floor(l.points / 10)} DH
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}
