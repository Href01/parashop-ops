'use client'

/**
 * RENTABILITE PAR EMPLACEMENT META — lequel rapporte, lequel coute.
 *
 * profit = marge des commandes LIVREES (apres emballage) − depense Meta.
 * La definition complete et ses limites sont dans lib/analytics/placements.ts ;
 * l'ecran ne fait que les montrer, avec leurs avertissements :
 *  · peu de commandes → lecture indicative, pas une tendance ;
 *  · depense Meta inconnue → « — », jamais 0 ;
 *  · la ventilation par POSITION est declaree par Meta, pas verifiee par les commandes.
 */

import { useEffect, useState } from 'react'
import { V } from './Viz'
import { T } from './Decision'

type Ligne = {
  source: string; libelle: string; payant: boolean
  sessions: number; paniers: number; commandes: number; livrees: number; annulees: number; enCours: number
  caLivre: number; marge: number; depense: number | null; profit: number | null
  roas: number | null; coutParLivree: number | null; tauxCommande: number | null
}
type Position = { publisher: string; source: string; position: string; depense: number; impressions: number; clics: number; achats: number; valeur: number }
type Reponse = {
  lignes: Ligne[]
  total: { depense: number | null; marge: number; profit: number | null; livrees: number; commandes: number; sessions: number }
  positions: Position[]
  metaDisponible: boolean
  metaErreur: string | null
  emballageParColis: number
}

const mad = (n: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n))} MAD`
const signe = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.abs(Math.round(n)))} MAD`
const pct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(1).replace('.', ',')} %`)

const POSITIONS: Record<string, string> = {
  feed: 'Fil', instagram_stories: 'Stories Instagram', facebook_stories: 'Stories Facebook', instagram_reels: 'Reels Instagram',
  facebook_reels: 'Reels Facebook', instagram_explore: 'Explorer', instagram_explore_home: 'Explorer (accueil)', instagram_profile_feed: 'Fil du profil',
  instagram_search: 'Recherche Instagram', facebook_reels_overlay: 'Reels (bandeau)', marketplace: 'Marketplace', an_classic: 'Audience Network',
  rewarded_video: 'Vidéo avec récompense', video_feeds: 'Fil vidéo', right_hand_column: 'Colonne de droite', search: 'Recherche', story: 'Stories',
}

export function Emplacements({ debut, fin, auto }: { debut: string; fin: string; auto: boolean }) {
  const [d, setD] = useState<Reponse | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let vivant = true
    setD(null); setErreur(null)
    fetch(`/api/ops/analytics/placements?${new URLSearchParams({ debut, fin, auto: auto ? '1' : '0' })}`)
      .then((r) => r.json())
      .then((j) => { if (!vivant) return; if (j.error) setErreur(j.error); else setD(j) })
      .catch((e) => { if (vivant) setErreur(String(e)) })
    return () => { vivant = false }
  }, [debut, fin, auto])

  const payants = d?.lignes.filter((l) => l.payant) ?? []
  const autres = d?.lignes.filter((l) => !l.payant && (l.commandes > 0 || l.sessions >= 20)).slice(0, 6) ?? []

  return (
    <section className="mb-5 rounded-lg p-3" style={{ border: `1px solid ${V.grid}` }}>
      <h2 className={T.label} style={{ color: V.ink }}>Rentabilité par emplacement Meta</h2>
      <p className={T.note} style={{ color: V.muted }}>
        Profit = marge des commandes <b>livrées</b> (après emballage) − dépense Meta. Les emplacements restent séparés : Instagram, Facebook, Audience Network et Threads ne sont pas fusionnés.
      </p>

      {erreur && <p className={T.note} style={{ color: V.critical }}>Impossible de charger : {erreur}</p>}
      {!d && !erreur && <p className={T.note} style={{ color: V.muted }}>Chargement…</p>}

      {d && (
        <>
          {d.metaErreur && (
            <p className={`${T.note} mt-1`} style={{ color: V.warning }}>
              Dépense Meta indisponible ({d.metaErreur}). Les colonnes de marge restent exactes ; profit et ROAS sont masqués plutôt que faux.
            </p>
          )}
          {d.total.livrees < 20 && (
            <p className={`${T.note} mt-1`} style={{ color: V.warning }}>
              {d.total.livrees} commande{d.total.livrees > 1 ? 's' : ''} livrée{d.total.livrees > 1 ? 's' : ''} sur la période : lecture indicative, pas une tendance. Élargis la période pour comparer.
            </p>
          )}

          <div className="overflow-x-auto mt-2">
            <table className="w-full text-[12px] tabular-nums" style={{ minWidth: 760 }}>
              <thead>
                <tr style={{ color: V.muted }}>
                  {['Emplacement', 'Sessions', 'Paniers', 'Commandes', 'Marge livrée', 'Dépense Meta', 'Profit', 'Coût / livrée', 'ROAS réel'].map((h, i) => (
                    <th key={h} className="font-semibold py-1 pe-2" style={{ textAlign: i === 0 ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payants.map((l) => (
                  <tr key={l.source} style={{ borderTop: `1px solid ${V.grid}` }}>
                    <td className="py-1.5 pe-2 font-semibold" style={{ color: V.ink }}>{l.libelle} <span className="font-normal" style={{ color: V.muted }}>({l.source})</span></td>
                    <td className="text-right pe-2">{l.sessions.toLocaleString('fr-FR')}</td>
                    <td className="text-right pe-2">{l.paniers}</td>
                    <td className="text-right pe-2" title={`${l.commandes} passées : ${l.livrees} livrées, ${l.annulees} annulées, ${l.enCours} en cours · ${pct(l.tauxCommande)} des sessions`}>
                      {l.commandes} <span style={{ color: V.muted }}>({l.livrees}✓{l.annulees ? ` ${l.annulees}✕` : ''}{l.enCours ? ` ${l.enCours}…` : ''})</span>
                    </td>
                    <td className="text-right pe-2">{mad(l.marge)}</td>
                    <td className="text-right pe-2">{l.depense == null ? '—' : mad(l.depense)}</td>
                    <td className="text-right pe-2 font-bold" style={{ color: l.profit == null ? V.muted : l.profit >= 0 ? V.good : V.critical }}>{l.profit == null ? '—' : signe(l.profit)}</td>
                    <td className="text-right pe-2">{l.coutParLivree == null ? '—' : mad(l.coutParLivree)}</td>
                    <td className="text-right">{l.roas == null ? '—' : `${l.roas.toFixed(1).replace('.', ',')}×`}</td>
                  </tr>
                ))}
                {payants.length === 0 && (
                  <tr><td colSpan={9} className={T.note} style={{ color: V.muted }}>Aucun emplacement Meta sur cette période.</td></tr>
                )}
                {payants.length > 0 && (
                  <tr style={{ borderTop: `2px solid ${V.axis}` }}>
                    <td className="py-1.5 pe-2 font-bold" style={{ color: V.ink }}>Total Meta</td>
                    <td className="text-right pe-2 font-semibold">{d.total.sessions.toLocaleString('fr-FR')}</td>
                    <td /><td className="text-right pe-2 font-semibold">{d.total.commandes} ({d.total.livrees}✓)</td>
                    <td className="text-right pe-2 font-semibold">{mad(d.total.marge)}</td>
                    <td className="text-right pe-2 font-semibold">{d.total.depense == null ? '—' : mad(d.total.depense)}</td>
                    <td className="text-right pe-2 font-bold" style={{ color: d.total.profit == null ? V.muted : d.total.profit >= 0 ? V.good : V.critical }}>{d.total.profit == null ? '—' : signe(d.total.profit)}</td>
                    <td /><td />
                  </tr>
                )}
                {autres.map((l) => (
                  <tr key={l.source} style={{ borderTop: `1px solid ${V.grid}`, color: V.muted }}>
                    <td className="py-1 pe-2">{l.libelle}</td>
                    <td className="text-right pe-2">{l.sessions.toLocaleString('fr-FR')}</td>
                    <td className="text-right pe-2">{l.paniers}</td>
                    <td className="text-right pe-2">{l.commandes} ({l.livrees}✓{l.annulees ? ` ${l.annulees}✕` : ''})</td>
                    <td className="text-right pe-2">{mad(l.marge)}</td>
                    <td colSpan={4} className="text-right">pas d'annonce Meta rattachée</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={`${T.note} mt-1`} style={{ color: V.muted }}>
            ✓ livrée · ✕ annulée · … en cours (marge comptée à la livraison). Emballage : {mad(d.emballageParColis)} par colis livré. « Sans source » regroupe les commandes manuelles et les visites sans balisage : elles ne peuvent être attribuées à aucun emplacement.
          </p>

          {d.positions.length > 0 && (
            <details className="mt-2">
              <summary className={T.label} style={{ color: V.ink2, cursor: 'pointer' }}>Par position (fil, stories, reels…) — déclaré par Meta</summary>
              <p className={`${T.note} mt-1`} style={{ color: V.warning }}>
                Ces achats et valeurs sont ceux que Meta déclare, pas ceux de tes commandes livrées : les liens des annonces ne portent pas la position. Pour obtenir le profit réel par position, ajoute <b>utm_term={'{{placement}}'}</b> aux paramètres d&apos;URL des annonces.
              </p>
              <div className="overflow-x-auto mt-1">
                <table className="w-full text-[12px] tabular-nums" style={{ minWidth: 640 }}>
                  <thead><tr style={{ color: V.muted }}>
                    {['Plateforme · position', 'Dépense', 'Impressions', 'Clics', 'CTR', 'Achats (Meta)', 'Valeur (Meta)', 'Coût / achat'].map((h, i) => (
                      <th key={h} className="font-semibold py-1 pe-2" style={{ textAlign: i === 0 ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {d.positions.map((p, i) => (
                      <tr key={`${p.publisher}-${p.position}-${i}`} style={{ borderTop: `1px solid ${V.grid}` }}>
                        <td className="py-1 pe-2" style={{ color: V.ink }}>{p.publisher} · {POSITIONS[p.position] ?? p.position}</td>
                        <td className="text-right pe-2">{mad(p.depense)}</td>
                        <td className="text-right pe-2">{p.impressions.toLocaleString('fr-FR')}</td>
                        <td className="text-right pe-2">{p.clics.toLocaleString('fr-FR')}</td>
                        <td className="text-right pe-2">{p.impressions > 0 ? pct(p.clics / p.impressions) : '—'}</td>
                        <td className="text-right pe-2">{p.achats}</td>
                        <td className="text-right pe-2">{p.valeur > 0 ? mad(p.valeur) : '—'}</td>
                        <td className="text-right">{p.achats > 0 ? mad(p.depense / p.achats) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  )
}
