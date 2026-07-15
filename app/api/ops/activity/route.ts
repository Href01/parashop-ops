import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * Live activity feed — "what's happening in the business" — derived from what the BOS
 * already writes (orders, price changes, stock moves, waitlist, leads). No per-endpoint
 * instrumentation needed. The client polls this every few seconds for a near-real-time feed.
 */
export const dynamic = 'force-dynamic'

type Ev = { id: string; type: string; icon: string; title: string; sub: string; actor: string | null; at: string }
const short = (e?: string | null) => (e ? e.split('@')[0] : null)

export async function GET() {
  const s = await getServerSession(authOptions)
  if (!s?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = (sql: string, p: unknown[] = []) => pool.query(sql, p).then((r) => r.rows).catch(() => [])

  const [orders, prices, moves, waitlist, leads] = await Promise.all([
    q(`SELECT id, status::text st, "createdAt", COALESCE(NULLIF(TRIM("deliveryName"),''),'—') nm, "deliveryCity" city
       FROM "Order" ORDER BY "createdAt" DESC LIMIT 20`),
    q(`SELECT pc."oldPrice" o, pc."newPrice" n, pc."changedAt", pc."changedBy", p.name
       FROM "PriceChange" pc JOIN "Product" p ON p.id = pc."productId"
       WHERE pc.source <> 'backfill' ORDER BY pc."changedAt" DESC LIMIT 15`),
    q(`SELECT m.type, m.quantity q, m."createdAt", m."performedBy", p.name
       FROM "InventoryMovement" m JOIN "Product" p ON p.id = m."productId" ORDER BY m."createdAt" DESC LIMIT 15`),
    q(`SELECT rn."createdAt", p.name FROM "RestockNotify" rn JOIN "Product" p ON p.id = rn."productId" ORDER BY rn."createdAt" DESC LIMIT 10`),
    q(`SELECT name, city, "createdAt" FROM "AbandonedCheckout" ORDER BY "createdAt" DESC LIMIT 12`),
  ])

  const evs: Ev[] = []
  for (const o of orders) evs.push({ id: `o${o.id}`, type: 'order', icon: '🛒', title: `Commande #${o.id} · ${o.st}`, sub: `${o.nm}${o.city ? ' · ' + o.city : ''}`, actor: null, at: o.createdAt })
  for (const p of prices) evs.push({ id: `p${p.changedAt}${p.name}`, type: 'price', icon: '🏷️', title: `Prix modifié : ${p.name}`, sub: `${Math.round(p.o)} → ${Math.round(p.n)} MAD`, actor: short(p.changedBy), at: p.changedAt })
  for (const m of moves) evs.push({ id: `m${m.createdAt}${m.name}`, type: 'stock', icon: m.type === 'Purchase' ? '📦' : m.type === 'Sale' ? '🧾' : '✏️', title: `Stock ${m.type} : ${m.name}`, sub: `${m.q > 0 ? '+' : ''}${m.q} u.`, actor: short(m.performedBy), at: m.createdAt })
  for (const w of waitlist) evs.push({ id: `w${w.createdAt}${w.name}`, type: 'waitlist', icon: '🔔', title: `Liste d'attente : ${w.name}`, sub: 'un client veut être prévenu', actor: null, at: w.createdAt })
  for (const l of leads) evs.push({ id: `l${l.createdAt}${l.name}`, type: 'lead', icon: '📞', title: `Lead : ${l.name || '—'}`, sub: `panier abandonné${l.city ? ' · ' + l.city : ''}`, actor: null, at: l.createdAt })

  evs.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return NextResponse.json({ events: evs.slice(0, 40) }, { headers: { 'Cache-Control': 'no-store' } })
}
