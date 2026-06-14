'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { Lock, LogOut, AlertCircle } from 'lucide-react'
import BosShell from '@/components/BosShell'

export default function SettingsPage() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const canSave = current && next.length >= 8 && next === confirm

  const submit = async () => {
    if (!canSave || saving) return
    setSaving(true); setError(null); setDone(false)
    try {
      const res = await fetch('/api/ops/account/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
      setDone(true)
      setCurrent(''); setNext(''); setConfirm('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Échec') }
    finally { setSaving(false) }
  }

  return (
    <BosShell active="settings" title="Paramètres" crumb="Aide">
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '22px 24px 60px' }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>COMPTE</div>
        <h1 className="serif-display" style={{ fontSize: 28, lineHeight: 1.05, marginBottom: 20 }}>Paramètres</h1>

        {/* Change password */}
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Lock style={{ width: 16, height: 16, color: 'var(--rose-bright)' }} />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)' }}>Changer le mot de passe</h3>
          </div>

          {done && (
            <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 13, color: 'var(--tx-hi)' }}>
              ✓ Mot de passe mis à jour.
            </div>
          )}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--rose-bg)', border: '1px solid var(--rose-line)', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
              <AlertCircle style={{ width: 15, height: 15, color: 'var(--rose-bright)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--tx-hi)' }}>{error}</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Mot de passe actuel" value={current} onChange={setCurrent} />
            <Field label="Nouveau mot de passe (8+ caractères)" value={next} onChange={setNext} />
            <Field label="Confirmer le nouveau mot de passe" value={confirm} onChange={setConfirm} />
            {next.length > 0 && next.length < 8 && <span style={{ fontSize: 11, color: 'var(--amber)' }}>Au moins 8 caractères.</span>}
            {confirm.length > 0 && next !== confirm && <span style={{ fontSize: 11, color: 'var(--red)' }}>Les mots de passe ne correspondent pas.</span>}
          </div>

          <button onClick={submit} disabled={!canSave || saving} className="btn-modern btn-primary" style={{ marginTop: 16, width: '100%', justifyContent: 'center', opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'not-allowed' }}>
            {saving ? 'Enregistrement…' : 'Mettre à jour'}
          </button>
        </div>

        {/* Sign out */}
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 14, padding: 20, marginTop: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 6 }}>Session</h3>
          <p style={{ fontSize: 13, color: 'var(--tx-lo)', marginBottom: 14 }}>Déconnecte-toi de ce navigateur.</p>
          <button onClick={() => signOut({ callbackUrl: '/auth/signin' })} className="btn-modern" style={{ color: 'var(--rose-bright)', borderColor: 'var(--rose-line)' }}>
            <LogOut style={{ width: 15, height: 15 }} />Se déconnecter
          </button>
        </div>
      </div>
    </BosShell>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-lo)' }}>{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        style={{ width: '100%', marginTop: 6, fontSize: 14, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--tx-hi)' }}
      />
    </label>
  )
}
