'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { MODULES } from './Report'
import { V } from './Viz'

/**
 * Navigation par CYCLE DE VIE, façon GA4 : acquisition → engagement →
 * conversion → rétention, puis les vues transverses. L'ancien menu rangeait par
 * type de donnée (Pulse / Catalogue / Clientes), ce qui n'aide pas à savoir où
 * chercher : on ne se demande pas « où sont les données clientes », on se
 * demande « est-ce qu'elles reviennent ».
 *
 * Les réglages voyagent d'un module à l'autre : période, comparaison, base et
 * segments vivent dans l'URL, et les liens les conservent. Changer d'onglet ne
 * doit pas remettre à zéro ce qu'on vient de régler.
 */
export default function AnalyticsNav() {
  const pathname = usePathname()
  const sp = useSearchParams()
  const suffixe = sp.toString() ? `?${sp.toString()}` : ''

  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="Modules d'analyse">
      {MODULES.map((m) => {
        const actif = m.href === '/analytics' ? pathname === m.href : pathname.startsWith(m.href)
        return (
          <Link
            key={m.href}
            href={`${m.href}${suffixe}`}
            className="px-3 py-2 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors"
            style={{ borderColor: actif ? V.ink : 'transparent', color: actif ? V.ink : V.muted }}
          >
            {m.label}
          </Link>
        )
      })}
      <Link
        href="/analytics/legacy"
        className="px-3 py-2 text-[12px] whitespace-nowrap border-b-2 -mb-px ms-auto"
        style={{ borderColor: pathname.startsWith('/analytics/legacy') ? V.ink : 'transparent', color: V.muted }}
        title="L'ancien tableau de bord, conservé le temps de la transition."
      >
        ancien tableau
      </Link>
    </nav>
  )
}
