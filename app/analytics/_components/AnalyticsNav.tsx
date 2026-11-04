'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { MODULES } from './Report'
import { ZoneDefilante } from './Defilement'
import { Activity, Compass, Megaphone, Route, Search, ShoppingBag, Users, type LucideIcon } from 'lucide-react'
import { V, MARQUE } from './Viz'
import { analyticsModuleHref } from '@/lib/analytics/navigation'

/** Une icône par onglet : on reconnaît l'onglet avant de le lire, et la barre a enfin un rythme visuel. */
const ICONES: Record<string, LucideIcon> = {
  '/analytics/sessions': Activity,
  '/analytics/acquisition': Megaphone,
  '/analytics/parcours': Route,
  '/analytics/catalogue': ShoppingBag,
  '/analytics/clientes': Users,
  '/analytics/seo': Search,
  '/analytics/explorer': Compass,
}

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
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({
      behavior: 'smooth', block: 'nearest', inline: 'center',
    })
  }, [pathname])

  return (
    // Onze onglets : sur un telephone trois sont visibles. Le bord estompe dit qu'il y en a d'autres.
    <ZoneDefilante>
    <nav ref={navRef}
      className="flex min-h-12 w-max min-w-full items-center gap-1"
      aria-label="Modules d'analyse">
      {MODULES.map((m, i) => {
        const actif = pathname.startsWith(m.href)
        // Un filet entre deux groupes : on lit « maintenant | performance | catalogue | outils » d'un coup d'oeil.
        const nouveauGroupe = i > 0 && MODULES[i - 1].groupe !== m.groupe
        return (
          <span key={m.href} className="contents">
            {nouveauGroupe && <span aria-hidden className="self-center mx-1 h-4 w-px shrink-0" style={{ background: V.grid }} />}
            <Link
              href={analyticsModuleHref(pathname, m.href, sp.toString())}
              aria-current={actif ? 'page' : undefined}
              className="my-1.5 inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors hover:bg-black/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={actif
                ? { background: MARQUE.roseFond, color: MARQUE.roseDim, boxShadow: `inset 0 0 0 1px ${MARQUE.roseLigne}` }
                : { color: V.ink2 }}
            >
              {(() => { const Icone = ICONES[m.href]; return Icone ? <Icone aria-hidden="true" size={15} strokeWidth={actif ? 2.4 : 2} /> : null })()}
              {m.label}
              {/* Sessions se met à jour toute seule : le point le dit, sans compteur à entretenir. */}
              {m.href === '/analytics/sessions' && (
                <span aria-hidden="true" title="Mis à jour en direct" className="size-1.5 rounded-full animate-pulse" style={{ background: V.good }} />
              )}
            </Link>
          </span>
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
    </ZoneDefilante>
  )
}
