'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import BosShell from '@/components/BosShell'
import PageHead from '@/components/PageHead'
import { Handshake, Plus } from 'lucide-react'

type Partner = {
  id: number; name: string; shinePct: number; startDate: string; active: boolean
  produits: number; unites: number; valeurStock: number; net: number; balance: number
}

const dh = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH`

export default function PartenairesPage() {
  const [partners, setPartners] = useState<Partner[] | null>(null)
  const [nom, setNom] = useState('')
  const [part, setPart] = useState('50')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = () => fetch('/api/ops/partners', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => setPartners(d?.partners ?? []))
  useEffect(() => { load() }, [])

  const creer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nom.trim()) return
    setBusy(true); setErr('')
    const r = await fetch('/api/ops/partners', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nom.trim(), shinePct: Number(part) }),
    })
    setBusy(false)
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || 'Échec'); return }
    setNom(''); load()
  }

  return (
    <BosShell active="partenaires" title="Partenaires" crumb="Opérations">
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '22px 24px 60px' }}>
        <PageHead
          title="Partenaires — dépôt-vente"
          note={<>Le stock appartient au partenaire, Shine le vend. Chaque relevé part du <b>bénéfice que le tableau de bord calcule déjà</b> pour chaque commande, puis déduit la publicité et les frais du partenariat avant de partager la marge nette.</>}
        />

        {partners === null ? (
          <div className="card-modern" style={{ padding: 24, marginTop: 18 }}><div className="skeleton-line" style={{ width: '40%', height: 14 }} /></div>
        ) : (
          <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
            {partners.length === 0 && (
              <div className="card-modern" style={{ padding: 34, textAlign: 'center' }}>
                <Handshake style={{ width: 32, height: 32, color: 'var(--tx-faint)', margin: '0 auto 10px' }} />
                <p className="fs13 tx-mid" style={{ margin: 0 }}>Aucun partenaire pour l&apos;instant.</p>
              </div>
            )}
            {partners.map((p) => (
              <Link key={p.id} href={`/partenaires/${p.id}`} className="card-modern" style={{ padding: '16px 18px', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', textDecoration: 'none', borderLeft: `3px solid ${p.active ? 'var(--green)' : 'var(--line-soft)'}` }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)' }}>{p.name}</div>
                  <div className="fs12 tx-lo" style={{ marginTop: 2 }}>
                    {p.produits} produits · depuis le {new Date(Number(p.startDate.slice(0, 4)), Number(p.startDate.slice(5, 7)) - 1, Number(p.startDate.slice(8, 10))).toLocaleDateString('fr-FR')} · Shine {p.shinePct} % / partenaire {100 - p.shinePct} %
                  </div>
                </div>
                <Chiffre label="Stock (au coût)" valeur={dh(p.valeurStock)} sous={`${p.unites} unités`} />
                <Chiffre label="Marge nette" valeur={dh(p.net)} couleur={p.net < 0 ? 'var(--red, #c0392b)' : undefined} />
                <Chiffre label="À reverser" valeur={dh(p.balance)} couleur="var(--amber)" />
              </Link>
            ))}

            <form onSubmit={creer} className="card-modern" style={{ padding: '14px 18px', display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ flex: '1 1 220px' }}>
                <div className="fs12 tx-lo" style={{ marginBottom: 4 }}>Nouveau partenaire</div>
                <input className="input-modern" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" style={{ width: '100%' }} />
              </label>
              <label style={{ width: 130 }}>
                <div className="fs12 tx-lo" style={{ marginBottom: 4 }}>Part de Shine (%)</div>
                <input className="input-modern" type="number" min={0} max={100} value={part} onChange={(e) => setPart(e.target.value)} style={{ width: '100%' }} />
              </label>
              <button className="btn-modern" disabled={busy || !nom.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus style={{ width: 14, height: 14 }} /> Créer
              </button>
              {err && <div className="fs12" style={{ color: 'var(--red, #c0392b)', width: '100%' }}>{err}</div>}
            </form>
          </div>
        )}
      </div>
    </BosShell>
  )
}

function Chiffre({ label, valeur, sous, couleur }: { label: string; valeur: string; sous?: string; couleur?: string }) {
  return (
    <div style={{ minWidth: 120 }}>
      <div className="fs11 tx-lo">{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--mono)', color: couleur || 'var(--tx-hi)' }}>{valeur}</div>
      {sous && <div className="fs11 tx-faint">{sous}</div>}
    </div>
  )
}
