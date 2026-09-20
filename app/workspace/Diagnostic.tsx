'use client'

import { useEffect, useState } from 'react'

/**
 * CE QUI BLOQUE, PLUTOT QU'UNE SUPPOSITION.
 *
 * L'ecran de panne affichait « Serveur temps-réel non configuré » et conseillait
 * d'ajouter deux variables — alors qu'elles etaient posees depuis deux mois. Un
 * message fixe ne pouvait pas distinguer une session expiree, un serveur endormi
 * et deux jetons devenus differents : trois pannes, un seul texte, et le seul
 * conseil donne etait faux dans deux cas sur trois.
 *
 * On interroge donc `/api/ops/workspace/diagnostic`, qui teste la chaine depuis
 * le serveur — le seul endroit d'ou le jeton, marque « Sensitive » chez Vercel,
 * est encore lisible.
 */

type Etape = { etape: string; ok: boolean; detail: string }
type Rapport = { ok: boolean; cause: string | null; conseil: string | null; etapes: Etape[] }

export default function Diagnostic({ cas }: { cas: string }) {
  const [rapport, setRapport] = useState<Rapport | null>(null)
  const [etat, setEtat] = useState<'charge' | 'pret' | 'session' | 'echec'>('charge')

  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch('/api/ops/workspace/diagnostic', { cache: 'no-store' })
        if (r.status === 401) { setEtat('session'); return }
        if (!r.ok) { setEtat('echec'); return }
        setRapport(await r.json())
        setEtat('pret')
      } catch { setEtat('echec') }
    })()
  }, [])

  const carte: React.CSSProperties = { padding: 26, borderLeft: '3px solid var(--amber)' }

  if (etat === 'session' || cas === 'auth') return (
    <div className="card-modern" style={carte}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 6 }}>Session expirée</div>
      <p className="fs13 tx-mid" style={{ margin: 0, lineHeight: 1.6 }}>
        Ta session BOS n&apos;est plus valide — rien à voir avec le serveur temps-réel.
        Déconnecte-toi et reconnecte-toi, tes pages sont intactes.
      </p>
    </div>
  )

  if (etat === 'charge') return (
    <div className="card-modern" style={{ padding: 26 }}>
      <div className="fs13 tx-mid">Diagnostic en cours… (le test de connexion prend jusqu&apos;à 25 s)</div>
    </div>
  )

  if (etat === 'echec' || !rapport) return (
    <div className="card-modern" style={carte}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 6 }}>Espace collaboratif indisponible</div>
      <p className="fs13 tx-mid" style={{ margin: 0 }}>Le diagnostic lui-même n&apos;a pas répondu. Recharge la page.</p>
    </div>
  )

  return (
    <div className="card-modern" style={carte}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 4 }}>
        {rapport.cause ? `Ce qui bloque : ${rapport.cause}` : 'Tout répond — recharge la page'}
      </div>
      {rapport.conseil ? (
        <p className="fs13" style={{ margin: '0 0 16px', lineHeight: 1.6, color: 'var(--tx-hi)' }}>{rapport.conseil}</p>
      ) : null}
      <div style={{ display: 'grid', gap: 8 }}>
        {rapport.etapes.map((e) => (
          <div key={e.etape} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span aria-hidden style={{ flex: 'none', marginTop: 1, color: e.ok ? 'var(--green, #1a7f5a)' : 'var(--red, #c0392b)' }}>
              {e.ok ? '✓' : '✗'}
            </span>
            <div>
              <div className="fs13" style={{ fontWeight: 600, color: 'var(--tx-hi)' }}>{e.etape}</div>
              <div className="fs12 tx-mid" style={{ lineHeight: 1.5 }}>{e.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
