'use client'

/**
 * CONVERSION — où et pourquoi ça décroche.
 *
 * L'entonnoir n'est plus figé : on choisit les étapes, et surtout la FENÊTRE DE
 * CONVERSION. Sans elle, un entonnoir ne veut rien dire — acheter douze jours
 * après la première visite n'est pas la même histoire qu'en quatre minutes.
 * Mesuré ici : passer de 15 minutes à 30 jours ne fait gagner que 3 commandes
 * sur 20. Les clientes décident vite ; ce qui les perd n'est donc pas le délai.
 */

import { useEffect, useMemo, useState } from 'react'
import { V } from '../_components/Viz'
import { T } from '../_components/Decision'
import { ReportShell, Scorecard, Squelette } from '../_components/Report'
import { BarreControle } from '../_components/Controls'
import { useReport, interroger } from '../_components/useReport'
import { Entonnoir, type EtapeEntonnoir } from '../_components/Charts'

const DEFAUT = ['PRODUCT_VIEW_DETAIL', 'PRODUCT_ADD_TO_CART', 'BEGIN_CHECKOUT', 'ADD_PAYMENT_INFO', 'PLACE_ORDER']

const FENETRES = [
  { min: 15, label: '15 min' },
  { min: 60, label: '1 h' },
  { min: 1440, label: '24 h' },
  { min: 10080, label: '7 j' },
  { min: 43200, label: '30 j' },
]

export default function Conversion() {
  const { etat, maj, setJours, setPeriode, setFiltre, periodePersonnalisee } = useReport()
  const [catalogue, setCatalogue] = useState<Array<{ cle: string; label: string }>>([])
  const [etapes, setEtapes] = useState<string[]>(DEFAUT)
  const [fenetre, setFenetre] = useState(1440)
  const [donnees, setDonnees] = useState<EtapeEntonnoir[] | null>(null)
  const [argent, setArgent] = useState<{ livrees: number; marge: number } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/ops/analytics/analyses').then((r) => r.json()).then((j) => setCatalogue(j.etapes ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    let vivant = true
    setDonnees(null)
    fetch('/api/ops/analytics/analyses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'entonnoir', etapes, periode: etat.periode, fenetreMin: fenetre }),
    })
      .then((r) => r.json())
      .then((j) => { if (vivant) { if (j.error) setErreur(j.error); else { setDonnees(j.etapes); setErreur(null) } } })
      .catch((e) => vivant && setErreur(String(e)))
    return () => { vivant = false }
  }, [etapes, fenetre, etat.periode])

  useEffect(() => {
    let vivant = true
    interroger({ periode: etat.periode, basis: etat.basis, mesures: ['livrees', 'marge'] })
      .then((r) => {
        if (!vivant) return
        const m = r.lignes[0]?.mesures
        setArgent({ livrees: m?.livrees?.valeur ?? 0, marge: m?.marge?.valeur ?? 0 })
      })
      .catch(() => {})
    return () => { vivant = false }
  }, [etat.periode, etat.basis])

  // Valorisation prudente : les visiteuses perdues à une marche auraient
  // converti au taux GLOBAL, pas au taux de l'étape suivante. On sous-estime
  // plutôt que de promettre un gain qui n'existe pas.
  const valoriser = useMemo(() => {
    if (!donnees || !argent || donnees.length === 0) return undefined
    const depart = donnees[0].sessions || 1
    const cvr = argent.livrees / depart
    const margeUnit = argent.livrees > 0 ? argent.marge / argent.livrees : 0
    return (perdues: number) => Math.round(perdues * cvr * margeUnit)
  }, [donnees, argent])

  const marche = useMemo(() => {
    if (!donnees || donnees.length < 2) return null
    let pire = 1, pireTaux = 101
    for (let i = 1; i < donnees.length; i++) {
      const p = donnees[i - 1].sessions
      const t = p > 0 ? (donnees[i].sessions / p) * 100 : 100
      if (t < pireTaux) { pireTaux = t; pire = i }
    }
    return { i: pire, taux: pireTaux, de: donnees[pire - 1], a: donnees[pire] }
  }, [donnees])

  const basculer = (cle: string) => {
    setEtapes((e) => (e.includes(cle) ? e.filter((x) => x !== cle) : [...e, cle]))
  }

  return (
    <ReportShell
      titre="Conversion"
      sous="Où et pourquoi le parcours décroche — et ce que chaque marche coûte."
      controles={
        <BarreControle etat={etat} maj={maj} setJours={setJours} setPeriode={setPeriode}
          setFiltre={setFiltre} periodePersonnalisee={periodePersonnalisee} />
      }
      enTete={erreur ? <p className="text-[13px] py-3" style={{ color: V.critical }}>Erreur : {erreur}</p> : null}
      scorecards={!donnees ? (
        [0, 1, 2, 3].map((i) => <div key={i}><Squelette lignes={2} hauteur={12} /></div>)
      ) : (
        <>
          <Scorecard label="Point de départ" definition="Sessions ayant atteint la première étape choisie."
            portee="sessions" valeur={donnees[0]?.sessions ?? 0} format="entier" hausseEstBonne />
          <Scorecard label="Arrivée" definition="Sessions ayant franchi toutes les étapes, dans l'ordre et dans la fenêtre."
            portee="sessions" valeur={donnees[donnees.length - 1]?.sessions ?? 0} format="entier" hausseEstBonne />
          <Scorecard label="Conversion du parcours" definition="Arrivée divisée par point de départ."
            portee="sessions"
            valeur={donnees[0]?.sessions ? (donnees[donnees.length - 1].sessions / donnees[0].sessions) * 100 : null}
            format="pourcent" hausseEstBonne />
          <Scorecard label="Plus grosse fuite" definition="La marche où l'on perd la plus grande part."
            portee="sessions" valeur={marche ? 100 - marche.taux : null} format="pourcent" hausseEstBonne={false}
            note={marche ? `${marche.de.label} → ${marche.a.label}` : undefined} />
        </>
      )}
      figure={
        <div className="space-y-6">
          {/* Le rail de construction, façon Amplitude : on empile les étapes et
              la figure se recalcule. C'est ce qui rend l'outil interrogeable au
              lieu de consultable. */}
          <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
            <div className="min-w-0">
              <p className={T.label} style={{ color: V.muted }}>Étapes du parcours</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {catalogue.map((c) => {
                  const on = etapes.includes(c.cle)
                  const rang = etapes.indexOf(c.cle)
                  return (
                    <button key={c.cle} onClick={() => basculer(c.cle)} className="ctrl rounded-lg px-2 py-1 text-[12px] font-semibold"
                      data-on={on ? '1' : undefined}
                      style={{ border: `1px solid ${on ? V.ink : V.grid}` }}>
                      {on && <span className="opacity-60">{rang + 1}. </span>}{c.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <p className={T.label} style={{ color: V.muted }}>Fenêtre de conversion</p>
              <div className="inline-flex rounded-lg overflow-hidden mt-1.5" style={{ border: `1px solid ${V.grid}` }}>
                {FENETRES.map((f) => (
                  <button key={f.min} onClick={() => setFenetre(f.min)} className="ctrl px-2.5 py-1 text-[12px] font-semibold"
                    data-on={fenetre === f.min ? '1' : undefined}>{f.label}</button>
                ))}
              </div>
              <p className={`${T.note} mt-1 max-w-[280px]`} style={{ color: V.muted }}>
                Délai maximum entre la première et la dernière étape. Sans fenêtre, un achat
                douze jours plus tard compterait comme une conversion du parcours.
              </p>
            </div>
          </div>

          {!donnees ? <Squelette lignes={5} hauteur={22} /> : <Entonnoir etapes={donnees} valoriser={valoriser} />}

          {donnees && marche && (
            <p className={`${T.body} max-w-[70ch]`} style={{ color: V.ink2 }}>
              La marche la plus coûteuse est <b>{marche.de.label} → {marche.a.label}</b> :
              {' '}{(100 - marche.taux).toFixed(0)} % s&apos;arrêtent là.
              {valoriser && (
                <> Environ <b>{valoriser(marche.de.sessions - marche.a.sessions).toLocaleString('fr-FR')} MAD</b> de
                marge ne se réalisent pas à cause d&apos;elle, au taux de conversion global de la période.</>
              )}
            </p>
          )}
        </div>
      }
    />
  )
}
