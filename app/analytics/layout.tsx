'use client'

import { Suspense, type ReactNode } from 'react'
import BosShell from '@/components/BosShell'
import AnalyticsNav from './_components/AnalyticsNav'

/**
 * La coque commune aux onze modules, posee dans le BOS.
 *
 * Elle reprend TROIS choses de la coque d'origine, chacune indispensable :
 *   · `AnalyticsNav`, la barre d'onglets — sans elle on atterrit sur la Vue
 *     d'ensemble et plus rien n'est atteignable ;
 *   · la barre collante, pour changer de module sans remonter la page ;
 *   · le conteneur centre a 1 140 px : ces modules sont dessines pour une
 *     colonne de lecture, pas pour toute la largeur d'un ecran.
 *
 * `analytique` porte, lui, ce que le BOS impose en plus (voir globals.css) : le
 * retablissement du reset de bordures de Tailwind, et la toile BLANCHE. Le BOS
 * pose des cartes blanches sur un fond teinte ; l'analyse n'a pas de carte
 * englobante et flotterait donc sur le rose.
 *
 * `Suspense` est OBLIGATOIRE et non decoratif : la navigation lit la periode et
 * les segments dans l'URL via `useSearchParams`, que Next refuse de prerendre
 * sans limite de suspension.
 */
export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  return (
    <BosShell active="analytics" title="Analytics" crumb="Aperçu">
      <div className="analytique" style={{ background: '#fff', minHeight: '100%' }}>
        <div
          className="bg-white border-b sticky top-0 z-20"
          style={{ borderColor: '#e1e0d9' }}
        >
          <div className="max-w-[1140px] mx-auto px-5">
            <Suspense fallback={<div className="h-[38px]" />}>
              <AnalyticsNav />
            </Suspense>
          </div>
        </div>
        <Suspense
          fallback={
            <div className="max-w-[1140px] mx-auto px-5 py-8 text-[13px] text-gray-400">
              Chargement…
            </div>
          }
        >
          {children}
        </Suspense>
      </div>
    </BosShell>
  )
}
