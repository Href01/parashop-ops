'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import BosShell from '@/components/BosShell'
import PageHead from '@/components/PageHead'
import { ArrowLeft, Download, Trash2 } from 'lucide-react'

/**
 * LE RELEVE D'UN PARTENAIRE, LIGNE PAR LIGNE.
 *
 * Deux temporalites, volontairement separees :
 *  - la PERIODE choisie en haut filtre le compte de resultat et le detail des
 *    ventes (« qu'a-t-on gagne en septembre ? ») ;
 *  - le SOLDE A REVERSER est toujours calcule depuis le debut du partenariat.
 *    Une depense de douane saisie en aout ne doit pas disparaitre du solde
 *    parce qu'on regarde septembre.
 */

type Line = { orderId: number; orderNumber: string | null; deliveredAt: string; productId: number; productName: string; quantity: number; revenue: number; cogs: number; orderCosts: number; packaging: number; margin: number }
type Expense = { id: number; date: string; category: string; label: string | null; amount: number; paidBy: 'shine' | 'partner' }
type Payment = { id: number; date: string; amount: number; method: string | null; note: string | null }
type StockRow = { id: number; name: string; brand: string; image: string | null; price: number; costPrice: number; stock: number; entrees: number; vendus: number; enCours: number; unitMargin: number; valeurCout: number; valeurVente: number }
type ModePub = 'partage' | 'partenaire'
type Part = { basePartage: number; shineShare: number; partnerShare: number; pubPartenaire: number }
type Totals = { revenue: number; cogs: number; orderCosts: number; packaging: number; returns: number; adsLinked: number; adsMixed?: number; expenses: number; expensesByCategory: Record<string, number>; expensesPaidByShine: number; expensesPaidByPartner: number; advances: number; pubDepenses: number; margeAvantPub: number; pubTotale: number; net: number; modePub: ModePub; basePartage: number; shineShare: number; partnerShare: number; pubPartenaire: number; scenarios: Record<ModePub, Part>; deliveredOrders: number; unitsSold: number }
type Data = {
  today: string
  ledger: {
    partner: { id: number; name: string; shinePct: number; startDate: string; notes: string | null; active: boolean }
    period: { from: string; to: string }; packagingRate: number
    lines: Line[]; returnsDetail: { orderId: number; orderNumber: string | null; returnedAt: string; fee: number }[]
    adsDetail: { externalId: string; name: string; spend: number }[]; adsMixedDetail?: { externalId: string; name: string; spend: number; part: number; allocated: number }[]; expenses: Expense[]; advancesDetail: Expense[]; totals: Totals
  }
  stock: StockRow[]
  settlement: { cogsSold: number; expensesPaidByPartner: number; advances: number; modePub: ModePub; margeAvantPub: number; pubTotale: number; pubPartenaire: number; partnerShare: number; shineShare: number; net: number; owed: number; paid: number; balance: number; scenarios: Record<ModePub, Part & { owed: number; balance: number }>; payments: Payment[]; depuisDebut: Totals }
}
type Campaign = { externalId: string; name: string; platform: string; spend: number; lastDate: string; linked: boolean; mode?: 'dedie' | 'mixte' | null }

const AVANCE = 'Avance reçue'
/** Les deux accords possibles sur la publicité — mêmes ventes, partage différent. */
const MODES: Record<ModePub, { titre: string; court: string; base: string; regle: string }> = {
  partage: { titre: 'Pub partagée', court: 'Pub partagée', base: 'marge nette (après pub)', regle: 'la pub est un frais commun : on partage ce qui reste APRÈS la pub' },
  partenaire: { titre: 'Pub à la charge du partenaire', court: 'Pub à sa charge', base: 'marge avant pub', regle: 'la pub est son budget : on partage la marge AVANT pub, puis toute la pub est retirée de sa part (payée par son avance)' },
}
const CATEGORIES = ['Douane & taxes', 'Transport', 'Cartons & fournitures', 'Publicité', 'Autre', AVANCE]
const dh = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DH`
/* Une date AAAA-MM-JJ est un jour du calendrier, pas un instant : la lire
   comme de l'UTC la decale d'un jour dans tout fuseau a l'ouest de Greenwich. */
const enDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : new Date(s)
const jour = (iso: string) => enDate(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
const moisDebut = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA')
const moisFin = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('en-CA')
const isoJour = (d: Date) => d.toLocaleDateString('en-CA')
const moinsJours = (iso: string, n: number) => { const d = enDate(iso); d.setDate(d.getDate() - n); return isoJour(d) }
const diffJours = (a: string, b: string) => Math.round((enDate(b).getTime() - enDate(a).getTime()) / 86400000)
/** Variation en %, ou null quand elle ne veut rien dire (base nulle ou absente). */
const deltaPct = (cur: number, old: number | undefined) => {
  if (old == null || old === 0) return null
  return ((cur - old) / Math.abs(old)) * 100
}

export default function PartenairePage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Data | null>(null)
  const [erreur, setErreur] = useState('')
  const [periode, setPeriode] = useState<{ from: string; to: string } | null>(null)
  const [campagnes, setCampagnes] = useState<Campaign[] | null>(null)
  const [prev, setPrev] = useState<{ totals: Totals; from: string; to: string } | null>(null)

  const load = useCallback(async () => {
    const q = periode ? `?from=${periode.from}&to=${periode.to}` : ''
    const r = await fetch(`/api/ops/partners/${id}${q}`, { cache: 'no-store' })
    if (!r.ok) { setErreur(r.status === 404 ? 'Partenaire introuvable' : 'Chargement impossible'); return }
    setData(await r.json())
  }, [id, periode])
  useEffect(() => { load() }, [load])
  /* Comparaison : les totaux de la periode precedente de meme duree, via la
     meme API (aucun calcul ajoute). Masquee quand elle precede le partenariat. */
  useEffect(() => {
    if (!data) { setPrev(null); return }
    const { from, to } = data.ledger.period
    const start = data.ledger.partner.startDate
    const len = diffJours(from, to) + 1
    const pTo = moinsJours(from, 1)
    if (pTo < start) { setPrev(null); return }
    const pFrom = moinsJours(pTo, len - 1) < start ? start : moinsJours(pTo, len - 1)
    let mort = false
    fetch(`/api/ops/partners/${id}?from=${pFrom}&to=${pTo}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!mort && d) setPrev({ totals: d.ledger.totals, from: pFrom, to: pTo }) })
      .catch(() => {})
    return () => { mort = true }
  }, [data, id])
  useEffect(() => {
    fetch(`/api/ops/partners/${id}/campaigns`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => setCampagnes(d?.campaigns ?? []))
  }, [id])

  if (erreur) return <BosShell active="partenaires" title="Partenaires" crumb="Opérations"><div style={{ padding: 30 }}><div className="card-modern" style={{ padding: 24 }}>{erreur}</div></div></BosShell>
  if (!data) return <BosShell active="partenaires" title="Partenaires" crumb="Opérations"><div style={{ padding: 30 }}><div className="card-modern" style={{ padding: 24, minHeight: 200 }}><div className="skeleton-line" style={{ width: '30%', height: 14 }} /></div></div></BosShell>

  const { ledger: L, stock, settlement: S } = data
  const P = L.partner
  const T = L.totals

  return (
    <BosShell active="partenaires" title={P.name} crumb="Partenaires">
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '20px 20px 70px' }}>
        <Link href="/partenaires" className="fs12 tx-lo" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', marginBottom: 8 }}>
          <ArrowLeft style={{ width: 13, height: 13 }} /> Tous les partenaires
        </Link>
        <PageHead
          title={P.name}
          note={<>Dépôt-vente : le stock lui appartient, Shine le vend. <b>{MODES[T.modePub].titre}</b> — {MODES[T.modePub].base} partagée <b>{P.shinePct} % Shine / {100 - P.shinePct} % partenaire</b>, depuis le {jour(P.startDate)}.</>}
          actions={<button className="btn-modern btn-subtle btn-sm" onClick={() => exporterCsv(data)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download style={{ width: 13, height: 13 }} /> Exporter le relevé</button>}
        />

        {/* ── Le solde : toujours depuis le debut ─────────────────────────── */}
        <div className="card-modern" style={{ padding: '16px 18px', marginTop: 16, borderLeft: '3px solid var(--amber)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div>
              <div className="fs12 tx-lo">À reverser au partenaire — depuis le début</div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--tx-hi)' }}>{dh(S.balance)}</div>
            </div>
            <div className="fs12 tx-mid" style={{ lineHeight: 1.7, fontFamily: 'var(--mono)' }}>
              <div>coût des produits vendus <b>{dh(S.cogsSold)}</b></div>
              <div>+ dépenses qu&apos;il a payées <b>{dh(S.expensesPaidByPartner)}</b></div>
              {S.advances > 0 && <div>+ argent qu&apos;il a avancé à Shine <b>{dh(S.advances)}</b></div>}
              <div>+ sa part de la {MODES[S.modePub].base} <b>{dh(S.partnerShare)}</b></div>
              {S.pubPartenaire > 0 && <div>− pub à sa charge (payée par son avance) <b>{dh(S.pubPartenaire)}</b></div>}
              <div>− déjà versé <b>{dh(S.paid)}</b></div>
            </div>
          </div>
          <p className="fs12 tx-lo" style={{ margin: '10px 0 0', lineHeight: 1.55 }}>
            Shine encaisse tout : elle lui rend l&apos;argent qu&apos;il a avancé pour chaque produit vendu, les frais qu&apos;il a réglés lui-même, l&apos;argent qu&apos;il lui a confié (avances, ex. budget pub) et sa part du bénéfice.{S.modePub === 'partenaire' ? ' La pub est son budget : ce qui a été dépensé chez Meta est retiré, le reste de son avance lui revient.' : ' Une marge négative réduit sa part d’autant — la perte se partage comme le gain.'}
          </p>
        </div>

        {/* ── Bilan depuis le debut : gagne-t-on, ou passe l'argent ───────── */}
        <Bilan shinePct={P.shinePct} t={S.depuisDebut} paid={S.paid} balance={S.balance} />

        {/* ── Les deux accords cote a cote ────────────────────────────────── */}
        <Scenarios partnerId={P.id} shinePct={P.shinePct} S={S} onChange={load} />

        {/* ── Periode ─────────────────────────────────────────────────────── */}
        <Periode start={P.startDate} today={data.today} courante={L.period} onChange={setPeriode} />

        {/* ── Chiffres de la periode ──────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 12 }}>
          <Kpi label="CA livré" valeur={dh(T.revenue)} sous={`${T.deliveredOrders} commandes · ${T.unitsSold} unités`} titre="Encaissé sur ses produits, remises déduites — avant tous les frais" delta={prev ? deltaPct(T.revenue, prev.totals.revenue) : null} />
          <Kpi label="Marge avant pub" valeur={dh(T.margeAvantPub)} couleur={T.margeAvantPub < 0 ? 'var(--red, #c0392b)' : 'var(--green)'} sous={T.revenue > 0 ? `${((T.margeAvantPub / T.revenue) * 100).toFixed(1)} % du CA` : '—'} titre="CA − achat − livraison & frais − emballage − retours − dépenses hors pub" delta={prev ? deltaPct(T.margeAvantPub, prev.totals.margeAvantPub) : null} />
          <Kpi label="Pub" valeur={dh(T.pubTotale)} sous={T.pubTotale > 0 ? `ROAS ${(T.revenue / T.pubTotale).toFixed(2)}` : '—'} titre="Ses campagnes + sa part des campagnes mixtes + dépenses « Publicité »" delta={prev ? deltaPct(T.pubTotale, prev.totals.pubTotale) : null} />
          <Kpi label="Marge nette (après pub)" valeur={dh(T.net)} couleur={T.net < 0 ? 'var(--red, #c0392b)' : 'var(--green)'} sous={T.revenue > 0 ? `${((T.net / T.revenue) * 100).toFixed(1)} % du CA` : '—'} titre="Marge avant pub − pub" delta={prev ? deltaPct(T.net, prev.totals.net) : null} />
          <Kpi label={`Part Shine (${P.shinePct} %)`} valeur={dh(T.shineShare)} couleur={T.shineShare < 0 ? 'var(--red, #c0392b)' : undefined} sous={`de la ${MODES[T.modePub].base}`} titre={`${P.shinePct} % de la ${MODES[T.modePub].base} de la période`} delta={prev ? deltaPct(T.shineShare, prev.totals.shineShare) : null} />
          <Kpi label={`Part partenaire (${100 - P.shinePct} %)`} valeur={dh(T.partnerShare - T.pubPartenaire)} sous={T.pubPartenaire > 0 ? `${dh(T.partnerShare)} − pub ${dh(T.pubPartenaire)}` : `de la ${MODES[T.modePub].base}`} titre={T.pubPartenaire > 0 ? 'Sa part de la marge avant pub, moins toute la pub (son budget)' : `${100 - P.shinePct} % de la marge nette de la période`} delta={prev ? deltaPct(T.partnerShare - T.pubPartenaire, prev.totals.partnerShare - prev.totals.pubPartenaire) : null} />
        </div>
        {prev && (
          <p className="fs11 tx-faint" style={{ margin: '6px 2px 0' }}>Comparé à la période précédente de même durée (du {jour(prev.from)} au {jour(prev.to)}).</p>
        )}

        {/* ── Les parts : qui touche quoi sur la marge nette ─────────────── */}
        <Partage shinePct={P.shinePct} shine={T.shineShare} partner={T.partnerShare} net={T.basePartage} base={MODES[T.modePub].base} />

        {/* ── Du CA a la marge nette ──────────────────────────────────────── */}
        <Section titre="Du chiffre d'affaires à la marge nette" note="Chaque ligne reprend le calcul du tableau de bord, au prorata de ses produits dans chaque commande. D'abord ce que coûte la vente, puis la pub à part.">
          <table className="table-modern" style={{ width: '100%' }}>
            <tbody>
              <Ligne label="CA encaissé sur ses produits" note="ce que les clientes ont réellement payé, remises déduites" valeur={T.revenue} />
              <Ligne label="Coût d'achat des produits vendus" note="son argent, qui lui est rendu" valeur={-T.cogs} />
              <Ligne label="Livraison nette et frais de commande" note="coût Sendit moins livraison facturée, commission, frais d'échec" valeur={-T.orderCosts} />
              <Ligne label={`Emballage (${L.packagingRate} DH par colis)`} note="payé par Shine — au prorata si le colis contient aussi des produits Shine" valeur={-T.packaging} />
              <Ligne label="Colis retournés ou refusés" note={`${L.returnsDetail.length} commande(s)`} valeur={-T.returns} />
              {CATEGORIES.filter((c) => c !== 'Publicité' && T.expensesByCategory[c]).map((c) => (
                <Ligne key={c} label={c} note="dépense du partenariat" valeur={-T.expensesByCategory[c]} />
              ))}
              <Total label="= Marge avant pub" note="ce que rapportent ses produits une fois vendus, livrés et emballés" valeur={T.margeAvantPub} />
              <Ligne label="Publicité — ses campagnes" note={`${L.adsDetail.length} campagne(s) qui ne montrent que ses produits : toute la dépense`} valeur={-T.adsLinked} />
              {(L.adsMixedDetail?.length ?? 0) > 0 && (
                <Ligne label="Publicité — campagnes mixtes" note={`sa part, au prorata de ses ventes du mois : ${(L.adsMixedDetail ?? []).map((a) => `${a.name || a.externalId} ${Math.round(a.part * 100)} % de ${dh(a.spend)}`).join(' · ')}`} valeur={-(T.adsMixed ?? 0)} />
              )}
              {T.pubDepenses > 0 && <Ligne label="Publicité — autres dépenses" note="saisies dans les dépenses du partenariat" valeur={-T.pubDepenses} />}
              <Total label="= Marge nette (après pub)" valeur={T.net} />
            </tbody>
          </table>
          <div className="fs12 tx-mid" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--line-soft)', lineHeight: 1.6 }}>
            <b>Accord : {MODES[T.modePub].titre.toLowerCase()}</b> — {MODES[T.modePub].regle}.<br />
            On partage la {MODES[T.modePub].base} <b>{dh(T.basePartage)}</b> → Shine {P.shinePct} % = <b>{dh(T.shineShare)}</b> · partenaire {100 - P.shinePct} % = <b>{dh(T.partnerShare)}</b>
            {T.pubPartenaire > 0 && <> − pub {dh(T.pubPartenaire)} = <b>{dh(T.partnerShare - T.pubPartenaire)}</b></>}.
          </div>
        </Section>

        {/* ── Stock ───────────────────────────────────────────────────────── */}
        <GestionStock partnerId={P.id} partnerName={P.name} stock={stock} onChange={load} />

        {/* ── Ventes detaillees ───────────────────────────────────────────── */}
        <Section titre="Ventes de la période, ligne par ligne" note={L.lines.length === 0 ? 'Aucune vente livrée sur cette période.' : `${L.lines.length} ligne(s) — chaque montant est la part de SES produits dans la commande.`}>
          {L.lines.length > 0 && (
            <Defilant>
              <table className="table-modern" style={{ width: '100%', minWidth: 760 }}>
                <thead><tr>
                  <th>Livrée le</th><th>Commande</th><th>Produit</th><th style={{ textAlign: 'right' }}>Qté</th>
                  <th style={{ textAlign: 'right' }}>CA</th><th style={{ textAlign: 'right' }}>Achat</th><th style={{ textAlign: 'right' }}>Livraison & frais</th><th style={{ textAlign: 'right' }}>Emballage</th><th style={{ textAlign: 'right' }}>Marge</th>
                </tr></thead>
                <tbody>
                  {L.lines.map((l, i) => (
                    <tr key={`${l.orderId}-${l.productId}-${i}`}>
                      <td className="fs12">{jour(l.deliveredAt)}</td>
                      <td className="fs12"><Link href={`/orders/${l.orderId}`}>{l.orderNumber || `#${l.orderId}`}</Link></td>
                      <td className="fs12" style={{ minWidth: 200 }}>{l.productName}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{l.quantity}</td>
                      <Num v={l.revenue} /><Num v={l.cogs} /><Num v={l.orderCosts} /><Num v={l.packaging} /><Num v={l.margin} gras />
                    </tr>
                  ))}
                </tbody>
              </table>
            </Defilant>
          )}
        </Section>

        {/* ── Depenses ────────────────────────────────────────────────────── */}
        <Depenses partnerId={P.id} depenses={[...L.expenses, ...(L.advancesDetail ?? [])].sort((a, b) => b.date.localeCompare(a.date))} today={data.today} onChange={load} />

        {/* ── Publicite ───────────────────────────────────────────────────── */}
        <Campagnes partnerId={P.id} campagnes={campagnes} depensePeriode={L.adsDetail} mixtes={L.adsMixedDetail ?? []} onChange={(c) => { setCampagnes(c); load() }} />

        {/* ── Versements ──────────────────────────────────────────────────── */}
        <Versements partnerId={P.id} versements={S.payments} today={data.today} solde={S.balance} onChange={load} />

        {/* ── Parametres ──────────────────────────────────────────────────── */}
        <Parametres partner={P} modePub={T.modePub} onChange={load} />
      </div>
    </BosShell>
  )
}

/* ─── Morceaux ───────────────────────────────────────────────────────────── */

function Section({ titre, note, children }: { titre: string; note?: string; children?: React.ReactNode }) {
  return (
    <section className="card-modern" style={{ padding: '16px 18px', marginTop: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--tx-hi)', margin: 0 }}>{titre}</h2>
      {note && <p className="fs12 tx-lo" style={{ margin: '3px 0 12px', lineHeight: 1.5 }}>{note}</p>}
      {children}
    </section>
  )
}
/** Les grands tableaux defilent dans leur carte, jamais la page entiere. */
function Defilant({ children }: { children: React.ReactNode }) {
  return <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>{children}</div>
}
function Kpi({ label, valeur, sous, couleur, titre, delta }: { label: string; valeur: string; sous?: string; couleur?: string; titre?: string; delta?: number | null }) {
  return (
    <div className="card-modern" style={{ padding: '12px 14px' }} title={titre}>
      <div className="fs12 tx-lo">{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: couleur || 'var(--tx-hi)' }}>{valeur}</div>
      {sous && <div className="fs11 tx-faint">{sous}</div>}
      {delta != null && (
        <div className="fs11" style={{ fontWeight: 700, color: delta >= 0 ? 'var(--green)' : 'var(--red, #c0392b)' }}>
          {delta >= 0 ? '▲ +' : '▼ '}{delta.toFixed(0)} % vs période précédente
        </div>
      )}
    </div>
  )
}
/* Les parts, d'un coup d'œil : la marge nette coupee selon le partage convenu. */
/**
 * LE BILAN DU PARTENARIAT, DEPUIS LE DEBUT.
 * Ce que Shine garde de l'argent passe par ses mains, moins ce qu'elle doit au
 * partenaire, egale exactement sa part de la marge nette : le tableau le montre
 * ligne par ligne pour que chacun puisse refaire le calcul.
 */
function Bilan({ shinePct, t, paid, balance }: { shinePct: number; t: Totals; paid: number; balance: number }) {
  const garde = t.revenue + (t.advances ?? 0) - t.adsLinked - (t.adsMixed ?? 0) - t.orderCosts - t.packaging - t.returns - t.expensesPaidByShine - paid
  // Egal a sa part de la marge nette ; un ecart d'un centime ne vient que des arrondis de chaque ligne.
  const revientShine = Math.abs(garde - balance - t.shineShare) < 0.05 ? t.shineShare : garde - balance
  const roas = t.pubTotale > 0 ? t.revenue / t.pubTotale : null
  const M = MODES[t.modePub]
  const gagne = t.shineShare >= 0
  const L = ({ l, v, note, gras, signe = true }: { l: string; v: number; note?: string; gras?: boolean; signe?: boolean }) => (
    <tr style={gras ? { borderTop: '2px solid var(--line-soft)' } : undefined}>
      <td style={{ fontWeight: gras ? 800 : 500, color: gras ? 'var(--tx-hi)' : 'var(--tx-mid)' }}>{l}{note && <div className="fs11 tx-faint" style={{ fontWeight: 400 }}>{note}</div>}</td>
      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: gras ? 800 : 600, whiteSpace: 'nowrap', color: gras ? (v < 0 ? 'var(--red, #c0392b)' : 'var(--tx-hi)') : 'var(--tx-hi)' }}>{signe && v > 0 ? '+ ' : v < 0 ? '− ' : ''}{dh(Math.abs(v))}</td>
    </tr>
  )
  return (
    <Section titre="Bilan du partenariat — depuis le début" note="Est-ce que Shine gagne ou perd avec ce partenariat, et où est passé l'argent.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div style={{ padding: '14px 16px', borderRadius: 12, background: gagne ? 'var(--green-bg)' : 'var(--red-bg)', border: '1px solid var(--line-soft)' }}>
          <div className="fs12 tx-lo">{gagne ? 'Le partenariat rapporte à Shine' : 'Le partenariat coûte à Shine'}</div>
          <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--mono)', color: gagne ? 'var(--green)' : 'var(--red, #c0392b)' }}>{dh(t.shineShare)}</div>
          <div className="fs12 tx-mid" style={{ lineHeight: 1.6, marginTop: 6 }}>
            {shinePct} % de la {M.base} ({dh(t.basePartage)}) sur {t.deliveredOrders} commande(s), {t.unitsSold} unité(s) vendues.<br />
            CA de ses produits {dh(t.revenue)} · pub {dh(t.pubTotale)}{t.modePub === 'partenaire' ? ' (à sa charge)' : ' (partagée)'}{roas != null && <> · chaque dirham de pub a rapporté <b>{roas.toFixed(2)} DH</b> de CA</>}.
          </div>
          <p className="fs11 tx-lo" style={{ margin: '8px 0 0', lineHeight: 1.5 }}>
            {gagne
              ? 'Après avoir rendu au partenaire son argent et sa part, il reste ce montant à Shine.'
              : t.modePub === 'partenaire'
                ? 'La marge de ses produits ne couvre pas encore les frais de vente : la perte se partage.'
                : 'La marge de ses produits ne couvre pas encore la pub et les frais : la perte se partage, Shine en porte sa part.'}
          </p>
        </div>
        <div>
          <table className="table-modern" style={{ width: '100%' }}>
            <tbody>
              <L l="Encaissé sur ses produits" note="payé par les clientes, remises déduites" v={t.revenue} />
              {(t.advances ?? 0) > 0 && <L l="Avances qu'il t'a remises" note="ex. budget pub" v={t.advances} />}
              <L l="Pub de ses campagnes" note="dépensée par Shine chez Meta" v={-t.adsLinked} />
              {(t.adsMixed ?? 0) > 0 && <L l="Sa part des campagnes mixtes" note="au prorata de ses ventes" v={-(t.adsMixed ?? 0)} />}
              <L l="Livraison nette & frais" note="payés par Shine (Sendit)" v={-t.orderCosts} />
              <L l="Emballage" note="payé par Shine, 7 DH par colis" v={-t.packaging} />
              {t.returns > 0 && <L l="Retours" v={-t.returns} />}
              {t.expensesPaidByShine > 0 && <L l="Frais du partenariat payés par Shine" v={-t.expensesPaidByShine} />}
              {paid > 0 && <L l="Déjà versé au partenaire" v={-paid} />}
              <L l="= Argent du partenariat chez Shine" v={garde} gras signe={false} />
              <L l={t.modePub === 'partenaire' ? '− À lui rendre (son stock vendu, son avance moins la pub, sa part)' : '− À lui rendre (son stock vendu, ses avances, sa part)'} v={-balance} />
              <L l={revientShine >= 0 ? '= Ce qui revient à Shine' : '= Ce que Shine perd'} note={`égal à sa part de la ${M.base} (${shinePct} %)`} v={revientShine} gras signe={false} />
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  )
}

/**
 * LES DEUX ACCORDS, COTE A COTE, SUR LES MEMES CHIFFRES DEPUIS LE DEBUT.
 * Seul change ce qui se partage : la marge apres pub, ou la marge avant pub
 * avec toute la pub pour le partenaire. Le reste (son stock vendu, ses frais,
 * ses avances, les versements) est identique dans les deux colonnes.
 */
function Scenarios({ partnerId, shinePct, S, onChange }: { partnerId: number; shinePct: number; S: Data['settlement']; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const ordre: ModePub[] = ['partenaire', 'partage']
  const appliquer = async (m: ModePub) => {
    if (!confirm(`Passer l'accord à « ${MODES[m].titre} » ? Tout le relevé et le tableau de bord seront recalculés depuis le début.`)) return
    setBusy(true)
    await fetch(`/api/ops/partners/${partnerId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modePub: m }) })
    setBusy(false); onChange()
  }
  const lignes: { l: string; note?: string; v: (m: ModePub) => number; gras?: boolean }[] = [
    { l: 'Ce qui se partage', note: `marge avant pub ${dh(S.margeAvantPub)} · pub ${dh(S.pubTotale)}`, v: (m) => S.scenarios[m].basePartage },
    { l: `Part Shine (${shinePct} %)`, v: (m) => S.scenarios[m].shineShare, gras: true },
    { l: `Part partenaire (${100 - shinePct} %)`, v: (m) => S.scenarios[m].partnerShare },
    { l: '− Pub à sa charge', v: (m) => (S.scenarios[m].pubPartenaire ? -S.scenarios[m].pubPartenaire : 0) },
    { l: '= Ce que gagne le partenaire', v: (m) => S.scenarios[m].partnerShare - S.scenarios[m].pubPartenaire, gras: true },
    { l: 'À lui rendre aujourd’hui', note: 'son stock vendu + ses frais + ses avances + sa part − pub − versé', v: (m) => S.scenarios[m].balance, gras: true },
  ]
  return (
    <Section titre="Les deux accords possibles — depuis le début" note="Mêmes ventes, mêmes frais, même pub : seul change qui paie la pub. La colonne encadrée est l'accord appliqué partout (solde, bilan, tableau de bord).">
      <Defilant>
        <table className="table-modern" style={{ width: '100%' }}>
          <thead><tr>
            <th />
            {ordre.map((m) => (
              <th key={m} style={{ textAlign: 'right', verticalAlign: 'bottom', padding: '8px 6px', background: m === S.modePub ? 'var(--green-bg)' : undefined }}>
                <div style={{ color: 'var(--tx-hi)', whiteSpace: 'normal' }}>{MODES[m].court}</div>
                {m === S.modePub
                  ? <span className="badge-modern badge-sm badge-success">accord actuel</span>
                  : <button className="btn-modern btn-subtle btn-sm" disabled={busy} onClick={() => appliquer(m)}>Appliquer</button>}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {lignes.map((x) => (
              <tr key={x.l} style={x.gras ? { borderTop: '1px solid var(--line-soft)' } : undefined}>
                <td style={{ padding: '8px 6px' }}><div className="fs12" style={{ fontWeight: x.gras ? 800 : 500, color: 'var(--tx-hi)' }}>{x.l}</div>{x.note && <div className="fs11 tx-faint">{x.note}</div>}</td>
                {ordre.map((m) => {
                  const v = x.v(m)
                  return <td key={m} style={{ textAlign: 'right', padding: '8px 6px', fontSize: 12, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', fontWeight: x.gras ? 800 : 500, background: m === S.modePub ? 'var(--green-bg)' : undefined, color: x.gras && v < 0 ? 'var(--red, #c0392b)' : 'var(--tx-hi)' }}>{dh(v)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Defilant>
      <p className="fs12 tx-lo" style={{ margin: '10px 0 0', lineHeight: 1.55 }}>
        {MODES.partenaire.titre} : {MODES.partenaire.regle}. {MODES.partage.titre} : {MODES.partage.regle} — Shine porte alors {shinePct} % de la pub alors que le budget vient de lui.
      </p>
    </Section>
  )
}

function Partage({ shinePct, shine, partner, net, base }: { shinePct: number; shine: number; partner: number; net: number; base: string }) {
  if (net === 0) return null
  const tot = Math.abs(shine) + Math.abs(partner)
  const wS = tot > 0 ? (Math.abs(shine) / tot) * 100 : 0
  return (
    <div className="card-modern" style={{ padding: '12px 14px', marginTop: 10 }} title={`Chaque part = son % de la ${base} de la période`}>
      <div className="fs12 tx-lo" style={{ marginBottom: 6 }}>Partage de la {base} {net < 0 ? '(négative : la perte se partage comme le gain)' : ''}</div>
      <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'var(--line-soft)' }}>
        <div style={{ width: `${wS}%`, background: 'var(--green)', transition: 'width .2s' }} />
        <div style={{ width: `${100 - wS}%`, background: 'var(--amber)', transition: 'width .2s' }} />
      </div>
      <div className="fs12 tx-mid" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: 'var(--mono)' }}>
        <span><span style={{ color: 'var(--green)', fontWeight: 800 }}>■</span> Shine {shinePct} % → <b>{dh(shine)}</b></span>
        <span><span style={{ color: 'var(--amber)', fontWeight: 800 }}>■</span> Partenaire {100 - shinePct} % → <b>{dh(partner)}</b></span>
      </div>
    </div>
  )
}
function Ligne({ label, note, valeur }: { label: string; note?: string; valeur: number }) {
  return (
    <tr>
      <td><div className="fs13" style={{ color: 'var(--tx-hi)' }}>{label}</div>{note && <div className="fs11 tx-faint">{note}</div>}</td>
      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', color: valeur < 0 ? 'var(--tx-mid)' : 'var(--tx-hi)' }}>{valeur > 0 ? '+ ' : valeur < 0 ? '− ' : ''}{dh(Math.abs(valeur))}</td>
    </tr>
  )
}
function Total({ label, note, valeur }: { label: string; note?: string; valeur: number }) {
  return (
    <tr style={{ borderTop: '2px solid var(--line-soft)' }}>
      <td><div style={{ fontWeight: 800, color: 'var(--tx-hi)' }}>{label}</div>{note && <div className="fs11 tx-faint">{note}</div>}</td>
      <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', color: valeur < 0 ? 'var(--red, #c0392b)' : 'var(--green)' }}>{dh(valeur)}</td>
    </tr>
  )
}
function Num({ v, gras }: { v: number; gras?: boolean }) {
  return <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', fontWeight: gras ? 800 : 400 }}>{dh(v)}</td>
}

function Periode({ start, today, courante, onChange }: { start: string; today: string; courante: { from: string; to: string }; onChange: (p: { from: string; to: string }) => void }) {
  const t = enDate(today)
  const prec = new Date(t.getFullYear(), t.getMonth() - 1, 1)
  const choix = [
    { label: 'Depuis le début', from: start, to: today },
    { label: 'Ce mois', from: moisDebut(t) < start ? start : moisDebut(t), to: today },
    { label: 'Mois dernier', from: moisDebut(prec), to: moisFin(prec) },
  ]
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 16 }}>
      {choix.map((c) => {
        const actif = c.from === courante.from && c.to === courante.to
        return <button key={c.label} className="btn-modern btn-subtle btn-sm" aria-pressed={actif} onClick={() => onChange({ from: c.from, to: c.to })} style={actif ? { background: 'var(--green-bg)', color: 'var(--green)', fontWeight: 700 } : undefined}>{c.label}</button>
      })}
      <span className="fs12 tx-lo" style={{ marginLeft: 6 }}>du</span>
      <input type="date" className="input-modern" value={courante.from} onChange={(e) => e.target.value && onChange({ from: e.target.value, to: courante.to })} style={{ padding: '4px 8px', width: 150, flex: 'none' }} />
      <span className="fs12 tx-lo">au</span>
      <input type="date" className="input-modern" value={courante.to} onChange={(e) => e.target.value && onChange({ from: courante.from, to: e.target.value })} style={{ padding: '4px 8px', width: 150, flex: 'none' }} />
    </div>
  )
}

function Depenses({ partnerId, depenses, today, onChange }: { partnerId: number; depenses: Expense[]; today: string; onChange: () => void }) {
  const [f, setF] = useState({ date: today, category: CATEGORIES[0], label: '', amount: '', paidBy: 'partner' as 'shine' | 'partner' })
  const [err, setErr] = useState('')
  const ajouter = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    const r = await fetch(`/api/ops/partners/${partnerId}/expenses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, amount: Number(f.amount) }) })
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || 'Échec'); return }
    setF({ ...f, label: '', amount: '' }); onChange()
  }
  const suppr = async (x: Expense) => {
    if (!confirm(`Supprimer « ${x.category}${x.label ? ' — ' + x.label : ''} » (${dh(x.amount)}) ?`)) return
    await fetch(`/api/ops/partners/${partnerId}/expenses?expenseId=${x.id}`, { method: 'DELETE' }); onChange()
  }
  return (
    <Section titre="Dépenses et avances du partenariat" note="Dépenses : tout ce que les commandes ne portent pas (douane, transport, cartons, publicité hors campagnes liées) — indique qui a payé. Avance reçue : l'argent que le partenaire te remet (ex. un budget pub) — il lui est dû et ne réduit pas la marge ; le coût réel de la pub, ce sont ses campagnes liées.">
      <form onSubmit={ajouter} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <Champ label="Date"><input type="date" className="input-modern" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} style={{ width: 150 }} /></Champ>
        <Champ label="Catégorie"><select className="input-modern" style={{ width: 180 }} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value, ...(e.target.value === AVANCE ? { paidBy: 'partner' as const } : {}) })}>{CATEGORIES.map((c) => <option key={c} value={c}>{c === AVANCE ? 'Avance reçue (argent remis à Shine)' : c}</option>)}</select></Champ>
        <Champ label="Libellé" grand><input className="input-modern" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="ex. dédouanement lot septembre" style={{ width: '100%' }} /></Champ>
        <Champ label="Montant (DH)"><input type="number" step="0.01" min="0" className="input-modern" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} style={{ width: 110 }} /></Champ>
        <Champ label="Payé par"><select className="input-modern" style={{ width: 150 }} value={f.paidBy} disabled={f.category === AVANCE} onChange={(e) => setF({ ...f, paidBy: e.target.value as 'shine' | 'partner' })}><option value="partner">Le partenaire</option><option value="shine">Shine</option></select></Champ>
        <button className="btn-modern btn-sm" disabled={!f.amount}>Ajouter</button>
        {err && <div className="fs12" style={{ color: 'var(--red, #c0392b)', width: '100%' }}>{err}</div>}
      </form>
      {depenses.length === 0 ? <p className="fs12 tx-faint" style={{ margin: 0 }}>Aucune dépense sur cette période.</p> : (
        <Defilant>
          <table className="table-modern" style={{ width: '100%', minWidth: 560 }}>
            <thead><tr><th>Date</th><th>Catégorie</th><th>Libellé</th><th>Payé par</th><th style={{ textAlign: 'right' }}>Montant</th><th /></tr></thead>
            <tbody>{depenses.map((x) => (
              <tr key={x.id}>
                <td className="fs12">{jour(x.date)}</td>
                <td className="fs12">{x.category === AVANCE ? <span className="badge-modern badge-sm badge-info" title="Argent remis à Shine : il lui est dû, ce n'est pas un coût">Avance reçue</span> : x.category}</td>
                <td className="fs12">{x.label || '—'}</td>
                <td className="fs12">{x.category === AVANCE ? 'Partenaire → Shine' : x.paidBy === 'partner' ? 'Partenaire' : 'Shine'}</td><Num v={x.amount} />
                <td style={{ textAlign: 'right' }}><button className="btn-modern btn-subtle btn-sm" onClick={() => suppr(x)} aria-label="Supprimer"><Trash2 style={{ width: 13, height: 13 }} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </Defilant>
      )}
    </Section>
  )
}

type Mode = 'dedie' | 'mixte' | ''
function Campagnes({ partnerId, campagnes, depensePeriode, mixtes, onChange }: { partnerId: number; campagnes: Campaign[] | null; depensePeriode: { externalId: string; spend: number }[]; mixtes: { externalId: string; part: number; allocated: number }[]; onChange: (c: Campaign[]) => void }) {
  const [sel, setSel] = useState<Map<string, Mode>>(new Map())
  const [busy, setBusy] = useState(false)
  const modeDe = (c: Campaign): Mode => (c.mode ?? (c.linked ? 'dedie' : null)) || ''
  useEffect(() => { if (campagnes) setSel(new Map(campagnes.map((c) => [c.externalId, modeDe(c)]))) }, [campagnes])
  const modifie = useMemo(() => campagnes ? campagnes.some((c) => modeDe(c) !== (sel.get(c.externalId) ?? '')) : false, [campagnes, sel])
  const enregistrer = async () => {
    setBusy(true)
    const de = (m: Mode) => [...sel].filter(([, v]) => v === m).map(([k]) => k)
    await fetch(`/api/ops/partners/${partnerId}/campaigns`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ externalIds: de('dedie'), mixtes: de('mixte') }) })
    const d = await fetch(`/api/ops/partners/${partnerId}/campaigns`, { cache: 'no-store' }).then((r) => r.json())
    setBusy(false); onChange(d.campaigns)
  }
  return (
    <Section titre="Publicité" note="« Ses produits seulement » : toute la dépense entre dans son relevé. « Mixte » (catalogue, pub qui montre aussi les produits Shine) : seule sa part entre, au prorata de ses ventes du mois. La dépense retenue entre dans « Pub » — partagée ou à sa charge selon l'accord (Paramètres).">
      {campagnes === null ? <div className="skeleton-line" style={{ width: '30%', height: 12 }} />
        : campagnes.length === 0 ? <p className="fs12 tx-faint" style={{ margin: 0 }}>Aucune campagne synchronisée sur les 90 derniers jours.</p>
        : (
          <>
            <div style={{ display: 'grid', gap: 4 }}>
              {campagnes.map((c) => {
                const periode = depensePeriode.find((d) => d.externalId === c.externalId)
                const mixte = mixtes.find((d) => d.externalId === c.externalId)
                const m = sel.get(c.externalId) ?? ''
                return (
                  <div key={c.externalId} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '6px 4px', borderBottom: '1px solid var(--line-soft)' }}>
                    <span className="fs12" style={{ flex: '1 1 220px', minWidth: 0, color: 'var(--tx-hi)' }}>{c.name || c.externalId}</span>
                    <span className="fs11 tx-lo" style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                      {dh(c.spend)} / 90 j
                      {periode ? ` · ${dh(periode.spend)} sur la période` : ''}
                      {mixte ? ` · sa part ${Math.round(mixte.part * 100)} % = ${dh(mixte.allocated)}` : ''}
                    </span>
                    <select className="input-modern" aria-label={`Rattachement de ${c.name || c.externalId}`} value={m} style={{ width: 200, flex: 'none', padding: '4px 8px' }}
                      onChange={(e) => { const n = new Map(sel); n.set(c.externalId, e.target.value as Mode); setSel(n) }}>
                      <option value="">Non liée</option>
                      <option value="dedie">Ses produits (100 %)</option>
                      <option value="mixte">Mixte (prorata ventes)</option>
                    </select>
                  </div>
                )
              })}
            </div>
            <button className="btn-modern btn-sm" style={{ marginTop: 10 }} disabled={!modifie || busy} onClick={enregistrer}>{busy ? 'Enregistrement…' : 'Enregistrer la publicité'}</button>
          </>
        )}
    </Section>
  )
}

function Versements({ partnerId, versements, today, solde, onChange }: { partnerId: number; versements: Payment[]; today: string; solde: number; onChange: () => void }) {
  const [f, setF] = useState({ date: today, amount: '', method: 'Virement', note: '' })
  const [err, setErr] = useState('')
  const ajouter = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    const r = await fetch(`/api/ops/partners/${partnerId}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, amount: Number(f.amount) }) })
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || 'Échec'); return }
    setF({ ...f, amount: '', note: '' }); onChange()
  }
  const suppr = async (x: Payment) => {
    if (!confirm(`Supprimer le versement de ${dh(x.amount)} du ${jour(x.date)} ?`)) return
    await fetch(`/api/ops/partners/${partnerId}/payments?paymentId=${x.id}`, { method: 'DELETE' }); onChange()
  }
  return (
    <Section titre="Versements au partenaire" note={`Chaque paiement que Shine lui fait. Solde actuel : ${dh(solde)}.`}>
      <form onSubmit={ajouter} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <Champ label="Date"><input type="date" className="input-modern" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} style={{ width: 150 }} /></Champ>
        <Champ label="Montant (DH)"><input type="number" step="0.01" min="0" className="input-modern" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} style={{ width: 120 }} /></Champ>
        <Champ label="Mode"><select className="input-modern" style={{ width: 130 }} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{['Virement', 'Espèces', 'Autre'].map((m) => <option key={m}>{m}</option>)}</select></Champ>
        <Champ label="Note" grand><input className="input-modern" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} style={{ width: '100%' }} /></Champ>
        <button className="btn-modern btn-sm" disabled={!f.amount}>Enregistrer</button>
        {err && <div className="fs12" style={{ color: 'var(--red, #c0392b)', width: '100%' }}>{err}</div>}
      </form>
      {versements.length === 0 ? <p className="fs12 tx-faint" style={{ margin: 0 }}>Aucun versement pour l&apos;instant.</p> : (
        <Defilant>
          <table className="table-modern" style={{ width: '100%', minWidth: 480 }}>
            <thead><tr><th>Date</th><th>Mode</th><th>Note</th><th style={{ textAlign: 'right' }}>Montant</th><th /></tr></thead>
            <tbody>{versements.map((x) => (
              <tr key={x.id}>
                <td className="fs12">{jour(x.date)}</td><td className="fs12">{x.method || '—'}</td><td className="fs12">{x.note || '—'}</td><Num v={x.amount} />
                <td style={{ textAlign: 'right' }}><button className="btn-modern btn-subtle btn-sm" onClick={() => suppr(x)} aria-label="Supprimer"><Trash2 style={{ width: 13, height: 13 }} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </Defilant>
      )}
    </Section>
  )
}

function Parametres({ partner, modePub, onChange }: { partner: Data['ledger']['partner']; modePub: ModePub; onChange: () => void }) {
  const [f, setF] = useState({ name: partner.name, shinePct: String(partner.shinePct), startDate: partner.startDate, notes: partner.notes || '', modePub })
  useEffect(() => { setF((v) => ({ ...v, modePub })) }, [modePub])
  const [ok, setOk] = useState(false)
  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault(); setOk(false)
    const r = await fetch(`/api/ops/partners/${partner.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, shinePct: Number(f.shinePct) }) })
    if (r.ok) { setOk(true); onChange() }
  }
  return (
    <Section titre="Paramètres du partenariat">
      <form onSubmit={enregistrer} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Champ label="Nom" grand><input className="input-modern" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ width: '100%' }} /></Champ>
        <Champ label="Part de Shine (%)"><input type="number" min="0" max="100" className="input-modern" value={f.shinePct} onChange={(e) => setF({ ...f, shinePct: e.target.value })} style={{ width: 90 }} /></Champ>
        <Champ label="Début"><input type="date" className="input-modern" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} style={{ width: 150 }} /></Champ>
        <Champ label="Publicité"><select className="input-modern" style={{ width: 240 }} value={f.modePub} onChange={(e) => setF({ ...f, modePub: e.target.value as ModePub })}><option value="partenaire">À la charge du partenaire</option><option value="partage">Partagée comme un frais</option></select></Champ>
        <Champ label="Accord convenu" grand><input className="input-modern" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} style={{ width: '100%' }} /></Champ>
        <button className="btn-modern btn-sm">Enregistrer</button>
        {ok && <span className="fs12" style={{ color: 'var(--green)' }}>Enregistré</span>}
      </form>
    </Section>
  )
}

/* Le stock du partenaire : chaque entree est confiee par lui (jamais un achat
   de Shine), et un nouveau produit se cree ici, rattache d'office. */
function GestionStock({ partnerId, partnerName, stock, onChange }: { partnerId: number; partnerName: string; stock: StockRow[]; onChange: () => void }) {
  const [ouvert, setOuvert] = useState<number | null>(null)
  const [qty, setQty] = useState('')
  const [cout, setCout] = useState('')
  const [emode, setEmode] = useState<'in' | 'out' | 'set'>('in')
  const [eerr, setEerr] = useState('')
  const [ebusy, setEbusy] = useState(false)
  const [montreNouveau, setMontreNouveau] = useState(false)
  const [n, setN] = useState({ name: '', brand: '', price: '', cost: '', qty: '', category: 'Visage' })
  const [nerr, setNerr] = useState('')
  const [nbusy, setNbusy] = useState(false)
  const [montreRattacher, setMontreRattacher] = useState(false)
  const [rq, setRq] = useState('')
  const [rr, setRr] = useState<{ id: number; name: string; brand: string; stock: number; partnerId: number | null }[] | null>(null)
  const [rerr, setRerr] = useState('')
  const [rbusy, setRbusy] = useState<number | null>(null)

  const ouvrirEntree = (s: StockRow) => {
    setOuvert(s.id); setQty(''); setCout(s.costPrice ? String(s.costPrice) : ''); setEerr(''); setEmode('in')
  }
  const envoyerEntree = async (s: StockRow) => {
    setEerr('')
    const brut = Math.trunc(Number(qty))
    if (!Number.isInteger(brut) || (emode !== 'set' && brut === 0) || (emode === 'set' && brut < 0)) { setEerr(emode === 'set' ? 'Stock réel entier, 0 ou plus' : 'Quantité entière non nulle'); return }
    // « set » = inventaire : on saisit le stock REEL, le mouvement applique la difference.
    const q = emode === 'set' ? brut - s.stock : emode === 'out' ? -Math.abs(brut) : Math.abs(brut)
    if (q === 0) { setOuvert(null); return }
    setEbusy(true)
    try {
      const r = await fetch(`/api/ops/partners/${partnerId}/stock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: s.id, quantity: q, ...(cout !== '' && q > 0 ? { costPerUnit: Number(cout) } : {}) }),
      })
      if (!r.ok) { setEerr((await r.json().catch(() => ({}))).error || 'Échec'); return }
      setOuvert(null); onChange()
    } finally { setEbusy(false) }
  }
  const detacher = async (s: StockRow) => {
    if (!confirm(`Détacher « ${s.name} » de ${partnerName} ?\n\nSon stock redevient celui de Shine et ses ventes — y compris passées — sortent du relevé.`)) return
    const r = await fetch(`/api/ops/products/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partnerId: null }) })
    if (!r.ok) { alert((await r.json().catch(() => ({}))).error || 'Échec'); return }
    onChange()
  }
  const chercher = async (e?: React.FormEvent) => {
    e?.preventDefault(); setRerr('')
    if (rq.trim().length < 2) { setRerr('Tape au moins 2 lettres'); return }
    const r = await fetch(`/api/ops/products?search=${encodeURIComponent(rq.trim())}`, { cache: 'no-store' })
    if (!r.ok) { setRerr('Recherche impossible'); return }
    setRr(await r.json())
  }
  const rattacher = async (p: { id: number; name: string; partnerId: number | null }) => {
    if (p.partnerId === partnerId) return
    if (p.partnerId != null && !confirm(`« ${p.name} » appartient déjà à un autre partenaire. Le transférer à ${partnerName} ?`)) return
    setRerr(''); setRbusy(p.id)
    try {
      const r = await fetch(`/api/ops/products/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partnerId }) })
      if (!r.ok) { setRerr((await r.json().catch(() => ({}))).error || 'Échec'); return }
      setRr((v) => (v ? v.filter((x) => x.id !== p.id) : v)); onChange()
    } finally { setRbusy(null) }
  }
  const creerProduit = async (e: React.FormEvent) => {
    e.preventDefault(); setNerr('')
    if (!n.name.trim()) { setNerr('Le nom du produit est requis'); return }
    if (n.price === '' || Number(n.price) < 0) { setNerr('Prix de vente invalide'); return }
    setNbusy(true)
    try {
      const r = await fetch(`/api/ops/partners/${partnerId}/products`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: n.name.trim(), brand: n.brand.trim() || partnerName,
          price: Number(n.price), ...(n.cost !== '' ? { costPrice: Number(n.cost) } : {}),
          category: n.category, ...(n.qty !== '' ? { quantity: Math.trunc(Number(n.qty)) } : {}),
        }),
      })
      if (!r.ok) { setNerr((await r.json().catch(() => ({}))).error || 'Échec'); return }
      setN({ name: '', brand: '', price: '', cost: '', qty: '', category: 'Visage' })
      setMontreNouveau(false); onChange()
    } finally { setNbusy(false) }
  }

  return (
    <Section titre="Son stock chez Shine" note="Le stock restant lui appartient : sa valeur au coût n'entre pas dans le patrimoine de Shine. Chaque mouvement est un dépôt du partenaire — jamais un achat de Shine. Bouton Stock : entrée, sortie/correction, ou ajustement au réel compté.">
      <Defilant>
        <table className="table-modern" style={{ width: '100%', minWidth: 820 }}>
          <thead><tr>
            <th>Produit</th><th style={{ textAlign: 'right' }}>Prix</th><th style={{ textAlign: 'right' }}>Achat</th><th style={{ textAlign: 'right' }}>Marge u.</th>
            <th style={{ textAlign: 'right' }}>Entrés</th><th style={{ textAlign: 'right' }}>Vendus</th><th style={{ textAlign: 'right' }}>En cours</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Valeur au coût</th><th />
          </tr></thead>
          <tbody>
            {stock.map((s) => (
              <Fragment key={s.id}>
                <tr>
                  <td style={{ minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {s.image ? <img src={s.image} alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} /> : <span style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--line-soft)', flexShrink: 0 }} />}
                      <div style={{ minWidth: 0 }}>
                        <div className="fs12" style={{ fontWeight: 600, color: 'var(--tx-hi)', lineHeight: 1.3 }}>{s.name}</div>
                        <div className="fs11 tx-lo">{s.brand} · #{s.id}</div>
                      </div>
                    </div>
                  </td>
                  <Num v={s.price} /><Num v={s.costPrice} /><Num v={s.unitMargin} />
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{s.entrees}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{s.vendus}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{s.enCours || '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: s.stock <= 0 ? 'var(--red, #c0392b)' : 'var(--tx-hi)' }}>{s.stock}</td>
                  <Num v={s.valeurCout} />
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn-modern btn-subtle btn-sm" onClick={() => (ouvert === s.id ? setOuvert(null) : ouvrirEntree(s))}>Stock</button>
                    <button className="btn-modern btn-subtle btn-sm" style={{ marginLeft: 4 }} title="Détacher ce produit du partenaire" onClick={() => detacher(s)}>Détacher</button>
                  </td>
                </tr>
                {ouvert === s.id && (
                  <tr key={`${s.id}-entree`}>
                    <td colSpan={10} style={{ background: 'var(--bg-2)' }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: 'var(--bg-3)', borderRadius: 8 }}>
                          {([['in', '+ Entrée'], ['out', '− Sortie'], ['set', '= Réel']] as ['in' | 'out' | 'set', string][]).map(([m, label]) => (
                            <button key={m} type="button" className="btn-modern btn-sm" onClick={() => { setEmode(m); setEerr('') }}
                              title={m === 'in' ? 'Le partenaire confie du stock' : m === 'out' ? 'Retrait, casse ou correction négative' : 'Inventaire : saisir le stock réel compté'}
                              style={{ background: emode === m ? 'var(--card)' : 'transparent', color: emode === m ? 'var(--tx-hi)' : 'var(--tx-lo)', boxShadow: emode === m ? '0 1px 3px rgba(0,0,0,.08)' : 'none', fontWeight: emode === m ? 700 : 500 }}>
                              {label}
                            </button>
                          ))}
                        </div>
                        <Champ label={emode === 'set' ? `Stock réel compté (actuel : ${s.stock})` : emode === 'out' ? 'Quantité à retirer' : 'Quantité confiée'}><input type="number" step="1" min={emode === 'set' ? 0 : 1} className="input-modern" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 110 }} autoFocus /></Champ>
                        {emode === 'in' && (
                          <Champ label="Prix d'achat (DH/u.)"><input type="number" step="0.01" min="0" className="input-modern" value={cout} onChange={(e) => setCout(e.target.value)} placeholder={String(s.costPrice || '')} style={{ width: 130 }} /></Champ>
                        )}
                        <button className="btn-modern btn-sm" disabled={ebusy} onClick={() => envoyerEntree(s)}>{ebusy ? 'Enregistrement…' : 'Enregistrer'}</button>
                        <button className="btn-modern btn-subtle btn-sm" onClick={() => setOuvert(null)}>Annuler</button>
                        {eerr && <div className="fs12" style={{ color: 'var(--red, #c0392b)', width: '100%' }}>{eerr}</div>}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            <tr style={{ borderTop: '2px solid var(--line-soft)', fontWeight: 800 }}>
              <td>Total</td><td /><td /><td />
              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{stock.reduce((a, s) => a + s.entrees, 0)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{stock.reduce((a, s) => a + s.vendus, 0)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{stock.reduce((a, s) => a + s.enCours, 0)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{stock.reduce((a, s) => a + s.stock, 0)}</td>
              <Num v={stock.reduce((a, s) => a + s.valeurCout, 0)} gras />
              <td />
            </tr>
          </tbody>
        </table>
      </Defilant>

      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!montreNouveau ? (
          <button className="btn-modern btn-sm" onClick={() => { setMontreNouveau(true); setMontreRattacher(false); setN((v) => ({ ...v, brand: v.brand || partnerName })) }}>+ Nouveau produit</button>
        ) : null}
        {!montreRattacher ? (
          <button className="btn-modern btn-subtle btn-sm" onClick={() => { setMontreRattacher(true); setMontreNouveau(false); setRr(null); setRq(''); setRerr('') }}>Rattacher un produit existant</button>
        ) : null}
      </div>
      {montreNouveau && (
          <form onSubmit={creerProduit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', background: 'var(--bg-2)', borderRadius: 8, padding: 12 }}>
            <Champ label="Nom du produit" grand><input className="input-modern" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} placeholder="ex. Sérum riz & niacinamide 30ml" style={{ width: '100%' }} /></Champ>
            <Champ label="Marque"><input className="input-modern" value={n.brand} onChange={(e) => setN({ ...n, brand: e.target.value })} placeholder={partnerName} style={{ width: 150 }} /></Champ>
            <Champ label="Catégorie"><select className="input-modern" value={n.category} onChange={(e) => setN({ ...n, category: e.target.value })} style={{ width: 120 }}>{['Visage', 'Corps', 'Cheveux'].map((c) => <option key={c}>{c}</option>)}</select></Champ>
            <Champ label="Prix de vente (DH)"><input type="number" step="0.01" min="0" className="input-modern" value={n.price} onChange={(e) => setN({ ...n, price: e.target.value })} style={{ width: 110 }} /></Champ>
            <Champ label="Prix d'achat (DH)"><input type="number" step="0.01" min="0" className="input-modern" value={n.cost} onChange={(e) => setN({ ...n, cost: e.target.value })} placeholder="payé par le partenaire" style={{ width: 130 }} /></Champ>
            <Champ label="Stock confié"><input type="number" step="1" min="0" className="input-modern" value={n.qty} onChange={(e) => setN({ ...n, qty: e.target.value })} placeholder="0" style={{ width: 90 }} /></Champ>
            <button className="btn-modern btn-sm" disabled={nbusy}>{nbusy ? 'Création…' : 'Créer le produit'}</button>
            <button type="button" className="btn-modern btn-subtle btn-sm" onClick={() => setMontreNouveau(false)}>Annuler</button>
            {nerr && <div className="fs12" style={{ color: 'var(--red, #c0392b)', width: '100%' }}>{nerr}</div>}
          </form>
        )}
      {montreRattacher && (
        <div style={{ background: 'var(--bg-2)', borderRadius: 8, padding: 12, width: '100%' }}>
          <form onSubmit={chercher} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Champ label="Chercher un produit"><input className="input-modern" value={rq} onChange={(e) => setRq(e.target.value)} placeholder="nom, marque…" style={{ width: 220 }} /></Champ>
            <button className="btn-modern btn-sm">Chercher</button>
            <button type="button" className="btn-modern btn-subtle btn-sm" onClick={() => setMontreRattacher(false)}>Fermer</button>
            {rerr && <div className="fs12" style={{ color: 'var(--red, #c0392b)', width: '100%' }}>{rerr}</div>}
          </form>
          {rr && (rr.length === 0 ? <p className="fs12 tx-faint" style={{ margin: '8px 0 0' }}>Aucun produit trouvé.</p> : (
            <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
              {rr.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', borderBottom: '1px solid var(--line-soft)' }}>
                  <span className="fs12" style={{ flex: 1, minWidth: 0, color: 'var(--tx-hi)' }}>{p.name} <span className="tx-lo">· {p.brand} · stock {p.stock}{p.partnerId === partnerId ? ' · déjà rattaché' : p.partnerId != null ? ' · autre partenaire' : ''}</span></span>
                  {p.partnerId !== partnerId && (
                    <button className="btn-modern btn-sm" disabled={rbusy === p.id} onClick={() => rattacher(p)}>{rbusy === p.id ? '…' : 'Rattacher'}</button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function Champ({ label, grand, children }: { label: string; grand?: boolean; children: React.ReactNode }) {
  return <label style={{ flex: grand ? '1 1 200px' : '0 0 auto' }}><div className="fs11 tx-lo" style={{ marginBottom: 3 }}>{label}</div>{children}</label>
}

/** Le releve a partager avec le partenaire, lisible dans Excel (point-virgule, BOM UTF-8). */
function exporterCsv(d: Data) {
  const L = d.ledger, T = L.totals, S = d.settlement
  const n = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',')
  const rows: (string | number)[][] = [
    [`Relevé ${L.partner.name}`, `du ${L.period.from} au ${L.period.to}`],
    [],
    ['COMPTE DE RÉSULTAT DE LA PÉRIODE'],
    ['CA encaissé', n(T.revenue)], ["Coût d'achat des produits vendus", n(-T.cogs)], ['Livraison nette et frais de commande', n(-T.orderCosts)],
    ['Emballage', n(-T.packaging)], ['Colis retournés', n(-T.returns)],
    ...Object.entries(T.expensesByCategory).filter(([c]) => c !== 'Publicité').map(([c, v]) => [c, n(-v)]),
    ['= Marge avant pub', n(T.margeAvantPub)],
    ['Publicité (ses campagnes)', n(-T.adsLinked)], ['Publicité (part des campagnes mixtes)', n(-(T.adsMixed ?? 0))], ['Publicité (autres dépenses)', n(-T.pubDepenses)],
    ['= Marge nette (après pub)', n(T.net)],
    ['Accord', MODES[T.modePub].titre], ['Montant partagé', n(T.basePartage)],
    [`Part Shine (${L.partner.shinePct} %)`, n(T.shineShare)], [`Part partenaire (${100 - L.partner.shinePct} %)`, n(T.partnerShare)], ['Pub à sa charge', n(-T.pubPartenaire)],
    [],
    ['SOLDE DEPUIS LE DÉBUT'],
    ['Coût des produits vendus', n(S.cogsSold)], ["Dépenses payées par le partenaire", n(S.expensesPaidByPartner)], ['Avances remises à Shine', n(S.advances ?? 0)], [`Sa part de la ${MODES[S.modePub].base}`, n(S.partnerShare)], ['Pub à sa charge', n(-S.pubPartenaire)], ['Déjà versé', n(-S.paid)], ['À reverser', n(S.balance)],
    [],
    ['VENTES'], ['Livrée le', 'Commande', 'Produit', 'Qté', 'CA', 'Achat', 'Livraison & frais', 'Emballage', 'Marge'],
    ...L.lines.map((l) => [l.deliveredAt.slice(0, 10), l.orderNumber || `#${l.orderId}`, l.productName, l.quantity, n(l.revenue), n(l.cogs), n(l.orderCosts), n(l.packaging), n(l.margin)]),
    [],
    ['DÉPENSES'], ['Date', 'Catégorie', 'Libellé', 'Payé par', 'Montant'],
    ...[...L.expenses, ...(L.advancesDetail ?? [])].map((x) => [x.date, x.category, x.label || '', x.category === AVANCE ? 'Partenaire → Shine' : x.paidBy === 'partner' ? 'Partenaire' : 'Shine', n(x.amount)]),
    [],
    ['STOCK'], ['Produit', 'Marque', 'Prix', 'Achat', 'Entrés', 'Vendus', 'Stock', 'Valeur au coût'],
    ...d.stock.map((s) => [s.name, s.brand, n(s.price), n(s.costPrice), s.entrees, s.vendus, s.stock, n(s.valeurCout)]),
  ]
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = `releve-${L.partner.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${L.period.from}-${L.period.to}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
