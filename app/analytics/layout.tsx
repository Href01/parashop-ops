'use client'

import { Suspense, type ReactNode } from 'react'
import BosShell from '@/components/BosShell'

/**
 * La coque du BOS autour des onze modules d'analyse.
 *
 * Elle est ici et non dans chaque page pour une raison simple : sur la boutique
 * ces modules heritaient du gabarit `/admin` sans le declarer, et les recopier
 * onze fois aurait garanti qu'un jour l'un d'eux derive.
 *
 * `Suspense` est OBLIGATOIRE, pas decoratif : la navigation entre modules lit
 * la periode et les segments dans l'URL via `useSearchParams`, et Next refuse
 * de prerendre un arbre client qui l'appelle sans limite de suspension. Sans
 * cette barriere, le build casse — ou pire, la page entiere bascule en rendu
 * dynamique et perd son cache.
 */
export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  return (
    <BosShell active="analytics" title="Analytics" crumb="Aperçu">
      {/* `analytique` porte deux choses (voir globals.css) : le retablissement
          du reset de bordures de Tailwind, et la toile BLANCHE sur laquelle
          ces modules ont ete dessines. Le BOS pose des cartes blanches sur un
          fond teinte ; l'analyse, elle, n'a pas de carte englobante et se
          retrouvait donc a flotter directement sur le rose. */}
      <div className="analytique" style={{ background: '#fff', minHeight: '100%' }}>
        <Suspense fallback={<div style={{ padding: 24, fontSize: 13, color: 'var(--tx-lo)' }}>Chargement…</div>}>
          {children}
        </Suspense>
      </div>
    </BosShell>
  )
}
