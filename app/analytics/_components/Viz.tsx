'use client'

/**
 * Primitives graphiques du tableau de bord.
 *
 * Avant : 2 143 lignes de chiffres bruts dans des div — 1 seul SVG, 2 tableaux,
 * aucune bibliotheque. Le contenu etait bon, la hierarchie visuelle inexistante.
 * On lisait 30 cartes au meme niveau d'importance sur un seul defilement.
 *
 * Choix de forme (cf. competence dataviz) :
 *   - une valeur qui evolue dans le temps -> courbe, jamais barres ;
 *   - des etapes qui se retrecissent      -> barres horizontales alignees a
 *                                            gauche, pour comparer des longueurs ;
 *   - un seul chiffre qui decide          -> pas de graphique, une tuile.
 *
 * Regles appliquees partout : traits fins (2px), extremites arrondies 4px,
 * grille et axes en retrait, survol par defaut, aucune couleur de serie sur du
 * texte, et jamais deux echelles verticales.
 *
 * Aucune dependance ajoutee : tout est en SVG. Une bibliotheque de graphiques
 * pese 50 a 150 ko pour ce qu'on fait ici en 200 lignes.
 */

import { useState } from 'react'

/* Palette deja validee (validate_palette.js, mode clair, surface #ffffff) :
   bande de luminosite OK, plancher de chroma OK, pire paire daltonisme ΔE 9,2
   (seuil 8), vision normale ΔE 27,6 (seuil 15). */
export const V = {
  s1: '#2a78d6',
  s2: '#eb6834',
  s3: '#1baf7a',
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  ink: '#0b0b0b',
  ink2: '#52514e',
  muted: '#898781',
} as const

const nf = (n: number) => Math.round(n).toLocaleString('fr-FR')

/* ── Tuile de tete ────────────────────────────────────────────────────────────
   Un chiffre qui decide ne se met pas en graphique : il se met en gros. La
   micro-courbe ne sert qu'a dire « ca monte ou ca descend », sans axes ni
   valeurs — elle n'est pas faite pour etre lue precisement. */
export function StatTile({
  label, value, unit, delta, series, tone = 'neutral', hint,
}: {
  label: string
  value: string
  unit?: string
  delta?: number | null
  series?: number[]
  tone?: 'neutral' | 'good' | 'warning' | 'critical'
  hint?: string
}) {
  const toneColor = tone === 'good' ? V.good : tone === 'warning' ? V.warning : tone === 'critical' ? V.critical : V.s1
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-1.5 min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: V.muted }}>{label}</p>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-[26px] font-black leading-none tabular-nums" style={{ color: V.ink }}>{value}</span>
        {unit && <span className="text-xs font-semibold" style={{ color: V.ink2 }}>{unit}</span>}
        {delta != null && (
          // Le signe ET la couleur : la couleur seule ne suffit jamais.
          <span
            className="text-[11px] font-bold tabular-nums ms-auto"
            style={{ color: delta > 0 ? V.good : delta < 0 ? V.critical : V.muted }}
          >
            {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {Math.abs(delta)} %
          </span>
        )}
      </div>
      {series && series.length > 1 && <Sparkline points={series} color={toneColor} />}
      {hint && <p className="text-[10px] leading-snug" style={{ color: V.muted }}>{hint}</p>}
    </div>
  )
}

/** Micro-courbe : tendance seule, sans axes — volontairement non lisible au chiffre. */
export function Sparkline({ points, color = V.s1, h = 28 }: { points: number[]; color?: string; h?: number }) {
  if (points.length < 2) return null
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const span = max - min || 1
  const w = 100
  const d = points
    .map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / span) * (h - 4) - 2}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full mt-0.5" style={{ height: h }} aria-hidden="true">
      <polyline points={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/* ── Courbe temporelle ────────────────────────────────────────────────────────
   UNE seule echelle verticale. Deux mesures d'ordres de grandeur differents
   (dirhams et sessions) ne partagent JAMAIS un graphique a deux axes : c'est
   l'erreur de lecture la plus courante, les croisements y sont un artefact de
   cadrage. On fait deux graphiques cote a cote. */
export function LineChart({
  data, color = V.s1, format = nf, label, height = 160,
}: {
  data: { date: string; value: number }[]
  color?: string
  format?: (n: number) => string
  label: string
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  if (data.length < 2) return <p className="text-xs" style={{ color: V.muted }}>Pas assez de données.</p>

  const W = 640, H = height, PAD_L = 8, PAD_R = 8, PAD_B = 18, PAD_T = 8
  const max = Math.max(...data.map(d => d.value), 1)
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const x = (i: number) => PAD_L + (i / (data.length - 1)) * innerW
  const y = (v: number) => PAD_T + innerH - (v / max) * innerH

  const line = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')
  const area = `${PAD_L},${PAD_T + innerH} ${line} ${PAD_L + innerW},${PAD_T + innerH}`
  const gid = `g-${label.replace(/\W/g, '')}`

  const jour = (s: string) => {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img" aria-label={label}
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grille en retrait : elle situe, elle ne se lit pas. */}
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={PAD_L} x2={W - PAD_R} y1={y(max * f)} y2={y(max * f)}
            stroke={V.grid} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}

        <polygon points={area} fill={`url(#${gid})`} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

        {hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={PAD_T + innerH}
              stroke={V.axis} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {/* Anneau de surface 2px : le point reste lisible par-dessus la courbe. */}
            <circle cx={x(hover)} cy={y(data[hover].value)} r={5} fill={color} stroke="#fff" strokeWidth={2} />
          </>
        )}

        {/* Zones de survol plus larges que les marques — on vise au doigt. */}
        {data.map((_, i) => (
          <rect key={i} x={x(i) - innerW / data.length / 2} y={0}
            width={innerW / data.length} height={H} fill="transparent"
            onMouseEnter={() => setHover(i)} />
        ))}

        {/* Sans repere de hauteur, une courbe ne dit que « ca monte » : on ne
            sait pas si le pic vaut 500 ou 5 000. Le maximum suffit — un axe
            complet encombrerait pour une information qu'on lit au survol. */}
        <text x={PAD_L} y={y(max) - 3} fontSize={10} fill={V.muted}>{format(max)}</text>
        <text x={PAD_L} y={H - 4} fontSize={10} fill={V.muted}>{jour(data[0].date)}</text>
        <text x={W - PAD_R} y={H - 4} fontSize={10} fill={V.muted} textAnchor="end">{jour(data[data.length - 1].date)}</text>
      </svg>

      {hover != null && (
        <div className="absolute top-0 pointer-events-none bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 shadow-sm"
          style={{ left: `${(hover / (data.length - 1)) * 100}%`, transform: 'translateX(-50%)' }}>
          <p className="text-[10px] whitespace-nowrap" style={{ color: V.muted }}>{jour(data[hover].date)}</p>
          <p className="text-xs font-bold tabular-nums whitespace-nowrap" style={{ color: V.ink }}>{format(data[hover].value)}</p>
        </div>
      )}
    </div>
  )
}

/* ── Tunnel ───────────────────────────────────────────────────────────────────
   Des barres horizontales alignees a gauche : comparer des LONGUEURS depuis une
   base commune est la comparaison la plus fiable de l'oeil. L'entonnoir en
   trapeze, lui, encode la valeur dans une aire ambigue.
   La perte est ecrite en clair a chaque marche : c'est l'information utile,
   pas le nombre absolu. */
export function FunnelChart({ stages }: { stages: { stage: string; sessions: number }[] }) {
  const rows = stages.filter(s => s.sessions > 0)
  if (rows.length === 0) return <p className="text-xs" style={{ color: V.muted }}>Aucune donnée.</p>

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((s, i) => {
        const prev = i > 0 ? rows[i - 1].sessions : null
        const passage = prev ? (s.sessions / prev) * 100 : 100
        const perdu = prev ? prev - s.sessions : 0
        // Seuil de couleur : sous 40 % de passage, l'etape est une vraie fuite.
        const tone = prev == null ? V.s1 : passage < 40 ? V.critical : passage < 65 ? V.warning : V.s1
        return (
          <div key={s.stage}>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-xs font-medium" style={{ color: V.ink }}>{s.stage}</span>
              <span className="text-xs font-bold tabular-nums" style={{ color: V.ink }}>{nf(s.sessions)}</span>
            </div>
            {/* La barre encode le PASSAGE depuis l'etape precedente, pas la part
                du total. Rapportees au premier palier, les cinq dernieres etapes
                devenaient des filets indistinguables — un tunnel ou l'on ne peut
                plus comparer que les deux premieres marches ne sert a rien.
                Ici chaque barre va de 0 a 100 % : l'oeil trouve la fuite
                immediatement, et le compte absolu reste ecrit a droite. */}
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: '#f2f1ec' }}>
              <div className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.max(2, passage)}%`, background: tone }} />
            </div>
            <p className="text-[10px] mt-0.5 tabular-nums" style={{ color: passage < 40 ? V.critical : V.muted }}>
              {prev == null
                ? 'point de départ'
                : `${passage.toFixed(1)} % passent${perdu > 0 ? ` · ${nf(perdu)} perdues ici` : ''}`}
            </p>
          </div>
        )
      })}
    </div>
  )
}

/* ── Barres comparatives ──────────────────────────────────────────────────────
   Pour un classement (canaux, villes, produits). Trie decroissant impose : un
   classement non trie oblige l'oeil a faire le travail. */
export function BarList({
  rows, format = nf, colorFor,
}: {
  rows: { label: string; value: number; hint?: string }[]
  format?: (n: number) => string
  colorFor?: (r: { label: string; value: number }) => string
}) {
  const sorted = [...rows].sort((a, b) => b.value - a.value)
  const max = Math.max(...sorted.map(r => r.value), 1)
  if (sorted.length === 0) return <p className="text-xs" style={{ color: V.muted }}>Aucune donnée.</p>
  return (
    <div className="flex flex-col gap-2.5">
      {sorted.map(r => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-xs truncate" style={{ color: V.ink }}>{r.label}</span>
            <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color: V.ink }}>{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: '#f2f1ec' }}>
            <div className="h-full rounded-full"
              style={{ width: `${Math.max(1, (r.value / max) * 100)}%`, background: colorFor ? colorFor(r) : V.s1 }} />
          </div>
          {r.hint && <p className="text-[10px] mt-0.5" style={{ color: V.muted }}>{r.hint}</p>}
        </div>
      ))}
    </div>
  )
}
