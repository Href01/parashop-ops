'use client'

/**
 * LES FIGURES D'ANALYSE — entonnoir, cohortes, chemins.
 *
 * Trois formes que le tableau de dimension ne sait pas produire, parce qu'elles
 * portent sur des SEQUENCES : l'ordre des etapes, le retour d'une personne d'un
 * mois sur l'autre, l'enchainement des pages.
 */

import { V } from './Viz'
import { T } from './Decision'

const nf = (n: number) => Math.round(n).toLocaleString('fr-FR')
const pct = (n: number) => `${n.toFixed(1).replace('.', ',')} %`

function duree(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} s`
  if (sec < 3600) return `${Math.round(sec / 60)} min`
  if (sec < 86400) return `${(sec / 3600).toFixed(1).replace('.', ',')} h`
  return `${(sec / 86400).toFixed(1).replace('.', ',')} j`
}

/* ── Entonnoir a etapes libres ────────────────────────────────────────────── */

export type EtapeEntonnoir = {
  evenement: string
  label: string
  sessions: number
  delaiMedian: number | null
}

/**
 * La barre mesure le PASSAGE DEPUIS L'ETAPE PRECEDENTE, pas la part du depart.
 *
 * Rapportees au depart, les dernieres etapes deviennent des traits
 * indiscernables — 3 % et 1,8 % se ressemblent a l'oeil alors que l'une perd
 * deux fois plus que l'autre. Le passage, lui, occupe toute la largeur
 * disponible et se compare d'une marche a l'autre. La part du depart reste
 * ecrite a cote, en petit.
 */
export function Entonnoir({ etapes, valoriser }: {
  etapes: EtapeEntonnoir[]
  /** Convertit des sessions perdues en dirhams — sinon la fuite reste abstraite. */
  valoriser?: (perdues: number) => number | null
}) {
  if (etapes.length === 0) return <p className={T.note} style={{ color: V.muted }}>Aucune donnée.</p>
  const depart = etapes[0].sessions || 1

  return (
    <div className="space-y-3">
      {etapes.map((e, i) => {
        const prec = i === 0 ? e.sessions : etapes[i - 1].sessions
        const passage = prec > 0 ? (e.sessions / prec) * 100 : 0
        const perdues = i === 0 ? 0 : Math.max(0, prec - e.sessions)
        const manque = valoriser && perdues > 0 ? valoriser(perdues) : null
        const couleur = i === 0 ? V.s1 : passage >= 65 ? V.s1 : passage >= 35 ? V.warning : V.critical
        return (
          <div key={e.evenement}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold" style={{ color: V.ink }}>{e.label}</span>
              <span className="text-[13px] font-black tabular-nums" style={{ color: V.ink }}>{nf(e.sessions)}</span>
            </div>
            <div className="h-2 rounded-sm mt-1 overflow-hidden" style={{ background: V.grid }}>
              <div className="rp-bar h-full rounded-sm"
                style={{ width: `${Math.max(1, i === 0 ? 100 : passage)}%`, background: couleur }} />
            </div>
            <div className={`${T.note} mt-1 flex flex-wrap gap-x-3`} style={{ color: V.muted }}>
              {i === 0 ? (
                <span>point de départ</span>
              ) : (
                <>
                  <span style={{ color: passage < 35 ? V.critical : V.muted }}>
                    <b>{pct(passage)}</b> passent
                  </span>
                  <span>{nf(perdues)} perdues ici</span>
                  <span>{pct((e.sessions / depart) * 100)} du départ</span>
                  {e.delaiMedian != null && e.delaiMedian > 0 && <span>délai médian {duree(e.delaiMedian)}</span>}
                  {manque != null && manque > 0 && (
                    <span style={{ color: V.critical }}>≈ {nf(manque)} MAD non réalisés</span>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Table de cohortes ────────────────────────────────────────────────────── */

export type CelluleCohorte = { cohorte: string; rang: number; clientes: number; ca: number }

/**
 * Degrade d'UNE SEULE teinte, jamais un arc-en-ciel : les cases se comparent
 * alors par intensite, ce que l'oeil fait bien. La valeur est ecrite dans la
 * case — la couleur ne porte jamais l'information seule.
 */
export function TableCohortes({ cellules, maxRangs = 6 }: { cellules: CelluleCohorte[]; maxRangs?: number }) {
  const cohortes = [...new Set(cellules.map((c) => c.cohorte))].sort()
  if (cohortes.length === 0) return <p className={T.note} style={{ color: V.muted }}>Aucune cohorte.</p>

  const par = new Map<string, Map<number, CelluleCohorte>>()
  for (const c of cellules) {
    if (!par.has(c.cohorte)) par.set(c.cohorte, new Map())
    par.get(c.cohorte)!.set(c.rang, c)
  }
  const taille = (co: string) => par.get(co)?.get(0)?.clientes ?? 0

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 2, minWidth: 120 + maxRangs * 62 }}>
        <thead>
          <tr>
            <th className={`${T.note} font-semibold text-left`} style={{ color: V.muted }}>Cohorte</th>
            <th className={`${T.note} font-semibold text-right pe-2`} style={{ color: V.muted }}>Clientes</th>
            {Array.from({ length: maxRangs }).map((_, r) => (
              <th key={r} className={`${T.note} font-semibold text-center`} style={{ color: V.muted }}>
                {r === 0 ? 'M0' : `M+${r}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohortes.map((co) => {
            const n = taille(co)
            return (
              <tr key={co}>
                <td className="text-[12px] font-semibold whitespace-nowrap" style={{ color: V.ink }}>{co}</td>
                <td className="text-[12px] text-right tabular-nums pe-2" style={{ color: V.ink2 }}>{nf(n)}</td>
                {Array.from({ length: maxRangs }).map((_, r) => {
                  const c = par.get(co)?.get(r)
                  const taux = n > 0 && c ? (c.clientes / n) * 100 : null
                  if (taux == null || !c) return <td key={r} className="text-center text-[11px]" style={{ color: V.grid }}>·</td>

                  // LE GARDE-FOU D'EFFECTIF S'APPLIQUE ICI AUSSI.
                  // Sans lui, une cohorte de 3 clientes dont 1 revient produit
                  // « 33 % » — la case la PLUS foncée du tableau, alors que
                  // c'est une personne. La couleur criait le bruit le plus fort.
                  // Sous 10 clientes, on montre donc le rapport brut, sans
                  // remplissage : le fait reste, l'inférence disparaît.
                  const fiable = n >= 10
                  if (!fiable) {
                    return (
                      <td key={r} className="text-center text-[10px] tabular-nums"
                        style={{ color: V.muted }}
                        title={`${c.clientes} sur ${n} — cohorte trop petite pour un pourcentage`}>
                        {r === 0 ? `${nf(n)}` : `${c.clientes}/${n}`}
                      </td>
                    )
                  }
                  // Intensite bornee : au-dela de 40 % de retour, la case est
                  // deja pleine — inutile d'aller jusqu'au noir.
                  const a = r === 0 ? 0.14 : Math.min(0.85, (taux / 40) * 0.8)
                  return (
                    <td key={r} className="text-center text-[11px] font-semibold tabular-nums rounded"
                      style={{ background: `rgba(42,120,214,${a})`, color: a > 0.45 ? '#fff' : V.ink }}
                      title={`${c.clientes} cliente(s) sur ${n} — ${nf(c.ca)} MAD`}>
                      {r === 0 ? '100 %' : `${taux.toFixed(0)} %`}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ── Chemins ──────────────────────────────────────────────────────────────── */

export type PasChemin = { de: string; vers: string; n: number }

export function Chemins({ pas, onDepart }: { pas: PasChemin[]; onDepart?: (p: string) => void }) {
  if (pas.length === 0) return <p className={T.note} style={{ color: V.muted }}>Aucun enchaînement.</p>
  const max = Math.max(...pas.map((p) => p.n), 1)
  // Grille a colonnes fixes plutot que des `flex-1` qui se disputent la place :
  // la premiere version centrait les paires au milieu d'un grand vide, avec les
  // barres rejetees a droite. On lit une liste, pas une constellation.
  return (
    <div className="space-y-1 max-w-[760px]">
      {pas.map((p, i) => (
        <div key={i} className="grid items-center gap-2"
          style={{ gridTemplateColumns: 'minmax(0,1fr) 12px minmax(0,1fr) 90px 42px' }}>
          <span className="text-[12px] truncate" style={{ color: V.ink2 }} title={p.de}>{p.de}</span>
          <span className="text-[11px] text-center" style={{ color: V.muted }} aria-hidden="true">→</span>
          <button
            onClick={() => onDepart?.(p.vers)}
            disabled={!onDepart || p.vers.startsWith('(')}
            className="text-[12px] truncate text-left disabled:cursor-default hover:underline"
            style={{ color: V.ink }} title={p.vers}
          >
            {p.vers}
          </button>
          <div className="h-1.5 rounded-sm" style={{ background: V.grid }}>
            <div className="rp-bar h-full rounded-sm" style={{ width: `${(p.n / max) * 100}%`, background: V.s1 }} />
          </div>
          <span className="text-[12px] tabular-nums text-right" style={{ color: V.ink }}>{nf(p.n)}</span>
        </div>
      ))}
    </div>
  )
}
