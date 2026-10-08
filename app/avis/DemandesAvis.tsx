'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Save, Sparkles } from 'lucide-react'
import type { ReglesAvis } from '@/lib/avis-demandes'

type Statut = { cle: 'demande' | 'recompense' | 'rappel'; nom: string; statut: string; motif: string | null }

const LIBELLES_MODELE: Record<Statut['cle'], string> = {
  demande: 'Demande d’avis avec montant',
  rappel: 'Relance : « vos X DH vous attendent toujours »',
  recompense: 'Bonus crédité',
}

const LIBELLES_STATUT: Record<string, { texte: string; classe: string }> = {
  APPROVED: { texte: 'Approuvé', classe: 'badge-success' },
  PENDING: { texte: 'En revue chez Meta', classe: 'badge-warning' },
  IN_APPEAL: { texte: 'En appel chez Meta', classe: 'badge-warning' },
  REJECTED: { texte: 'Refusé', classe: 'badge-danger' },
  PAUSED: { texte: 'En pause', classe: 'badge-danger' },
  DISABLED: { texte: 'Désactivé', classe: 'badge-danger' },
}

const champs: { cle: keyof ReglesAvis; label: string; aide: string; min: number; max: number }[] = [
  { cle: 'premierDh', label: 'Bonus 1re demande (DH)', aide: 'Cliente qui n’a jamais reçu de bonus d’avis', min: 0, max: 500 },
  { cle: 'suivantDh', label: 'Bonus demandes suivantes (DH)', aide: 'Cliente qui a déjà reçu un bonus', min: 0, max: 500 },
  { cle: 'delaiJours', label: 'Demander après livraison (jours)', aide: 'Laisser le temps d’essayer', min: 0, max: 60 },
  { cle: 'relanceApresJours', label: 'Relancer après (jours)', aide: 'Sans avis depuis le dernier message', min: 1, max: 90 },
  { cle: 'relancesMax', label: 'Relances max par demande', aide: '0 : jamais de relance', min: 0, max: 3 },
  { cle: 'lotParJour', label: 'Messages max par envoi', aide: 'Tâche quotidienne et envoi depuis le BOS', min: 1, max: 200 },
]

/** Les réglages des demandes d'avis et les modèles WhatsApp chez Meta (onglet Réglages). */
export default function DemandesAvis({ regles: initiales, recharger }: { regles: ReglesAvis; recharger: () => Promise<void> }) {
  const [regles, setRegles] = useState<ReglesAvis>(initiales)
  const [statuts, setStatuts] = useState<Statut[] | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)
  useEffect(() => { setRegles(initiales) }, [initiales])

  async function action(nom: string, corps: Record<string, unknown>, succes: string) {
    setOccupe(nom); setMessage(null)
    try {
      const r = await fetch('/api/ops/avis/demandes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Échec')
      if (d.statuts) setStatuts(d.statuts)
      setMessage({ ok: true, texte: succes })
      await recharger()
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : 'Échec' })
    } finally { setOccupe(null) }
  }

  const modeles: Statut[] = statuts ?? [
    { cle: 'demande', nom: regles.modeleDemande?.nom ?? 'shine_avis_bonus_v1', statut: regles.modeleDemande?.statut ?? 'ABSENT', motif: null },
    { cle: 'rappel', nom: regles.modeleRappel?.nom ?? 'shine_avis_rappel_v1', statut: regles.modeleRappel?.statut ?? 'ABSENT', motif: null },
    { cle: 'recompense', nom: regles.modeleRecompense?.nom ?? 'shine_avis_recompense_v1', statut: regles.modeleRecompense?.statut ?? 'ABSENT', motif: null },
  ]
  const manquants = modeles.some(m => m.statut === 'ABSENT')

  return (
    <section className="card" style={{ padding: 18 }} aria-labelledby="reglages-avis">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 id="reglages-avis" style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)', margin: 0 }}>Règles d’envoi</h2>
        <span className={`badge-modern badge-sm ${regles.envoiAuto ? 'badge-success' : 'badge-warning'}`}>
          {regles.envoiAuto ? 'Envoi automatique chaque jour à 11 h' : 'Envoi automatique désactivé'}
        </span>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--tx-lo)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Le bonus est versé quand tous les produits de la demande ont un avis publié. Une cliente qui n’a pas fini est relancée selon ces réglages ; de nouveaux produits livrés ouvrent une nouvelle demande.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        {champs.map(c => (
          <label key={c.cle} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--tx-mid)' }}>
            <span style={{ fontWeight: 600, color: 'var(--tx-hi)' }}>{c.label}</span>
            <input type="number" inputMode="numeric" min={c.min} max={c.max} value={String(regles[c.cle] ?? '')}
              onChange={e => setRegles({ ...regles, [c.cle]: e.target.value === '' ? '' : Number(e.target.value) } as ReglesAvis)}
              style={{ minHeight: 40, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line-soft)', background: 'var(--bg-1, #fff)', color: 'var(--tx-hi)', fontSize: 14 }} />
            <small style={{ color: 'var(--tx-faint)' }}>{c.aide}</small>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--tx-hi)', minHeight: 40, cursor: 'pointer' }}>
          <input type="checkbox" checked={regles.envoiAuto} onChange={e => setRegles({ ...regles, envoiAuto: e.target.checked })} style={{ width: 18, height: 18 }} />
          Envoi automatique chaque jour à 11 h
        </label>
        <button type="button" className="btn-modern btn-sm btn-primary" disabled={occupe !== null}
          onClick={() => void action('regles', { action: 'regles', regles }, 'Réglages enregistrés.')}>
          <Save style={{ width: 14, height: 14 }} /> {occupe === 'regles' ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: 16, paddingTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <strong style={{ fontSize: 13.5, color: 'var(--tx-hi)' }}>Modèles WhatsApp chez Meta</strong>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {manquants && <button type="button" className="btn-modern btn-sm btn-primary" disabled={occupe !== null}
              onClick={() => void action('creer', { action: 'creerModeles' }, 'Modèles soumis à Meta : la validation prend de quelques minutes à 24 h.')}>
              <Sparkles style={{ width: 14, height: 14 }} /> {occupe === 'creer' ? 'Envoi à Meta…' : 'Créer chez Meta'}
            </button>}
            <button type="button" className="btn-modern btn-sm btn-secondary" disabled={occupe !== null}
              onClick={() => void action('statut', { action: 'statutModeles' }, 'Statuts mis à jour depuis Meta.')}>
              <RefreshCw style={{ width: 14, height: 14 }} /> {occupe === 'statut' ? 'Lecture…' : 'Actualiser'}
            </button>
          </div>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {modeles.map(m => {
            const s = LIBELLES_STATUT[m.statut] ?? { texte: m.statut === 'ABSENT' ? 'Pas encore créé' : m.statut, classe: 'badge-neutral' }
            return <li key={m.cle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
              <span>{LIBELLES_MODELE[m.cle] ?? m.cle} <code style={{ fontSize: 11.5, color: 'var(--tx-faint)' }}>{m.nom}</code></span>
              <span className={`badge-modern badge-sm ${s.classe}`}>{s.texte}{m.motif ? ` · ${m.motif}` : ''}</span>
            </li>
          })}
        </ul>
        <p style={{ fontSize: 12, color: 'var(--tx-faint)', margin: '8px 0 0' }}>
          Tant que le modèle de demande n’est pas approuvé, seules les demandes à 50 DH partent (ancien modèle) ; les autres attendent.
          Tant que la relance n’est pas approuvée, les relances partent avec le message de demande.
        </p>
      </div>

      {message && <p role="status" style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: message.ok ? 'var(--green)' : 'var(--red, #B91C1C)' }}>{message.texte}</p>}
    </section>
  )
}
