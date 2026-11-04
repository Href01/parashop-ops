'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { ComponentType } from 'react'
import { V } from './Viz'

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
          <div role="tablist" aria-label="Vues" className="inline-flex max-w-full overflow-x-auto rounded-lg p-0.5" style={{ background: V.grid }}>
            {vues.map((v) => {
              const on = v.cle === active.cle
              return (
                <Link key={v.cle} href={lien(v.cle)} role="tab" aria-selected={on} scroll={false}
                  className="rounded-md px-3 py-1 text-[12px] font-semibold whitespace-nowrap"
                  style={on ? { background: '#fff', color: V.ink, boxShadow: '0 1px 2px rgba(0,0,0,.08)' } : { color: V.ink2 }}>
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
