'use client'

/**
 * LA CHAINE DE L'ARGENT — la refonte de logique, pas de mise en forme.
 *
 * L'ancienne page etait organisee par TYPE DE DONNEE : ventes, parcours,
 * produits, acquisition, comportement, fidelite. C'est l'organisation d'une base
 * de donnees, pas celle d'une decision. On y lisait trente cartes de meme poids
 * et on en ressortait avec trente constats et aucune action.
 *
 * Une boutique en paiement a la livraison vit une seule equation :
 *
 *   publicite depensee -> visiteuses -> commandes passees -> commandes LIVREES
 *                                                                  -> marge
 *
 * Chaque fleche est un rendement, et chaque rendement est une perte quand il est
 * mauvais. Le tableau de bord doit donc suivre cette chaine, maillon par maillon,
 * et chiffrer les pertes EN DIRHAMS — pas en sessions ni en pourcentages, parce
 * qu'on n'arbitre pas un budget avec un taux de rebond.
 *
 * Trois principes appliques partout :
 *   1. tout est ramene au LIVRE, jamais au commande — en COD, une commande
 *      passee n'est pas une vente ;
 *   2. un chiffre sans point de comparaison est du bruit : tout se lit contre la
 *      periode precedente ;
 *   3. les anomalies remontent d'elles-memes ; on ne les cherche pas dans trente
 *      cartes.
 */

import { V } from './Viz'

const mad = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} MAD`
const nf = (n: number) => Math.round(n).toLocaleString('fr-FR')
/* Virgule decimale : le reste de la page est en francais, « 77.0 % » y detonne. */
const pct = (n: number) => `${n.toFixed(1).replace('.', ',')} %`

export type Maillon = {
  label: string
  value: number
  /** Format d'affichage : un nombre de personnes ne se lit pas comme un montant. */
  kind: 'num' | 'mad'
  /** Rendement depuis le maillon precedent, en %. */
  rendement?: number | null
  /**
   * Sous quel rendement ce maillon precis est anormal. PROPRE A CHAQUE MAILLON :
   * un seuil unique peindrait en rouge une conversion de 1,8 % (parfaitement
   * normale en e-commerce) a cote d'une livraison de 47 % (catastrophique). Une
   * couleur qui s'allume toujours ne veut plus rien dire — on la laisse absente
   * par defaut, et elle ne s'allume que la ou une decision est vraiment due.
   */
  seuilBas?: number | null
  /** Ce que le maillon precedent a perdu ici, deja converti en dirhams. */
  perteMad?: number | null
  note?: string
}

/**
 * La chaine, en une ligne lisible de gauche a droite. Pas de graphique : ce sont
 * cinq valeurs et quatre transitions, une figure les rendrait moins claires.
 *
 * Deux contraintes de mise en page qui ne se voient qu'a l'ecran :
 *   - desktop : la ligne de transition occupe une bande de hauteur FIXE, presente
 *     meme sur le premier maillon (vide), sinon la premiere colonne remonte et
 *     les cinq libelles ne sont plus sur la meme ligne ;
 *   - mobile : le pourcentage vit dans une gouttiere de largeur FIXE, sinon
 *     chaque valeur demarre a une abscisse differente et la colonne part en
 *     escalier.
 */
export function MoneyChain({ maillons }: { maillons: Maillon[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex flex-col lg:flex-row lg:items-stretch gap-0">
        {maillons.map((m, i) => {
          const faible = m.seuilBas != null && m.rendement != null && m.rendement < m.seuilBas
          const teinte = faible || m.value < 0 ? V.critical : V.ink
          return (
            <div key={m.label} className="flex lg:flex-col lg:flex-1 min-w-0">
              {/* La transition depuis le maillon precedent : c'est ELLE qui porte
                  l'information utile, pas la valeur absolue. */}
              <div className="w-[62px] flex-shrink-0 lg:w-auto flex items-center lg:items-stretch lg:h-4 lg:pb-1">
                {i > 0 ? (
                  <>
                    <div className="hidden lg:flex items-center gap-1.5 w-full">
                      <div className="h-px flex-1" style={{ background: V.grid }} />
                      {m.rendement != null && (
                        <span className="text-[10px] font-bold tabular-nums whitespace-nowrap"
                          style={{ color: faible ? V.critical : V.muted }}>
                          {pct(m.rendement)}
                        </span>
                      )}
                      <div className="h-px flex-1" style={{ background: V.grid }} />
                    </div>
                    <span className="lg:hidden text-[10px] font-bold tabular-nums w-full text-right pr-2"
                      style={{ color: faible ? V.critical : V.muted }}>
                      {m.rendement != null ? `↓ ${pct(m.rendement)}` : ''}
                    </span>
                  </>
                ) : (
                  <div className="w-full" aria-hidden="true" />
                )}
              </div>
              <div className="flex-1 min-w-0 lg:px-1 py-1.5 lg:py-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider truncate" style={{ color: V.muted }}>
                  {m.label}
                </p>
                <p className="text-[19px] font-black leading-tight tabular-nums" style={{ color: teinte }}>
                  {m.kind === 'mad' ? mad(m.value) : nf(m.value)}
                </p>
                {m.perteMad != null && m.perteMad > 0 && (
                  // La perte chiffree : « 861 visiteuses perdues » ne declenche
                  // aucune decision ; « ~2 400 MAD manques ici » si.
                  <p className="text-[10px] font-semibold tabular-nums" style={{ color: V.critical }}>
                    −{mad(m.perteMad)} perdus ici
                  </p>
                )}
                {m.note && <p className="text-[10px] leading-snug mt-0.5" style={{ color: V.muted }}>{m.note}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export type Signal = {
  gravite: 'critique' | 'attention' | 'bon'
  titre: string
  detail: string
  /** Impact estime en dirhams — sert a CLASSER, pas a decorer. */
  impact?: number
}

/**
 * Ce qui a change — la detection remplace la recherche.
 *
 * Trente cartes obligent a chercher l'anomalie. Ici elle se presente, classee par
 * impact en dirhams. Trois signaux au maximum : au-dela, on retombe dans une
 * liste a lire, et une liste a lire n'est pas une decision.
 */
export function Signaux({ signaux }: { signaux: Signal[] }) {
  const tri = { critique: 0, attention: 1, bon: 2 }
  const top = [...signaux]
    .sort((a, b) => tri[a.gravite] - tri[b.gravite] || (b.impact ?? 0) - (a.impact ?? 0))
    .slice(0, 3)

  if (top.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <p className="text-xs" style={{ color: V.muted }}>Rien d&apos;anormal sur la période.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {top.map((s, i) => {
        const c = s.gravite === 'critique' ? V.critical : s.gravite === 'attention' ? V.warning : V.good
        const fond = s.gravite === 'critique' ? '#fdf2f2' : s.gravite === 'attention' ? '#fdf8ec' : '#f1faf1'
        // Icone ET libelle : la couleur ne porte jamais le sens seule.
        const icone = s.gravite === 'critique' ? '▲' : s.gravite === 'attention' ? '●' : '✓'
        return (
          <div key={i} className="rounded-xl border px-3.5 py-2.5"
            style={{ background: fond, borderColor: `${c}33` }}>
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-black flex-shrink-0" style={{ color: c }} aria-hidden="true">{icone}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold leading-snug" style={{ color: V.ink }}>{s.titre}</p>
                <p className="text-[11px] leading-snug mt-0.5" style={{ color: V.ink2 }}>{s.detail}</p>
              </div>
              {s.impact != null && s.impact > 0 && (
                <span className="text-xs font-black tabular-nums flex-shrink-0" style={{ color: c }}>
                  {mad(s.impact)}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
