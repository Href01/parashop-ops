'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ExternalLink, X } from 'lucide-react'
import type { Verdict } from '@/lib/ads/conseils'
import { ApercuFeed, ApercuStory } from './Apercu'
import { FAMILLES, VERDICTS, dh, dh1, jourCourt, nb, pct, statutPub, type Donnees, type Pub } from './types'
import s from '../agent.module.css'

type Tri = 'depense' | 'cout' | 'ctr' | 'resultats'
const TONS: Record<string, string> = { vert: 'chipVert', orange: 'chipOrange', rouge: 'chipRouge', gris: '', bleu: 'chipBleu' }

export function PuceVerdict({ v }: { v: Verdict | undefined }) {
  if (!v) return null
  const x = VERDICTS[v]
  return <span className={`${s.chip} ${TONS[x.ton] ? s[TONS[x.ton] as keyof typeof s] : ''}`}>{x.label}</span>
}

export function Campagnes({ d, ouvrirPub, demander }: { d: Donnees; ouvrirPub: (adId: string) => void; demander: (genre: 'analyse' | 'creatifs', sujet: string) => void }) {
  const [statut, setStatut] = useState<'toutes' | 'actives' | 'pause'>('toutes')
  const [famille, setFamille] = useState<'toutes' | 'messages' | 'ventes' | 'autre'>('toutes')
  const [verdict, setVerdict] = useState<'tous' | Verdict>('tous')
  const [tri, setTri] = useState<Tri>('depense')
  const [recherche, setRecherche] = useState('')

  const groupes = useMemo(() => {
    const filtrees = d.pubs.filter((p) => {
      const v = d.verdicts[p.adId]
      if (statut === 'actives' && p.statut !== 'ACTIVE') return false
      if (statut === 'pause' && p.statut === 'ACTIVE') return false
      if (famille !== 'toutes' && v?.famille !== famille) return false
      if (verdict !== 'tous' && v?.verdict !== verdict) return false
      if (recherche && !`${p.nom} ${p.campagne} ${p.texte}`.toLowerCase().includes(recherche.toLowerCase())) return false
      return true
    })
    const cle = (p: Pub) => tri === 'depense' ? -p.j30.depense : tri === 'cout' ? (p.j30.coutParResultat ?? 1e9) : tri === 'ctr' ? -(p.j7.ctr ?? p.j30.ctr ?? 0) : -(p.j30.messages + p.j30.achats)
    const par = new Map<string, Pub[]>()
    for (const p of filtrees.sort((a, b) => cle(a) - cle(b))) par.set(p.campagne || 'Sans campagne', [...(par.get(p.campagne || 'Sans campagne') || []), p])
    return [...par.entries()].map(([nom, pubs]) => {
      const dep = pubs.reduce((n, p) => n + p.j30.depense, 0), res = pubs.reduce((n, p) => n + p.j30.messages + p.j30.achats, 0)
      return { nom, pubs, dep, res, actives: pubs.filter((p) => p.statut === 'ACTIVE').length, famille: d.verdicts[pubs[0].adId]?.famille }
    }).sort((a, b) => b.dep - a.dep)
  }, [d, statut, famille, verdict, tri, recherche])

  if (!d.pubs.length) return <p className={`${s.notice} ${s.warn}`}>Aucune donnée au niveau des pubs. Clique « Relire Meta » en haut de la page.</p>
  const puce = <T extends string>(val: T, cur: T, set: (x: T) => void, label: string) => <button key={val} type="button" aria-pressed={cur === val} className={s.filtre} onClick={() => set(val)}>{label}</button>

  return (
    <section className={s.panel} aria-labelledby="campagnes">
      <div className={s.panelHeader}>
        <div><h2 id="campagnes">Campagnes et pubs · 30 jours</h2><p>Chaque pub est comparée aux pubs de sa famille (Messages avec Messages, Ventes avec Ventes). Clique une pub pour son aperçu et sa courbe.</p></div>
      </div>
      <div className={s.body}>
        <div className={s.filtres}>
          <div className={s.groupeFiltres}>{puce('toutes', statut, setStatut, 'Toutes')}{puce('actives', statut, setStatut, 'Actives')}{puce('pause', statut, setStatut, 'En pause')}</div>
          <div className={s.groupeFiltres}>{puce('toutes', famille, setFamille, 'Toutes familles')}{puce('messages', famille, setFamille, 'Messages')}{puce('ventes', famille, setFamille, 'Ventes')}</div>
          <div className={s.groupeFiltres}>{puce('tous', verdict, setVerdict, 'Tous verdicts')}{(['gagnante', 'surveiller', 'couper', 'trop_tot'] as Verdict[]).map((x) => puce(x, verdict, setVerdict, VERDICTS[x].label))}</div>
          <div className={s.groupeFiltres}>
            <select value={tri} onChange={(e) => setTri(e.target.value as Tri)} aria-label="Trier par" className={s.select}>
              <option value="depense">Tri : dépense</option><option value="cout">Tri : coût par résultat</option><option value="ctr">Tri : taux de clic</option><option value="resultats">Tri : résultats</option>
            </select>
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher une pub…" className={s.recherche} aria-label="Chercher une pub" />
          </div>
        </div>
        {!groupes.length && <p className={s.notice}>Aucune pub ne correspond à ces filtres.</p>}
        {groupes.map((g) => (
          <div key={g.nom} className={s.campagne}>
            <div className={s.campagneTete}>
              <b>{g.nom}</b>
              {g.famille && <span className={s.chip}>{FAMILLES[g.famille]}</span>}
              <span className={s.muted}>{g.pubs.length} pub(s){g.actives ? ` · ${g.actives} active(s)` : ''}</span>
              <span className={s.campagneChiffres}>{dh(g.dep)} · {g.res} résultat(s) · {g.res ? `${dh1(g.dep / g.res)}/résultat` : '—'}</span>
            </div>
            <div className={s.scroll}><table className={`${s.table} ${s.cartes}`}>
              <thead><tr><th>Pub</th><th>Verdict</th><th className={s.num}>Dépense 30 j</th><th className={s.num}>7 j</th><th className={s.num}>Conv.</th><th className={s.num}>Achats</th><th className={s.num}>Coût/résultat</th><th className={s.num}>CTR 7 j</th><th className={s.num}>Fréq.</th></tr></thead>
              <tbody>{g.pubs.map((p) => {
                const v = d.verdicts[p.adId]
                return (
                  <tr key={p.adId} className={s.ligneCliquable} onClick={() => ouvrirPub(p.adId)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') ouvrirPub(p.adId) }}>
                    <td className={s.pleine}><div className={s.pubCell}>{p.vignette ? <img className={s.vignette} src={p.vignette} alt="" loading="lazy" /> : <span className={s.vignette} />}<div>
                      <div className={s.pubNom}>{p.nom || p.adId}</div>
                      <div className={s.meta} style={{ marginTop: 2 }}><span className={`${s.chip} ${p.statut === 'ACTIVE' ? s.chipVert : ''}`}>{statutPub(p.statut)}</span>{p.boost && <span className={`${s.chip} ${s.chipOrange}`}>Boost</span>}{p.fatigue && <span className={`${s.chip} ${s.chipRouge}`}>Fatigue</span>}</div>
                    </div></div></td>
                    <td data-l="Verdict" title={v?.raison}><PuceVerdict v={v?.verdict} /></td>
                    <td className={s.num} data-l="30 j">{dh(p.j30.depense)}</td><td className={s.num} data-l="7 j">{dh(p.j7.depense)}</td>
                    <td className={s.num} data-l="Conv.">{p.j30.messages}</td><td className={s.num} data-l="Achats">{p.j30.achats}</td>
                    <td className={s.num} data-l="Coût/résultat">{dh1(p.j30.coutParResultat)}</td><td className={s.num} data-l="CTR">{pct(p.j7.ctr ?? null, 2)}</td><td className={s.num} data-l="Fréq.">{nb(p.frequence7j)}</td>
                  </tr>)
              })}</tbody>
            </table></div>
          </div>
        ))}
        <p className={`${s.small} ${s.muted}`}>Résultat = conversation démarrée ou achat vu par le pixel. Le pixel ne voit pas les ventes conclues en DM : une pub Messages se juge au coût par conversation.</p>
        <div className={s.btns}><button type="button" className={s.ghost} onClick={() => demander('analyse', 'Analyse complète de mes campagnes des 30 derniers jours : quoi couper, quoi augmenter, et pourquoi')}>Demander une analyse complète à l’agent</button></div>
      </div>
    </section>
  )
}

type Detail = { pub: Record<string, unknown>; jours: { jour: string; depense: number; impressions: number; clics_lien: number; messages: number; achats: number }[] }

export function TiroirPub({ adId, d, fermer, demander }: { adId: string; d: Donnees; fermer: () => void; demander: (genre: 'analyse' | 'creatifs', sujet: string) => void }) {
  const p = d.pubs.find((x) => x.adId === adId)
  const v = d.verdicts[adId]
  const [detail, setDetail] = useState<Detail | null>(null)
  useEffect(() => { void fetch(`/api/ops/ads/agent?pub=${adId}`).then((r) => (r.ok ? r.json() : null)).then(setDetail) }, [adId])
  if (!p) return null
  const texte = String(detail?.pub?.texte ?? p.texte ?? '')
  const visuel = { format: 'feed' as const, image: p.vignette, accroche: '', langue: 'fr' as const, surimpression: false, position: 'haut' as const }
  const serie = (detail?.jours || []).map((j) => ({ ...j, label: jourCourt(j.jour) }))
  const nomPub = `« ${(p.nom || p.adId).slice(0, 60)} »`
  return (
    <div className={s.drawer} role="dialog" aria-modal="true" aria-label={p.nom || p.adId} onClick={fermer}>
      <div className={s.drawerBody} onClick={(e) => e.stopPropagation()}>
        <div className={s.panelHeader} style={{ padding: 0 }}>
          <div><p className={s.eyebrow}>{p.campagne} · {statutPub(p.statut)}</p><h2>{p.nom || p.adId}</h2></div>
          <button type="button" className={s.ghost} onClick={fermer} aria-label="Fermer"><X size={14} /></button>
        </div>
        {v && <p className={`${s.notice} ${v.verdict === 'gagnante' ? s.ok : v.verdict === 'couper' ? s.error : ''}`}><PuceVerdict v={v.verdict} /> {v.raison}</p>}
        <div className={s.detailPub}>
          <div className={s.apercus}>
            {p.format === 'VIDEO' ? <ApercuStory v={visuel} legende={texte} bouton={d.verdicts[adId]?.famille === 'messages' ? 'Envoyer un message' : 'Acheter'} reel /> : <ApercuFeed v={visuel} legende={texte} bouton={d.verdicts[adId]?.famille === 'messages' ? 'Envoyer un message' : 'Acheter'} largeur={300} />}
            {p.permalien && <a href={p.permalien} target="_blank" rel="noopener noreferrer" className={s.small}>Voir la publication sur Instagram <ExternalLink size={11} /></a>}
          </div>
          <div className={s.detailChiffres}>
            <div className={s.grilleMesures}>
              {[['Dépense 30 j', dh(p.j30.depense)], ['Dépense 7 j', dh(p.j7.depense)], ['Conversations', String(p.j30.messages)], ['Achats pixel', String(p.j30.achats)],
                ['Coût / conversation', dh1(p.j30.coutParMessage)], ['Coût / achat pixel', dh1(p.j30.coutParAchatPixel)], ['Clics sur le lien', String(p.j30.clicsLien)], ['Taux de clic 30 j', pct(p.j30.ctr, 2)],
                ['Coût pour 1 000 vues', dh1(p.j30.cpm)], ['Fréquence 7 j', nb(p.frequence7j)], ['Accroche vidéo (3 s)', pct(p.j30.accroche, 0)], ['Vues complètes', pct(p.j30.retention, 0)]].map(([k, x]) => (
                <div key={k} className={s.mesure}><span>{k}</span><b>{x}</b></div>))}
            </div>
            <div style={{ height: 180, marginTop: 12 }}>
              {serie.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={serie} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="#eef1ed" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: '#66716a' }} minTickGap={14} />
                    <YAxis yAxisId="d" tick={{ fontSize: 10.5, fill: '#66716a' }} width={40} />
                    <YAxis yAxisId="n" orientation="right" tick={{ fontSize: 10.5, fill: '#66716a' }} width={30} allowDecimals={false} />
                    <Tooltip />
                    <Bar yAxisId="d" dataKey="depense" name="Dépense (DH)" fill="#c9d3cc" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="n" dataKey="messages" name="Conversations" stroke="#3b6fd4" strokeWidth={1.8} dot={false} />
                    <Line yAxisId="n" dataKey="achats" name="Achats pixel" stroke="#175f50" strokeWidth={1.8} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : <p className={s.muted}>Chargement de la courbe…</p>}
            </div>
            <div className={s.btns}>
              <button type="button" className={s.primary} onClick={() => demander('analyse', `Analyse la pub ${nomPub} (id ${adId}) : pourquoi ce résultat, et que faire (garder, couper, changer la création, le public ou le budget)`)}>Demander une analyse</button>
              <button type="button" className={s.ghost} onClick={() => demander('creatifs', `3 variantes de la pub ${nomPub} (id ${adId}) : même produit, nouvelles accroches et nouveaux visuels`)}>3 variantes</button>
            </div>
            {texte && <details className={s.small} style={{ marginTop: 10 }}><summary>Texte complet de la pub</summary><p style={{ whiteSpace: 'pre-wrap' }}>{texte}</p></details>}
          </div>
        </div>
      </div>
    </div>
  )
}
