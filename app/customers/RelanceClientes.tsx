'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Megaphone, RefreshCw, Save, Send, Sparkles } from 'lucide-react'
import type { ReglesRelance } from '@/lib/relance-clientes'

type Apercu = {
  total: number
  envoyables: number
  exemple: { prenom: string; derniereCommande: string; nouveautes: string } | null
  offre: { existe: boolean; condition: string; probleme: string | null }
  bilan: { envoyees: number; lues: number; desinscrites: number; commandes: number; commandes_code: number; ca_livre: number }
  dernierPassage: { at: string; candidats: number; envoyees: number; echecs: number; code: string } | null
}

const STATUTS: Record<string, { texte: string; classe: string }> = {
  APPROVED: { texte: 'Approuvé', classe: 'badge-success' },
  PENDING: { texte: 'En revue chez Meta', classe: 'badge-warning' },
  IN_APPEAL: { texte: 'En appel chez Meta', classe: 'badge-warning' },
  REJECTED: { texte: 'Refusé', classe: 'badge-danger' },
  PAUSED: { texte: 'En pause', classe: 'badge-danger' },
  DISABLED: { texte: 'Désactivé', classe: 'badge-danger' },
}

const champs: { cle: 'inactifDepuisJours' | 'delaiEntreRelancesJours' | 'pauseApresMessageJours' | 'lotMax'; label: string; aide: string }[] = [
  { cle: 'inactifDepuisJours', label: 'Sans commande depuis (jours)', aide: 'Dernière commande plus ancienne que' },
  { cle: 'delaiEntreRelancesJours', label: 'Pas avant (jours) entre 2 relances', aide: 'Une même cliente' },
  { cle: 'pauseApresMessageJours', label: 'Pause après un autre message (jours)', aide: 'Demande d’avis, etc.' },
  { cle: 'lotMax', label: 'Messages max par envoi', aide: 'Commencer petit, mesurer' },
]
const champsPromo: { cle: 'code' | 'pourcent' | 'validiteJours' | 'minimumDh'; label: string; type: 'text' | 'number' }[] = [
  { cle: 'code', label: 'Code promo', type: 'text' },
  { cle: 'pourcent', label: 'Réduction (%)', type: 'number' },
  { cle: 'validiteJours', label: 'Valable (jours, code créé ici)', type: 'number' },
  { cle: 'minimumDh', label: 'Commande minimum (DH, 0 = aucun)', type: 'number' },
]

const entree = { minHeight: 40, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line-soft)', background: 'var(--bg-1, #fff)', color: 'var(--tx-hi)', fontSize: 14 } as const

export default function RelanceClientes() {
  const [ouvert, setOuvert] = useState(false)
  const [regles, setRegles] = useState<ReglesRelance | null>(null)
  const [apercu, setApercu] = useState<Apercu | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)

  async function charger() {
    const r = await fetch('/api/ops/clients/relance', { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (d.regles) setRegles(d.regles)
    setApercu(d.apercu ?? null)
    if (d.apercuErreur) setMessage({ ok: false, texte: `Aperçu indisponible : ${d.apercuErreur}` })
  }
  useEffect(() => { void charger() }, [])

  async function action(nom: string, corps: Record<string, unknown>, succes: (d: any) => string) {
    setOccupe(nom); setMessage(null)
    try {
      const r = await fetch('/api/ops/clients/relance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Échec')
      if (d.regles) setRegles(d.regles)
      setMessage({ ok: true, texte: succes(d) })
      await charger()
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : 'Échec' })
    } finally { setOccupe(null) }
  }

  if (!regles) return null
  const statut = STATUTS[regles.modele?.statut ?? ''] ?? { texte: regles.modele ? regles.modele.statut : 'Pas encore créé', classe: 'badge-neutral' }
  const approuve = regles.modele?.statut === 'APPROVED'
  const p = regles.promo
  const ex = apercu?.exemple

  return (
    <section className="card" style={{ padding: 18, marginBottom: 20 }} aria-labelledby="relance-clientes">
      <button type="button" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', flexWrap: 'wrap', minHeight: 44 }}>
        <span id="relance-clientes" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)' }}>
          <Megaphone style={{ width: 17, height: 17 }} /> Relancer les clientes qui ne commandent plus
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--tx-lo)' }}>
          {apercu && <span><b style={{ color: 'var(--tx-hi)' }}>{apercu.total}</b> clientes · sans commande depuis {regles.inactifDepuisJours} j</span>}
          <span className={`badge-modern badge-sm ${statut.classe}`}>WhatsApp : {statut.texte}</span>
          {ouvert ? <ChevronUp style={{ width: 16, height: 16 }} /> : <ChevronDown style={{ width: 16, height: 16 }} />}
        </span>
      </button>

      {ouvert && <div style={{ marginTop: 12 }}>
        <p style={{ fontSize: 12.5, color: 'var(--tx-lo)', margin: '0 0 14px', lineHeight: 1.5 }}>
          Un message WhatsApp avec les marques arrivées depuis sa dernière commande et un code promo. Jamais automatique : vous choisissez quand envoyer.
          Exclues : commande en cours, désinscrites (« Ne plus recevoir d’offres », « stop »), déjà relancées récemment, code déjà utilisé (il ne sert qu’une fois), ou un autre message reçu il y a moins de {regles.pauseApresMessageJours} jours.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          {champs.map(c => (
            <label key={c.cle} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
              <span style={{ fontWeight: 600, color: 'var(--tx-hi)' }}>{c.label}</span>
              <input type="number" inputMode="numeric" value={String(regles[c.cle])} style={entree}
                onChange={e => setRegles({ ...regles, [c.cle]: Number(e.target.value) })} />
              <small style={{ color: 'var(--tx-faint)' }}>{c.aide}</small>
            </label>
          ))}
          {champsPromo.map(c => (
            <label key={c.cle} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
              <span style={{ fontWeight: 600, color: 'var(--tx-hi)' }}>{c.label}</span>
              <input type={c.type} inputMode={c.type === 'number' ? 'numeric' : undefined} value={String(p[c.cle])} style={entree}
                onChange={e => setRegles({ ...regles, promo: { ...p, [c.cle]: c.type === 'number' ? Number(e.target.value) : e.target.value.toUpperCase() } })} />
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn-modern btn-sm btn-primary" disabled={occupe !== null}
            onClick={() => void action('regles', { action: 'regles', regles }, () => 'Réglages enregistrés.')}>
            <Save style={{ width: 14, height: 14 }} /> {occupe === 'regles' ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>

        {/* Le message tel qu'elle le recevra */}
        <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: 'var(--bg-2)', fontSize: 13, lineHeight: 1.6, color: 'var(--tx-hi)', whiteSpace: 'pre-line' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--tx-faint)', marginBottom: 6 }}>Exemple de message</div>
          {`Bonjour ${ex?.prenom ?? 'Salma'} 🌸\nDepuis votre dernière commande, de nouveaux soins sont arrivés chez Shine : ${ex?.nouveautes ?? 'Anua, COSRX et Beauty of Joseon'}.\nPour vous, -${p.pourcent} % sur votre prochaine commande avec le code ${p.code}, ${apercu?.offre.condition ?? '…'} 🎁\nLivraison partout au Maroc, paiement à la livraison.`}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <span className="badge-modern badge-info">Voir les nouveautés ↗</span>
            <span className="badge-modern badge-neutral">Ne plus recevoir d’offres</span>
          </div>
        </div>

        {/* Modèle Meta */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <span style={{ fontSize: 13, color: 'var(--tx-hi)' }}>Modèle WhatsApp <code style={{ fontSize: 11.5, color: 'var(--tx-faint)' }}>shine_relance_v1</code> : <span className={`badge-modern badge-sm ${statut.classe}`}>{statut.texte}</span></span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!regles.modele && <button type="button" className="btn-modern btn-sm btn-primary" disabled={occupe !== null}
              onClick={() => void action('creer', { action: 'creerModele' }, () => 'Modèle soumis à Meta : validation de quelques minutes à 24 h.')}>
              <Sparkles style={{ width: 14, height: 14 }} /> {occupe === 'creer' ? 'Envoi à Meta…' : 'Créer chez Meta'}
            </button>}
            <button type="button" className="btn-modern btn-sm btn-secondary" disabled={occupe !== null}
              onClick={() => void action('statut', { action: 'statutModele' }, () => 'Statut mis à jour depuis Meta.')}>
              <RefreshCw style={{ width: 14, height: 14 }} /> {occupe === 'statut' ? 'Lecture…' : 'Actualiser'}
            </button>
          </div>
        </div>

        {/* Envoi */}
        {apercu && <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: 14, paddingTop: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--tx-mid)', margin: 0 }}>
            <b style={{ color: 'var(--tx-hi)' }}>{apercu.total}</b> clientes à relancer · prochain envoi : <b style={{ color: 'var(--tx-hi)' }}>{apercu.envoyables}</b> ·
            {' '}code {p.code} {apercu.offre.existe ? 'existant, utilisé tel quel' : 'créé au premier envoi'}
          </p>
          {apercu.offre.probleme && <p style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--amber, #B45309)' }}>⚠ {apercu.offre.probleme} L’envoi reste bloqué.</p>}
          <button type="button" className="btn-modern btn-sm btn-primary" style={{ marginTop: 10 }} disabled={occupe !== null || !approuve || Boolean(apercu.offre.probleme) || apercu.envoyables <= 0}
            title={!approuve ? 'Le modèle WhatsApp doit d’abord être approuvé par Meta' : apercu.offre.probleme ?? undefined}
            onClick={() => { if (confirm(`Envoyer le message à ${apercu.envoyables} clientes maintenant ? (code ${p.code}, -${p.pourcent} %)`)) void action('envoyer', { action: 'envoyer' }, d => `${d.envoyees ?? 0} messages envoyés${d.echecs?.length ? `, ${d.echecs.length} échecs` : ''} — code ${d.code}${d.codeCree ? ' créé' : ''}.`) }}>
            <Send style={{ width: 14, height: 14 }} /> {occupe === 'envoyer' ? 'Envoi en cours…' : `Envoyer à ${apercu.envoyables} clientes`}
          </button>
          {!approuve && <p style={{ fontSize: 12, color: 'var(--tx-faint)', margin: '6px 0 0' }}>L’envoi s’ouvre quand Meta a approuvé le modèle.</p>}

          {apercu.bilan.envoyees > 0 && <p style={{ fontSize: 12.5, color: 'var(--tx-mid)', margin: '12px 0 0' }}>
            Bilan : {apercu.bilan.envoyees} relancées · {apercu.bilan.lues} lues · {apercu.bilan.desinscrites} désinscrites · {apercu.bilan.commandes} commandes depuis (dont {apercu.bilan.commandes_code} avec le code) · {Math.round(apercu.bilan.ca_livre).toLocaleString('fr-FR')} DH livrés
          </p>}
        </div>}

        {message && <p role="status" style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: message.ok ? 'var(--green)' : 'var(--red, #B91C1C)' }}>{message.texte}</p>}
      </div>}
    </section>
  )
}
