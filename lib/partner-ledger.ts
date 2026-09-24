import pool from '@/lib/db'

/**
 * LE RELEVE D'UN PARTENAIRE EN DEPOT-VENTE.
 *
 * Un partenaire possede un stock ; Shine le vend et partage la marge nette —
 * apres publicite et tous les frais — selon `Partner.shinePct`.
 *
 * UNE SEULE REGLE : LE RESULTAT D'UNE COMMANDE EST CELUI DU TABLEAU DE BORD.
 * Le benefice d'une commande livree est deja calcule en base par
 * `calculate_order_profit` (encaisse, moins le cout des produits, moins le cout
 * Sendit reel, moins les frais de retour et la commission de canal). Le releve
 * le reprend au prorata de la part des produits du partenaire dans la commande,
 * au lieu de le recalculer : un second calcul finirait par diverger du premier,
 * et c'est exactement la dispute qu'on veut eviter. Pour la meme raison,
 * l'emballage est le tarif par colis du tableau de bord, et les retours sont
 * les `returnDeliveryFee` qu'il compte deja.
 *
 * LE PRORATA. Une commande peut melanger ses produits et ceux de Shine. Le
 * partenaire porte la part `w` = valeur catalogue de ses lignes / valeur de
 * toutes les lignes. La remise, la livraison facturee, le cout Sendit et
 * l'emballage se partagent selon `w` ; le cout de chaque produit, lui, est
 * exact — c'est le prix d'achat fige au moment de la commande.
 *
 * CE QUI LUI EST DU. Shine encaisse tout. Elle doit donc au partenaire :
 *   le cout des produits vendus (son argent, avance a l'achat)
 * + les depenses qu'il a payees lui-meme
 * + sa part de la marge nette
 * − ce qui lui a deja ete verse.
 * Une marge nette negative reduit sa part a proportion : la perte se partage
 * comme le gain. Le solde se calcule toujours depuis le debut du partenariat —
 * une depense de douane d'aout ne disparait pas parce qu'on regarde septembre.
 */

export const BUSINESS_TIMEZONE = 'Africa/Casablanca'

export const EXPENSE_CATEGORIES = [
  'Douane & taxes',
  'Transport',
  'Cartons & fournitures',
  'Publicité',
  'Autre',
] as const

export type Period = { from: string; to: string }

export type LedgerLine = {
  orderId: number
  orderNumber: string | null
  deliveredAt: string
  productId: number
  productName: string
  quantity: number
  /** Ce que la cliente a reellement paye pour cette ligne (remise deduite). */
  revenue: number
  cogs: number
  /** Livraison nette, commission, frais d'echec — part de la ligne. */
  orderCosts: number
  packaging: number
  /** Marge de la ligne avant publicite et depenses du partenariat. */
  margin: number
}

export type LedgerTotals = {
  revenue: number
  cogs: number
  orderCosts: number
  packaging: number
  returns: number
  adsLinked: number
  expenses: number
  expensesByCategory: Record<string, number>
  expensesPaidByShine: number
  expensesPaidByPartner: number
  net: number
  shineShare: number
  partnerShare: number
  deliveredOrders: number
  unitsSold: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0)

async function partnerProductIds(partnerId: number): Promise<number[]> {
  const r = await pool.query(`SELECT id FROM "Product" WHERE "partnerId" = $1`, [partnerId])
  return r.rows.map((x) => Number(x.id))
}

/** Les commandes (livrees ou retournees) qui contiennent au moins une ligne du partenaire. */
async function ordersWithPartnerLines(
  ids: number[],
  period: Period,
  kind: 'delivered' | 'returned',
) {
  if (ids.length === 0) return { orders: [] as any[], items: [] as any[] }
  const dateCol = kind === 'delivered' ? `"deliveredAt"` : `"returnedAt"`
  const statusFilter = kind === 'delivered' ? `AND o.status::text = 'DELIVERED'` : ''
  const orders = await pool.query(
    `SELECT o.id, o."orderNumber", o.${dateCol} AS at, o.revenue, o."productsTotal",
            o."finalProfit", o."estimatedProfit", o."actualDeliveryCost", o."estimatedDeliveryCost",
            o."returnDeliveryFee"
       FROM "Order" o
      WHERE o.${dateCol} IS NOT NULL
        ${statusFilter}
        AND (o.${dateCol} AT TIME ZONE '${BUSINESS_TIMEZONE}')::date BETWEEN $2::date AND $3::date
        AND EXISTS (SELECT 1 FROM "OrderItem" oi WHERE oi."orderId" = o.id AND oi."productId" = ANY($1::int[]))
      ORDER BY o.${dateCol}`,
    [ids, period.from, period.to],
  )
  if (orders.rowCount === 0) return { orders: [], items: [] }
  const items = await pool.query(
    `SELECT oi."orderId", oi."productId", oi.quantity, oi.price,
            COALESCE(oi."unitCost", p."costPrice", 0) AS "unitCost", p.name
       FROM "OrderItem" oi LEFT JOIN "Product" p ON p.id = oi."productId"
      WHERE oi."orderId" = ANY($1::int[])`,
    [orders.rows.map((o) => o.id)],
  )
  return { orders: orders.rows, items: items.rows }
}

/** La part des lignes du partenaire dans la valeur catalogue de la commande. */
function partnerWeight(orderItems: any[], ids: Set<number>) {
  const all = orderItems.reduce((s, i) => s + num(i.price) * num(i.quantity), 0)
  const mine = orderItems.filter((i) => ids.has(Number(i.productId))).reduce((s, i) => s + num(i.price) * num(i.quantity), 0)
  return all > 0 ? mine / all : 0
}

export type OrderRow = {
  id: number
  orderNumber: string | null
  at: string | Date
  revenue: unknown
  finalProfit: unknown
  estimatedProfit: unknown
  actualDeliveryCost: unknown
  estimatedDeliveryCost: unknown
}
export type ItemRow = { orderId: number; productId: number; quantity: unknown; price: unknown; unitCost: unknown; name: string }

/**
 * LA REGLE DE PARTAGE D'UNE COMMANDE — pure, sans base, donc testable.
 *
 * Reprend le benefice que la base a deja calcule pour la commande et en donne
 * aux lignes du partenaire la part `w` de leur valeur catalogue. Le cout des
 * produits, lui, n'est jamais proratise : chaque ligne porte son propre prix
 * d'achat. Voir tests/partner-ledger.test.ts.
 */
export function allocateOrderLines(o: OrderRow, its: ItemRow[], idSet: Set<number>, packagingRate: number): LedgerLine[] {
  const w = partnerWeight(its, idSet)
  if (w <= 0) return []
  const cogsAll = its.reduce((s, i) => s + num(i.unitCost) * num(i.quantity), 0)
  const revenue = num(o.revenue)
  // Meme repli que le tableau de bord quand le benefice n'est pas calcule.
  const profit = o.finalProfit != null ? num(o.finalProfit)
    : o.estimatedProfit != null ? num(o.estimatedProfit)
    : revenue - cogsAll - num(o.actualDeliveryCost ?? o.estimatedDeliveryCost)
  // Tout ce qui n'est pas le cout des produits : encaisse, moins livraison,
  // commission et frais d'echec. C'est cette part qui se partage selon w.
  const horsProduits = profit + cogsAll
  const mine = its.filter((i) => idSet.has(Number(i.productId)))
  const mineValue = mine.reduce((s, i) => s + num(i.price) * num(i.quantity), 0)
  return mine.map((it) => {
    const part = mineValue > 0 ? (num(it.price) * num(it.quantity)) / mineValue : 0
    const lineRevenue = revenue * w * part
    const lineCogs = num(it.unitCost) * num(it.quantity)
    const avantEmballage = horsProduits * w * part - lineCogs
    const linePackaging = packagingRate * w * part
    return {
      orderId: o.id,
      orderNumber: o.orderNumber,
      deliveredAt: new Date(o.at).toISOString(),
      productId: Number(it.productId),
      productName: it.name,
      quantity: num(it.quantity),
      revenue: r2(lineRevenue),
      cogs: r2(lineCogs),
      orderCosts: r2(lineRevenue - lineCogs - avantEmballage),
      packaging: r2(linePackaging),
      margin: r2(avantEmballage - linePackaging),
    }
  })
}

/**
 * Ce que Shine doit au partenaire : son argent avance (cout des produits
 * vendus), les depenses qu'il a payees, sa part de la marge nette — moins ce
 * qui lui a deja ete verse. Une marge negative reduit sa part a proportion.
 */
export function settle(t: { cogs: number; expensesPaidByPartner: number; net: number }, shinePct: number, paid: number) {
  const partnerShare = r2((t.net * (100 - shinePct)) / 100)
  const owed = r2(t.cogs + t.expensesPaidByPartner + partnerShare)
  return { partnerShare, shineShare: r2((t.net * shinePct) / 100), owed, balance: r2(owed - paid) }
}

export async function computeLedger(partnerId: number, period: Period) {
  /* Les colonnes DATE sont lues en texte : le pilote pg les convertit sinon en
     Date a minuit HEURE LOCALE, et toISOString() les relit en UTC — le 24
     septembre devenait le 23 sur un serveur en UTC+1. */
  const partner = await pool.query(`SELECT *, "startDate"::text AS "startDate" FROM "Partner" WHERE id = $1`, [partnerId])
  if (partner.rowCount === 0) return null
  const p = partner.rows[0]
  const shinePct = num(p.shinePct)
  const ids = await partnerProductIds(partnerId)
  const idSet = new Set(ids)

  const setting = await pool.query(`SELECT value FROM "AppSetting" WHERE key = 'packaging_cost_per_parcel'`)
  const packagingRate = num(setting.rows[0]?.value)

  // ── Ventes livrees ────────────────────────────────────────────────────────
  const delivered = await ordersWithPartnerLines(ids, period, 'delivered')
  const lines: LedgerLine[] = []
  for (const o of delivered.orders) {
    lines.push(...allocateOrderLines(o, delivered.items.filter((i) => i.orderId === o.id), idSet, packagingRate))
  }

  // ── Retours et colis refuses ──────────────────────────────────────────────
  const returned = await ordersWithPartnerLines(ids, period, 'returned')
  const returnsDetail = returned.orders.map((o) => {
    const w = partnerWeight(returned.items.filter((i) => i.orderId === o.id), idSet)
    return { orderId: o.id, orderNumber: o.orderNumber, returnedAt: new Date(o.at).toISOString(), fee: r2(num(o.returnDeliveryFee) * w) }
  }).filter((x) => x.fee > 0)

  // ── Publicite des campagnes dediees ───────────────────────────────────────
  const ads = await pool.query(
    `SELECT a."externalId", MAX(a."campaignName") AS name, SUM(a.spend)::double precision AS spend
       FROM "AdSpendDaily" a
       JOIN "PartnerAdCampaign" pc ON pc."externalId" = a."externalId" AND pc."partnerId" = $1
      WHERE a.date BETWEEN $2::date AND $3::date
      GROUP BY a."externalId" ORDER BY spend DESC`,
    [partnerId, period.from, period.to],
  )
  const adsDetail = ads.rows.map((a) => ({ externalId: a.externalId, name: a.name, spend: r2(num(a.spend)) }))

  // ── Depenses du partenariat ───────────────────────────────────────────────
  const exp = await pool.query(
    `SELECT id, date::text AS date, category, label, amount, "paidBy" FROM "PartnerExpense"
      WHERE "partnerId" = $1 AND date BETWEEN $2::date AND $3::date ORDER BY date DESC, id DESC`,
    [partnerId, period.from, period.to],
  )
  const expenses = exp.rows.map((e) => ({ ...e, amount: num(e.amount), date: String(e.date instanceof Date ? e.date.toISOString().slice(0, 10) : e.date).slice(0, 10) }))
  const expensesByCategory: Record<string, number> = {}
  for (const e of expenses) expensesByCategory[e.category] = r2((expensesByCategory[e.category] || 0) + e.amount)

  const sum = (xs: number[]) => r2(xs.reduce((s, x) => s + x, 0))
  const revenue = sum(lines.map((l) => l.revenue))
  const cogs = sum(lines.map((l) => l.cogs))
  const orderCosts = sum(lines.map((l) => l.orderCosts))
  const packaging = sum(lines.map((l) => l.packaging))
  const returns = sum(returnsDetail.map((x) => x.fee))
  const adsLinked = sum(adsDetail.map((a) => a.spend))
  const expensesTotal = sum(expenses.map((e) => e.amount))
  const net = r2(revenue - cogs - orderCosts - packaging - returns - adsLinked - expensesTotal)

  const totals: LedgerTotals = {
    revenue, cogs, orderCosts, packaging, returns, adsLinked,
    expenses: expensesTotal,
    expensesByCategory,
    expensesPaidByShine: sum(expenses.filter((e) => e.paidBy === 'shine').map((e) => e.amount)),
    expensesPaidByPartner: sum(expenses.filter((e) => e.paidBy === 'partner').map((e) => e.amount)),
    net,
    shineShare: r2((net * shinePct) / 100),
    partnerShare: r2((net * (100 - shinePct)) / 100),
    deliveredOrders: new Set(lines.map((l) => l.orderId)).size,
    unitsSold: lines.reduce((s, l) => s + l.quantity, 0),
  }

  return {
    partner: {
      id: p.id, name: p.name, shinePct, notes: p.notes, active: p.active,
      startDate: String(p.startDate instanceof Date ? p.startDate.toISOString() : p.startDate).slice(0, 10),
    },
    period, packagingRate, lines, returnsDetail, adsDetail, expenses, totals,
  }
}

/** L'etat du stock, produit par produit — il n'appartient pas a Shine. */
export async function partnerStock(partnerId: number, startDate: string) {
  const r = await pool.query(
    `SELECT p.id, p.name, p.brand, p.image, p.price, p."costPrice", p.stock, p."virtualStock", p.active,
            COALESCE((SELECT SUM(m.quantity) FROM "InventoryMovement" m
                       WHERE m."productId" = p.id AND m.quantity > 0 AND m.type <> 'Sale'), 0)::int AS entrees,
            COALESCE((SELECT SUM(oi.quantity) FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
                       WHERE oi."productId" = p.id AND o.status::text = 'DELIVERED'
                         AND (o."deliveredAt" AT TIME ZONE '${BUSINESS_TIMEZONE}')::date >= $2::date), 0)::int AS vendus,
            COALESCE((SELECT SUM(oi.quantity) FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
                       WHERE oi."productId" = p.id AND o.status::text NOT IN ('DELIVERED', 'CANCELLED')
                         AND o."returnedAt" IS NULL), 0)::int AS "enCours"
       FROM "Product" p
      WHERE p."partnerId" = $1
      ORDER BY p.brand, p.name`,
    [partnerId, startDate],
  )
  return r.rows.map((x) => {
    const stock = num(x.stock)
    const cost = num(x.costPrice)
    const price = num(x.price)
    return {
      id: x.id, name: x.name, brand: x.brand, image: x.image, active: x.active,
      price, costPrice: cost, stock, entrees: num(x.entrees), vendus: num(x.vendus), enCours: num(x.enCours),
      unitMargin: r2(price - cost),
      valeurCout: r2(Math.max(0, stock) * cost),
      valeurVente: r2(Math.max(0, stock) * price),
    }
  })
}

/**
 * Ce que Shine doit au partenaire, TOUJOURS depuis le debut du partenariat —
 * quelle que soit la periode affichee.
 */
export async function partnerSettlement(partnerId: number, startDate: string, today: string) {
  const all = await computeLedger(partnerId, { from: startDate, to: today })
  if (!all) return null
  const pay = await pool.query(
    `SELECT id, date::text AS date, amount, method, note FROM "PartnerPayment" WHERE "partnerId" = $1 ORDER BY date DESC, id DESC`,
    [partnerId],
  )
  const payments = pay.rows.map((x) => ({ ...x, amount: num(x.amount), date: String(x.date instanceof Date ? x.date.toISOString() : x.date).slice(0, 10) }))
  const paid = r2(payments.reduce((s, x) => s + x.amount, 0))
  const t = all.totals
  const s = settle(t, all.partner.shinePct, paid)
  return {
    cogsSold: t.cogs,
    expensesPaidByPartner: t.expensesPaidByPartner,
    partnerShare: s.partnerShare,
    shineShare: s.shineShare,
    net: t.net,
    owed: s.owed,
    paid,
    balance: s.balance,
    payments,
  }
}

export function todayCasablanca(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE })
}

/**
 * CE QUE LE DEPOT-VENTE RETIRE AU RESULTAT DE SHINE SUR UNE PERIODE.
 *
 * Le tableau de bord compte 100 % des ventes partenaire : leur CA, leur cout,
 * leur livraison, leur emballage, leur publicite. Or Shine n'en garde que sa
 * part. La correction se ramene a une ligne :
 *
 *   rentabilite : − (part du partenaire dans la marge nette + depenses du partenariat)
 *
 * (Le tableau de bord contient deja la contribution C des ventes ; la marge
 * nette vaut N = C − depenses ; Shine garde s·N ; C − s·N = (1 − s)·N + depenses.)
 *
 *   tresorerie  : − (versements faits au partenaire + depenses payees par Shine)
 *
 * Ne leve jamais : si le partenariat n'est pas configure, la correction vaut zero
 * et le tableau de bord reste exactement celui d'avant.
 */
export async function ajustementDepotVente(from: string, to: string) {
  try {
    const ps = await pool.query(`SELECT id, "startDate"::text AS s FROM "Partner" WHERE active`)
    let part = 0
    let cash = 0
    for (const p of ps.rows) {
      const debut = from < p.s ? p.s : from
      if (debut > to) continue
      const L = await computeLedger(p.id, { from: debut, to })
      if (!L) continue
      part += L.totals.partnerShare + L.totals.expenses
      cash += L.totals.expensesPaidByShine
    }
    const v = await pool.query(
      `SELECT COALESCE(SUM(pp.amount), 0)::double precision AS s
         FROM "PartnerPayment" pp JOIN "Partner" pa ON pa.id = pp."partnerId"
        WHERE pa.active AND pp.date BETWEEN $1::date AND $2::date`,
      [from, to],
    )
    cash += num(v.rows[0]?.s)
    return { part: r2(part), cash: r2(cash), partenaires: ps.rowCount ?? 0 }
  } catch {
    return { part: 0, cash: 0, partenaires: 0 }
  }
}
