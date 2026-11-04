'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { ComponentType } from 'react'
import { V, MARQUE } from './Viz'

/**
 * UN ONGLET D'ANALYSE = UNE QUESTION, ET SES VUES.
 *
 * Onze onglets rangeaient les données par type ; sept en posent la question :
 * « que font les visiteuses aujourd'hui », « ce que rapporte la pub », « où le parcours
 * décroche », « que cherchent-elles et que voient-elles », « reviennent-elles ». Les vues d'une même
 * question sont ici des sous-onglets, qui gardent la période, les segments et la comparaison.
 *
 * La vue vit dans l'URL (`?vue=`) : elle se partage et « retour » fonctionne. La première vue est la
 * vue par défaut et n'écrit rien dans l'adresse.
 */
export type VueGroupe = { cle: string; label: string; Composant: ComponentType }

export function GroupeVues({ vues }: { vues: VueGroupe[] }) {
  const pathname = usePathname()
  const sp = useSearchParams()
  const active = vues.find((v) => v.cle === sp.get('vue')) ?? vues[0]

  const lien = (cle: string) => {
    const p = new URLSearchParams(sp.toString())
    if (cle === vues[0].cle) p.delete('vue'); else p.set('vue', cle)
    const q = p.toString()
    return q ? `${pathname}?${q}` : pathname
  }

  return (
    <>
      {vues.length > 1 && (
        <div className="max-w-[1140px] mx-auto px-4 pt-4 sm:px-5">
          <div role="tablist" aria-label="Vues" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl p-1" style={{ background: MARQUE.carte, border: `1px solid ${MARQUE.carteLigne}`, boxShadow: MARQUE.ombre }}>
            {vues.map((v) => {
              const on = v.cle === active.cle
              return (
                <Link key={v.cle} href={lien(v.cle)} role="tab" aria-selected={on} scroll={false}
                  className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors hover:bg-black/[0.04]"
                  style={on ? { background: MARQUE.roseFond, color: MARQUE.roseDim, boxShadow: `inset 0 0 0 1px ${MARQUE.roseLigne}` } : { color: V.ink2 }}>
                  {v.label}
                </Link>
              )
            })}
          </div>
        </div>
      )}
      <active.Composant key={active.cle} />
    </>
  )
}
