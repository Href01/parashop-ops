import pool from '@/lib/db'
import { BOS, envoyer, h, mad } from '@/lib/telegram'
import { jourLocalUtc, jourLocalDepuisTz } from '@/lib/analytics/metrics'

/**
 * LE RAPPORT DE 21 H — ce qu'il faut savoir de la journee, sans ouvrir le BOS.
 * Memes definitions que le tableau de bord : une vente compte le jour de sa
 * livraison (heure du Maroc), la marge est celle de la commande (encaisse −
 * cout des produits − livraison), la pub est la depense Meta de la periode.
 * Le resultat du mois est donne « avant emballage et frais » : le chiffre
 * exact, avec tout, reste celui du tableau de bord.
 */

const TZ = 'Africa/Casablanca'
/* Colonne AVEC fuseau (deliveredAt) : lecture directe. Colonne naive ecrite en UTC
   (createdAt des commandes, evenements, historique) : jourLocalUtc — sinon le « jour »
   courait de 02 h a 02 h et le rapport de 21 h ratait les commandes de 0 h a 2 h. */
const jourLocal = (col: string) => jourLocalDepuisTz(col)
const jourLocalNaif = (col: string) => jourLocalUtc(col)

export async function construireRapport() {
  const auj = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
  const titre = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const debutMois = `${auj.slice(0, 7)}-01`

  const [jour, parCanal, mois, pubHier, sendit, paniers, visites, stock] = await Promise.all([
    pool.query(`SELECT
        count(*) FILTER (WHERE ${jourLocalNaif('"createdAt"')} = $1::date AND status::text <> 'CANCELLED')::int AS recues,
        COALESCE(sum(total) FILTER (WHERE ${jourLocalNaif('"createdAt"')} = $1::date AND status::text <> 'CANCELLED'), 0)::float AS montant_recu,
        count(*) FILTER (WHERE status::text = 'DELIVERED' AND ${jourLocal('"deliveredAt"')} = $1::date)::int AS livrees,
        COALESCE(sum(revenue) FILTER (WHERE status::text = 'DELIVERED' AND ${jourLocal('"deliveredAt"')} = $1::date), 0)::float AS ca_livre,
        (SELECT count(DISTINCT "orderId") FROM "OrderStatusHistory"
          WHERE "newStatus"::text = 'CANCELLED' AND ${jourLocalNaif('"createdAt"')} = $1::date)::int AS annulees
      FROM "Order"`, [auj]),
    pool.query(`SELECT COALESCE("sourceChannel", '—') AS canal, count(*)::int AS n FROM "Order"
      WHERE ${jourLocalNaif('"createdAt"')} = $1::date AND status::text <> 'CANCELLED' GROUP BY 1 ORDER BY 2 DESC`, [auj]),
    pool.query(`SELECT
        COALESCE(sum(revenue), 0)::float AS ca,
        COALESCE(sum(COALESCE("finalProfit", "estimatedProfit")), 0)::float AS marge,
        count(*)::int AS n,
        (SELECT COALESCE(sum(spend), 0) FROM "AdSpendDaily" WHERE date >= $1::date AND date <= $2::date)::float AS pub
      FROM "Order" WHERE status::text = 'DELIVERED' AND ${jourLocal('"deliveredAt"')} BETWEEN $1::date AND $2::date`, [debutMois, auj]),
    pool.query(`SELECT COALESCE(sum(spend), 0)::float AS pub, max(date)::text AS jusqua FROM "AdSpendDaily" WHERE date = $1::date - 1`, [auj]),
    pool.query(`SELECT count(*)::int AS en_cours,
        count(*) FILTER (WHERE "createdAt" < now() - interval '5 days')::int AS vieux
      FROM "Order" WHERE status::text = 'CONFIRMED' AND "returnedAt" IS NULL`),
    pool.query(`SELECT count(*)::int AS n, COALESCE(sum("cartTotal"), 0)::float AS montant FROM "AbandonedCheckout"
      WHERE "orderId" IS NULL AND contacted = false AND "updatedAt" > now() - interval '7 days'
        AND length(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g')) >= 9`),
    pool.query(`SELECT count(DISTINCT "sessionId")::int AS n FROM "AnalyticsEvent"
      WHERE id > (SELECT COALESCE(max(id), 0) - 60000 FROM "AnalyticsEvent") AND ${jourLocalNaif('"createdAt"')} = $1::date`, [auj]),
    pool.query(`SELECT p.name, (COALESCE(p.stock, 0) + COALESCE(p."virtualStock", 0))::int AS vendable
      FROM "Product" p
      WHERE p.active AND p."trackInventory" AND COALESCE(p.stock, 0) + COALESCE(p."virtualStock", 0) <= 2
        AND EXISTS (SELECT 1 FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
                     WHERE oi."productId" = p.id AND o.status::text <> 'CANCELLED' AND o."createdAt" > now() - interval '30 days')
      ORDER BY vendable, p.name LIMIT 6`),
  ])

  const j = jour.rows[0], m = mois.rows[0]
  const canaux = parCanal.rows.map((c) => `${h(c.canal === 'Website' ? 'Site' : c.canal)} ${c.n}`).join(' · ')
  const resultat = m.marge - m.pub
  const roas = m.pub > 0 ? (m.ca / m.pub).toFixed(1).replace('.', ',') : null
  const lignes = [
    `📊 <b>Rapport du ${h(titre)}</b>`,
    '',
    `<b>Aujourd'hui</b>`,
    `🛒 ${j.recues} commande${j.recues > 1 ? 's' : ''} reçue${j.recues > 1 ? 's' : ''} · ${mad(j.montant_recu)}${canaux ? ` (${canaux})` : ''}`,
    `✅ ${j.livrees} livrée${j.livrees > 1 ? 's' : ''} · CA livré <b>${mad(j.ca_livre)}</b>${j.annulees ? ` · ❌ ${j.annulees} annulée${j.annulees > 1 ? 's' : ''}` : ''}`,
    `👀 ${visites.rows[0].n} visites`,
    `📣 Pub d'hier : ${mad(pubHier.rows[0].pub)}`,
    '',
    `<b>Mois en cours</b> (livré)`,
    `CA <b>${mad(m.ca)}</b> · ${m.n} commandes · marge ${mad(m.marge)}`,
    `Pub ${mad(m.pub)}${roas ? ` · ROAS ${roas}x` : ''}`,
    `${resultat >= 0 ? '🟢' : '🔴'} Marge − pub : <b>${mad(resultat)}</b> <i>(avant emballage et frais)</i>`,
    '',
    `<b>À faire</b>`,
    `🚚 ${sendit.rows[0].en_cours} colis en cours chez Sendit${sendit.rows[0].vieux ? ` · <b>${sendit.rows[0].vieux} depuis plus de 5 jours</b>` : ''}`,
    `📞 ${paniers.rows[0].n} panier${paniers.rows[0].n > 1 ? 's' : ''} abandonné${paniers.rows[0].n > 1 ? 's' : ''} à rappeler (${mad(paniers.rows[0].montant)}, 7 j)`,
    ...(stock.rows.length ? [`📦 Stock bas sur des produits qui se vendent : ${stock.rows.map((s) => `${h(s.name.slice(0, 40))} (${s.vendable})`).join(' · ')}`] : []),
  ]
  return lignes.join('\n')
}

export async function envoyerRapport() {
  const texte = await construireRapport()
  const ok = await envoyer('rapport', texte, { texte: 'Ouvrir le tableau de bord', url: `${BOS}/` })
  return { ok, longueur: texte.length }
}
