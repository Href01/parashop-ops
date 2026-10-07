'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, MessageCircle, RefreshCw, Save, Send, Sparkles } from 'lucide-react'

type Regles = { audience: string; lotMax: number; pauseApresMessageJours: number; code: string; modele: { nom: string; statut: string } | null }
type Apercu = {
  titre: string; regles: Regles; total: number; envoyables: number; message: string
  offre: { code: string; reduction: string; condition: string; probleme: string | null }
  bilan: { envoyees: number; lues: number; desinscrites: number; commandes_code: number; ca_livre: number }
}

const STATUTS: Record<string, { texte: string; classe: string }> = {
  APPROVED: { texte: 'Approuvé', classe: 'badge-success' },
  PENDING: { texte: 'En revue chez Meta', classe: 'badge-warning' },
  IN_APPEAL: { texte: 'En appel chez Meta', classe: 'badge-warning' },
  REJECTED: { texte: 'Refusé', classe: 'badge-danger' },
  PAUSED: { texte: 'En pause', classe: 'badge-danger' },
  DISABLED: { texte: 'Désactivé', classe: 'badge-danger' },
}
const AUDIENCES: Record<string, string> = {
  toutes: 'Toutes (clientes et comptes)',
  clientes: 'Clientes ayant reçu une commande',
  comptes: 'Comptes sans commande',
  marque: 'Clientes ayant déjà acheté la marque',
}
const entree = { minHeight: 40, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line-soft)', background: 'var(--bg-1, #fff)', color: 'var(--tx-hi)', fontSize: 14 } as const

/** Une campagne WhatsApp (annonce Olaplex et soins coréens, Milk Shake…) : réglages, message, modèle Meta, envoi. */
export default function CampagneWhatsApp({ cle, titre, audiences }: { cle: 'annonce' | 'milkshake'; titre: string; audiences: string[] }) {
  const [ouvert, setOuvert] = useState(false)
  const [apercu, setApercu] = useState<Apercu | null>(null)
  const [regles, setRegles] = useState<Regles | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)

  async function charger() {
    const r = await fetch(`/api/ops/clients/campagnes/${cle}`, { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    setApercu(d.apercu ?? null)
    if (d.apercu?.regles) setRegles(d.apercu.regles)
    else if (d.regles) setRegles({ audience: 'toutes', lotMax: 50, pauseApresMessageJours: 7, code: '', modele: null, ...d.regles })
    if (d.apercuErreur) setMessage({ ok: false, texte: `Aperçu indisponible : ${d.apercuErreur}` })
  }
  useEffect(() => { void charger() }, [])

  async function action(nom: string, corps: Record<string, unknown>, succes: (d: any) => string) {
    setOccupe(nom); setMessage(null)
    try {
      const r = await fetch(`/api/ops/clients/campagnes/${cle}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Échec')
      setMessage({ ok: true, texte: succes(d) })
      await charger()
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : 'Échec' })
    } finally { setOccupe(null) }
  }

  if (!regles) return null
  const statut = STATUTS[regles.modele?.statut ?? ''] ?? { texte: regles.modele ? regles.modele.statut : 'Pas encore créé', classe: 'badge-neutral' }
  const approuve = regles.modele?.statut === 'APPROVED'
  const probleme = apercu?.offre.probleme ?? null
  const idTitre = `campagne-${cle}`

  return (
    <section className="card" style={{ padding: 18, marginBottom: 20 }} aria-labelledby={idTitre}>
      <button type="button" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', flexWrap: 'wrap', minHeight: 44 }}>
        <span id={idTitre} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)' }}>
          <MessageCircle style={{ width: 17, height: 17 }} /> Campagne WhatsApp : {titre}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--tx-lo)' }}>
          {apercu && <span><b style={{ color: 'var(--tx-hi)' }}>{apercu.total}</b> clientes · code {regles.code}</span>}
          <span className={`badge-modern badge-sm ${statut.classe}`}>WhatsApp : {statut.texte}</span>
          {ouvert ? <ChevronUp style={{ width: 16, height: 16 }} /> : <ChevronDown style={{ width: 16, height: 16 }} />}
        </span>
      </button>

      {ouvert && <div style={{ marginTop: 12 }}>
        <p style={{ fontSize: 12.5, color: 'var(--tx-lo)', margin: '0 0 14px', lineHeight: 1.5 }}>
          Un seul envoi par cliente. Exclues : désinscrites, commande depuis moins de 14 jours, code déjà utilisé (il ne sert qu’une fois), autre message reçu il y a moins de {regles.pauseApresMessageJours} jours. Jamais automatique.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
            <span style={{ fontWeight: 600, color: 'var(--tx-hi)' }}>Qui reçoit</span>
            <select value={regles.audience} style={entree} onChange={e => setRegles({ ...regles, audience: e.target.value })}>
              {audiences.map(a => <option key={a} value={a}>{AUDIENCES[a] ?? a}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
            <span style={{ fontWeight: 600, color: 'var(--tx-hi)' }}>Code promo</span>
            <input value={regles.code} style={entree} onChange={e => setRegles({ ...regles, code: e.target.value.toUpperCase() })} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
            <span style={{ fontWeight: 600, color: 'var(--tx-hi)' }}>Messages max par envoi</span>
            <input type="number" inputMode="numeric" value={String(regles.lotMax)} style={entree} onChange={e => setRegles({ ...regles, lotMax: Number(e.target.value) })} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
            <span style={{ fontWeight: 600, color: 'var(--tx-hi)' }}>Pause après un autre message (jours)</span>
            <input type="number" inputMode="numeric" value={String(regles.pauseApresMessageJours)} style={entree} onChange={e => setRegles({ ...regles, pauseApresMessageJours: Number(e.target.value) })} />
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn-modern btn-sm btn-primary" disabled={occupe !== null}
            onClick={() => void action('regles', { action: 'regles', regles }, () => 'Réglages enregistrés.')}>
            <Save style={{ width: 14, height: 14 }} /> {occupe === 'regles' ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>

        {apercu && <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: 'var(--bg-2)', fontSize: 13, lineHeight: 1.6, color: 'var(--tx-hi)', whiteSpace: 'pre-line' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--tx-faint)', marginBottom: 6 }}>Le message</div>
          {apercu.message}
        </div>}
        {probleme && <p style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: 'var(--amber, #B45309)' }}>⚠ {probleme} L’envoi reste bloqué.</p>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <span style={{ fontSize: 13, color: 'var(--tx-hi)' }}>Modèle WhatsApp {regles.modele?.nom && <code style={{ fontSize: 11.5, color: 'var(--tx-faint)' }}>{regles.modele.nom}</code>} : <span className={`badge-modern badge-sm ${statut.classe}`}>{statut.texte}</span></span>
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

        {apercu && <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: 14, paddingTop: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--tx-mid)', margin: 0 }}>
            <b style={{ color: 'var(--tx-hi)' }}>{apercu.total}</b> clientes visées · prochain envoi : <b style={{ color: 'var(--tx-hi)' }}>{apercu.envoyables}</b>
          </p>
          <button type="button" className="btn-modern btn-sm btn-primary" style={{ marginTop: 10 }} disabled={occupe !== null || !approuve || Boolean(probleme) || apercu.envoyables <= 0}
            title={!approuve ? 'Le modèle WhatsApp doit d’abord être approuvé par Meta' : probleme ?? undefined}
            onClick={() => { if (confirm(`Envoyer « ${titre} » à ${apercu.envoyables} clientes maintenant ? (code ${regles.code})`)) void action('envoyer', { action: 'envoyer' }, d => `${d.envoyees ?? 0} messages envoyés${d.echecs?.length ? `, ${d.echecs.length} échecs` : ''}.`) }}>
            <Send style={{ width: 14, height: 14 }} /> {occupe === 'envoyer' ? 'Envoi en cours…' : `Envoyer à ${apercu.envoyables} clientes`}
          </button>
          {apercu.bilan.envoyees > 0 && <p style={{ fontSize: 12.5, color: 'var(--tx-mid)', margin: '12px 0 0' }}>
            Bilan : {apercu.bilan.envoyees} envoyés · {apercu.bilan.lues} lus · {apercu.bilan.desinscrites} désinscrites · {apercu.bilan.commandes_code} commandes avec le code · {Math.round(apercu.bilan.ca_livre).toLocaleString('fr-FR')} DH livrés
          </p>}
        </div>}

        {message && <p role="status" style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: message.ok ? 'var(--green)' : 'var(--red, #B91C1C)' }}>{message.texte}</p>}
      </div>}
    </section>
  )
}
