'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
type Totals = { revenue: number; cogs: number; orderCosts: number; packaging: number; returns: number; adsLinked: number; expenses: number; expensesByCategory: Record<string, number>; expensesPaidByShine: number; expensesPaidByPartner: number; net: number; shineShare: number; partnerShare: number; deliveredOrders: number; unitsSold: number }
type Data = {
  today: string
  ledger: {
    partner: { id: number; name: string; shinePct: number; startDate: string; notes: string | null; active: boolean }
    period: { from: string; to: string }; packagingRate: number
    lines: Line[]; returnsDetail: { orderId: number; orderNumber: string | null; returnedAt: string; fee: number }[]
    adsDetail: { externalId: string; name: string; spend: number }[]; expenses: Expense[]; totals: Totals
  }
  stock: StockRow[]
  settlement: { cogsSold: number; expensesPaidByPartner: number; partnerShare: number; shineShare: number; net: number; owed: number; paid: number; balance: number; payments: Payment[] }
}
type Campaign = { externalId: string; name: string; platform: string; spend: number; lastDate: string; linked: boolean }

const CATEGORIES = ['Douane & taxes', 'Transport', 'Cartons & fournitures', 'Publicité', 'Autre']
const dh = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DH`
/* Une date AAAA-MM-JJ est un jour du calendrier, pas un instant : la lire
   comme de l'UTC la decale d'un jour dans tout fuseau a l'ouest de Greenwich. */
const enDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : new Date(s)
const jour = (iso: string) => enDate(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
const moisDebut = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA')
const moisFin = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('en-CA')

export default function PartenairePage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Data | null>(null)
  const [erreur, setErreur] = useState('')
  const [periode, setPeriode] = useState<{ from: string; to: string } | null>(null)
  const [campagnes, setCampagnes] = useState<Campaign[] | null>(null)

  const load = useCallback(async () => {
    const q = periode ? `?from=${periode.from}&to=${periode.to}` : ''
    const r = await fetch(`/api/ops/partners/${id}${q}`, { cache: 'no-store' })
    if (!r.ok) { setErreur(r.status === 404 ? 'Partenaire introuvable' : 'Chargement impossible'); return }
    setData(await r.json())
  }, [id, periode])
  useEffect(() => { load() }, [load])
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
          note={<>Dépôt-vente : le stock lui appartient, Shine le vend. Marge nette partagée <b>{P.shinePct} % Shine / {100 - P.shinePct} % partenaire</b>, depuis le {jour(P.startDate)}.</>}
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
              <div>+ sa part de la marge nette <b>{dh(S.partnerShare)}</b></div>
              <div>− déjà versé <b>{dh(S.paid)}</b></div>
            </div>
          </div>
          <p className="fs12 tx-lo" style={{ margin: '10px 0 0', lineHeight: 1.55 }}>
            Shine encaisse tout : elle lui rend l&apos;argent qu&apos;il a avancé pour chaque produit vendu, les frais qu&apos;il a réglés lui-même, et sa part du bénéfice. Une marge négative réduit sa part d&apos;autant — la perte se partage comme le gain.
          </p>
        </div>

        {/* ── Periode ─────────────────────────────────────────────────────── */}
        <Periode start={P.startDate} today={data.today} courante={L.period} onChange={setPeriode} />

        {/* ── Chiffres de la periode ──────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 12 }}>
          <Kpi label="CA livré" valeur={dh(T.revenue)} sous={`${T.deliveredOrders} commandes · ${T.unitsSold} unités`} />
          <Kpi label="Marge nette" valeur={dh(T.net)} couleur={T.net < 0 ? 'var(--red, #c0392b)' : 'var(--green)'} sous={T.revenue > 0 ? `${((T.net / T.revenue) * 100).toFixed(1)} % du CA` : '—'} />
          <Kpi label={`Part Shine (${P.shinePct} %)`} valeur={dh(T.shineShare)} />
          <Kpi label={`Part partenaire (${100 - P.shinePct} %)`} valeur={dh(T.partnerShare)} />
        </div>

        {/* ── Du CA a la marge nette ──────────────────────────────────────── */}
        <Section titre="Du chiffre d'affaires à la marge nette" note="Chaque ligne reprend le calcul du tableau de bord, au prorata de ses produits dans chaque commande.">
          <table className="table-modern" style={{ width: '100%' }}>
            <tbody>
              <Ligne label="CA encaissé sur ses produits" note="ce que les clientes ont réellement payé, remises déduites" valeur={T.revenue} />
              <Ligne label="Coût d'achat des produits vendus" note="son argent, qui lui est rendu" valeur={-T.cogs} />
              <Ligne label="Livraison nette et frais de commande" note="coût Sendit moins livraison facturée, commission, frais d'échec" valeur={-T.orderCosts} />
              <Ligne label={`Emballage (${L.packagingRate} DH par colis)`} note="au prorata des colis mixtes" valeur={-T.packaging} />
              <Ligne label="Colis retournés ou refusés" note={`${L.returnsDetail.length} commande(s)`} valeur={-T.returns} />
              <Ligne label="Publicité — campagnes liées" note={`${L.adsDetail.length} campagne(s)`} valeur={-T.adsLinked} />
              {CATEGORIES.filter((c) => T.expensesByCategory[c]).map((c) => (
                <Ligne key={c} label={c} note="dépense du partenariat" valeur={-T.expensesByCategory[c]} />
              ))}
              <tr style={{ borderTop: '2px solid var(--line-soft)' }}>
                <td style={{ fontWeight: 800, color: 'var(--tx-hi)' }}>Marge nette</td>
                <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--mono)', color: T.net < 0 ? 'var(--red, #c0392b)' : 'var(--green)' }}>{dh(T.net)}</td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* ── Stock ───────────────────────────────────────────────────────── */}
        <Section titre="Son stock chez Shine" note="Le stock restant lui appartient : sa valeur au coût n'entre pas dans le patrimoine de Shine.">
          <Defilant>
            <table className="table-modern" style={{ width: '100%', minWidth: 780 }}>
              <thead><tr>
                <th>Produit</th><th style={{ textAlign: 'right' }}>Prix</th><th style={{ textAlign: 'right' }}>Achat</th><th style={{ textAlign: 'right' }}>Marge u.</th>
                <th style={{ textAlign: 'right' }}>Entrés</th><th style={{ textAlign: 'right' }}>Vendus</th><th style={{ textAlign: 'right' }}>En cours</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Valeur au coût</th>
              </tr></thead>
              <tbody>
                {stock.map((s) => (
                  <tr key={s.id}>
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
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--line-soft)', fontWeight: 800 }}>
                  <td>Total</td><td /><td /><td />
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{stock.reduce((a, s) => a + s.entrees, 0)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{stock.reduce((a, s) => a + s.vendus, 0)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{stock.reduce((a, s) => a + s.enCours, 0)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{stock.reduce((a, s) => a + s.stock, 0)}</td>
                  <Num v={stock.reduce((a, s) => a + s.valeurCout, 0)} gras />
                </tr>
              </tbody>
            </table>
          </Defilant>
        </Section>

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
        <Depenses partnerId={P.id} depenses={L.expenses} today={data.today} onChange={load} />

        {/* ── Publicite ───────────────────────────────────────────────────── */}
        <Campagnes partnerId={P.id} campagnes={campagnes} depensePeriode={L.adsDetail} onChange={(c) => { setCampagnes(c); load() }} />

        {/* ── Versements ──────────────────────────────────────────────────── */}
        <Versements partnerId={P.id} versements={S.payments} today={data.today} solde={S.balance} onChange={load} />

        {/* ── Parametres ──────────────────────────────────────────────────── */}
        <Parametres partner={P} onChange={load} />
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
function Kpi({ label, valeur, sous, couleur }: { label: string; valeur: string; sous?: string; couleur?: string }) {
  return (
    <div className="card-modern" style={{ padding: '12px 14px' }}>
      <div className="fs12 tx-lo">{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: couleur || 'var(--tx-hi)' }}>{valeur}</div>
      {sous && <div className="fs11 tx-faint">{sous}</div>}
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
    <Section titre="Dépenses du partenariat" note="Tout ce que les commandes ne portent pas : douane, transport, cartons, publicité hors campagnes liées. Indique qui a payé — c'est ce qui décide de ce qu'on lui rembourse.">
      <form onSubmit={ajouter} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <Champ label="Date"><input type="date" className="input-modern" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} style={{ width: 150 }} /></Champ>
        <Champ label="Catégorie"><select className="input-modern" style={{ width: 180 }} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Champ>
        <Champ label="Libellé" grand><input className="input-modern" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="ex. dédouanement lot septembre" style={{ width: '100%' }} /></Champ>
        <Champ label="Montant (DH)"><input type="number" step="0.01" min="0" className="input-modern" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} style={{ width: 110 }} /></Champ>
        <Champ label="Payé par"><select className="input-modern" style={{ width: 150 }} value={f.paidBy} onChange={(e) => setF({ ...f, paidBy: e.target.value as 'shine' | 'partner' })}><option value="partner">Le partenaire</option><option value="shine">Shine</option></select></Champ>
        <button className="btn-modern btn-sm" disabled={!f.amount}>Ajouter</button>
        {err && <div className="fs12" style={{ color: 'var(--red, #c0392b)', width: '100%' }}>{err}</div>}
      </form>
      {depenses.length === 0 ? <p className="fs12 tx-faint" style={{ margin: 0 }}>Aucune dépense sur cette période.</p> : (
        <Defilant>
          <table className="table-modern" style={{ width: '100%', minWidth: 560 }}>
            <thead><tr><th>Date</th><th>Catégorie</th><th>Libellé</th><th>Payé par</th><th style={{ textAlign: 'right' }}>Montant</th><th /></tr></thead>
            <tbody>{depenses.map((x) => (
              <tr key={x.id}>
                <td className="fs12">{jour(x.date)}</td><td className="fs12">{x.category}</td><td className="fs12">{x.label || '—'}</td>
                <td className="fs12">{x.paidBy === 'partner' ? 'Partenaire' : 'Shine'}</td><Num v={x.amount} />
                <td style={{ textAlign: 'right' }}><button className="btn-modern btn-subtle btn-sm" onClick={() => suppr(x)} aria-label="Supprimer"><Trash2 style={{ width: 13, height: 13 }} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </Defilant>
      )}
    </Section>
  )
}

function Campagnes({ partnerId, campagnes, depensePeriode, onChange }: { partnerId: number; campagnes: Campaign[] | null; depensePeriode: { externalId: string; spend: number }[]; onChange: (c: Campaign[]) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (campagnes) setSel(new Set(campagnes.filter((c) => c.linked).map((c) => c.externalId))) }, [campagnes])
  const modifie = useMemo(() => campagnes ? campagnes.some((c) => c.linked !== sel.has(c.externalId)) : false, [campagnes, sel])
  const enregistrer = async () => {
    setBusy(true)
    await fetch(`/api/ops/partners/${partnerId}/campaigns`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ externalIds: [...sel] }) })
    const d = await fetch(`/api/ops/partners/${partnerId}/campaigns`, { cache: 'no-store' }).then((r) => r.json())
    setBusy(false); onChange(d.campaigns)
  }
  return (
    <Section titre="Publicité" note="Coche uniquement les campagnes qui ne montrent QUE ses produits : toute leur dépense entre dans son relevé. Une campagne mixte se saisit plutôt en dépense « Publicité », avec la part convenue.">
      {campagnes === null ? <div className="skeleton-line" style={{ width: '30%', height: 12 }} />
        : campagnes.length === 0 ? <p className="fs12 tx-faint" style={{ margin: 0 }}>Aucune campagne synchronisée sur les 90 derniers jours.</p>
        : (
          <>
            <div style={{ display: 'grid', gap: 4 }}>
              {campagnes.map((c) => {
                const periode = depensePeriode.find((d) => d.externalId === c.externalId)
                return (
                  <label key={c.externalId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={sel.has(c.externalId)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(c.externalId); else n.delete(c.externalId); setSel(n) }} />
                    <span className="fs12" style={{ flex: 1, minWidth: 0, color: 'var(--tx-hi)' }}>{c.name || c.externalId}</span>
                    <span className="fs11 tx-lo" style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{dh(c.spend)} / 90 j{periode ? ` · ${dh(periode.spend)} sur la période` : ''}</span>
                  </label>
                )
              })}
            </div>
            <button className="btn-modern btn-sm" style={{ marginTop: 10 }} disabled={!modifie || busy} onClick={enregistrer}>{busy ? 'Enregistrement…' : 'Enregistrer les campagnes liées'}</button>
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

function Parametres({ partner, onChange }: { partner: Data['ledger']['partner']; onChange: () => void }) {
  const [f, setF] = useState({ name: partner.name, shinePct: String(partner.shinePct), startDate: partner.startDate, notes: partner.notes || '' })
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
        <Champ label="Accord convenu" grand><input className="input-modern" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} style={{ width: '100%' }} /></Champ>
        <button className="btn-modern btn-sm">Enregistrer</button>
        {ok && <span className="fs12" style={{ color: 'var(--green)' }}>Enregistré</span>}
      </form>
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
    ['Emballage', n(-T.packaging)], ['Colis retournés', n(-T.returns)], ['Publicité (campagnes liées)', n(-T.adsLinked)],
    ...Object.entries(T.expensesByCategory).map(([c, v]) => [c, n(-v)]),
    ['Marge nette', n(T.net)], [`Part Shine (${L.partner.shinePct} %)`, n(T.shineShare)], [`Part partenaire (${100 - L.partner.shinePct} %)`, n(T.partnerShare)],
    [],
    ['SOLDE DEPUIS LE DÉBUT'],
    ['Coût des produits vendus', n(S.cogsSold)], ["Dépenses payées par le partenaire", n(S.expensesPaidByPartner)], ['Sa part de la marge nette', n(S.partnerShare)], ['Déjà versé', n(-S.paid)], ['À reverser', n(S.balance)],
    [],
    ['VENTES'], ['Livrée le', 'Commande', 'Produit', 'Qté', 'CA', 'Achat', 'Livraison & frais', 'Emballage', 'Marge'],
    ...L.lines.map((l) => [l.deliveredAt.slice(0, 10), l.orderNumber || `#${l.orderId}`, l.productName, l.quantity, n(l.revenue), n(l.cogs), n(l.orderCosts), n(l.packaging), n(l.margin)]),
    [],
    ['DÉPENSES'], ['Date', 'Catégorie', 'Libellé', 'Payé par', 'Montant'],
    ...L.expenses.map((x) => [x.date, x.category, x.label || '', x.paidBy === 'partner' ? 'Partenaire' : 'Shine', n(x.amount)]),
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
