'use client'

/**
 * LES PRIMITIVES DE DECISION.
 *
 * `Viz.tsx` porte les figures (courbe, entonnoir, barres). Celles-ci portent la
 * LECTURE : la cascade qui designe le responsable d'une variation, le taux qui
 * refuse de conclure quand l'effectif ne le permet pas, le bandeau qui previent
 * qu'un chiffre est encore provisoire, et le repli qui range les preuves sans
 * les supprimer.
 *
 * Charte typographique — trois niveaux, pas six. L'ancienne page melangeait 10,
 * 11, 12, 13, 14 et 20 px sans regle : rien n'y disait ce qui comptait.
 *
 *   T.hero   44 px  le chiffre qui decide          (un seul par ecran)
 *   T.lever  20 px  la reponse d'un levier         (trois par ecran)
 *   T.body   13 px  les tableaux et les preuves
 *
 * Une seule couleur d'accent, et deux semantiques (alerte / bon) reprises de la
 * palette deja validee daltonisme dans Viz.tsx. Le violet et le rose de
 * l'ancienne page sont retires : trois accents sans rapport ne hierarchisent
 * rien, ils decorent.
 */

import { useState, type ReactNode } from 'react'
import { V } from './Viz'

export const T = {
  hero: 'text-[40px] leading-[1.05] font-black tracking-tight tabular-nums',
  lever: 'text-[20px] leading-tight font-bold tabular-nums',
  body: 'text-[13px] leading-snug',
  label: 'text-[11px] font-semibold uppercase tracking-wider',
  note: 'text-[11px] leading-snug',
} as const

export const mad = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} MAD`
export const nf = (n: number) => Math.round(n).toLocaleString('fr-FR')
export const pctf = (n: number, d = 1) => `${n.toFixed(d).replace('.', ',')} %`
export const signed = (n: number) => `${n >= 0 ? '+' : '−'}${mad(Math.abs(n))}`

/* ── Taux avec garde-fou d'effectif ───────────────────────────────────────────
   64 commandes decoupees par ville, canal et appareil : un « 67 % » calcule sur
   3 commandes n'est pas un constat, c'est du hasard mis en forme.

   La distinction qui compte : UN EFFECTIF EST UN FAIT, UN TAUX EST UNE
   INFERENCE. On montre donc toujours le rapport brut — « 20/22 » est vrai quel
   que soit l'effectif — et on retient seulement le POURCENTAGE, qui pretend
   generaliser. La premiere version affichait « 22 obs. — trop peu pour
   conclure » a la place du rapport : elle cachait un fait pour eviter une
   inference, et remplissait la colonne de texte sur trois lignes. */
export function Taux({ pct, n, d, suffixe }: { pct: number | null; n: number; d: number; suffixe?: string }) {
  if (pct == null) {
    return (
      <span className="tabular-nums whitespace-nowrap" style={{ color: V.ink }}
        title={`${n} sur ${d} — sous 30 observations, le pourcentage n'est pas interprétable`}>
        {nf(n)}/{nf(d)}
        <span className={T.note} style={{ color: V.muted }}> n&lt;30</span>
      </span>
    )
  }
  return (
    <span className="tabular-nums whitespace-nowrap" style={{ color: V.ink }}>
      {pctf(pct)}{suffixe ? ` ${suffixe}` : ''}
      <span className={T.note} style={{ color: V.muted }}> {nf(n)}/{nf(d)}</span>
    </span>
  )
}

/* ── Bandeau de maturite ──────────────────────────────────────────────────────
   Le delai median commande -> livraison est de 1,4 jour : les commandes des
   derniers jours sont encore en vol et leur taux de livraison ne peut que
   monter. L'afficher sans le dire fait passer un provisoire pour un resultat. */
export function Maturite({ enVol, total, pctResolu }: { enVol: number; total: number; pctResolu: number }) {
  if (enVol === 0) return null
  return (
    <p className={T.note} style={{ color: V.ink2 }}>
      <span aria-hidden="true">◷</span>{' '}
      <b>{nf(enVol)}</b> commande{enVol > 1 ? 's' : ''} sur {nf(total)} {enVol > 1 ? 'sont' : 'est'} encore en cours de livraison —
      le taux de livraison ci-dessous ne peut que monter ({pctf(pctResolu, 0)} du sort connu).
    </p>
  )
}

/* ── La cascade de decomposition ──────────────────────────────────────────────
   La piece qui manquait. « La marge a monte de 2 146 MAD » ne dit rien ; « le
   volume a apporte +4 070, la livraison a coute −1 432, la marge unitaire +781
   et la publicite −1 273 » designe l'endroit ou agir.

   Forme : barres horizontales flottantes, alignees sur un zero commun, dans
   l'ordre du calcul. Pas de camembert, pas de couleur de serie — seulement le
   signe, qui est la seule information a lire d'un coup d'oeil. */
export type FacteurVue = { label: string; effet: number; de: string; a: string }

export function Cascade({
  depart, arrivee, facteurs, labelDepart, labelArrivee,
}: {
  depart: number; arrivee: number; facteurs: FacteurVue[]
  labelDepart: string; labelArrivee: string
}) {
  const ampleur = Math.max(...facteurs.map((f) => Math.abs(f.effet)), 1)
  // 50 % de la largeur de chaque cote du zero central.
  const largeur = (v: number) => `${(Math.abs(v) / ampleur) * 46}%`

  return (
    <div className="w-full">
      <Ligne label={labelDepart} valeur={mad(depart)} fort />
      <div className="my-1.5 space-y-1.5">
        {facteurs.map((f) => {
          const positif = f.effet >= 0
          const c = positif ? V.good : V.critical
          return (
            <div key={f.label} className="flex items-center gap-3">
              {/* Pas de `truncate` : « Volume de command… » ne veut rien dire.
                  Le libelle passe a la ligne, la ligne grandit — c'est le bon
                  arbitrage quand il n'y a que quatre facteurs. */}
              <div className="w-[46%] min-w-0 sm:w-[34%]">
                <p className={`${T.body} font-semibold`} style={{ color: V.ink }}>{f.label}</p>
                <p className={T.note} style={{ color: V.muted }}>{f.de} → {f.a}</p>
              </div>
              {/* Le zero est au centre : un effet negatif part a gauche, un
                  positif a droite. On lit le signe avant de lire le chiffre. */}
              <div className="flex-1 flex items-center min-w-0" aria-hidden="true">
                <div className="w-1/2 flex justify-end">
                  {!positif && <div className="h-3.5 rounded-l" style={{ width: largeur(f.effet), background: c }} />}
                </div>
                <div className="w-px h-4 flex-shrink-0" style={{ background: V.axis }} />
                <div className="w-1/2">
                  {positif && <div className="h-3.5 rounded-r" style={{ width: largeur(f.effet), background: c }} />}
                </div>
              </div>
              <span className={`${T.body} font-bold tabular-nums text-right w-[86px] flex-shrink-0`} style={{ color: c }}>
                {signed(f.effet)}
              </span>
            </div>
          )
        })}
      </div>
      <Ligne label={labelArrivee} valeur={mad(arrivee)} fort />
    </div>
  )
}

function Ligne({ label, valeur, fort }: { label: string; valeur: string; fort?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-t" style={{ borderColor: V.grid }}>
      <span className={`${T.body} ${fort ? 'font-bold' : ''}`} style={{ color: V.ink }}>{label}</span>
      <span className={`${T.body} font-black tabular-nums`} style={{ color: V.ink }}>{valeur}</span>
    </div>
  )
}

/* ── Barre de segment ─────────────────────────────────────────────────────────
   `_device`, `_locale` et `_source` sont presents sur 100 % des evenements et
   n'etaient exploites nulle part. Cette barre re-filtre toute la page — c'est
   l'ajout le plus visible du chantier, et il ne coute que du SQL. */
export type SegmentEtat = { device?: string; locale?: string; source?: string }

export function BarreSegment({
  etat, onChange, options,
}: {
  etat: SegmentEtat
  onChange: (s: SegmentEtat) => void
  options: { device: string[]; locale: string[]; source: string[] }
}) {
  const groupes: Array<{ cle: keyof SegmentEtat; titre: string; valeurs: string[]; libelle: (v: string) => string }> = [
    { cle: 'device', titre: 'Appareil', valeurs: options.device, libelle: (v) => (v === 'mobile' ? 'Mobile' : v === 'desktop' ? 'Ordinateur' : v) },
    { cle: 'locale', titre: 'Langue', valeurs: options.locale, libelle: (v) => (v === 'fr' ? 'Français' : v === 'ar' ? 'العربية' : v) },
    { cle: 'source', titre: 'Origine', valeurs: options.source, libelle: (v) => v.charAt(0).toUpperCase() + v.slice(1) },
  ]
  const actif = Object.values(etat).some(Boolean)

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {groupes.filter((g) => g.valeurs.length > 1).map((g) => (
        <div key={g.cle} className="flex items-center gap-1.5">
          <span className={T.note} style={{ color: V.muted }}>{g.titre}</span>
          <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${V.grid}` }}>
            {['', ...g.valeurs].map((v) => {
              const on = (etat[g.cle] ?? '') === v
              return (
                <button
                  key={v || 'tous'}
                  onClick={() => onChange({ ...etat, [g.cle]: v || undefined })}
                  className="px-2.5 py-1 text-[11px] font-semibold transition-colors"
                  style={{
                    background: on ? V.ink : 'transparent',
                    color: on ? '#fff' : V.ink2,
                  }}
                >
                  {v ? g.libelle(v) : 'Tout'}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {actif && (
        <button onClick={() => onChange({})} className="text-[11px] font-semibold underline" style={{ color: V.muted }}>
          tout réafficher
        </button>
      )}
    </div>
  )
}

/* ── Repli des preuves ────────────────────────────────────────────────────────
   29 cartes au meme poids obligent a chercher. On en montre six et on range le
   reste ici : rien n'est supprime, tout est a un clic, et la ligne de resume
   suffit le plus souvent. */
export function Repli({
  titre, resume, defaut = false, children,
}: {
  titre: string; resume?: string; defaut?: boolean; children: ReactNode
}) {
  const [ouvert, setOuvert] = useState(defaut)
  return (
    <div className="border-t" style={{ borderColor: V.grid }}>
      <button
        onClick={() => setOuvert((o) => !o)}
        className="w-full flex items-baseline gap-2 py-3 text-left group"
        aria-expanded={ouvert}
      >
        <span className="text-[10px] w-3 flex-shrink-0 transition-transform" style={{ color: V.muted }} aria-hidden="true">
          {ouvert ? '▾' : '▸'}
        </span>
        <span className={`${T.body} font-bold`} style={{ color: V.ink }}>{titre}</span>
        {resume && <span className={`${T.note} truncate`} style={{ color: V.muted }}>{resume}</span>}
      </button>
      {ouvert && <div className="pb-5 pl-5">{children}</div>}
    </div>
  )
}

/* ── Tableau compact ──────────────────────────────────────────────────────────
   Remplace le champ `extra` des anciennes listes, qui empilait quatre metriques
   dans une chaine de texte : « 12 u. · 210 MAD/u · 18 % du CA · 4 % conv ».
   C'etait un tableau deguise en phrase. Ici les colonnes sont alignees, les
   nombres tabulaires, et la comparaison verticale redevient possible. */
export type Colonne<R> = {
  cle: string
  titre: string
  align?: 'left' | 'right'
  rendu: (r: R) => ReactNode
  /** Largeur fixe pour les colonnes numeriques — evite le ballet des colonnes. */
  largeur?: string
}

export function Tableau<R>({
  lignes, colonnes, vide = 'Aucune donnée sur la période.', max,
}: {
  lignes: R[]; colonnes: Colonne<R>[]; vide?: string; max?: number
}) {
  const [tout, setTout] = useState(false)
  if (lignes.length === 0) return <p className={T.note} style={{ color: V.muted }}>{vide}</p>
  const visibles = max && !tout ? lignes.slice(0, max) : lignes

  // Un tableau a 4 colonnes ou plus ne tient pas dans 390 px : sans largeur
  // minimale il s'ECRASE au lieu de defiler, et les cellules se touchent
  // (« paymentunmount »). On le fait donc deborder, et le conteneur defile.
  const largeurMin = colonnes.length >= 4 ? `${140 + (colonnes.length - 1) * 92}px` : undefined

  return (
    <>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: largeurMin }}>
          <thead>
            <tr>
              {colonnes.map((c) => (
                <th
                  key={c.cle}
                  className={`${T.note} font-semibold pb-1.5 ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                  style={{ color: V.muted, width: c.largeur, borderBottom: `1px solid ${V.grid}` }}
                >
                  {c.titre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((l, i) => (
              <tr key={i}>
                {colonnes.map((c) => (
                  <td
                    key={c.cle}
                    className={`${T.body} py-1.5 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}
                    style={{ color: V.ink, borderBottom: `1px solid ${V.grid}` }}
                  >
                    {c.rendu(l)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {max && lignes.length > max && (
        <button onClick={() => setTout((t) => !t)} className="mt-2 text-[11px] font-semibold underline" style={{ color: V.muted }}>
          {tout ? 'réduire' : `voir les ${lignes.length - max} autres`}
        </button>
      )}
    </>
  )
}

/* ── Le levier ────────────────────────────────────────────────────────────────
   Une carte = une question = un chiffre = une action. Le titre est la question,
   pas le nom de la table. */
export function Levier({
  question, reponse, ton = 'neutre', detail, children,
}: {
  question: string
  reponse: string
  ton?: 'neutre' | 'bon' | 'alerte'
  detail?: ReactNode
  children?: ReactNode
}) {
  const c = ton === 'bon' ? V.good : ton === 'alerte' ? V.critical : V.ink
  return (
    <section className="py-5 border-t" style={{ borderColor: V.grid }}>
      <p className={T.label} style={{ color: V.muted }}>{question}</p>
      <p className={`${T.lever} mt-1`} style={{ color: c }}>{reponse}</p>
      {detail && <div className={`${T.note} mt-1`} style={{ color: V.ink2 }}>{detail}</div>}
      {children && <div className="mt-3.5">{children}</div>}
    </section>
  )
}
