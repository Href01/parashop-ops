'use client'

/**
 * L'ETAT PARTAGE DE TOUS LES RAPPORTS — periode, comparaison, base, filtres.
 *
 * Trois choses en decoulent, et c'est pour elles qu'il existe :
 *
 *  1. TOUT VIT DANS L'URL. Une vue se partage par lien, se met en favori, et le
 *     bouton « retour » du navigateur refait ce qu'on attend. C'est ce qui
 *     manquait le plus : chaque reglage se perdait au changement de page.
 *  2. LA COMPARAISON EST UN AXE, pas une colonne. Elle est portee ici, donc
 *     chaque module l'applique sans y penser — comme les comparaisons GA4.
 *  3. UNE SEULE DEFINITION DE PERIODE pour tous les modules : impossible que
 *     deux pages parlent de deux fenetres differentes sans le dire.
 */

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export type Basis = 'cohorte' | 'cash'
export type ModeComparaison = 'aucune' | 'precedente'

const TZ = 'Africa/Casablanca'

function aujourdHui(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
}

function decale(date: string, jours: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + jours)
  return d.toISOString().slice(0, 10)
}

/** Dernier jour du mois d'une date `AAAA-MM-JJ`. */
function dernierJour(annee: number, mois: number): number {
  return new Date(Date.UTC(annee, mois, 0)).getUTCDate()
}

/** Vrai si la période couvre exactement un mois civil, du 1er au dernier jour. */
export function estMoisComplet(debut: string, fin: string): boolean {
  const [a1, m1, j1] = debut.split('-').map(Number)
  const [a2, m2, j2] = fin.split('-').map(Number)
  return a1 === a2 && m1 === m2 && j1 === 1 && j2 === dernierJour(a1, m1)
}

/** Le mois civil qui précède celui de `date`. */
export function moisPrecedentDe(date: string): { debut: string; fin: string } {
  const [a, m] = date.split('-').map(Number)
  const annee = m === 1 ? a - 1 : a
  const mois = m === 1 ? 12 : m - 1
  const mm = String(mois).padStart(2, '0')
  return { debut: `${annee}-${mm}-01`, fin: `${annee}-${mm}-${String(dernierJour(annee, mois)).padStart(2, '0')}` }
}

export function joursEntre(debut: string, fin: string): number {
  return Math.max(1, Math.round((new Date(fin).getTime() - new Date(debut).getTime()) / 86400000) + 1)
}

export type EtatRapport = {
  periode: { debut: string; fin: string }
  /** null quand la comparaison est desactivee. */
  comparaison: { debut: string; fin: string } | null
  modeComparaison: ModeComparaison
  basis: Basis
  jours: number
  /** Segments actifs, exprimes comme filtres du modele. */
  filtres: Array<{ dimension: string; valeurs: string[] }>
}

/**
 * Les raccourcis de periode.
 *
 * « Aujourd'hui » et « Hier » manquaient, alors que ce sont les deux plus
 * consultes : on ouvre un tableau de bord d'abord pour savoir ou en est la
 * journee. Attention a la lecture d'aujourd'hui — la comparaison porte sur hier,
 * qui est une journee COMPLETE face a une journee en cours : l'interface le dit
 * plutot que de laisser croire a un effondrement chaque matin.
 */
export const PERIODES = [
  { jours: 1, label: "Aujourd'hui" },
  { jours: 7, label: '7 j' },
  { jours: 30, label: '30 j' },
  { jours: 90, label: '90 j' },
  { jours: 365, label: '12 mois' },
] as const

/**
 * LES PERIODES DECALEES.
 *
 * « Hier » et « Mois dernier » ne sont pas des DUREES mais des periodes closes,
 * et c'est justement ce qui les rend utiles : une journee terminee se compare
 * honnetement a la precedente, alors qu'« Aujourd'hui » compare une journee en
 * cours a une journee complete. Elles ne pouvaient pas s'exprimer avec le seul
 * reglage `jours`, qui se termine toujours aujourd'hui.
 */
function moisPrecedent(): { debut: string; fin: string } {
  return moisPrecedentDe(aujourdHui())
}

export const PERIODES_DECALEES = [
  { cle: 'hier', label: 'Hier', calc: (): { debut: string; fin: string } => {
    const h = decale(aujourdHui(), -1)
    return { debut: h, fin: h }
  } },
  { cle: 'mois_dernier', label: 'Mois dernier', calc: moisPrecedent },
] as const

/** Laquelle de ces périodes closes est active, s'il y en a une. */
export function periodeDecaleeActive(etat: { periode: { debut: string; fin: string } }): string | null {
  for (const p of PERIODES_DECALEES) {
    const r = p.calc()
    if (r.debut === etat.periode.debut && r.fin === etat.periode.fin) return p.cle
  }
  return null
}

export function estAujourdHui(fin: string, jours: number): boolean {
  return jours === 1 && fin === aujourdHui()
}

/** Date du jour en heure du Maroc — exposee pour borner les selecteurs. */
export function dateDuJour(): string {
  return aujourdHui()
}

export function useReport() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const etat: EtatRapport = useMemo(() => {
    const fin = sp.get('fin') || aujourdHui()
    const jours = Math.min(Math.max(parseInt(sp.get('jours') || '30', 10) || 30, 1), 730)
    const debut = sp.get('debut') || decale(fin, -(jours - 1))
    const j = joursEntre(debut, fin)

    const mode: ModeComparaison = sp.get('cmp') === '0' ? 'aucune' : 'precedente'
    // La periode precedente colle a la courante, sans recouvrement d'un jour.
    //
    // EXCEPTION : un MOIS CIVIL COMPLET se compare au mois civil precedent, pas
    // aux N jours qui precedent. Juillet (31 jours) comparé « à même durée »
    // donnait « 31 mai → 30 juin » — une fenetre a cheval sur deux mois, qu'on
    // ne sait pas interpreter. Un mois se compare a un mois.
    const finPrec = decale(debut, -1)
    const comparaison = mode === 'aucune' ? null
      : estMoisComplet(debut, fin) ? moisPrecedentDe(debut)
      : { debut: decale(finPrec, -(j - 1)), fin: finPrec }

    const filtres: Array<{ dimension: string; valeurs: string[] }> = []
    for (const d of ['appareil', 'langue', 'canal', 'ville']) {
      const v = sp.get(d)
      if (v) filtres.push({ dimension: d, valeurs: v.split('|').filter(Boolean).slice(0, 8) })
    }

    return {
      periode: { debut, fin },
      comparaison,
      modeComparaison: mode,
      basis: sp.get('basis') === 'cash' ? 'cash' : 'cohorte',
      jours: j,
      filtres,
    }
  }, [sp])

  /** Modifie l'URL sans recharger : l'etat EST l'URL. */
  const maj = useCallback((patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') p.delete(k)
      else p.set(k, v)
    }
    router.replace(`${pathname}?${p.toString()}`, { scroll: false })
  }, [router, pathname, sp])

  const setJours = useCallback((jours: number) => {
    maj({ jours: String(jours), debut: null, fin: null })
  }, [maj])

  /** Periode choisie a la main. `debut` et `fin` prennent le pas sur `jours`. */
  const setPeriode = useCallback((debut: string, fin: string) => {
    if (!debut || !fin) return
    const [d, f] = debut <= fin ? [debut, fin] : [fin, debut]
    maj({ debut: d, fin: f, jours: String(joursEntre(d, f)) })
  }, [maj])

  /** Vrai quand l'utilisateur a fixe des bornes explicites. */
  const periodePersonnalisee = !!sp.get('debut') && !!sp.get('fin')

  const setFiltre = useCallback((dimension: string, valeurs: string[]) => {
    maj({ [dimension]: valeurs.length ? valeurs.join('|') : null })
  }, [maj])

  return { etat, maj, setJours, setPeriode, setFiltre, periodePersonnalisee, sp }
}

/** Appel du point d'entree unique. */
export async function interroger(body: unknown): Promise<{
  lignes: Array<{ cle: string; mesures: Record<string, { valeur: number | null; precedent?: number | null; n?: number; fiable?: boolean }> }>
  modele: {
    dimension: { cle: string; label: string; definition: string } | null
    mesures: Array<{ cle: string; label: string; definition: string; format: 'entier' | 'mad' | 'pourcent' | 'decimal'; portee: string; hausseEstBonne: boolean; seuil: number | null }>
  }
}> {
  const appeler = () => fetch('/api/ops/analytics/query', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  let res = await appeler()
  // Un seul nouvel essai, uniquement sur panne serveur. Les erreurs de requête
  // (400) restent visibles et on ne double jamais une lecture qui a réussi.
  if (res.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, 350))
    res = await appeler()
  }
  const json = await res.json().catch(() => ({ error: `Réponse illisible (${res.status})` }))
  if (!res.ok || json.error) throw new Error(json.error || `API ${res.status}`)
  return json
}
