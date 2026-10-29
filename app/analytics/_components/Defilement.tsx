'use client'

/**
 * UNE ZONE QUI DEFILE EN LARGEUR, ET QUI LE DIT.
 *
 * Sur un telephone, trois choses du tableau de bord depassaient de l'ecran sans
 * aucun indice : la barre de periode (« Mois dernier » et « Dates… » inatteignables),
 * les onglets (3 sur 11 visibles) et les tableaux (seule la premiere colonne de
 * chiffres, le reste hors cadre). Une barre de defilement masquee est une porte
 * sans poignee : on ne peut pas ouvrir ce dont on ignore l'existence.
 *
 * Ce composant estompe le bord ou il reste du contenu, et seulement celui-la. Il
 * disparait de lui-meme quand tout tient (ecran large) : aucun reglage par page.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

const LARGEUR_FONDU = 28

export function ZoneDefilante({
  children, className = '', style,
}: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const [bords, setBords] = useState({ gauche: false, droite: false })

  const mesurer = useCallback(() => {
    const el = ref.current
    if (!el) return
    const gauche = el.scrollLeft > 2
    const droite = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setBords((b) => (b.gauche === gauche && b.droite === droite ? b : { gauche, droite }))
  }, [])

  useEffect(() => {
    mesurer()
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(mesurer)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [mesurer])

  const noir = '#000', clair = 'transparent'
  const masque = bords.gauche || bords.droite
    ? `linear-gradient(to right, ${bords.gauche ? clair : noir} 0, ${noir} ${LARGEUR_FONDU}px, ${noir} calc(100% - ${LARGEUR_FONDU}px), ${bords.droite ? clair : noir} 100%)`
    : undefined

  return (
    <div
      ref={ref}
      onScroll={mesurer}
      className={`overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      style={{ ...style, maskImage: masque, WebkitMaskImage: masque }}
    >
      {children}
    </div>
  )
}
