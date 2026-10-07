'use client'

import { useEffect, useState } from 'react'
import { MessageCircle, RefreshCw, Send, Save, Sparkles } from 'lucide-react'
import type { ReglesAvis } from '@/lib/avis-demandes'

type Passage = { at: string; candidats: number; envoyees: number; nouvelles: number; relances: number; attenteModele: number; echecs: number }
type Apercu = { total: number; nouvelles: number; relances: number; premierBonus: number; bonusSuivant: number; bloquees: number; dernierPassage: Passage | null }
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
  { cle: 'lotParJour', label: 'Messages max par jour', aide: 'Plafond de la tâche quotidienne', min: 1, max: 200 },
]

export default function DemandesAvis() {
  const [regles, setRegles] = useState<ReglesAvis | null>(null)
  const [apercu, setApercu] = useState<Apercu | null>(null)
  const [statuts, setStatuts] = useState<Statut[] | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)

  async function charger() {
    const r = await fetch('/api/ops/avis/demandes', { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (d.regles) setRegles(d.regles)
    setApercu(d.apercu ?? null)
    if (d.apercuErreur) setMessage({ ok: false, texte: `Aperçu indisponible : ${d.apercuErreur}` })
  }
  useEffect(() => { void charger() }, [])

  async function action(nom: string, corps: Record<string, unknown>, succes: (d: any) => string) {
    setOccupe(nom); setMessage(null)
    try {
      const r = await fetch('/api/ops/avis/demandes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Échec')
      if (d.statuts) setStatuts(d.statuts)
      if (d.regles) setRegles(d.regles)
      setMessage({ ok: true, texte: succes(d) })
      await charger()
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : 'Échec' })
    } finally { setOccupe(null) }
  }

  if (!regles) return <div className="card" style={{ padding: 18, marginBottom: 22, fontSize: 13, color: 'var(--tx-faint)' }}>Chargement des demandes d’avis…</div>

  const envoyables = apercu ? Math.min(apercu.total - apercu.bloquees, regles.lotParJour) : 0
  const modeles: Statut[] = statuts ?? [
    { cle: 'demande', nom: regles.modeleDemande?.nom ?? 'shine_avis_bonus_v1', statut: regles.modeleDemande?.statut ?? 'ABSENT', motif: null },
    { cle: 'rappel', nom: regles.modeleRappel?.nom ?? 'shine_avis_rappel_v1', statut: regles.modeleRappel?.statut ?? 'ABSENT', motif: null },
    { cle: 'recompense', nom: regles.modeleRecompense?.nom ?? 'shine_avis_recompense_v1', statut: regles.modeleRecompense?.statut ?? 'ABSENT', motif: null },
  ]
  const manquants = modeles.some(m => m.statut === 'ABSENT')

  return (
    <section className="card" style={{ padding: 18, marginBottom: 22 }} aria-labelledby="demandes-avis">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 id="demandes-avis" style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx-hi)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageCircle style={{ width: 17, height: 17 }} /> Demandes d’avis WhatsApp
        </h2>
        <span className={`badge-modern badge-sm ${regles.envoiAuto ? 'badge-success' : 'badge-warning'}`}>
          {regles.envoiAuto ? 'Envoi automatique chaque jour à 11 h' : 'Envoi automatique désactivé'}
        </span>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--tx-lo)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Le bonus est versé quand tous les produits de la demande ont un avis publié. Une cliente qui n’a pas fini est relancée selon vos réglages ; de nouveaux produits livrés ouvrent une nouvelle demande.
      </p>

      {/* Réglages */}
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
          onClick={() => void action('regles', { action: 'regles', regles }, () => 'Réglages enregistrés.')}>
          <Save style={{ width: 14, height: 14 }} /> {occupe === 'regles' ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {/* Modèles Meta */}
      <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: 16, paddingTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <strong style={{ fontSize: 13.5, color: 'var(--tx-hi)' }}>Modèles WhatsApp chez Meta</strong>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {manquants && <button type="button" className="btn-modern btn-sm btn-primary" disabled={occupe !== null}
              onClick={() => void action('creer', { action: 'creerModeles' }, () => 'Modèles soumis à Meta : la validation prend de quelques minutes à 24 h.')}>
              <Sparkles style={{ width: 14, height: 14 }} /> {occupe === 'creer' ? 'Envoi à Meta…' : 'Créer chez Meta'}
            </button>}
            <button type="button" className="btn-modern btn-sm btn-secondary" disabled={occupe !== null}
              onClick={() => void action('statut', { action: 'statutModeles' }, () => 'Statuts mis à jour depuis Meta.')}>
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

      {/* Prochain envoi */}
      <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: 16, paddingTop: 14 }}>
        <strong style={{ fontSize: 13.5, color: 'var(--tx-hi)' }}>Prochain envoi</strong>
        {apercu ? <>
          <p style={{ fontSize: 13, color: 'var(--tx-mid)', margin: '6px 0 0', lineHeight: 1.6 }}>
            <b style={{ color: 'var(--tx-hi)' }}>{apercu.total}</b> clientes : {apercu.nouvelles} nouvelles demandes · {apercu.relances} relances ·
            {' '}{apercu.premierBonus} à {regles.premierDh} DH · {apercu.bonusSuivant} à {regles.suivantDh} DH
            {apercu.bloquees > 0 && <> · <span style={{ color: 'var(--amber, #B45309)', fontWeight: 600 }}>{apercu.bloquees} en attente du modèle Meta</span></>}
          </p>
          {apercu.dernierPassage && <p style={{ fontSize: 12, color: 'var(--tx-faint)', margin: '4px 0 0' }}>
            Dernier passage : {new Date(apercu.dernierPassage.at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {apercu.dernierPassage.envoyees} envoyés ({apercu.dernierPassage.nouvelles} nouvelles, {apercu.dernierPassage.relances} relances){apercu.dernierPassage.echecs ? ` · ${apercu.dernierPassage.echecs} échecs` : ''}
          </p>}
          <button type="button" className="btn-modern btn-sm btn-primary" style={{ marginTop: 10 }} disabled={occupe !== null || envoyables <= 0}
            onClick={() => { if (confirm(`Envoyer jusqu’à ${envoyables} messages WhatsApp maintenant ?`)) void action('envoyer', { action: 'envoyer' }, d => `${d.envoyees ?? 0} messages envoyés (${d.nouvelles ?? 0} nouvelles, ${d.relances ?? 0} relances)${d.attenteModele ? `, ${d.attenteModele} en attente du modèle` : ''}${d.echecs?.length ? `, ${d.echecs.length} échecs` : ''}.`) }}>
            <Send style={{ width: 14, height: 14 }} /> {occupe === 'envoyer' ? 'Envoi en cours…' : `Envoyer maintenant (${envoyables})`}
          </button>
        </> : <p style={{ fontSize: 12.5, color: 'var(--tx-faint)', margin: '6px 0 0' }}>Aperçu indisponible.</p>}
      </div>

      {message && <p role="status" style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: message.ok ? 'var(--green)' : 'var(--red, #B91C1C)' }}>{message.texte}</p>}
    </section>
  )
}
