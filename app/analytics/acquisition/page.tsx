'use client'

/**
 * ACQUISITION — d'où elles viennent, ce qu'elles coûtent, ce qu'elles rapportent.
 *
 * Le canal est celui des utm pour les commandes du site, et l'origine saisie
 * pour les commandes manuelles. C'est la correction la plus importante du
 * chantier : l'ancienne carte groupait sur `sourceChannel`, dont les valeurs
 * sont `website`, `instagram`, `whatsapp` — un mélange du TYPE de commande et de
 * l'ORIGINE d'une saisie manuelle. Les commandes venues des publicités étaient
 * noyées dans `website`, et on divisait la dépense Meta par un tableau où Meta
 * n'apparaissait pas.
 *
 * UNE HONNÊTETÉ À TENIR : la dépense publicitaire n'est PAS ventilable par
 * canal. Les régies facturent par plateforme, pas par utm. On la compare donc
 * au bloc des canaux payants pris ensemble, jamais ligne par ligne.
 */

import { useEffect, useMemo, useState } from 'react'
import { V } from '../_components/Viz'
import { T } from '../_components/Decision'
import { ReportShell, Scorecard, DimensionTable, Squelette, fmt, type ColonneMesure, type LigneTable } from '../_components/Report'
import { BarreControle } from '../_components/Controls'
import { useReport, interroger } from '../_components/useReport'

type Reponse = Awaited<ReturnType<typeof interroger>>

const MESURES = ['commandes', 'livrees', 'tauxLivraison', 'caLivre', 'marge', 'margeParCommande'] as const
const CANAUX_PAYANTS = ['Instagram Ads', 'Facebook Ads', 'TikTok Ads']

export default function Acquisition() {
  const { etat, maj, setJours, setPeriode, setFiltre, periodePersonnalisee } = useReport()
  const [dimension, setDimension] = useState('canal')
  const [table, setTable] = useState<Reponse | null>(null)
  const [pub, setPub] = useState<Reponse | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const base = useMemo(() => ({
    periode: etat.periode, comparaison: etat.comparaison ?? undefined,
    basis: etat.basis, filtres: etat.filtres,
  }), [etat])

  useEffect(() => {
    let vivant = true
    setTable(null)
    Promise.all([
      interroger({ ...base, dimension, mesures: [...MESURES], limite: 100 }),
      interroger({ ...base, mesures: ['depensePub', 'clicsPub', 'impressionsPub'] }),
    ])
      .then(([t, p]) => { if (vivant) { setTable(t); setPub(p); setErreur(null) } })
      .catch((e) => vivant && setErreur(e instanceof Error ? e.message : 'Erreur'))
    return () => { vivant = false }
  }, [base, dimension])

  const depense = pub?.lignes[0]?.mesures.depensePub?.valeur ?? 0
  const depensePrec = pub?.lignes[0]?.mesures.depensePub?.precedent ?? null

  // Le bloc payant : la seule comparaison honnête avec la dépense.
  const payant = useMemo(() => {
    if (!table || dimension !== 'canal') return null
    const l = table.lignes.filter((x) => CANAUX_PAYANTS.includes(x.cle))
    if (l.length === 0) return null
    const s = (c: string) => l.reduce((a, x) => a + (x.mesures[c]?.valeur ?? 0), 0)
    const livrees = s('livrees'), marge = s('marge')
    return {
      livrees, marge, caLivre: s('caLivre'), commandes: s('commandes'),
      net: marge - depense,
      cac: livrees > 0 ? depense / livrees : null,
      roas: depense > 0 ? s('caLivre') / depense : null,
    }
  }, [table, dimension, depense])

  const colonnes: ColonneMesure[] = useMemo(
    () => (table?.modele.mesures ?? []).map((m) => ({
      cle: m.cle, label: m.label, definition: m.definition, format: m.format,
      portee: m.portee, hausseEstBonne: m.hausseEstBonne,
      derivee: (m as { derivee?: boolean }).derivee,
    })),
    [table]
  )

  return (
    <ReportShell
      titre="Acquisition"
      sous="D'où viennent les commandes, ce qu'elles coûtent et ce qu'elles rapportent."
      controles={
        <BarreControle etat={etat} maj={maj} setJours={setJours} setPeriode={setPeriode}
          setFiltre={setFiltre} periodePersonnalisee={periodePersonnalisee} />
      }
      enTete={erreur ? <p className="text-[13px] py-3" style={{ color: V.critical }}>Erreur : {erreur}</p> : null}
      scorecards={!table ? (
        [0, 1, 2, 3].map((i) => <div key={i}><Squelette lignes={2} hauteur={12} /></div>)
      ) : (
        <>
          <Scorecard label="Dépense publicitaire" portee="événements"
            definition="Toutes plateformes. Non ventilable par canal : les régies facturent par plateforme, pas par utm."
            valeur={depense} precedent={depensePrec} format="mad" hausseEstBonne={false} />
          <Scorecard label="Marge des canaux payants" portee="événements"
            definition="Marge des commandes livrées venues d'Instagram Ads, Facebook Ads ou TikTok Ads."
            valeur={payant?.marge ?? null} format="mad" hausseEstBonne />
          <Scorecard label="Net après publicité" portee="événements"
            definition="Marge des canaux payants moins la dépense publicitaire totale."
            valeur={payant ? payant.net : null} format="mad" hausseEstBonne
            note={payant && payant.net < 0 ? 'la publicité coûte plus qu\'elle ne rapporte' : undefined} />
          <Scorecard label="Coût par commande livrée" portee="événements"
            definition="Dépense publicitaire divisée par les commandes livrées issues des publicités."
            valeur={payant?.cac ?? null} format="mad" hausseEstBonne={false}
            note={payant?.roas != null ? `${payant.roas.toFixed(1).replace('.', ',')} MAD de CA par MAD dépensé` : undefined} />
        </>
      )}
      figure={payant && (
        <div className="rounded-xl p-4" style={{ border: `1px solid ${V.grid}` }}>
          <p className={T.label} style={{ color: V.muted }}>Ce que la publicité laisse réellement</p>
          <p className={`${T.body} mt-2 max-w-[72ch]`} style={{ color: V.ink2 }}>
            {payant.commandes} commandes issues des publicités, dont <b>{payant.livrees} livrées</b>.
            Elles ont produit <b>{fmt(payant.marge, 'mad')}</b> de marge pour <b>{fmt(depense, 'mad')}</b> dépensés,
            soit <b style={{ color: payant.net >= 0 ? V.good : V.critical }}>{fmt(payant.net, 'mad')}</b> nets.
            {payant.cac != null && <> Chaque commande livrée a coûté {fmt(payant.cac, 'mad')} d&apos;acquisition.</>}
          </p>
          <p className={`${T.note} mt-2`} style={{ color: V.muted }}>
            La dépense n&apos;apparaît pas dans le tableau ci-dessous : elle n&apos;est pas ventilable par canal.
            Les lignes se comparent entre elles à la marge, pas au chiffre d&apos;affaires — deux canaux au
            même CA n&apos;ont pas la même marge.
          </p>
        </div>
      )}
      tableau={!table ? <Squelette lignes={6} hauteur={16} /> : (
        <DimensionTable
          lignes={table.lignes as LigneTable[]}
          colonnes={colonnes}
          labelDimension={table.modele.dimension?.label ?? 'Dimension'}
          dimensions={[
            { cle: 'canal', label: "Canal d'acquisition" },
            { cle: 'ville', label: 'Ville' },
            { cle: 'appareil', label: 'Appareil' },
            { cle: 'jour', label: 'Jour' },
          ]}
          onDimension={setDimension}
          comparaison={!!etat.comparaison}
          lignesParPage={10}
        />
      )}
    />
  )
}
