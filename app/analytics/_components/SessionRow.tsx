'use client'

/**
 * UNE LIGNE DE SESSION — lisible en une seconde.
 *
 *   ▌ Abir Fadili  [Commandée · 297 MAD]  ● ● ● ●        17:20 · 27 min
 *   ▌ Ordinateur · Instagram · campagne 1202… · ↳ /marques/milk-shake   102 actions
 *
 *  · la barre de gauche et la pastille donnent l'ISSUE (livrée, commandée, annulée,
 *    panier abandonné, parcours, rebond, automatisé) ;
 *  · les quatre points donnent jusqu'ou la visiteuse est allee (fiche, panier,
 *    paiement, commande) ;
 *  · la source garde son emplacement (Instagram, Facebook, Audience Network…) :
 *    on ne fusionne jamais les emplacements Meta ;
 *  · les regles (issue, etapes, libelles) sont dans lib/analytics/session-view.ts, testees.
 */

import type { ReactNode } from 'react'
import { V } from './Viz'
import { ETAPES, ISSUES, dureeCourte, etapesAtteintes, issueSession, libelleSource, type Famille } from '@/lib/analytics/session-view'

export type SessionLigne = {
  sessionId: string; device: string; ville: string; source: string
  debut: string; derniere: string
  actions: number; fiches: number; paniers: number; recherches: number; checkouts: number; frictions: number
  duree: number; enLigne: boolean
  automatise: boolean; pays: string | null; medium: string | null; campagne: string | null; campagneNom?: string | null; arrivee: string | null
  commande: { id: number; nom: string | null; telephone: string | null; statut: string; montant: number } | null
}

const heure = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Casablanca' }).format(new Date(iso))

const POINT_FAMILLE: Record<Famille, string> = { google: '#2a78d6', meta: '#7c3aed', organique: '#0a7a0a', direct: '#898781', autre: '#898781' }
const APPAREIL: Record<string, string> = { mobile: 'Mobile', desktop: 'Ordinateur', tablet: 'Tablette' }

function Etapes({ s, couleur }: { s: SessionLigne; couleur: string }) {
  const e = etapesAtteintes(s)
  return (
    <span className="inline-flex items-center" role="img"
      aria-label={ETAPES.filter((x) => e[x.cle]).map((x) => x.label).join(', ') || 'Aucune étape du tunnel'}
      title={ETAPES.map((x) => `${e[x.cle] ? '●' : '○'} ${x.label}`).join('\n')}>
      {ETAPES.map((x, i) => (
        <span key={x.cle} className="inline-flex items-center">
          {i > 0 && <span style={{ width: 8, height: 2, background: e[x.cle] ? couleur : V.grid }} />}
          <span style={{ width: 9, height: 9, borderRadius: 9, background: e[x.cle] ? couleur : 'transparent', border: `2px solid ${e[x.cle] ? couleur : V.axis}` }} />
        </span>
      ))}
    </span>
  )
}

export function SessionRow({ s, ouvert, onToggle, children }: { s: SessionLigne; ouvert: boolean; onToggle: () => void; children?: ReactNode }) {
  const issue = issueSession({ ...s, commande: s.commande })
  const st = ISSUES[issue]
  const src = libelleSource(s.source, s.medium)
  const titre = s.commande?.nom || (s.automatise ? `Robot · ${s.ville}` : s.ville)
  const etranger = s.pays && s.pays !== 'MA' && !s.automatise ? ` · ${s.pays}` : ''
  const montant = s.commande ? ` · ${Math.round(s.commande.montant).toLocaleString('fr-FR')} MAD` : ''

  return (
    <div className="rounded-xl overflow-hidden bg-white" style={{ border: `1px solid ${ouvert ? V.axis : V.grid}`, opacity: s.automatise && !ouvert ? 0.7 : 1 }}>
      <button onClick={onToggle} aria-expanded={ouvert} className="w-full text-left flex gap-3 px-3 py-2.5">
        <span aria-hidden="true" className="self-stretch rounded-full shrink-0" style={{ width: 4, background: st.couleur }} />
        <span className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-start gap-x-4 gap-y-1.5">
          {/* Qui, ce qu'elle a fait, d'ou elle venait */}
          <span className="flex-1 min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {s.enLigne && <span className="pulse w-1.5 h-1.5 rounded-full shrink-0" style={{ background: V.good }} title="Active à l'instant" />}
              <span className="text-[13px] font-semibold" style={{ color: V.ink }}>{titre}<span className="font-normal" style={{ color: V.muted }}>{etranger}</span></span>
              <span className="text-[11px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap" style={{ background: st.fond, color: st.couleur }}>{st.label}{montant}</span>
              {s.frictions > 0 && (
                <span className="text-[11px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap" style={{ background: '#fdf3dc', color: '#854D0E' }}
                  title="Erreurs ou signaux à vérifier, pas un nombre de pannes confirmées">▲ {s.frictions} signal{s.frictions > 1 ? 'x' : ''}</span>
              )}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]" style={{ color: V.muted }}>
              <span>{APPAREIL[s.device.toLowerCase()] ?? s.device}</span>
              <span className="inline-flex items-center gap-1 font-semibold" style={{ color: V.ink2 }} title={`utm_source=${src.code}${s.medium ? ` · utm_medium=${s.medium}` : ''}`}>
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 7, background: POINT_FAMILLE[src.famille], display: 'inline-block' }} />
                {src.label}{src.code !== src.label.toLowerCase() && src.famille === 'meta' ? <span className="font-normal" style={{ color: V.muted }}> ({src.code})</span> : null}
              </span>
              {(s.campagneNom || s.campagne) && <span title={`Campagne : ${s.campagneNom ?? s.campagne}${s.campagneNom ? ` (${s.campagne})` : ''}`}>{s.campagneNom ? '' : 'campagne '}{(s.campagneNom ?? s.campagne ?? '').length > 26 ? `${(s.campagneNom ?? s.campagne ?? '').slice(0, 26)}…` : (s.campagneNom ?? s.campagne)}</span>}
              {s.arrivee && s.arrivee !== '/' && <span className="font-mono" title={`Page d'arrivée : ${s.arrivee}`}>↳ {s.arrivee.length > 34 ? `…${s.arrivee.slice(-34)}` : s.arrivee}</span>}
            </span>
          </span>
          {/* Jusqu'ou, quand, combien de temps */}
          <span className="shrink-0 flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-x-3 gap-y-1">
            <Etapes s={s} couleur={st.couleur} />
            <span className="text-[11px] tabular-nums text-right" style={{ color: V.muted }}>
              <span style={{ color: V.ink2 }} className="font-semibold">{heure(s.derniere)}</span> · {dureeCourte(s.duree)} · {s.actions} action{s.actions > 1 ? 's' : ''}
            </span>
          </span>
        </span>
        <span aria-hidden="true" className="text-[10px] self-center" style={{ color: V.muted }}>{ouvert ? '▾' : '▸'}</span>
      </button>
      {ouvert && <div className="px-3 pb-3 pt-1" style={{ borderTop: `1px solid ${V.grid}`, background: '#fcfcfa' }}>{children}</div>}
    </div>
  )
}

/** En-tete de jour : « Aujourd'hui · 38 sessions · 1 commande ». */
export function EnteteJour({ libelle, sessions }: { libelle: string; sessions: SessionLigne[] }) {
  const cmd = sessions.filter((x) => x.commande).length
  return (
    <div className="flex items-baseline gap-2 pt-3 pb-1 px-1">
      <h3 className="text-[12px] font-bold capitalize" style={{ color: V.ink }}>{libelle}</h3>
      <span className="text-[11px]" style={{ color: V.muted }}>
        {sessions.length} session{sessions.length > 1 ? 's' : ''}{cmd > 0 ? ` · ${cmd} commande${cmd > 1 ? 's' : ''}` : ''}
      </span>
      <span className="flex-1 self-center" style={{ height: 1, background: V.grid }} />
    </div>
  )
}
