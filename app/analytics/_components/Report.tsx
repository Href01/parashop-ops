'use client'

/**
 * LES PATRONS DE RAPPORT.
 *
 * Trois composants, repris de trois outils, et une seule regle : on apprend a
 * lire une fois, puis tous les modules se lisent pareil.
 *
 *   ReportShell     (GA4)     titre + comparaison -> scorecards -> figure -> tableau.
 *                             La sequence est toujours la meme, dans cet ordre.
 *   Scorecard       (GA4)     un chiffre, sa variation, sa definition au survol.
 *   DimensionTable  (GA4)     LE composant central : dimension au choix, tri,
 *                             recherche, ligne de totaux, micro-barre de part.
 *                             Il remplace les anciennes listes dont le champ
 *                             `extra` empilait quatre metriques dans une phrase
 *                             (« 12 u. · 210 MAD/u · 18 % du CA · 4 % conv »).
 *   ChampInfo       (Looker)  la definition en clair, au survol du libelle.
 *
 * Regle de couleur, valable partout : la periode COURANTE est en encre pleine,
 * la comparaison en gris. Jamais deux couleurs vives qui se disputent — la
 * couleur ne sert qu'a dire « regarde ici », et si tout crie, plus rien ne dit
 * rien.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { CircleAlert, RotateCw } from 'lucide-react'
import { V } from './Viz'
import { T } from './Decision'

/* ── Jetons ───────────────────────────────────────────────────────────────── */
export const JET = {
  ligne: 34,          // hauteur de ligne de tableau
  gouttiere: 20,
  rayon: 10,
} as const

/**
 * Le mouvement, en trois regles.
 *
 *  1. Une animation rend un CHANGEMENT lisible, elle ne decore pas. Un tableau
 *     de bord qui remue en permanence fatigue en trois jours.
 *  2. Court : 140 a 260 ms. Au-dela, on attend l'interface au lieu de la lire.
 *  3. Toujours desactivable — `prefers-reduced-motion` est respecte partout,
 *     ce n'est pas une option.
 *
 * Les barres croissent depuis zero au premier rendu : c'est le seul endroit ou
 * le mouvement ajoute du sens, parce qu'il montre la grandeur en train de se
 * former. L'entree des blocs est decalee de 40 ms pour guider l'oeil de haut en
 * bas, une fois, sans jamais se rejouer au survol.
 */
export const STYLES_RAPPORT = `
  .rp-in { animation: rpIn .26s cubic-bezier(.2,.8,.3,1) both; }
  .rp-in-1 { animation-delay: .04s } .rp-in-2 { animation-delay: .08s } .rp-in-3 { animation-delay: .12s }
  @keyframes rpIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }

  .rp-row { transition: background-color .12s ease; }
  .rp-row:hover { background: ${V.grid}4d; }
  .rp-row:hover .rp-key { color: ${V.ink}; }

  .rp-th { transition: color .12s ease; }
  .rp-th:hover { color: ${V.ink}; }

  .rp-bar { transition: width .5s cubic-bezier(.2,.8,.3,1); }

  .rp-sk { background: linear-gradient(90deg, ${V.grid}66 25%, ${V.grid}b3 37%, ${V.grid}66 63%);
           background-size: 400% 100%; animation: rpSk 1.2s ease-in-out infinite; border-radius: 4px; }
  @keyframes rpSk { from { background-position: 100% 50% } to { background-position: 0 50% } }

  @media (prefers-reduced-motion: reduce) {
    .rp-in, .rp-sk { animation: none; opacity: 1; transform: none; }
    .rp-bar, .rp-row, .rp-th { transition: none; }
  }
`

/** Squelette de chargement — il garde la place, donc la page ne saute pas. */
export function Squelette({ lignes = 3, hauteur = 14 }: { lignes?: number; hauteur?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: lignes }).map((_, i) => (
        <div key={i} className="rp-sk" style={{ height: hauteur, width: `${100 - i * 12}%` }} />
      ))}
    </div>
  )
}

/** Erreur de lecture commune a tous les rapports, avec une sortie immediate. */
export function ErreurChargement({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const retry = onRetry ?? (() => window.location.reload())
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 border-y py-3 sm:flex-row sm:items-center sm:justify-between"
      style={{ borderColor: `${V.critical}40`, color: V.critical }}
    >
      <div className="flex min-w-0 items-start gap-2">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-[13px] font-bold">Données temporairement indisponibles</p>
          <p className="break-words text-[12px]" style={{ color: V.muted }}>{message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={retry}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start border px-3 text-[12px] font-bold transition-colors hover:bg-black/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:self-auto"
        style={{ borderColor: V.axis, borderRadius: 6, color: V.ink }}
      >
        <RotateCw aria-hidden="true" className="size-3.5" />
        Réessayer
      </button>
    </div>
  )
}

const nf = (n: number) => Math.round(n).toLocaleString('fr-FR')

export type FormatMesure = 'entier' | 'mad' | 'pourcent' | 'decimal'

export function fmt(v: number | null | undefined, f: FormatMesure): string {
  if (v == null) return '—'
  switch (f) {
    case 'mad': return `${nf(v)} MAD`
    case 'pourcent': return `${v.toFixed(1).replace('.', ',')} %`
    case 'decimal': return v.toFixed(2).replace('.', ',')
    default: return nf(v)
  }
}

/* ── La definition au survol (Looker) ─────────────────────────────────────── */
export function ChampInfo({ label, definition, portee }: { label: string; definition: string; portee?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 cursor-help border-b border-dotted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ borderColor: V.axis }}
      title={portee ? `${definition}\n\nCompté en : ${portee}.` : definition}
      tabIndex={0}
      role="note"
      aria-label={`${label}. ${definition}${portee ? ` Compté en ${portee}.` : ''}`}
    >
      {label}
    </span>
  )
}

/* ── L'ecart vs comparaison ───────────────────────────────────────────────── */
export function Ecart({ courant, precedent, hausseEstBonne = true }: {
  courant: number | null | undefined
  precedent: number | null | undefined
  hausseEstBonne?: boolean
}) {
  if (courant == null || precedent == null || precedent === 0) return null
  const pct = ((courant - precedent) / Math.abs(precedent)) * 100
  if (!Number.isFinite(pct)) return null
  const monte = pct >= 0
  const bon = monte === hausseEstBonne
  // Fleche ET signe : la couleur n'est jamais le seul porteur du sens.
  return (
    <span className="text-[11px] font-bold tabular-nums whitespace-nowrap"
      style={{ color: Math.abs(pct) < 0.5 ? V.muted : bon ? V.good : V.critical }}>
      {monte ? '▲' : '▼'} {Math.abs(pct).toFixed(0)} %
    </span>
  )
}

/* ── Scorecard (GA4) ──────────────────────────────────────────────────────── */
export function Scorecard({
  label, definition, portee, valeur, precedent, format, hausseEstBonne = true, note,
}: {
  label: string; definition: string; portee?: string
  valeur: number | null; precedent?: number | null
  format: FormatMesure; hausseEstBonne?: boolean; note?: string
}) {
  return (
    <div className="min-w-0">
      <p className={T.label} style={{ color: V.muted }}>
        <ChampInfo label={label} definition={definition} portee={portee} />
      </p>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-[22px] font-black leading-none tabular-nums" style={{ color: V.ink }}>
          {fmt(valeur, format)}
        </span>
        <Ecart courant={valeur} precedent={precedent} hausseEstBonne={hausseEstBonne} />
      </div>
      {note && <p className={`${T.note} mt-0.5`} style={{ color: V.muted }}>{note}</p>}
      {precedent != null && (
        <p className={T.note} style={{ color: V.muted }}>période précédente : {fmt(precedent, format)}</p>
      )}
    </div>
  )
}

/* ── La coque de rapport (GA4) ────────────────────────────────────────────── */
export function ReportShell({
  titre, sous, controles, scorecards, figure, tableau, enTete, colonnes = 4,
}: {
  titre: string
  sous?: string
  controles?: ReactNode
  enTete?: ReactNode
  scorecards?: ReactNode
  figure?: ReactNode
  tableau?: ReactNode
  /** Nombre de cartes sur une rangée en grand écran. 4 par défaut ; 5 quand un
   *  module a une mesure de plus, pour éviter la carte orpheline en 2e rangée.
   *  Les classes sont écrites en toutes lettres : Tailwind ne génère pas de
   *  nom de classe construit à l'exécution. */
  colonnes?: 4 | 5
}) {
  return (
    <div className="max-w-[1140px] mx-auto px-4 py-5 sm:px-5">
      <style>{STYLES_RAPPORT}</style>
      <header className="pb-4">
        <h1 className="text-[19px] font-black leading-tight" style={{ color: V.ink }}>{titre}</h1>
        {sous && <p className={`${T.note} mt-0.5`} style={{ color: V.muted }}>{sous}</p>}
        {controles && <div className="mt-3">{controles}</div>}
      </header>
      {enTete}
      {scorecards && (
        <section className={`rp-in grid grid-cols-2 gap-x-6 gap-y-5 py-5 border-t border-b ${
          colonnes === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}
          style={{ borderColor: V.grid }}>
          {scorecards}
        </section>
      )}
      {figure && <section className="rp-in rp-in-1 py-6">{figure}</section>}
      {tableau && <section className="rp-in rp-in-2 pb-10">{tableau}</section>}
    </div>
  )
}

/* ── Le tableau de dimension (GA4) ────────────────────────────────────────── */

export type ColonneMesure = {
  cle: string
  label: string
  definition: string
  format: FormatMesure
  portee?: string
  hausseEstBonne?: boolean
  /** Mesure calculee a partir d'autres : elle ne s'additionne pas. */
  derivee?: boolean
}

export type LigneTable = {
  cle: string
  mesures: Record<string, { valeur: number | null; precedent?: number | null; n?: number; fiable?: boolean }>
}

export function DimensionTable({
  lignes, colonnes, labelDimension, dimensions, onDimension, comparaison, lignesParPage = 10, vide,
}: {
  lignes: LigneTable[]
  colonnes: ColonneMesure[]
  labelDimension: string
  /** Dimensions proposees dans le selecteur — c'est ce qui rend le tableau explorable. */
  dimensions?: Array<{ cle: string; label: string }>
  onDimension?: (cle: string) => void
  comparaison?: boolean
  lignesParPage?: number
  vide?: string
}) {
  const [tri, setTri] = useState<{ cle: string; desc: boolean }>({ cle: colonnes[0]?.cle ?? '', desc: true })
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)

  const filtrees = useMemo(() => {
    const t = q.trim().toLowerCase()
    const base = t ? lignes.filter((l) => l.cle.toLowerCase().includes(t)) : lignes
    return [...base].sort((a, b) => {
      const va = a.mesures[tri.cle]?.valeur ?? -Infinity
      const vb = b.mesures[tri.cle]?.valeur ?? -Infinity
      return tri.desc ? vb - va : va - vb
    })
  }, [lignes, q, tri])

  // La ligne de totaux se calcule sur TOUTES les lignes filtrees, pas sur la
  // page affichee : un total qui change quand on tourne la page est un piège.
  const totaux = useMemo(() => {
    const t: Record<string, number> = {}
    for (const c of colonnes) {
      // On n'additionne QUE ce qui s'additionne. Un pourcentage ne se somme
      // pas, et une mesure dérivée non plus : la ligne affichait « Total —
      // Marge / commande : 1 258 MAD », qui est la somme des marges unitaires
      // de chaque canal. Ça ne veut rien dire, et ça se lisait comme un chiffre.
      if (c.format === 'pourcent' || c.derivee) continue
      t[c.cle] = filtrees.reduce((s, l) => s + (l.mesures[c.cle]?.valeur ?? 0), 0)
    }
    return t
  }, [filtrees, colonnes])

  const pages = Math.max(1, Math.ceil(filtrees.length / lignesParPage))
  const p = Math.min(page, pages - 1)
  const visibles = filtrees.slice(p * lignesParPage, (p + 1) * lignesParPage)
  const maxPremiere = Math.max(...filtrees.map((l) => l.mesures[colonnes[0]?.cle]?.valeur ?? 0), 1)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 pb-2">
        {dimensions && dimensions.length > 1 && (
          <select
            aria-label="Dimension du tableau"
            value={dimensions.find((d) => d.label === labelDimension)?.cle ?? ''}
            onChange={(e) => { onDimension?.(e.target.value); setPage(0) }}
            className="text-[12px] font-semibold rounded-lg px-2 py-1 outline-none"
            style={{ border: `1px solid ${V.grid}`, color: V.ink, background: '#fff' }}
          >
            {dimensions.map((d) => <option key={d.cle} value={d.cle}>{d.label}</option>)}
          </select>
        )}
        <input
          aria-label="Rechercher dans le tableau"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(0) }}
          placeholder="Rechercher…"
          className="text-[12px] rounded-lg px-2 py-1 outline-none flex-1 min-w-[120px] max-w-[220px]"
          style={{ border: `1px solid ${V.grid}`, color: V.ink }}
        />
        <span className={T.note} style={{ color: V.muted }}>{nf(filtrees.length)} lignes</span>
      </div>

      {filtrees.length === 0 ? (
        <p className={T.note} style={{ color: V.muted }}>{vide ?? 'Aucune donnée sur la période.'}</p>
      ) : (
        <>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 120 + colonnes.length * (comparaison ? 132 : 104) }}>
              <thead>
                <tr>
                  <th className={`${T.note} font-semibold text-left pb-1.5 sticky left-0`}
                    style={{ color: V.muted, borderBottom: `1px solid ${V.axis}`, background: '#fff' }}>
                    {labelDimension}
                  </th>
                  {colonnes.map((c) => (
                    <th key={c.cle}
                      aria-sort={tri.cle === c.cle ? (tri.desc ? 'descending' : 'ascending') : 'none'}
                      className={`${T.note} rp-th font-semibold text-right pb-1 select-none whitespace-nowrap`}
                      style={{ color: tri.cle === c.cle ? V.ink : V.muted, borderBottom: `1px solid ${V.axis}` }}>
                      <button type="button"
                        onClick={() => setTri((t) => ({ cle: c.cle, desc: t.cle === c.cle ? !t.desc : true }))}
                        className="min-h-9 cursor-pointer whitespace-nowrap px-1 text-right focus-visible:outline focus-visible:outline-2">
                        <ChampInfo label={c.label} definition={c.definition} portee={c.portee} />
                        <span className="ml-1" aria-hidden="true">{tri.cle === c.cle ? (tri.desc ? '↓' : '↑') : ''}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((l) => (
                  <tr key={l.cle} className="rp-row" style={{ height: JET.ligne, background: '#fff' }}>
                    <td className="text-[13px] sticky left-0" style={{ color: V.ink, borderBottom: `1px solid ${V.grid}`, background: 'inherit' }}>
                      <div className="flex items-center gap-2 pr-3 max-w-[280px]">
                        {/* Micro-barre : la part se lit sans calculer. Elle croît
                            depuis zéro au premier rendu — le seul endroit où le
                            mouvement ajoute du sens, puisqu'il montre la grandeur
                            en train de se former. */}
                        <span className="rp-bar h-1.5 rounded-sm flex-shrink-0" style={{
                          width: Math.max(2, ((l.mesures[colonnes[0]?.cle]?.valeur ?? 0) / maxPremiere) * 34),
                          background: V.s1, opacity: .4,
                        }} />
                        <span className="rp-key truncate" title={l.cle} style={{ color: V.ink2, transition: 'color .12s ease' }}>{l.cle}</span>
                      </div>
                    </td>
                    {colonnes.map((c) => {
                      const m = l.mesures[c.cle]
                      return (
                        <td key={c.cle} className="text-[13px] text-right tabular-nums whitespace-nowrap"
                          style={{ color: V.ink, borderBottom: `1px solid ${V.grid}` }}>
                          {/* Sous le seuil d'effectif : le rapport brut, qui reste
                              vrai, plutot qu'un pourcentage qui pretend generaliser. */}
                          {m?.valeur == null && m?.n != null
                            ? <span className={T.note} style={{ color: V.muted }} title={`${m.n} observations — sous le seuil`}>n={nf(m.n)}</span>
                            : fmt(m?.valeur, c.format)}
                          {comparaison && m?.precedent != null && (
                            <div><Ecart courant={m.valeur} precedent={m.precedent} hausseEstBonne={c.hausseEstBonne ?? true} /></div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr style={{ height: JET.ligne }}>
                  <td className="text-[13px] font-bold sticky left-0" style={{ color: V.ink, borderTop: `1px solid ${V.axis}`, background: '#fff' }}>
                    Total
                  </td>
                  {colonnes.map((c) => (
                    <td key={c.cle} className="text-[13px] font-bold text-right tabular-nums"
                      style={{ color: totaux[c.cle] == null ? V.muted : V.ink, borderTop: `1px solid ${V.axis}` }}
                      title={totaux[c.cle] == null ? "Cette mesure ne s'additionne pas." : undefined}>
                      {totaux[c.cle] == null ? '—' : fmt(totaux[c.cle], c.format)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center gap-2 mt-2">
              <button onClick={() => setPage(Math.max(0, p - 1))} disabled={p === 0}
                aria-label="Page précédente"
                className="min-h-9 min-w-9 text-[12px] px-2 rounded disabled:opacity-30" style={{ border: `1px solid ${V.grid}`, color: V.ink2 }}>‹</button>
              <span className={T.note} style={{ color: V.muted }}>{p + 1} / {pages}</span>
              <button onClick={() => setPage(Math.min(pages - 1, p + 1))} disabled={p >= pages - 1}
                aria-label="Page suivante"
                className="min-h-9 min-w-9 text-[12px] px-2 rounded disabled:opacity-30" style={{ border: `1px solid ${V.grid}`, color: V.ink2 }}>›</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── La navigation par modules ────────────────────────────────────────────── */
export const MODULES = [
  { href: '/analytics', label: "Vue d'ensemble" },
  { href: '/analytics/acquisition', label: 'Acquisition' },
  { href: '/analytics/engagement', label: 'Engagement' },
  { href: '/analytics/conversion', label: 'Conversion' },
  { href: '/analytics/retention', label: 'Rétention' },
  { href: '/analytics/produits', label: 'Produits' },
  { href: '/analytics/recherche', label: 'Recherche' },
  { href: '/analytics/qualite', label: 'Qualité' },
  { href: '/analytics/sessions', label: 'Sessions' },
  { href: '/analytics/explorer', label: 'Explorer' },
] as const
