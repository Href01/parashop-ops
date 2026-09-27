'use client'

import { AlertTriangle, ArrowDownRight, ArrowUpRight, Lightbulb, Sparkles } from 'lucide-react'
import type { Conseil } from '@/lib/ads/conseils'
import { dh, dh1, evolution, nb, nomPeriode, type Donnees } from './types'
import s from '../agent.module.css'

/** Une courbe de 24 px : la tendance d'un indicateur sur la periode, sans axe. */
function Courbe({ valeurs, couleur = '#175f50' }: { valeurs: number[]; couleur?: string }) {
  if (valeurs.length < 2 || valeurs.every((v) => v === 0)) return null
  const max = Math.max(...valeurs), min = Math.min(...valeurs), W = 110, H = 26
  const pts = valeurs.map((v, i) => `${(i / (valeurs.length - 1)) * W},${H - 2 - ((v - min) / (max - min || 1)) * (H - 4)}`).join(' ')
  return <svg className={s.courbe} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden><polyline points={pts} fill="none" stroke={couleur} strokeWidth="1.6" strokeLinejoin="round" /></svg>
}

/** L'ecart a la periode d'avant, colore selon que monter est bon ou mauvais. */
function Ecart({ a, b, bonSiHausse = true }: { a: number | null; b: number | null; bonSiHausse?: boolean }) {
  const e = evolution(a, b)
  if (e == null || !Number.isFinite(e)) return <span className={s.ecartNeutre}>—</span>
  const bon = bonSiHausse ? e >= 0 : e <= 0
  const Icone = e >= 0 ? ArrowUpRight : ArrowDownRight
  return <span className={bon ? s.ecartBon : s.ecartMauvais}><Icone size={12} />{Math.abs(e) < 1 ? '0' : Math.round(Math.abs(e))} %</span>
}

export function Cockpit({ d }: { d: Donnees }) {
  const v = d.verite, serie = d.serie
  // Une periode d'avant qui commence avant l'ouverture n'est pas une reference : pas de pourcentage.
  const p = d.precedent.partiel ? null : d.precedent
  const messages = v.messages
  // Des jours sans detail par pub : les DM de ces jours-la manquent, le cout par DM serait faux.
  const dmComplets = v.joursSansDetail === 0
  const coutMessage = messages && dmComplets ? v.depense / messages : null
  const gagne = v.profitApresPub >= 0
  // Avant la premiere commande enregistree, rien n'est compte (ni pub, ni ventes) : on le dit.
  const periode = v.partiel && v.ouverture ? `depuis la 1re commande enregistrée (${new Date(`${v.ouverture}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })})` : `sur ${nomPeriode(v.jours)}`
  const kpis: { label: string; valeur: string; a: number | null; b: number | null | undefined; bonSiHausse?: boolean; courbe: number[]; aide: string; court?: string }[] = [
    { label: 'Dépense pub', valeur: dh(v.depense), a: v.depense, b: p?.depense, bonSiHausse: false, courbe: serie.map((j) => j.depense), aide: 'Tout ce que Meta a facturé sur la période (converti en DH).' },
    { label: 'Commandes livrées', valeur: String(v.livrees), a: v.livrees, b: p?.livrees, courbe: serie.map((j) => j.livrees), aide: 'Tous canaux : site, DM Instagram, WhatsApp. Une commande ne compte qu’une fois livrée.' },
    { label: 'CA livré', valeur: dh(v.ca), a: v.ca, b: p?.ca, courbe: serie.map((j) => j.ca), aide: 'Chiffre d’affaires des commandes livrées.' },
    { label: 'Profit après pub', valeur: dh(v.profitApresPub), a: v.profitApresPub, b: p?.profitApresPub, courbe: serie.map((j) => j.marge - j.depense), aide: 'Marge des commandes livrées (coût produit et livraison déduits) moins la pub.' },
    { label: 'Pub par commande livrée', valeur: dh(v.coutParCommandeLivree), a: v.coutParCommandeLivree, b: p?.coutParCommandeLivree, bonSiHausse: false, courbe: [], aide: `À comparer au seuil de rentabilité : ${dh(v.seuilParCommande)} de marge par commande.`, court: `seuil : ${dh(v.seuilParCommande)}` },
    { label: 'Conversations (DM)', valeur: nb(messages, 0), a: messages, b: dmComplets && p?.joursSansDetail === 0 ? p.messages : null, courbe: serie.map((j) => j.messages), aide: dmComplets ? 'Conversations démarrées depuis une pub : au Maroc, c’est souvent là que la vente se fait.' : `Conversations démarrées depuis une pub. ${v.joursSansDetail} jour(s) de dépense de la période n’ont pas encore été relus pub par pub dans Meta : leurs DM manquent.`, court: dmComplets ? 'DM ouverts depuis une pub' : `incomplet (${v.joursSansDetail} j non lus)` },
    { label: 'Coût par conversation', valeur: dh1(coutMessage), a: coutMessage, b: null, bonSiHausse: false, courbe: [], aide: 'Dépense des pubs divisée par les conversations démarrées.', court: dmComplets ? 'dépense ÷ conversations' : 'DM incomplets' },
    { label: 'Ce que Meta voit', valeur: dh(v.pixel.valeur), a: v.pixel.valeur, b: p?.pixel.valeur, courbe: [], aide: `Ventes vues par le pixel : ${v.ca ? Math.round((v.pixel.valeur / v.ca) * 100) : 0} % des ventes livrées réelles. Ne juge pas une pub là-dessus.` },
  ]
  return (
    <section className={s.cockpit} aria-label="Résumé">
      <div className={`${s.verdict} ${gagne ? s.verdictBon : s.verdictMauvais}`}>
        <b>{gagne ? `Après la pub, il te reste ${dh(v.profitApresPub)} de marge` : `La pub coûte ${dh(-v.profitApresPub)} de plus que la marge livrée`}</b>
        <span> {periode} · {dh(v.marge)} de marge sur {v.livrees} commande(s) livrée(s), tous canaux, moins {dh(v.depense)} de pub · {dh(v.coutParCommandeLivree)} de pub par commande pour {dh(v.seuilParCommande)} de marge.{d.enRoute ? ` ${d.enRoute} commande(s) récente(s) encore en livraison.` : ''}</span>
      </div>
      <div className={s.kpis}>
        {kpis.map((k) => (
          <div key={k.label} className={s.kpi} title={k.aide}>
            <span className={s.kpiLabel}>{k.label}</span>
            <b>{k.valeur}</b>
            <span className={s.kpiPied}>{k.b != null ? <><Ecart a={k.a} b={k.b} bonSiHausse={k.bonSiHausse} /> <span className={s.muted}>vs période d’avant</span></> : <span className={s.muted}>{k.court ?? (k.b === undefined && d.precedent.partiel ? 'sans comparaison' : '')}</span>}</span>
            <Courbe valeurs={k.courbe} couleur={k.bonSiHausse === false ? '#a3352a' : '#175f50'} />
          </div>
        ))}
      </div>
    </section>
  )
}

const ICONES = { alerte: AlertTriangle, opportunite: Sparkles, conseil: Lightbulb }
const CLASSES = { alerte: 'conseilAlerte', opportunite: 'conseilOpportunite', conseil: 'conseilInfo' } as const

export function Conseils({ liste, agir }: { liste: Conseil[]; agir: (c: Conseil) => void }) {
  if (!liste.length) return null
  return (
    <section className={s.conseils} aria-label="Conseils">
      {liste.map((c) => {
        const Icone = ICONES[c.niveau]
        return (
          <article key={c.id} className={`${s.conseil} ${s[CLASSES[c.niveau]]}`}>
            <Icone size={16} className={s.conseilIcone} />
            <div className={s.conseilTexte}><b>{c.titre}</b><p>{c.detail}</p></div>
            {c.action && <button type="button" className={s.ghost} onClick={() => agir(c)}>{c.action.demande ? 'Demander à l’agent' : c.action.adId ? 'Voir la pub' : 'Voir'}</button>}
          </article>
        )
      })}
    </section>
  )
}
