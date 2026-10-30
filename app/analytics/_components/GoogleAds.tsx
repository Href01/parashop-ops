'use client'

/**
 * GOOGLE ADS — visites, conversion et profit par campagne, groupe et mot-cle.
 *
 * L'equivalent des « Emplacements Meta », mais au niveau ou se prennent les decisions de recherche payante :
 * quel mot-cle coute, lequel amene des visites, lequel finit en commande.
 *
 * profit = marge des commandes LIVREES (apres emballage) − depense Google.
 * Definition, jointure et limites : lib/analytics/google-ads-view.ts. L'ecran ne fait que les montrer :
 *  · depense Google inconnue → « — », jamais 0 ;
 *  · des visites sans identifiant (d'avant le 29/10) sont a part, sous « Non rattaché » ;
 *  · peu de visites → le taux de conversion s'affiche en effectif (n=…), pas en pourcentage.
 */

import { useEffect, useMemo, useState } from 'react'
import { V } from './Viz'
import { T } from './Decision'
import { DimensionTable, Scorecard, Squelette, type ColonneMesure, type LigneTable } from './Report'

type Niveau = 'campagne' | 'groupe' | 'motcle'

type Ligne = {
  cle: string; libelle: string; contexte: string; rattache: boolean
  impressions: number | null; clics: number | null; depense: number | null
  sessions: number; paniers: number; commandes: number; livrees: number; annulees: number; enCours: number
  caLivre: number; marge: number; profit: number | null
  cpc: number | null; ctr: number | null; tauxConversion: number | null
}
type Totaux = {
  depense: number | null; clics: number | null; impressions: number | null
  sessions: number; paniers: number; commandes: number; livrees: number; caLivre: number; marge: number; profit: number | null
  cpc: number | null; ctr: number | null; tauxConversion: number | null; visitesParClic: number | null; nonRattachees: number
}
type Reponse = { lignes: Ligne[]; totaux: Totaux; googleDisponible: boolean; googleErreur: string | null; emballageParColis: number }

const NIVEAUX: Array<{ cle: Niveau; label: string }> = [
  { cle: 'campagne', label: 'Campagnes' }, { cle: 'groupe', label: 'Groupes' }, { cle: 'motcle', label: 'Mots-clés' },
]

/** Sous ce nombre de visites un pourcentage de conversion ne veut rien dire : on affiche l'effectif. */
const MIN_VISITES_TAUX = 10

const COLONNES: ColonneMesure[] = [
  { cle: 'depense', label: 'Dépense', definition: 'Ce que Google a facturé sur la période, en MAD.', format: 'mad', hausseEstBonne: false },
  { cle: 'clics', label: 'Clics', definition: 'Clics sur les annonces (Google).', format: 'entier' },
  { cle: 'cpc', label: 'CPC moyen (MAD)', definition: 'Dépense ÷ clics.', format: 'decimal', hausseEstBonne: false, derivee: true },
  { cle: 'ctr', label: 'Taux de clic', definition: 'Clics ÷ affichages : la part des personnes qui ont vu l’annonce et cliqué.', format: 'pourcent', derivee: true },
  { cle: 'sessions', label: 'Visites', definition: 'Sessions ouvertes sur le site depuis ces annonces, robots écartés (même règle que la page Sessions).', format: 'entier', portee: 'sessions' },
  { cle: 'paniers', label: 'Paniers', definition: 'Visites qui ont ajouté un produit au panier.', format: 'entier', portee: 'sessions' },
  { cle: 'commandes', label: 'Commandes', definition: 'Commandes passées par ces visites (toutes, livrées ou non).', format: 'entier' },
  { cle: 'tauxConversion', label: 'Conversion', definition: 'Commandes ÷ visites. Sous 10 visites, l’effectif est affiché à la place : un pourcentage n’y veut rien dire.', format: 'pourcent', derivee: true },
  { cle: 'profit', label: 'Profit', definition: 'Marge des commandes LIVRÉES (après emballage) − dépense Google. Les commandes pas encore livrées ne comptent pas encore.', format: 'mad', derivee: true },
]

const mesure = (valeur: number | null | undefined, n?: number) => ({ valeur: valeur ?? null, ...(n != null ? { n } : {}) })

export function GoogleAds({ debut, fin, auto }: { debut: string; fin: string; auto: boolean }) {
  const [niveau, setNiveau] = useState<Niveau>('motcle')
  const [d, setD] = useState<Reponse | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let vivant = true
    setD(null); setErreur(null)
    fetch(`/api/ops/analytics/google-ads?${new URLSearchParams({ debut, fin, niveau, auto: auto ? '1' : '0' })}`)
      .then((r) => r.json())
      .then((j) => { if (!vivant) return; if (j.error) setErreur(j.error); else setD(j) })
      .catch((e) => { if (vivant) setErreur(String(e)) })
    return () => { vivant = false }
  }, [debut, fin, auto, niveau])

  const lignes = useMemo<LigneTable[]>(() => {
    if (!d) return []
    const vus = new Map<string, number>()
    return d.lignes.map((l) => {
      // Le libelle sert d'identifiant dans le tableau : le groupe ou la campagne le precise, et un numero lève toute collision.
      const base = !l.rattache ? 'Non rattaché' : niveau === 'campagne' || !l.contexte ? l.libelle : `${l.libelle} · ${l.contexte}`
      const k = vus.get(base) ?? 0; vus.set(base, k + 1)
      return {
        cle: k === 0 ? base : `${base} (${k + 1})`,
        mesures: {
          depense: mesure(l.depense), clics: mesure(l.clics), cpc: mesure(l.cpc), ctr: mesure(l.ctr),
          sessions: mesure(l.sessions), paniers: mesure(l.paniers), commandes: mesure(l.commandes),
          tauxConversion: l.sessions < MIN_VISITES_TAUX ? { valeur: null, n: l.sessions, fiable: false } : mesure(l.tauxConversion),
          profit: mesure(l.profit),
        },
      }
    })
  }, [d, niveau])

  const t = d?.totaux

  return (
    <section className="mb-5 rounded-lg p-3" style={{ border: `1px solid ${V.grid}` }}>
      <h2 className={T.label} style={{ color: V.ink }}>Google Ads : visites, conversion et profit</h2>
      <p className={T.note} style={{ color: V.muted }}>
        Profit = marge des commandes <b>livrées</b> (après emballage) − dépense Google. Clics et dépense viennent de Google en direct ;
        visites, paniers et commandes de votre site. Le suivi par groupe et par mot-clé existe depuis le 29/10 :
        les visites d’avant sont sous « Non rattaché ».
      </p>

      {erreur && <p className={`${T.note} mt-2`} style={{ color: V.critical }}>Impossible de charger : {erreur}</p>}
      {!d && !erreur && <div className="mt-3"><Squelette lignes={5} hauteur={16} /></div>}

      {d && t && (
        <>
          {d.googleErreur && (
            <p className={`${T.note} mt-2`} style={{ color: V.ink2, background: '#fff7e6', borderRadius: 8, padding: '8px 10px' }} role="alert">
              ⚠ {d.googleErreur} La dépense, les clics et le profit sont inconnus (« — ») : les visites et commandes ci-dessous viennent du site.
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
            <Scorecard label="Dépense" definition="Dépense Google Ads sur la période, toutes campagnes." valeur={t.depense} format="mad" hausseEstBonne={false} />
            <Scorecard label="Clics" definition="Clics sur les annonces." valeur={t.clics} format="entier" hausseEstBonne
              note={t.cpc != null ? `${t.cpc.toFixed(2).replace('.', ',')} MAD le clic` : undefined} />
            <Scorecard label="Visites" definition="Sessions du site issues des annonces Google, robots écartés." valeur={t.sessions} format="entier" hausseEstBonne
              note={t.visitesParClic != null ? `${Math.round(t.visitesParClic)} % des clics ouvrent une page` : undefined} />
            <Scorecard label="Commandes" definition="Commandes passées par ces visites." valeur={t.commandes} format="entier" hausseEstBonne
              note={`${t.paniers} visite${t.paniers > 1 ? 's' : ''} avec panier`} />
            <Scorecard label="Conversion" definition="Commandes ÷ visites." valeur={t.tauxConversion} format="pourcent" hausseEstBonne
              note={t.sessions < MIN_VISITES_TAUX ? 'trop peu de visites' : `${t.sessions} visites`} />
            <Scorecard label="Profit" definition="Marge des commandes livrées après emballage, moins toute la dépense Google." valeur={t.profit} format="mad" hausseEstBonne
              note={t.profit != null && t.profit < 0 && t.commandes === 0 ? 'aucune commande pour l’instant' : undefined} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span role="group" aria-label="Niveau de détail" className="inline-flex rounded-lg p-0.5" style={{ background: V.grid }}>
              {NIVEAUX.map((n) => (
                <button key={n.cle} aria-pressed={niveau === n.cle} onClick={() => setNiveau(n.cle)}
                  className="rounded-md px-3 py-1 text-[12px] font-semibold whitespace-nowrap" style={{ minHeight: 32, ...(niveau === n.cle ? { background: '#fff', color: V.ink, boxShadow: '0 1px 2px rgba(0,0,0,.08)' } : { color: V.ink2 }) }}>
                  {n.label}
                </button>
              ))}
            </span>
            {t.nonRattachees > 0 && (
              <span className={T.note} style={{ color: V.muted }}>
                {t.nonRattachees} visite{t.nonRattachees > 1 ? 's' : ''} sans identifiant de campagne (avant le suivi) : ligne « Non rattaché ».
              </span>
            )}
          </div>

          <div className="mt-3">
            <DimensionTable
              key={niveau}
              lignes={lignes}
              colonnes={COLONNES}
              labelDimension={NIVEAUX.find((n) => n.cle === niveau)!.label.replace(/s$/, '')}
              totauxExacts={{
                depense: t.depense, clics: t.clics, cpc: t.cpc, ctr: t.ctr, sessions: t.sessions, paniers: t.paniers,
                commandes: t.commandes, tauxConversion: t.sessions < MIN_VISITES_TAUX ? null : t.tauxConversion, profit: t.profit,
              }}
              lignesParPage={12}
              vide="Aucune annonce Google n’a diffusé ni envoyé de visite sur cette période."
            />
          </div>
          <p className={`${T.note} mt-2`} style={{ color: V.muted }}>
            Les jours Google suivent le fuseau du compte publicitaire, ceux du site l’heure du Maroc : un écart d’une heure autour de minuit est normal.
            Emballage retenu : {d.emballageParColis.toLocaleString('fr-FR')} MAD par colis livré.
          </p>
        </>
      )}
    </section>
  )
}
