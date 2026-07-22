'use client'

import { useState, useEffect, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import { Lock, LogOut, AlertCircle, Users, KeyRound } from 'lucide-react'
import BosShell from '@/components/BosShell'

type Account = {
  id: number
  email: string
  name: string
  role: string
  banned: boolean
  isFounder: boolean
  isSelf: boolean
}

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
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '22px 24px 60px' }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>COMPTE</div>
        <h1 className="serif-display" style={{ fontSize: 28, lineHeight: 1.05, marginBottom: 20 }}>Paramètres</h1>

        {/* Change password (self, verifies current) */}
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Lock style={{ width: 16, height: 16, color: 'var(--rose-bright)' }} />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)' }}>Changer mon mot de passe</h3>
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

        {/* Team accounts — admin reset, no current password required */}
        <TeamAccounts />

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

function TeamAccounts() {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ops/accounts')
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
      setAccounts(d.accounts || [])
    } catch (e) { setLoadErr(e instanceof Error ? e.message : 'Échec du chargement') }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 14, padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Users style={{ width: 16, height: 16, color: 'var(--rose-bright)' }} />
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)' }}>Comptes de l’équipe</h3>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--tx-lo)', marginBottom: 16 }}>
        Réinitialise le mot de passe d’un compte sans avoir besoin de l’ancien.
      </p>

      {loadErr && <span style={{ fontSize: 12, color: 'var(--red)' }}>{loadErr}</span>}
      {!accounts && !loadErr && <span style={{ fontSize: 12, color: 'var(--tx-lo)' }}>Chargement…</span>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {accounts?.map((a) => (
          <AccountRow
            key={a.id}
            account={a}
            open={openId === a.id}
            onToggle={() => setOpenId((v) => (v === a.id ? null : a.id))}
          />
        ))}
      </div>
    </div>
  )
}

function AccountRow({ account, open, onToggle }: { account: Account; open: boolean; onToggle: () => void }) {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const canSave = pw.length >= 8 && pw === confirm

  const reset = async () => {
    if (!canSave || saving) return
    setSaving(true); setError(null); setDone(false)
    try {
      const res = await fetch(`/api/ops/accounts/${account.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: pw }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
      setDone(true); setPw(''); setConfirm('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Échec') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', background: 'var(--bg-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-hi)' }}>{account.name}</span>
            {account.isSelf && <Tag text="Vous" />}
            {account.isFounder && <Tag text="Fondateur" tone="rose" />}
          </div>
          <div style={{ fontSize: 12, color: 'var(--tx-lo)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.email}</div>
        </div>
        <button
          onClick={onToggle}
          className="btn-modern"
          style={{ fontSize: 12.5, padding: '7px 12px', color: open ? 'var(--tx-lo)' : 'var(--rose-bright)', borderColor: open ? 'var(--line)' : 'var(--rose-line)', flexShrink: 0 }}
        >
          <KeyRound style={{ width: 14, height: 14 }} />
          {open ? 'Annuler' : 'Mot de passe'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {done && (
            <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 8, padding: '9px 11px', fontSize: 12.5, color: 'var(--tx-hi)' }}>
              ✓ Mot de passe réinitialisé pour {account.email}.
            </div>
          )}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--rose-bg)', border: '1px solid var(--rose-line)', borderRadius: 8, padding: '9px 11px' }}>
              <AlertCircle style={{ width: 14, height: 14, color: 'var(--rose-bright)', flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: 'var(--tx-hi)' }}>{error}</span>
            </div>
          )}
          <Field label="Nouveau mot de passe (8+ caractères)" value={pw} onChange={setPw} />
          <Field label="Confirmer" value={confirm} onChange={setConfirm} />
          {pw.length > 0 && pw.length < 8 && <span style={{ fontSize: 11, color: 'var(--amber)' }}>Au moins 8 caractères.</span>}
          {confirm.length > 0 && pw !== confirm && <span style={{ fontSize: 11, color: 'var(--red)' }}>Les mots de passe ne correspondent pas.</span>}
          <button onClick={reset} disabled={!canSave || saving} className="btn-modern btn-primary" style={{ justifyContent: 'center', opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'not-allowed' }}>
            {saving ? 'Enregistrement…' : 'Réinitialiser le mot de passe'}
          </button>
        </div>
      )}
    </div>
  )
}

function Tag({ text, tone }: { text: string; tone?: 'rose' }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
      padding: '2px 7px', borderRadius: 999,
      color: tone === 'rose' ? 'var(--rose-bright)' : 'var(--tx-lo)',
      background: tone === 'rose' ? 'var(--rose-bg)' : 'var(--bg-1)',
      border: `1px solid ${tone === 'rose' ? 'var(--rose-line)' : 'var(--line)'}`,
    }}>{text}</span>
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
