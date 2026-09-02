'use client'

/**
 * EXPLORER — n'importe quelle dimension, n'importe quelles mesures.
 *
 * C'est l'apport de Looker, et l'aboutissement du modèle sémantique : puisque
 * chaque dimension et chaque mesure sont définies une fois, on peut les
 * combiner librement sans écrire une requête de plus. Les sept autres modules
 * sont des vues préréglées de ce même moteur ; celui-ci laisse la main.
 *
 * Le sélecteur de champs porte la DÉFINITION EN CLAIR de chaque mesure, au
 * survol. C'est ce qui tue la question « ça veut dire quoi, ce chiffre ? » — et
 * ça ne coûte rien, puisque la définition vient du modèle.
 *
 * Deux garde-fous que la liberté rend nécessaires :
 *  · une mesure absente de la source d'une dimension est désactivée ;
 *  · les taux sous le seuil d'effectif affichent leur effectif, ici comme
 *    ailleurs — explorer ne dispense pas d'être honnête.
 */

import { useEffect, useMemo, useState } from 'react'
import { V } from '../_components/Viz'
import { T } from '../_components/Decision'
import { ReportShell, DimensionTable, Squelette, ErreurChargement, type ColonneMesure, type LigneTable } from '../_components/Report'
import { BarreControle } from '../_components/Controls'
import { useReport, interroger } from '../_components/useReport'

type Champ = {
  cle: string; label: string; definition: string
  format?: 'entier' | 'mad' | 'pourcent' | 'decimal'
  portee?: string; source?: string; sources?: string[]; derivee?: boolean
}
type Reponse = Awaited<ReturnType<typeof interroger>>

const PORTEE_TITRE: Record<string, string> = {
  evenement: 'Comptées en événements',
  session: 'Comptées en sessions',
  personne: 'Comptées en personnes',
}

export default function Explorer() {
  const { etat, maj, setJours, setPeriode, setFiltre, periodePersonnalisee, sp } = useReport()
  const [catalogue, setCatalogue] = useState<{ dimensions: Champ[]; mesures: Champ[] } | null>(null)
  const [dimension, setDimension] = useState(sp.get('d') || 'canal')
  const [mesures, setMesures] = useState<string[]>(
    (sp.get('m') || 'commandes,livrees,caLivre,marge').split(',').filter(Boolean)
  )
  const [table, setTable] = useState<Reponse | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const mesuresActives = useMemo(() => {
    if (!catalogue) return mesures
    const sources = catalogue.dimensions.find((d) => d.cle === dimension)?.sources ?? []
    return mesures.filter((cle) => {
      const m = catalogue.mesures.find((x) => x.cle === cle)
      return !m?.source || sources.includes(m.source)
    })
  }, [catalogue, dimension, mesures])

  useEffect(() => {
    // Même règle : un catalogue vide sans explication laisse croire que le
    // modèle ne contient rien, alors que c'est l'appel qui a échoué.
    fetch('/api/ops/analytics/query').then((r) => r.json())
      .then((j) => { if (j.error) setErreur(j.error); else setCatalogue(j) })
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Catalogue indisponible'))
  }, [])

  // Le choix vit dans l'URL comme le reste : une exploration se partage.
  useEffect(() => { maj({ d: dimension, m: mesures.join(',') }) }, [dimension, mesures]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mesuresActives.length === 0) return
    let vivant = true
    interroger({
      periode: etat.periode, comparaison: etat.comparaison ?? undefined,
      basis: etat.basis, filtres: etat.filtres, dimension, mesures: mesuresActives, limite: 300,
    })
      .then((r) => { if (vivant) { setTable(r); setErreur(null) } })
      .catch((e) => vivant && setErreur(e instanceof Error ? e.message : 'Erreur'))
    return () => { vivant = false }
  }, [etat, dimension, mesuresActives])

  const colonnes: ColonneMesure[] = useMemo(
    () => (table?.modele.mesures ?? []).map((x) => ({
      cle: x.cle, label: x.label, definition: x.definition, format: x.format,
      portee: x.portee, hausseEstBonne: x.hausseEstBonne,
      derivee: (x as { derivee?: boolean }).derivee,
    })), [table])

  const basculer = (cle: string) => {
    const prochaines = mesures.includes(cle) ? mesures.filter((x) => x !== cle) : [...mesures, cle]
    if (prochaines.length === 0) setTable(null)
    setMesures(prochaines)
  }

  const sourcesDimension = catalogue?.dimensions.find((d) => d.cle === dimension)?.sources ?? []
  const compatible = (m: Champ) => !m.source || sourcesDimension.includes(m.source)
  const choisirDimension = (cle: string) => {
    const sources = catalogue?.dimensions.find((d) => d.cle === cle)?.sources ?? []
    setDimension(cle)
    const prochaines = mesures.filter((m) => {
      const champ = catalogue?.mesures.find((x) => x.cle === m)
      return !champ?.source || sources.includes(champ.source)
    })
    if (prochaines.length === 0) setTable(null)
    setMesures(prochaines)
  }

  /** Export CSV — point-virgule et virgule décimale, pour qu'Excel FR l'ouvre bien. */
  const exporter = () => {
    if (!table) return
    const entetes = [table.modele.dimension?.label ?? 'Dimension', ...colonnes.map((c) => c.label)]
    const lignes = (table.lignes as LigneTable[]).map((l) => [
      `"${l.cle.replace(/"/g, '""')}"`,
      ...colonnes.map((c) => {
        const v = l.mesures[c.cle]?.valeur
        return v == null ? '' : String(v).replace('.', ',')
      }),
    ])
    const csv = '﻿' + [entetes.join(';'), ...lignes.map((r) => r.join(';'))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics-${dimension}-${etat.periode.debut}-${etat.periode.fin}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const parPortee = useMemo(() => {
    const g: Record<string, Champ[]> = {}
    for (const m of catalogue?.mesures ?? []) {
      const k = m.portee ?? 'evenement'
      ;(g[k] = g[k] || []).push(m)
    }
    return g
  }, [catalogue])

  return (
    <ReportShell
      titre="Explorer"
      sous="Croisez n'importe quelle dimension avec n'importe quelles mesures. Les autres modules sont des vues préréglées de ce même moteur."
      controles={<BarreControle etat={etat} maj={maj} setJours={setJours} setPeriode={setPeriode}
        setFiltre={setFiltre} periodePersonnalisee={periodePersonnalisee} />}
      enTete={erreur ? <ErreurChargement message={erreur} /> : null}
      figure={
        <div className="grid lg:grid-cols-[220px_1fr] gap-6">
          {/* Le sélecteur de champs, façon Looker : groupé, avec la définition
              au survol de chaque libellé. */}
          <div>
            <p className={T.label} style={{ color: V.muted }}>Dimension</p>
            <select aria-label="Dimension à explorer" value={dimension} onChange={(e) => choisirDimension(e.target.value)}
              className="w-full mt-1.5 text-[12px] font-semibold rounded-lg px-2 py-1.5 outline-none"
              style={{ border: `1px solid ${V.grid}`, color: V.ink, background: '#fff' }}>
              {(catalogue?.dimensions ?? []).map((d) => (
                <option key={d.cle} value={d.cle}>{d.label}</option>
              ))}
            </select>
            <p className={`${T.note} mt-1`} style={{ color: V.muted }}>
              {catalogue?.dimensions.find((d) => d.cle === dimension)?.definition}
            </p>

            <p className={`${T.label} mt-4`} style={{ color: V.muted }}>Mesures</p>
            <div className="mt-1.5 max-h-[430px] space-y-3 overflow-y-auto pr-1">
              {Object.entries(parPortee).map(([portee, champs]) => (
                <div key={portee}>
                  <p className={T.note} style={{ color: V.muted }}>{PORTEE_TITRE[portee] ?? portee}</p>
                  <div className="mt-1 space-y-0.5">
                    {champs.map((m) => {
                      const on = mesuresActives.includes(m.cle)
                      const disponible = compatible(m)
                      return (
                        <button key={m.cle} onClick={() => basculer(m.cle)} disabled={!disponible}
                          title={disponible ? m.definition : `${m.label} ne peut pas être ventilé par cette dimension.`}
                          className="min-h-8 w-full text-left text-[12px] rounded px-1.5 py-0.5 flex items-center gap-1.5 disabled:opacity-35"
                          style={{ background: on ? V.ink : 'transparent', color: on ? '#fff' : V.ink2 }}>
                          <span aria-hidden="true" style={{ opacity: on ? 1 : 0.3 }}>{on ? '✓' : '+'}</span>
                          <span className="truncate">{m.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
              <p className={T.note} style={{ color: V.muted }}>
                {mesures.length === 0
                  ? 'Choisissez au moins une mesure à gauche.'
                  : `${mesures.length} mesure${mesures.length > 1 ? 's' : ''} sélectionnée${mesures.length > 1 ? 's' : ''}`}
              </p>
              <button onClick={exporter} disabled={!table}
                className="text-[12px] font-semibold rounded-lg px-2.5 py-1 disabled:opacity-40"
                style={{ border: `1px solid ${V.grid}`, color: V.ink }}>
                Exporter en CSV
              </button>
            </div>

            {mesures.length === 0 ? (
              <p className={T.note} style={{ color: V.muted }}>Aucune mesure sélectionnée.</p>
            ) : !table ? (
              <Squelette lignes={8} hauteur={16} />
            ) : (
              <>
                <DimensionTable
                  lignes={table.lignes as LigneTable[]}
                  colonnes={colonnes}
                  labelDimension={table.modele.dimension?.label ?? 'Dimension'}
                  comparaison={!!etat.comparaison}
                  lignesParPage={15}
                />
                {/* L'avertissement qui évite de lire un total pour une ventilation :
                    une mesure que la dimension ne sait pas découper renvoie le total
                    sur une seule ligne, plutôt qu'une jointure inventée. */}
                {table.lignes.length === 1 && table.lignes[0].cle === '(tous)' && (
                  <p className={`${T.note} mt-2`} style={{ color: V.warning }}>
                    Cette dimension ne s&apos;applique pas aux mesures choisies : le total est affiché
                    sur une seule ligne. Croisez plutôt avec une dimension de la même source.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      }
    />
  )
}
