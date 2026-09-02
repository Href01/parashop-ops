'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
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
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({
      behavior: 'smooth', block: 'nearest', inline: 'center',
    })
  }, [pathname])

  return (
    <nav ref={navRef}
      className="flex min-h-10 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Modules d'analyse">
      {MODULES.map((m) => {
        const actif = m.href === '/analytics' ? pathname === m.href : pathname.startsWith(m.href)
        return (
          <Link
            key={m.href}
            href={`${m.href}${suffixe}`}
            aria-current={actif ? 'page' : undefined}
            className="min-h-10 px-3 py-2 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors"
            style={{ borderColor: actif ? V.ink : 'transparent', color: actif ? V.ink : V.muted }}
          >
            {m.label}
          </Link>
        )
      })}
      {/* L'onglet « ancien tableau » a ete retire avec la page qu'il ouvrait.
          Ses trois sections sans equivalent direct ont ete verifiees avant :
          « refus par ville » et « commandes par statut » se composent dans
          Explorer (ville et statut sont des dimensions declarees), les frictions
          OTP et les clics de rage sont dans Qualite, et le stock a sa propre
          page. Garder un onglet vers un doublon fige, c'est garantir qu'un jour
          on lira deux chiffres differents pour la meme question. */}
    </nav>
  )
}
