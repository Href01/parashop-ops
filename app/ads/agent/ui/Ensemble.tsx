'use client'

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { dh, dh1, jourCourt, nb, pct, type Donnees, type Repartition } from './types'
import s from '../agent.module.css'

const VERT = '#175f50', BLEU = '#3b6fd4', ORANGE = '#c47d12', GRIS = '#a9b8af'
const axe = { fontSize: 11, fill: '#66716a' }

function Carte({ titre, aide, children }: { titre: string; aide?: string; children: React.ReactNode }) {
  return <section className={s.panel}><div className={s.panelHeader}><div><h2>{titre}</h2>{aide && <p>{aide}</p>}</div></div><div className={s.body}>{children}</div></section>
}

const NOMS_DIM: Record<string, string> = { age: 'Âge', sexe: 'Sexe', placement: 'Placement', region: 'Région' }
const valeurLisible = (dim: string, v: string) => dim === 'sexe' ? ({ female: 'Femmes', male: 'Hommes', unknown: 'Inconnu' } as Record<string, string>)[v] ?? v
  : dim === 'placement' ? v.replace('instagram · ', 'Instagram ').replace('facebook · ', 'Facebook ').replace(/_/g, ' ').replace('instagram stories', 'Stories').replace('instagram reels', 'Reels').replace('feed', 'fil') : v

function Audience({ dim, lignes }: { dim: string; lignes: Repartition[] }) {
  const total = lignes.reduce((n, x) => n + x.depense, 0), totalMsg = lignes.reduce((n, x) => n + x.messages, 0)
  const top = lignes.filter((x) => x.depense > 0).slice(0, 6)
  return (
    <div className={s.audience}>
      <h3>{NOMS_DIM[dim] ?? dim}</h3>
      {top.map((x) => (
        <div key={x.valeur} className={s.audienceLigne}>
          <span className={s.audienceNom}>{valeurLisible(dim, x.valeur)}</span>
          <div className={s.doubleBarre} title={`${pct((x.depense / total) * 100, 0)} de la dépense, ${pct(totalMsg ? (x.messages / totalMsg) * 100 : 0, 0)} des conversations`}>
            <i style={{ width: `${(x.depense / total) * 100}%` }} className={s.barreDepense} />
            <i style={{ width: `${totalMsg ? (x.messages / totalMsg) * 100 : 0}%` }} className={s.barreMessages} />
          </div>
          <span className={s.audienceCout}>{x.messages ? `${dh1(x.depense / x.messages)}/conv.` : '—'}</span>
        </div>
      ))}
    </div>
  )
}

export function Ensemble({ d }: { d: Donnees }) {
  const serie = d.serie.map((j) => ({ ...j, label: jourCourt(j.jour), coutConv: j.messages ? Math.round((j.depense / j.messages) * 10) / 10 : null }))
  const v = d.verite
  const canaux = v.parCanal
  const maxCanal = Math.max(...canaux.map((c) => c.ca), 1)
  const produits = [...d.produits].filter((p) => p.margeShine != null && p.stockVendable > 0 && !p.importBloque)
    .sort((a, b) => b.margeShine! * Math.max(1, b.vendus90j) - a.margeShine! * Math.max(1, a.vendus90j)).slice(0, 8)
  const dims = ['age', 'placement', 'region', 'sexe'].filter((k) => d.repartitions[k]?.length)
  return (
    <>
      <Carte titre="Dépense contre ventes livrées, jour par jour" aide="Les barres : ce que la pub a coûté. Les courbes : le chiffre d’affaires et la marge des commandes livrées ce jour-là (tous canaux). Une vente arrive 1 à 2 jours après la pub : lis la tendance, pas un jour isolé.">
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#eef1ed" vertical={false} />
              <XAxis dataKey="label" tick={axe} interval="preserveStartEnd" minTickGap={18} />
              <YAxis tick={axe} width={52} />
              <Tooltip formatter={(x, n) => [dh(Number(x)), String(n)]} labelStyle={{ fontWeight: 700 }} />
              <Legend wrapperStyle={{ fontSize: 11.5 }} />
              <Bar dataKey="depense" name="Dépense pub" fill={GRIS} radius={[3, 3, 0, 0]} />
              <Line dataKey="ca" name="CA livré" stroke={VERT} strokeWidth={2} dot={false} />
              <Line dataKey="marge" name="Marge livrée" stroke={ORANGE} strokeWidth={1.6} dot={false} strokeDasharray="4 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Carte>
      <div className={s.deuxColonnes}>
        <Carte titre="Conversations démarrées" aide="DM Instagram, Messenger, WhatsApp ouverts depuis une pub, et leur coût.">
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#eef1ed" vertical={false} />
                <XAxis dataKey="label" tick={axe} interval="preserveStartEnd" minTickGap={18} />
                <YAxis yAxisId="n" tick={axe} width={40} allowDecimals={false} />
                <YAxis yAxisId="c" orientation="right" tick={axe} width={40} />
                <Tooltip formatter={(x, n) => [n === 'Coût par conversation' ? dh1(Number(x)) : nb(Number(x), 0), String(n)]} />
                <Bar yAxisId="n" dataKey="messages" name="Conversations" fill={BLEU} radius={[3, 3, 0, 0]} />
                <Line yAxisId="c" dataKey="coutConv" name="Coût par conversation" stroke={ORANGE} strokeWidth={1.6} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Carte>
        <Carte titre="D’où viennent les commandes livrées" aide="Meta ne voit que « Site (pub Meta suivie) ». Le reste vend souvent grâce aux pubs, sans lien de suivi.">
          <div className={s.canaux}>{canaux.map((c) => (
            <div key={c.canal} className={s.canal}>
              <span className={s.canalNom}>{c.canal}</span>
              <div className={s.barreSeule}><i style={{ width: `${(c.ca / maxCanal) * 100}%` }} /></div>
              <span className={s.canalChiffres}>{c.commandes} cmd · {dh(c.ca)}</span>
            </div>))}
          </div>
        </Carte>
      </div>
      {dims.length > 0 && (
        <Carte titre="À qui la pub parle vraiment (28 derniers jours)" aide="Barre grise : part de la dépense. Barre bleue : part des conversations. Quand le bleu dépasse le gris, ce public répond mieux que la moyenne.">
          <div className={s.audiences}>{dims.map((k) => <Audience key={k} dim={k} lignes={d.repartitions[k]} />)}</div>
        </Carte>
      )}
      <Carte titre="Les produits qui peuvent porter une pub" aide="Classés par marge laissée à Shine × ventes, en stock. Les produits en dépôt-vente ne comptent que la moitié de la marge.">
        <div className={s.scroll}><table className={`${s.table} ${s.cartes}`}>
          <thead><tr><th>Produit</th><th className={s.num}>Prix</th><th className={s.num}>Marge Shine / vente</th><th className={s.num}>Vendus 90 j</th><th className={s.num}>Stock</th><th className={s.num}>Pub max par vente*</th></tr></thead>
          <tbody>{produits.map((x) => (
            <tr key={x.id}>
              <td className={s.pleine}><b>{x.marque}</b> · {x.nom}{x.partenaire && <span className={`${s.chip} ${s.chipOrange}`} style={{ marginInlineStart: 6 }}>dépôt-vente</span>}</td>
              <td className={s.num} data-l="Prix">{dh(x.prix)}</td><td className={s.num} data-l="Marge">{dh(x.margeShine)}</td>
              <td className={s.num} data-l="Vendus">{x.vendus90j}</td><td className={s.num} data-l="Stock">{x.stockVendable}</td>
              <td className={s.num} data-l="Pub max">{dh(x.margeShine != null ? x.margeShine / 3 : null)}</td>
            </tr>))}</tbody>
        </table></div>
        <p className={`${s.small} ${s.muted}`}>* Repère prudent : un tiers de la marge, pour que la pub laisse de quoi payer le reste (emballage, retours, temps).</p>
      </Carte>
    </>
  )
}
