import pool from '@/lib/db'
import { BOS, envoyer, h, mad } from '@/lib/telegram'

/**
 * LA VEILLE — toutes les 5 minutes, ce qui doit arriver sur le telephone.
 *
 * Etat dans AppSetting `telegram_veille` : derniere commande annoncee, ce qui a
 * deja ete signale (annulations, retours, paniers, echecs de code) et les
 * alertes en cours. Au tout premier passage, on prend l'etat actuel comme point
 * de depart : pas de deluge d'anciennes commandes.
 *
 * Une alerte part une fois quand le probleme apparait, se rappelle toutes les
 * 3 h tant qu'il dure, et un message « resolu » part quand il disparait.
 */

const CLE = 'telegram_veille'
const TZ = 'Africa/Casablanca'
const STOREFRONT = process.env.STOREFRONT_URL || 'https://www.shinecosmetics.ma'

type Alerte = { depuis: string; dernierEnvoi: string; detail: string }
type Etat = {
  derniereCommande: number
  /** Dernier changement de statut vu (OrderStatusHistory) : les annulations en viennent. */
  dernierStatut?: number
  annulees: number[]
  retours: number[]
  paniers: number[]
  dernierEchecCode: number
  /** Dernier evenement de visite vu, et quand son numero a bouge pour la derniere fois. */
  visites?: { id: number; bougeLe: string }
  alertes: Record<string, Alerte>
}

const borne = (xs: number[]) => xs.slice(-400)

async function lireEtat(): Promise<Etat | null> {
  const r = await pool.query<{ value: string }>(`SELECT value FROM "AppSetting" WHERE key = $1`, [CLE])
  if (!r.rows[0]) return null
  try { return JSON.parse(r.rows[0].value) as Etat } catch { return null }
}

async function ecrireEtat(e: Etat) {
  await pool.query(
    `INSERT INTO "AppSetting" (key, value, "updatedAt") VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
    [CLE, JSON.stringify(e)],
  )
}

/** Point de depart : tout ce qui existe deja est considere comme annonce. */
async function etatInitial(): Promise<Etat> {
  const r = await pool.query(`SELECT
      (SELECT COALESCE(max(id), 0) FROM "Order")::int AS commande,
      (SELECT COALESCE(max(id), 0) FROM "MessageLog")::int AS message,
      (SELECT COALESCE(max(id), 0) FROM "OrderStatusHistory")::int AS statut,
      ARRAY(SELECT id FROM "Order" WHERE "returnedAt" > now() - interval '3 days') AS retours,
      ARRAY(SELECT id FROM "AbandonedCheckout" WHERE "updatedAt" > now() - interval '3 days') AS paniers`)
  const x = r.rows[0]
  return { derniereCommande: x.commande, dernierStatut: x.statut, annulees: [], retours: x.retours, paniers: x.paniers, dernierEchecCode: x.message, alertes: {} }
}

const CANAUX: Record<string, string> = { Website: 'Site', Instagram: 'Instagram', WhatsApp: 'WhatsApp', Famille: 'Famille', TikTok: 'TikTok', Sendit: 'Sendit', Jumia: 'Jumia' }

async function lignesCommande(ids: number[]) {
  if (ids.length === 0) return new Map<number, string[]>()
  const r = await pool.query(
    `SELECT oi."orderId", COALESCE(p.name, 'Produit #' || oi."productId") AS name, oi.quantity
       FROM "OrderItem" oi LEFT JOIN "Product" p ON p.id = oi."productId"
      WHERE oi."orderId" = ANY($1::int[]) ORDER BY oi.id`,
    [ids],
  )
  const m = new Map<number, string[]>()
  for (const l of r.rows) m.set(l.orderId, [...(m.get(l.orderId) ?? []), `• ${h(l.name)} ×${l.quantity}`])
  return m
}

async function nouvellesCommandes(e: Etat) {
  const r = await pool.query(
    `SELECT id, "orderNumber", "sourceChannel", status::text AS status, total::float AS total,
            "deliveryName", "deliveryCity", "paymentMethod", "promoCode"
       FROM "Order" WHERE id > $1 ORDER BY id LIMIT 15`,
    [e.derniereCommande],
  )
  const lignes = await lignesCommande(r.rows.map((o) => o.id))
  for (const o of r.rows) {
    const canal = CANAUX[o.sourceChannel] ?? o.sourceChannel ?? '—'
    const texte = [
      `🛒 <b>Nouvelle commande</b> · ${h(canal)} · <b>${mad(o.total ?? 0)}</b>`,
      `${h(o.orderNumber || `#${o.id}`)} · ${h(o.deliveryName || 'Cliente')}${o.deliveryCity ? ` · ${h(o.deliveryCity)}` : ''}`,
      ...(lignes.get(o.id) ?? []),
      `${o.paymentMethod === 'VIREMENT' ? 'Virement' : 'Paiement à la livraison'}${o.promoCode ? ` · code ${h(o.promoCode)}` : ''}${o.status === 'DELIVERED' ? ' · déjà livrée' : ''}`,
    ].join('\n')
    await envoyer('commandes', texte, { texte: 'Ouvrir la commande', url: `${BOS}/orders/${o.id}` })
    e.derniereCommande = o.id
  }
  return r.rowCount ?? 0
}

async function annulationsEtRetours(e: Etat) {
  if (e.dernierStatut == null) {
    e.dernierStatut = (await pool.query(`SELECT COALESCE(max(id), 0)::int AS m FROM "OrderStatusHistory"`)).rows[0].m
  }
  const a = await pool.query(
    `SELECT h.id AS hid, o.id, o."orderNumber", o.total::float AS total, o."deliveryName"
       FROM "OrderStatusHistory" h JOIN "Order" o ON o.id = h."orderId"
      WHERE h.id > $1 AND h."newStatus"::text = 'CANCELLED' AND NOT (o.id = ANY($2::int[]))
      ORDER BY h.id LIMIT 10`,
    [e.dernierStatut, e.annulees],
  )
  const dernier = await pool.query(`SELECT COALESCE(max(id), 0)::int AS m FROM "OrderStatusHistory"`)
  e.dernierStatut = Math.max(e.dernierStatut ?? 0, dernier.rows[0].m)
  for (const o of a.rows) {
    await envoyer('commandes', `❌ <b>Commande annulée</b> · ${h(o.orderNumber || `#${o.id}`)} · ${mad(o.total ?? 0)} · ${h(o.deliveryName || 'Cliente')}`,
      { texte: 'Voir', url: `${BOS}/orders/${o.id}` })
    e.annulees = borne([...e.annulees, o.id])
  }
  const r = await pool.query(
    `SELECT id, "orderNumber", total::float AS total, "deliveryName", "returnDeliveryFee"::float AS frais FROM "Order"
      WHERE "returnedAt" > now() - interval '2 days' AND NOT (id = ANY($1::int[]))
      ORDER BY id LIMIT 10`,
    [e.retours],
  )
  for (const o of r.rows) {
    await envoyer('commandes', `↩️ <b>Retour / colis refusé</b> · ${h(o.orderNumber || `#${o.id}`)} · ${mad(o.total ?? 0)} · ${h(o.deliveryName || 'Cliente')}${o.frais ? ` · frais retour ${mad(o.frais)}` : ''}`,
      { texte: 'Voir', url: `${BOS}/orders/${o.id}` })
    e.retours = borne([...e.retours, o.id])
  }
}

/** Les paniers qui valent un appel : 300 DH et plus, numéro saisi, sans commande, après 30 min. */
async function paniersARappeler(e: Etat) {
  const r = await pool.query(
    `SELECT id, name, phone, city, "cartTotal"::float AS total, "cartItems", "lastStep" FROM "AbandonedCheckout"
      WHERE "orderId" IS NULL AND contacted = false AND COALESCE("cartTotal", 0) >= 300
        AND length(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g')) >= 9
        AND "updatedAt" BETWEEN now() - interval '6 hours' AND now() - interval '30 minutes'
        AND NOT (id = ANY($1::int[]))
      ORDER BY id LIMIT 5`,
    [e.paniers],
  )
  for (const p of r.rows) {
    const chiffres = String(p.phone).replace(/\D/g, '')
    const wa = chiffres.startsWith('212') ? chiffres : `212${chiffres.replace(/^0/, '')}`
    const produits = Array.isArray(p.cartItems) ? p.cartItems.slice(0, 4).map((i: { name?: string; quantity?: number }) => `• ${h(i.name)} ×${i.quantity ?? 1}`) : []
    await envoyer('commandes', [
      `📞 <b>Panier abandonné à rappeler</b> · <b>${mad(p.total)}</b>`,
      `${h(p.name || 'Sans nom')} · ${h(p.phone)}${p.city ? ` · ${h(p.city)}` : ''}`,
      ...produits,
    ].join('\n'), { texte: 'Écrire sur WhatsApp', url: `https://wa.me/${wa}` })
    e.paniers = borne([...e.paniers, p.id])
  }
}

const ERREURS_WA: Record<string, string> = {
  '131026': 'numéro injoignable sur WhatsApp',
  '131049': 'retenu par Meta (trop de messages marketing)',
  '131042': 'PROBLÈME DE PAIEMENT du compte WhatsApp — plus aucun code ne part',
  '131047': 'hors fenêtre 24 h',
  '130472': 'retenu par Meta (test)',
}

/** Un code de checkout qui n'est pas arrivé = une commande peut-être perdue. */
async function codesEchoues(e: Etat) {
  const r = await pool.query(
    `SELECT id, phone, "errorCode" FROM "MessageLog"
      WHERE id > $1 AND type = 'otp' AND direction = 'out' AND status = 'failed'
      ORDER BY id LIMIT 10`,
    [e.dernierEchecCode],
  )
  for (const m of r.rows) {
    const raison = ERREURS_WA[m.errorCode] ?? `erreur ${m.errorCode ?? 'inconnue'}`
    await envoyer('alertes', `⚠️ <b>Code de commande non reçu</b> · ${h(m.phone)}\n${h(raison)}\nLa cliente ne peut pas valider sa commande : la rappeler.`)
  }
  const max = await pool.query(`SELECT COALESCE(max(id), 0)::int AS m FROM "MessageLog"`)
  e.dernierEchecCode = Math.max(e.dernierEchecCode, max.rows[0].m)
}

async function heureCasa(): Promise<number> {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date()))
}

/** Ce qui doit marcher en permanence. Chaque controle rend null (OK) ou le detail du probleme. */
async function controles(e: Etat): Promise<Record<string, string | null>> {
  const res: Record<string, string | null> = {}
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
  // 1. La boutique repond (page et enregistrement des visites, sans rien ecrire).
  try {
    const [page, evt] = await Promise.all([
      fetch(`${STOREFRONT}/`, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(15_000) }),
      fetch(`${STOREFRONT}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': ua }, body: '{"events":[]}', signal: AbortSignal.timeout(15_000) }),
    ])
    const ko = [page.status >= 500 && `accueil ${page.status}`, evt.status >= 500 && `suivi des visites ${evt.status}`].filter(Boolean)
    res.boutique = ko.length ? `La boutique répond en erreur : ${ko.join(', ')}.` : null
  } catch (err) {
    res.boutique = `La boutique ne répond pas (${err instanceof Error ? err.message : 'réseau'}).`
  }
  // 2. Des visites sont enregistrees. On suit le NUMERO du dernier evenement (la
  //    colonne de date n'a pas de fuseau) : s'il n'a pas bouge depuis 2 h en
  //    journee, le suivi est probablement casse. La nuit peut etre calme.
  const v = await pool.query(`SELECT COALESCE(max(id), 0)::int AS id FROM "AnalyticsEvent"`)
  const id = v.rows[0].id, maintenant = new Date().toISOString()
  if (!e.visites || id > e.visites.id) e.visites = { id, bougeLe: maintenant }
  const heure = await heureCasa()
  const immobile = Date.now() - new Date(e.visites.bougeLe).getTime() > 2 * 3600_000
  res.suivi = heure >= 10 && heure <= 23 && immobile ? 'Aucune visite enregistrée depuis 2 h en journée : le suivi est peut-être cassé.' : null
  // 3. La pub Meta est synchronisee (Meta a 1-2 jours de retard normalement).
  const m = await pool.query(`SELECT max(date)::text AS d, (max(date) < current_date - 3) AS vieux FROM "AdSpendDaily"`)
  res.meta = m.rows[0]?.vieux ? `La pub Meta n'est plus synchronisée depuis le ${m.rows[0].d} : dépenses et ROAS faux au tableau de bord.` : null
  return res
}

async function alertes(e: Etat) {
  const etat = await controles(e)
  const maintenant = new Date()
  for (const [cle, detail] of Object.entries(etat)) {
    const en = e.alertes[cle]
    if (detail && !en) {
      await envoyer('alertes', `🔴 <b>Problème</b>\n${h(detail)}`, { texte: 'Tableau de bord', url: `${BOS}/` })
      e.alertes[cle] = { depuis: maintenant.toISOString(), dernierEnvoi: maintenant.toISOString(), detail }
    } else if (detail && en && maintenant.getTime() - new Date(en.dernierEnvoi).getTime() > 3 * 3600_000) {
      const h1 = Math.round((maintenant.getTime() - new Date(en.depuis).getTime()) / 3600_000)
      await envoyer('alertes', `🔴 <b>Toujours en cours (${h1} h)</b>\n${h(detail)}`)
      en.dernierEnvoi = maintenant.toISOString()
    } else if (!detail && en) {
      const min = Math.round((maintenant.getTime() - new Date(en.depuis).getTime()) / 60_000)
      await envoyer('alertes', `🟢 <b>Résolu</b> après ${min >= 120 ? `${Math.round(min / 60)} h` : `${min} min`}\n${h(en.detail)}`)
      delete e.alertes[cle]
    }
  }
}

export async function veille() {
  let e = await lireEtat()
  if (!e) {
    e = await etatInitial()
    await ecrireEtat(e)
    return { init: true }
  }
  const commandes = await nouvellesCommandes(e)
  await annulationsEtRetours(e)
  await paniersARappeler(e)
  await codesEchoues(e)
  await alertes(e)
  await ecrireEtat(e)
  return { commandes, alertesEnCours: Object.keys(e.alertes) }
}
