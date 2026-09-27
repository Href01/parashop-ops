import 'server-only'
import pool from '@/lib/db'

/**
 * LA VERITE D'UNE PERIODE : ce que la pub a coute contre ce qui a ete LIVRE.
 *
 * Meta ne voit que les achats du pixel. Au Maroc, une grande part des ventes
 * passe par les DM Instagram et WhatsApp, et le paiement a la livraison fait
 * qu'une commande n'est gagnee qu'une fois livree. Mesure du 26/09/2026 sur
 * 90 jours : le pixel voyait 8 764 DH de ventes, les commandes livrees en
 * faisaient 42 846. Juger les pubs au ROAS de Meta, c'est couper ce qui marche.
 *
 * Marge : celle que le BOS calcule par commande (coût produit et livraison
 * deduits), finalProfit une fois connue, sinon estimatedProfit.
 */

export type Canal = { canal: string; commandes: number; ca: number; marge: number }
export type Verite = {
  jours: number; de: string; a: string
  depense: number; sourceDepense: 'MetaAdDaily' | 'AdSpendDaily' | 'mixte'
  // Jours de la fenetre ou la depense n'est connue qu'au niveau campagne : les DM et les achats pixel de ces jours manquent.
  joursSansDetail: number
  messages: number
  pixel: { achats: number | null; valeur: number }
  // La fenetre commence avant l'ouverture de la boutique : ses totaux (et une comparaison avec elle) sont incomplets.
  partiel: boolean; ouverture: string | null
  livrees: number; annulees: number; ca: number; marge: number
  parCanal: Canal[]
  suiviesMeta: { commandes: number; ca: number }   // UTM Facebook / Instagram
  profitApresPub: number
  coutParCommandeLivree: number | null
  merLivre: number | null                          // CA livre / depense
  seuilParCommande: number | null                  // marge moyenne par commande : au-dela, chaque commande payee en pub perd de l'argent
  panierMoyen: number | null
}

const arrondi = (x: number) => Math.round(x * 100) / 100

/**
 * La depense JOUR PAR JOUR : le detail par pub ("MetaAdDaily") quand ce jour a
 * ete lu, sinon le total par campagne ("AdSpendDaily"). Choisir une source pour
 * toute la fenetre faussait tout : le detail par pub ne couvrait que 30 jours,
 * et « 90 jours » affichait la depense de 30 (2 281 DH au lieu de ~7 000).
 */
const DEPENSE_PAR_JOUR = `
  WITH j AS (SELECT generate_series(current_date - $1::int - $2::int + 1, current_date - $2::int, interval '1 day')::date AS jour),
  ad AS (SELECT jour, sum(depense) depense, sum(achats) achats, sum(valeur_achats) valeur, sum(messages) messages
         FROM "MetaAdDaily" WHERE jour > current_date - $1::int - $2::int AND jour <= current_date - $2::int GROUP BY jour),
  sp AS (SELECT date AS jour, sum(spend) depense, sum(revenue) valeur
         FROM "AdSpendDaily" WHERE platform = 'Meta' AND date > current_date - $1::int - $2::int AND date <= current_date - $2::int GROUP BY date)
  SELECT coalesce(sum(coalesce(ad.depense, sp.depense, 0)), 0) depense,
         coalesce(sum(coalesce(ad.valeur, sp.valeur, 0)), 0) valeur,
         coalesce(sum(ad.achats), 0) achats, coalesce(sum(ad.messages), 0) messages,
         count(ad.jour)::int jours_detail,
         count(*) FILTER (WHERE ad.jour IS NULL AND sp.depense > 0)::int jours_sans_detail
  FROM j LEFT JOIN ad USING (jour) LEFT JOIN sp USING (jour)`

/** decalage : la meme fenetre, reculee de N jours (decalage = jours → la periode d'avant, pour comparer). */
export async function verite(jours: number, decalage = 0): Promise<Verite> {
  const [depenses, ouverture, commandes, canaux] = await Promise.all([
    pool.query<{ depense: string; valeur: string; achats: string; messages: string; jours_detail: number; jours_sans_detail: number }>(DEPENSE_PAR_JOUR, [jours, decalage]),
    // L'ouverture : la premiere commande ou le premier dirham de pub, le plus ancien des deux.
    pool.query<{ d: string | null }>(`SELECT least((SELECT min("createdAt") FROM "Order"), (SELECT min(date)::timestamptz FROM "AdSpendDaily"))::date::text AS d`),
    pool.query<{ livrees: number; annulees: number; ca: string; marge: string; meta_n: number; meta_ca: string }>(
      `SELECT count(*) FILTER (WHERE status = 'DELIVERED')::int livrees,
              -- Le statut n'a que PENDING, CONFIRMED, DELIVERED, CANCELLED ; un retour se lit a "returnedAt".
              count(*) FILTER (WHERE status = 'CANCELLED' OR "returnedAt" IS NOT NULL)::int annulees,
              coalesce(sum(coalesce(revenue, "productsTotal")) FILTER (WHERE status = 'DELIVERED'), 0) ca,
              coalesce(sum(coalesce("finalProfit", "estimatedProfit")) FILTER (WHERE status = 'DELIVERED'), 0) marge,
              count(*) FILTER (WHERE status = 'DELIVERED' AND "utmSource" ~* '^(fb|facebook|ig|instagram|meta)')::int meta_n,
              coalesce(sum(coalesce(revenue, "productsTotal")) FILTER (WHERE status = 'DELIVERED' AND "utmSource" ~* '^(fb|facebook|ig|instagram|meta)'), 0) meta_ca
       FROM "Order" WHERE coalesce("deliveredAt", "createdAt") > now() - (($1::int + $2::int) * interval '1 day') AND coalesce("deliveredAt", "createdAt") <= now() - ($2::int * interval '1 day')`, [jours, decalage]),
    pool.query<{ canal: string; commandes: number; ca: string; marge: string }>(
      `SELECT CASE WHEN "sourceChannel" = 'Website' AND "utmSource" ~* '^(fb|facebook|ig|instagram|meta)' THEN 'Site (pub Meta suivie)'
                   ELSE coalesce("sourceChannel", 'Inconnu') END canal,
              count(*)::int commandes, coalesce(sum(coalesce(revenue, "productsTotal")), 0) ca, coalesce(sum(coalesce("finalProfit", "estimatedProfit")), 0) marge
       FROM "Order" WHERE status = 'DELIVERED' AND coalesce("deliveredAt", "createdAt") > now() - (($1::int + $2::int) * interval '1 day') AND coalesce("deliveredAt", "createdAt") <= now() - ($2::int * interval '1 day')
       GROUP BY 1 ORDER BY 3 DESC`, [jours, decalage]),
  ])
  const dj = depenses.rows[0]
  const depense = Number(dj.depense)
  const c = commandes.rows[0]
  const ca = Number(c.ca), marge = Number(c.marge), livrees = c.livrees
  const fin = new Date(Date.now() - decalage * 864e5), debut = new Date(fin.getTime() - jours * 864e5)
  const de = debut.toISOString().slice(0, 10)
  const ouvert = ouverture.rows[0]?.d ?? null
  return {
    jours, de, a: fin.toISOString().slice(0, 10),
    depense: arrondi(depense),
    sourceDepense: dj.jours_sans_detail === 0 ? 'MetaAdDaily' : dj.jours_detail === 0 ? 'AdSpendDaily' : 'mixte',
    joursSansDetail: dj.jours_sans_detail,
    messages: Number(dj.messages),
    // Sans detail par pub sur une partie de la fenetre, le nombre d'achats du pixel serait faux : on ne le donne pas.
    pixel: { achats: dj.jours_sans_detail === 0 ? Number(dj.achats) : null, valeur: arrondi(Number(dj.valeur)) },
    partiel: ouvert != null && de < ouvert, ouverture: ouvert,
    livrees, annulees: c.annulees, ca: arrondi(ca), marge: arrondi(marge),
    parCanal: canaux.rows.map((r) => ({ canal: r.canal, commandes: r.commandes, ca: arrondi(Number(r.ca)), marge: arrondi(Number(r.marge)) })),
    suiviesMeta: { commandes: c.meta_n, ca: arrondi(Number(c.meta_ca)) },
    profitApresPub: arrondi(marge - depense),
    coutParCommandeLivree: livrees > 0 && depense > 0 ? arrondi(depense / livrees) : null,
    merLivre: depense > 0 ? arrondi(ca / depense) : null,
    seuilParCommande: livrees > 0 ? arrondi(marge / livrees) : null,
    panierMoyen: livrees > 0 ? arrondi(ca / livrees) : null,
  }
}

/**
 * L'economie de chaque produit : ce qu'une vente laisse (prix − coût), le stock
 * vendable, les ventes livrees sur 90 jours. C'est ce qui dit QUOI pousser :
 * une pub sur un produit a 20 DH de marge ou en rupture brule de l'argent.
 */
export async function economieProduits(limite = 60) {
  const r = await pool.query(
    `SELECT p.id, p.name AS nom, p.brand AS marque, p.category AS categorie, p.price AS prix, p."costPrice" AS cout,
            (coalesce(p.stock, 0) + coalesce(p."virtualStock", 0)) AS stock_vendable, coalesce(p."importUnavailable", false) AS import_bloque,
            p."partnerId" IS NOT NULL AS partenaire,
            coalesce(v.qte, 0)::int AS vendus_90j, coalesce(v.ca, 0) AS ca_90j
     FROM "Product" p
     LEFT JOIN (SELECT oi."productId", sum(oi.quantity) qte, sum(oi.price * oi.quantity) ca
                FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
                WHERE o.status = 'DELIVERED' AND coalesce(o."deliveredAt", o."createdAt") > now() - interval '90 days'
                GROUP BY 1) v ON v."productId" = p.id
     WHERE p.active = true AND coalesce(p.discontinued, false) = false
     ORDER BY coalesce(v.ca, 0) DESC, p.id LIMIT $1`, [limite])
  return r.rows.map((p) => {
    const prix = Number(p.prix) || 0, cout = p.cout == null ? null : Number(p.cout)
    const marge = cout == null ? null : arrondi(prix - cout)
    return {
      id: p.id, nom: p.nom, marque: p.marque, categorie: p.categorie, prix,
      margeUnitaire: marge,
      // Depot-vente (K-beauty d'un partenaire) : la marge nette se partage 50/50 ; Shine n'en garde que la moitie.
      partenaire: p.partenaire, margeShine: marge == null ? null : p.partenaire ? arrondi(marge / 2) : marge,
      tauxMarge: cout == null || prix === 0 ? null : Math.round(((prix - cout) / prix) * 100),
      stockVendable: Number(p.stock_vendable), importBloque: p.import_bloque,
      vendus90j: p.vendus_90j, ca90j: arrondi(Number(p.ca_90j)),
    }
  })
}
