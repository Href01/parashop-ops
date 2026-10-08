'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, Send } from 'lucide-react'
import type { ReglesAvis } from '@/lib/avis-demandes'
import {
  ETAPES, MARCHES, dateCourte, depuis, etapeSuivi, libelleErreur, rangEtape,
  type Etape, type LigneFile, type LigneSuivi,
} from '@/lib/avis-suivi'

type Props = {
  lignes: LigneSuivi[] | null
  erreur: string | null
  regles: ReglesAvis
  file: LigneFile[]
  onPreparer: (userIds: number[]) => void
  onModeration: () => void
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

/** Onglet « Suivi » : où en est chaque cliente déjà sollicitée, et qui relancer. */
export default function SuiviAvis({ lignes, erreur, regles, file, onPreparer, onModeration }: Props) {
  const [etape, setEtape] = useState<Etape | 'toutes'>('toutes')
  const [recherche, setRecherche] = useState('')
  const [coches, setCoches] = useState<Set<number>>(new Set())

  if (!lignes) {
    return <div className="card" style={{ padding: 18, fontSize: 13, color: erreur ? 'var(--red, #B91C1C)' : 'var(--tx-faint)' }}>
      {erreur ? `Suivi indisponible : ${erreur}` : 'Chargement du suivi…'}
    </div>
  }

  const dansFile = new Map(file.map(f => [f.userId, f]))
  const avecEtape = lignes.map(l => ({ l, e: etapeSuivi(l) }))
  const total = lignes.length
  const parEtape = new Map<Etape, number>()
  for (const { e } of avecEtape) parEtape.set(e, (parEtape.get(e) ?? 0) + 1)

  const q = recherche.trim().toLowerCase()
  const visibles = avecEtape.filter(({ l, e }) => (etape === 'toutes' || e === etape) && (!q || (l.name ?? '').toLowerCase().includes(q) || (l.phone ?? '').includes(q)))
  const pretes = visibles.filter(({ l }) => dansFile.get(l.userId)?.envoyable).map(({ l }) => l.userId)
  const cochees = [...coches].filter(id => dansFile.get(id)?.envoyable)

  const cocher = (ids: number[], oui: boolean) => {
    const s = new Set(coches)
    for (const id of ids) { if (oui) s.add(id); else s.delete(id) }
    setCoches(s)
  }

  function suite(l: LigneSuivi, e: Etape) {
    const f = dansFile.get(l.userId)
    if (f) return <>
      <span className={`badge-modern badge-sm ${f.envoyable ? 'badge-info' : 'badge-warning'}`} style={{ whiteSpace: 'nowrap' }}>{f.envoyable ? 'Prête pour un envoi' : 'Bloquée (modèle Meta)'}</span>
      <div style={{ fontSize: 11.5, color: 'var(--tx-faint)', marginTop: 3 }}>
        {f.type === 'relance' ? `Relance ${f.messagesTour}/${regles.relancesMax}` : 'Nouvel envoi de la demande'}
      </div>
    </>
    if (e === 'paye') return <span style={{ color: 'var(--tx-faint)' }}>Terminé</span>
    if (e === 'a_publier') return <button type="button" className="btn-modern btn-sm btn-secondary" onClick={onModeration}>Publier ses avis</button>
    if (l.desinscrite) return <span style={{ color: 'var(--tx-lo)' }}>Désinscrite des offres</span>
    if (l.envoyes > regles.relancesMax) return <span style={{ color: 'var(--tx-lo)' }}>Relances épuisées ({pluriel(l.envoyes, 'message')})</span>
    if (l.dernierMessage) {
      const prochaine = new Date(new Date(l.dernierMessage).getTime() + regles.relanceApresJours * 86_400_000)
      if (prochaine.getTime() > Date.now()) return <span style={{ color: 'var(--tx-lo)' }}>Relance possible le {dateCourte(prochaine.toISOString())}</span>
    }
    return <span style={{ color: 'var(--tx-faint)' }}>Pas dans la file aujourd’hui</span>
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: 'var(--tx-lo)', margin: '0 0 12px', lineHeight: 1.55 }}>
        Chaque cliente déjà sollicitée, sur sa demande en cours : message reçu, lu, lien ouvert, avis laissés, bonus versé.
        Filtrez une étape, cochez les clientes prêtes puis « Préparer l’envoi » pour les relancer.
      </p>

      {/* Entonnoir */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 8, marginBottom: 16 }} aria-label="Entonnoir des demandes d’avis">
        <Marche libelle="Sollicitées" n={total} total={total} />
        {MARCHES.map(m => (
          <Marche key={m.libelle} libelle={m.libelle} total={total}
            n={avecEtape.filter(({ e }) => rangEtape(e) >= rangEtape(m.depuis)).length} />
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div className="search-box" style={{ minWidth: 220, maxWidth: 320 }}>
          <Search />
          <input type="text" placeholder="Nom ou téléphone…" value={recherche} onChange={e => setRecherche(e.target.value)} aria-label="Rechercher une cliente" />
        </div>
        <div className="filter-strip inline-flex gap-1 p-1 bg-bg-2 rounded-lg" role="group" aria-label="Étape">
          <button type="button" className={`btn-modern btn-sm ${etape === 'toutes' ? 'btn-primary' : 'btn-subtle'}`} aria-pressed={etape === 'toutes'} onClick={() => setEtape('toutes')}>
            Toutes <span style={{ marginLeft: 5, opacity: 0.8 }}>{total}</span>
          </button>
          {ETAPES.filter(x => parEtape.get(x.cle)).map(x => (
            <button key={x.cle} type="button" title={x.aide} aria-pressed={etape === x.cle}
              className={`btn-modern btn-sm ${etape === x.cle ? 'btn-primary' : 'btn-subtle'}`} onClick={() => setEtape(x.cle)}>
              {x.libelle} <span style={{ marginLeft: 5, opacity: 0.8 }}>{parEtape.get(x.cle)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card-modern" style={{ padding: 0 }}>
        <div className="overflow-x-auto">
          <table className="table-modern" style={{ minWidth: 920 }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input type="checkbox" disabled={pretes.length === 0} checked={pretes.length > 0 && pretes.every(id => coches.has(id))}
                    onChange={e => cocher(pretes, e.target.checked)} aria-label="Cocher les clientes prêtes (filtre en cours)" style={{ width: 16, height: 16 }} />
                </th>
                <th>Cliente</th>
                <th>Étape</th>
                <th>Avis</th>
                <th>Messages</th>
                <th>Demandée le</th>
                <th>Suite</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 36, color: 'var(--tx-faint)' }}>
                  {total === 0 ? 'Aucune demande d’avis envoyée pour l’instant.' : 'Aucune cliente à cette étape.'}
                </td></tr>
              ) : visibles.map(({ l, e }) => {
                const def = ETAPES[rangEtape(e)]
                const prete = Boolean(dansFile.get(l.userId)?.envoyable)
                const nom = l.name?.trim() || 'Cliente sans nom'
                return (
                  <tr key={l.userId}>
                    <td>
                      <input type="checkbox" disabled={!prete} checked={prete && coches.has(l.userId)} onChange={ev => cocher([l.userId], ev.target.checked)}
                        aria-label={`Cocher ${nom}`} title={prete ? undefined : 'Pas dans la file d’envoi aujourd’hui'} style={{ width: 16, height: 16 }} />
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--tx-hi)' }}>{nom}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--tx-faint)' }}>
                        {l.phone ?? '—'} · <Link href={`/customers/${l.userId}`} style={{ color: 'var(--blue)' }}>Fiche</Link>
                      </div>
                    </td>
                    <td>
                      <span className={`badge-modern badge-sm badge-${def.ton}`} title={def.aide} style={{ whiteSpace: 'nowrap' }}>{def.libelle}</span>
                      {e === 'echec' && <div style={{ fontSize: 11.5, color: 'var(--red, #B91C1C)', marginTop: 3 }}>{libelleErreur(l.erreur)}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <b style={{ color: 'var(--tx-hi)' }}>{l.laisses}/{l.produits}</b>
                      {l.laisses > l.publies && <div style={{ fontSize: 11.5, color: 'var(--amber, #B45309)' }}>{l.laisses - l.publies} à publier</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {pluriel(l.envoyes, 'envoyé')}{l.echecs > 0 && <span style={{ color: 'var(--red, #B91C1C)' }}> · {pluriel(l.echecs, 'échec')}</span>}
                      <div style={{ fontSize: 11.5, color: 'var(--tx-faint)' }}>Dernier : {depuis(l.dernierMessage)}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--tx-mid)' }}>{dateCourte(l.demandeLe)}</td>
                    <td>{suite(l, e)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="table-foot" style={{ position: 'sticky', bottom: 0, zIndex: 3, background: 'var(--bg-1)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 12.5, color: 'var(--tx-mid)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <b style={{ color: 'var(--tx-hi)' }}>{pluriel(cochees.length, 'cliente')} cochée{cochees.length > 1 ? 's' : ''}</b>
            <span>· {pluriel(pretes.length, 'prête')} pour un envoi dans ce filtre</span>
            {cochees.length > 0 && <button type="button" className="btn-modern btn-sm btn-subtle" onClick={() => setCoches(new Set())}>Tout décocher</button>}
          </div>
          <button type="button" className="btn-modern btn-sm btn-primary" disabled={cochees.length === 0} onClick={() => onPreparer(cochees)}>
            <Send style={{ width: 14, height: 14 }} /> Préparer l’envoi ({cochees.length})
          </button>
        </div>
      </div>
    </div>
  )
}

function Marche({ libelle, n, total }: { libelle: string; n: number; total: number }) {
  const pct = total ? Math.round((n / total) * 100) : 0
  return (
    <div className="card" style={{ padding: '10px 12px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx-lo)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{libelle}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--tx-hi)', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
        <span style={{ fontSize: 12, color: 'var(--tx-faint)' }}>{pct} %</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-inset, var(--bg-2))', marginTop: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green)' }} />
      </div>
    </div>
  )
}
