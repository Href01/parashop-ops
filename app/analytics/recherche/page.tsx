'use client'

/**
 * RECHERCHE — ce qu'elles tapent, et surtout ce qu'elles ne trouvent pas.
 *
 * Le module manquait. L'ancien tableau en montrait deux cartes perdues dans la
 * page « catalogue », et il comptait des FRAPPES au lieu de recherches : « sa »,
 * « sal », « saler », « salerm » y faisaient quatre lignes pour une intention.
 *
 * La colonne qui vaut le détour est « sans résultat ». Une recherche sans
 * réponse, c'est une cliente qui voulait acheter et qui repart — et le terme dit
 * quoi faire : rentrer la marque, ou corriger la façon dont le catalogue l'écrit.
 */

import { useEffect, useMemo, useState } from 'react'
import { V } from '../_components/Viz'
import { T } from '../_components/Decision'
import { ReportShell, Scorecard, Squelette, fmt } from '../_components/Report'
import { BarreControle } from '../_components/Controls'
import { useReport } from '../_components/useReport'

type Terme = { terme: string; n: number; sessions: number; resultats: number; zero: number }
type Donnees = {
  resume: { frappes: number; recherches: number; sessions: number; sansResultat: number; clics: number; sessionsAvecClic: number }
  top: Terme[]
  zero: Array<{ terme: string; n: number; sessions: number }>
}

export default function Recherche() {
  const { etat, maj, setJours, setPeriode, setFiltre, periodePersonnalisee } = useReport()
  const [d, setD] = useState<Donnees | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let vivant = true
    setD(null)
    fetch('/api/ops/analytics/analyses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'recherches', periode: etat.periode }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({ error: `Réponse illisible (${r.status})` }))
        if (!vivant) return
        if (!r.ok || j.error) { setErreur(j.error || `Erreur ${r.status}`); setD({ resume: { frappes: 0, recherches: 0, sessions: 0, sansResultat: 0, clics: 0, sessionsAvecClic: 0 }, top: [], zero: [] }) }
        else { setD(j); setErreur(null) }
      })
      .catch((e) => {
        if (!vivant) return
        setErreur(e instanceof Error ? e.message : 'Chargement impossible')
        setD({ resume: { frappes: 0, recherches: 0, sessions: 0, sansResultat: 0, clics: 0, sessionsAvecClic: 0 }, top: [], zero: [] })
      })
    return () => { vivant = false }
  }, [etat.periode])

  const r = d?.resume
  const tauxZero = r && r.recherches > 0 ? (r.sansResultat / r.recherches) * 100 : null

  /* Les termes qui trouvent MAL sans être à zéro : moins d'un résultat en
     moyenne alors que le mot est manifestement une intention d'achat. C'est là
     que se cachent les fautes de catalogue — un nom écrit en deux mots d'un
     côté, en un seul de l'autre. */
  const malTrouves = useMemo(
    () => (d?.top ?? []).filter((t) => t.n >= 3 && t.resultats < 2).sort((a, b) => b.n - a.n).slice(0, 8),
    [d]
  )

  const maxTop = Math.max(1, ...(d?.top ?? []).map((t) => t.n))
  const maxZero = Math.max(1, ...(d?.zero ?? []).map((t) => t.n))

  return (
    <ReportShell
      titre="Recherche"
      sous="Ce que les visiteuses tapent dans la barre de recherche — et ce que le site ne sait pas leur montrer."
      controles={<BarreControle etat={etat} maj={maj} setJours={setJours} setPeriode={setPeriode}
        setFiltre={setFiltre} periodePersonnalisee={periodePersonnalisee} />}
      enTete={erreur ? <p className="text-[13px] py-3" style={{ color: V.critical }}>Erreur : {erreur}</p> : null}
      scorecards={!d ? ([0, 1, 2, 3].map((i) => <div key={i}><Squelette lignes={2} hauteur={12} /></div>)) : (
        <>
          <Scorecard label="Recherches" portee="événements"
            definition="Intentions de recherche, une fois la frappe terminée. Une requête qui n'est que le début d'une autre tapée juste après ne compte pas."
            valeur={r?.recherches ?? null} format="entier" hausseEstBonne
            note={r ? `${fmt(r.frappes, 'entier')} frappes au clavier ramenées à ${fmt(r.recherches, 'entier')} intentions` : undefined} />
          <Scorecard label="Sessions qui cherchent" portee="sessions"
            definition="Sessions ayant utilisé la barre de recherche au moins une fois."
            valeur={r?.sessions ?? null} format="entier" hausseEstBonne />
          <Scorecard label="Sans résultat" portee="événements"
            definition="Part des recherches qui n'ont rien renvoyé. Chacune est une cliente qui voulait acheter et qui repart les mains vides."
            valeur={tauxZero} format="pourcent" hausseEstBonne={false}
            note={r ? `${fmt(r.sansResultat, 'entier')} recherches sur ${fmt(r.recherches, 'entier')}` : undefined} />
          <Scorecard label="Clics sur un résultat" portee="événements"
            definition="Recherches qui ont abouti à l'ouverture d'une fiche produit."
            valeur={r?.clics ?? null} format="entier" hausseEstBonne
            note={r ? `${fmt(r.sessionsAvecClic, 'entier')} sessions` : undefined} />
        </>
      )}
      figure={!d ? <Squelette lignes={5} hauteur={16} /> : malTrouves.length > 0 ? (
        <div>
          <p className={T.label} style={{ color: V.warning }}>Trouvent mal, et ce n&apos;est pas la faute de la cliente</p>
          <p className={`${T.note} mb-3 max-w-[80ch]`} style={{ color: V.muted }}>
            Ces mots sont tapés plusieurs fois et ramènent moins de deux produits en moyenne, alors
            que le catalogue en contient. C&apos;est presque toujours une question d&apos;écriture :
            un nom en deux mots d&apos;un côté, en un seul de l&apos;autre.
          </p>
          <div className="space-y-1.5">
            {malTrouves.map((t) => (
              <div key={t.terme} className="flex items-baseline gap-3 text-[13px]">
                <span className="font-semibold flex-shrink-0 min-w-[150px]" style={{ color: V.ink }}>
                  « {t.terme} »
                </span>
                <span className="tabular-nums flex-shrink-0" style={{ color: V.ink2 }}>
                  {t.n} recherche{t.n > 1 ? 's' : ''}
                </span>
                <span className="tabular-nums flex-shrink-0" style={{ color: t.resultats < 1 ? V.critical : V.warning }}>
                  {t.resultats.toFixed(1).replace('.', ',')} résultat{t.resultats >= 2 ? 's' : ''} en moyenne
                </span>
                {t.zero > 0 && (
                  <span className={T.note} style={{ color: V.muted }}>dont {t.zero} à zéro</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className={T.note} style={{ color: V.muted }}>
          Aucun terme fréquent ne ramène un catalogue vide sur cette période.
        </p>
      )}
      tableau={!d ? <Squelette lignes={8} hauteur={16} /> : (
        <div className="grid lg:grid-cols-2 gap-8">
          <Colonne titre="Ce qu'elles cherchent le plus"
            note="Recherches terminées, pas frappes au clavier."
            lignes={d.top.slice(0, 15).map((t) => ({
              cle: t.terme, n: t.n, part: t.n / maxTop,
              droite: `${t.sessions} session${t.sessions > 1 ? 's' : ''}`,
              alerte: t.resultats < 1,
            }))}
            vide="Aucune recherche sur la période." />
          <Colonne titre="Ce qu'elles ne trouvent pas"
            note="Chaque ligne est une demande que le catalogue ne couvre pas — ou couvre sous un autre nom."
            ton="alerte"
            lignes={d.zero.slice(0, 15).map((t) => ({
              cle: t.terme, n: t.n, part: t.n / maxZero,
              droite: `${t.sessions} session${t.sessions > 1 ? 's' : ''}`,
              alerte: true,
            }))}
            vide="Aucune recherche restée sans réponse. C'est rare — et bon signe." />
        </div>
      )}
    />
  )
}

function Colonne({ titre, note, lignes, vide, ton }: {
  titre: string; note: string; vide: string; ton?: 'alerte'
  lignes: Array<{ cle: string; n: number; part: number; droite: string; alerte?: boolean }>
}) {
  return (
    <div>
      <p className={T.label} style={{ color: ton === 'alerte' ? V.critical : V.muted }}>{titre}</p>
      <p className={`${T.note} mb-2`} style={{ color: V.muted }}>{note}</p>
      {lignes.length === 0 ? (
        <p className={T.note} style={{ color: V.muted }}>{vide}</p>
      ) : (
        <ol>
          {lignes.map((l) => (
            <li key={l.cle} className="rp-row flex items-center gap-2 text-[13px] py-1.5"
              style={{ borderBottom: `1px solid ${V.grid}` }}>
              {/* La barre porte la part, le nombre porte la valeur : on lit le
                  classement d'un coup d'œil sans perdre le chiffre exact. */}
              <span className="rp-bar h-1.5 rounded-sm flex-shrink-0" style={{
                width: Math.max(2, l.part * 40),
                background: ton === 'alerte' ? V.critical : V.s1, opacity: 0.45,
              }} />
              <span className="truncate min-w-0 flex-1" style={{ color: V.ink }} title={l.cle}>{l.cle}</span>
              <span className={`${T.note} tabular-nums flex-shrink-0`} style={{ color: V.muted }}>{l.droite}</span>
              <span className="tabular-nums font-semibold flex-shrink-0 text-right w-[38px]"
                style={{ color: ton === 'alerte' ? V.critical : V.ink }}>{l.n}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
