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
import Link from 'next/link'
import { CircleAlert, RotateCw } from 'lucide-react'
import { V, MARQUE } from './Viz'
import { T } from './Decision'
import { calculerEcart } from '@/lib/analytics/ecart'
import { ZoneDefilante } from './Defilement'

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
export function Ecart({ courant, precedent, hausseEstBonne = true, discret = false }: {
  courant: number | null | undefined
  precedent: number | null | undefined
  hausseEstBonne?: boolean
  /** Dans un tableau : petit, et coloré seulement quand l'écart compte (≥ 25 %).
   *  Un tableau où chaque cellule porte une flèche rouge ou verte ne laisse plus rien
   *  ressortir : la couleur doit désigner, pas décorer. */
  discret?: boolean
}) {
  const e = calculerEcart(courant, precedent)
  if (!e) return null
  const bon = e.monte === hausseEstBonne
  const marquant = !e.extreme && Math.abs(e.pct) >= 25
  const couleur = e.extreme || Math.abs(e.pct) < 0.5 || (discret && !marquant) ? V.muted : bon ? V.good : V.critical
  // Fleche ET signe : la couleur n'est jamais le seul porteur du sens. Un ecart
  // extreme (« × 49 ») n'a PAS de couleur de verdict : ce n'est pas un bilan.
  //
  // Hors tableau, l'écart est une PASTILLE teintée (le verdict se repère sans lire) ; son texte prend l'encre
  // foncée du verdict, pas la couleur de marque : `good` sur blanc ne fait que 3,4:1.
  const verdict = couleur === V.good ? 'bon' : couleur === V.critical ? 'mauvais' : 'neutre'
  const encre = verdict === 'bon' ? V.goodInk : verdict === 'mauvais' ? V.criticalInk : V.muted
  const teinte = verdict === 'bon' ? 'rgba(12,163,12,.10)' : verdict === 'mauvais' ? 'rgba(208,59,59,.10)' : 'rgba(0,0,0,.05)'
  return (
    <span className={`${discret ? 'text-[11px] font-medium' : 'text-[11px] font-bold rounded-md px-1.5 py-0.5'} tabular-nums whitespace-nowrap`} title={e.explication}
      style={{ color: encre, background: discret ? undefined : teinte, cursor: e.extreme ? 'help' : undefined }}>
      {e.texte}
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
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mt-1.5">
        <span className="text-[28px] font-black leading-none tracking-tight tabular-nums" style={{ color: V.ink }}>
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
  /* DES CARTES BLANCHES SUR LA TOILE GRISE DU BOS. Chaque bloc (réglages, chiffres, figure, tableau) est une carte :
     l'œil sait où commence et où finit une idée, et la page a du relief au lieu d'un long défilement plat. Même
     langage que Commandes, Produits ou Clientes. */
  const carte = { background: MARQUE.carte, border: `1px solid ${MARQUE.carteLigne}`, boxShadow: MARQUE.ombre } as const
  return (
    <div className="max-w-[1140px] mx-auto px-4 pt-6 pb-12 sm:px-5 space-y-5">
      <style>{STYLES_RAPPORT}</style>
      <header>
        <h1 className="text-[24px] font-black leading-tight tracking-tight" style={{ color: V.ink }}>{titre}</h1>
        {sous && <p className="text-[13px] leading-snug mt-1 max-w-[80ch]" style={{ color: V.ink2 }}>{sous}</p>}
        {controles && <div className="mt-4 rounded-2xl px-3.5 py-3" style={carte}>{controles}</div>}
      </header>
      {enTete}
      {scorecards && (
        <section className={`rp-in grid grid-cols-2 gap-x-6 gap-y-5 rounded-2xl p-4 sm:p-5 ${
          colonnes === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}
          style={carte}>
          {scorecards}
        </section>
      )}
      {figure && <section className="rp-in rp-in-1 rounded-2xl p-4 sm:p-5" style={carte}>{figure}</section>}
      {tableau && <section className="rp-in rp-in-2 rounded-2xl p-4 sm:p-5" style={carte}>{tableau}</section>}
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
  /** Ce qui s'affiche à la place de `cle` (qui reste l'identifiant, pour le tri et les liens). */
  libelle?: string
  mesures: Record<string, { valeur: number | null; precedent?: number | null; n?: number; fiable?: boolean }>
}

export function DimensionTable({
  lignes, colonnes, labelDimension, dimensions, onDimension, comparaison, lignesParPage = 10, vide, totauxExacts, lienLigne,
}: {
  lignes: LigneTable[]
  colonnes: ColonneMesure[]
  labelDimension: string
  /** Les totaux de la période, calculés SANS dimension. Quand une mesure y figure, la
   *  ligne « Total » l'utilise au lieu de sommer les lignes : une session qui défile
   *  sur trois pages compte dans trois lignes (somme 3 417) mais une seule fois dans la
   *  période (2 191), et les lignes au-delà de la limite chargée n'y sont pas non plus. */
  totauxExacts?: Record<string, number | null | undefined>
  /** Dimensions proposees dans le selecteur — c'est ce qui rend le tableau explorable. */
  dimensions?: Array<{ cle: string; label: string }>
  onDimension?: (cle: string) => void
  comparaison?: boolean
  lignesParPage?: number
  vide?: string
  /** Un lien pour aller VOIR le détail d'une ligne dans un autre module (ex. la campagne → ses sessions). null : pas de lien. */
  lienLigne?: (l: LigneTable) => string | null
}) {
  const [tri, setTri] = useState<{ cle: string; desc: boolean }>({ cle: colonnes[0]?.cle ?? '', desc: true })
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)

  const filtrees = useMemo(() => {
    const t = q.trim().toLowerCase()
    const base = t ? lignes.filter((l) => (l.libelle ?? l.cle).toLowerCase().includes(t)) : lignes
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
      // Le total exact de la période prime : lui seul compte une session une fois.
      // (Un pourcentage ou une mesure dérivée y est aussi exact : calculé sur la période entière.)
      const exact = totauxExacts?.[c.cle]
      if (exact != null) { t[c.cle] = exact; continue }
      // On n'additionne QUE ce qui s'additionne. Un pourcentage ne se somme
      // pas, et une mesure dérivée non plus : la ligne affichait « Total —
      // Marge / commande : 1 258 MAD », qui est la somme des marges unitaires
      // de chaque canal. Ça ne veut rien dire, et ça se lisait comme un chiffre.
      if (c.format === 'pourcent' || c.derivee) continue
      t[c.cle] = filtrees.reduce((s, l) => s + (l.mesures[c.cle]?.valeur ?? 0), 0)
    }
    return t
  }, [filtrees, colonnes, totauxExacts])

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
        {/* Les cartes n'ont pas d'en-tetes a cliquer : le tri passe par ce menu. */}
        <label className="sm:hidden flex items-center gap-1.5 w-full">
          <span className={T.note} style={{ color: V.muted }}>Trier par</span>
          <select aria-label="Trier par" value={tri.cle}
            onChange={(e) => { setTri({ cle: e.target.value, desc: true }); setPage(0) }}
            className="text-[12px] font-semibold rounded-lg px-2 py-1 outline-none flex-1 min-w-0"
            style={{ border: `1px solid ${V.grid}`, color: V.ink, background: '#fff' }}>
            {colonnes.map((c) => <option key={c.cle} value={c.cle}>{c.label}</option>)}
          </select>
        </label>
      </div>

      {filtrees.length === 0 ? (
        <p className={T.note} style={{ color: V.muted }}>{vide ?? 'Aucune donnée sur la période.'}</p>
      ) : (
        <>
          <ZoneDefilante className="hidden sm:block -mx-1 px-1">
            <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 120 + colonnes.length * (comparaison ? 92 : 84) }}>
              <thead>
                <tr>
                  <th className={`${T.note} font-semibold text-left pb-1.5 sticky left-0`}
                    style={{ color: V.muted, borderBottom: `1px solid ${V.axis}`, background: '#fff' }}>
                    {labelDimension}
                  </th>
                  {colonnes.map((c) => (
                    <th key={c.cle}
                      aria-sort={tri.cle === c.cle ? (tri.desc ? 'descending' : 'ascending') : 'none'}
                      className={`${T.note} rp-th font-semibold text-right pb-1 select-none align-bottom`}
                      style={{ color: tri.cle === c.cle ? V.ink : V.muted, borderBottom: `1px solid ${V.axis}` }}>
                      <button type="button"
                        onClick={() => setTri((t) => ({ cle: c.cle, desc: t.cle === c.cle ? !t.desc : true }))}
                        className="min-h-9 cursor-pointer px-1 text-right leading-tight focus-visible:outline focus-visible:outline-2">
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
                      <div className="flex items-center gap-2 pr-3 max-w-[220px]">
                        {/* Micro-barre : la part se lit sans calculer. Elle croît
                            depuis zéro au premier rendu — le seul endroit où le
                            mouvement ajoute du sens, puisqu'il montre la grandeur
                            en train de se former. */}
                        <span className="rp-bar h-1.5 rounded-sm flex-shrink-0" style={{
                          width: Math.max(2, ((l.mesures[colonnes[0]?.cle]?.valeur ?? 0) / maxPremiere) * 34),
                          background: V.s1, opacity: .4,
                        }} />
                        {lienLigne?.(l)
                          ? <Link href={lienLigne(l)!} className="rp-key truncate underline decoration-dotted underline-offset-2" title={`${l.libelle ?? l.cle} — voir le détail`} style={{ color: V.ink2 }}>{l.libelle ?? l.cle}</Link>
                          : <span className="rp-key truncate" title={l.libelle ?? l.cle} style={{ color: V.ink2, transition: 'color .12s ease' }}>{l.libelle ?? l.cle}</span>}
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
                            <div><Ecart discret courant={m.valeur} precedent={m.precedent} hausseEstBonne={c.hausseEstBonne ?? true} /></div>
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
          </ZoneDefilante>

          {/* TELEPHONE : une carte par ligne. Le tableau ne montrait que le nom et le bord de
              la premiere colonne : tous les chiffres etaient hors cadre, sans indice. Une
              carte les met tous a l'ecran, sans defilement lateral. */}
          <div className="sm:hidden space-y-2" role="list">
            {visibles.map((l) => {
              const part = ((l.mesures[colonnes[0]?.cle]?.valeur ?? 0) / maxPremiere) * 100
              return (
                <div key={l.cle} role="listitem" className="rounded-lg px-3 py-2.5" style={{ border: `1px solid ${V.grid}`, background: '#fff' }}>
                  <p className="text-[13px] font-semibold break-words" style={{ color: V.ink }}>
                    {lienLigne?.(l)
                      ? <Link href={lienLigne(l)!} className="underline decoration-dotted underline-offset-2">{l.libelle ?? l.cle}</Link>
                      : (l.libelle ?? l.cle)}
                  </p>
                  <div className="mt-1.5 h-1 rounded-sm" style={{ background: V.grid }} aria-hidden="true">
                    <div className="h-full rounded-sm" style={{ width: `${Math.max(2, part)}%`, background: V.s1, opacity: .55 }} />
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-3">
                    {colonnes.map((c) => {
                      const m = l.mesures[c.cle]
                      return (
                        <div key={c.cle} className="min-w-0">
                          <p className="text-[12px] leading-tight" style={{ color: V.muted }}>{c.label}</p>
                          <p className="text-[14px] font-bold tabular-nums leading-snug" style={{ color: V.ink }}>
                            {m?.valeur == null && m?.n != null
                              ? <span className="font-normal" style={{ color: V.muted }} title={`${m.n} observations — sous le seuil`}>n={nf(m.n)}</span>
                              : fmt(m?.valeur, c.format)}
                          </p>
                          {comparaison && m?.precedent != null && (
                            <Ecart discret courant={m.valeur} precedent={m.precedent} hausseEstBonne={c.hausseEstBonne ?? true} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            <div className="rounded-lg px-3 py-2.5" style={{ background: V.grid + '55' }}>
              <p className="text-[13px] font-bold" style={{ color: V.ink }}>Total</p>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2.5">
                {colonnes.map((c) => (
                  <div key={c.cle} className="min-w-0">
                    <p className="text-[12px] leading-tight" style={{ color: V.muted }}>{c.label}</p>
                    <p className="text-[14px] font-bold tabular-nums" style={{ color: totaux[c.cle] == null ? V.muted : V.ink }}>
                      {totaux[c.cle] == null ? '—' : fmt(totaux[c.cle], c.format)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
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
/**
 * Sept onglets, un par QUESTION (onze en posaient une par type de donnée) :
 *  · maintenant — qui est sur le site, ce qui se passe aujourd'hui (l'entrée du tableau de bord) ;
 *  · analyse — Acquisition (ce que rapporte la pub), Parcours (où ça décroche), Catalogue (ce qu'elles
 *    voient et cherchent), Clientes (reviennent-elles). Chacun regroupe ses vues en sous-onglets ;
 *  · outils — Google Search Console (autre source de données) et l'exploration libre.
 */
export const MODULES = [
  { href: '/analytics/sessions', label: 'Sessions', groupe: 'maintenant' },
  { href: '/analytics/acquisition', label: 'Acquisition', groupe: 'analyse' },
  { href: '/analytics/parcours', label: 'Parcours', groupe: 'analyse' },
  { href: '/analytics/catalogue', label: 'Catalogue', groupe: 'analyse' },
  { href: '/analytics/clientes', label: 'Clientes', groupe: 'analyse' },
  { href: '/analytics/seo', label: 'SEO', groupe: 'outils' },
  { href: '/analytics/explorer', label: 'Explorer', groupe: 'outils' },
] as const
