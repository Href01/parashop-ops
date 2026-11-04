import pool from '@/lib/db'

/**
 * LES LIGNES DE COMMANDE, PACKS DÉVELOPPÉS EN COMPOSANTS.
 *
 * Un pack (« Duo Éclaircissant », « Routine Glass Skin »…) est un produit à part entière, mais ce qui sort du stock ce
 * sont ses COMPOSANTS : la base le fait ainsi (apply_order_line_stock : un produit qui a un Bundle n'est pas décrémenté,
 * ses BundleItem le sont ; le stock du pack se recalcule ensuite = min des composants).
 *
 * Tout calcul qui regarde les ventes PAR PRODUIT pour décider du stock (vitesse de vente, réservé, produit « sans vente »,
 * stock du partenaire) doit voir la même chose que la base. Compter les lignes brutes oubliait chaque composant vendu via un
 * pack : sa vitesse était sous-estimée, et un composant vendu seulement en pack paraissait invendu.
 * (Constaté le 4/11 : commande 369, un Duo Éclaircissant, absente du relevé du partenaire.)
 *
 * Ce fragment se met à la place de `"OrderItem" oi` et expose les mêmes colonnes utiles :
 *   "orderId", "productId" (le composant), quantity (en unités de composant), price (prix unitaire du composant : le prix de la
 *   ligne réparti au prorata du prix catalogue des composants).
 * Il ne sert PAS aux rapports « quel pack se vend » : là, la ligne brute est la bonne.
 */
export const LIGNES_COMPOSANTS = `(
  SELECT oi."orderId",
         COALESCE(bi."productId", oi."productId") AS "productId",
         oi.quantity * COALESCE(bi.quantity, 1) AS quantity,
         CASE WHEN bi.id IS NULL THEN oi.price
              ELSE oi.price * oi.quantity * (c.price * bi.quantity) / NULLIF(bt.tot, 0) / NULLIF(oi.quantity * bi.quantity, 0)
         END AS price
    FROM "OrderItem" oi
    LEFT JOIN "Bundle" b ON b."productId" = oi."productId"
    LEFT JOIN "BundleItem" bi ON bi."bundleId" = b.id
    LEFT JOIN "Product" c ON c.id = bi."productId"
    LEFT JOIN (
      SELECT bi2."bundleId", SUM(c2.price * bi2.quantity) AS tot
        FROM "BundleItem" bi2 JOIN "Product" c2 ON c2.id = bi2."productId" GROUP BY 1
    ) bt ON bt."bundleId" = b.id
)`

/**
 * UN MOUVEMENT DE STOCK SUR UN PACK SE FAIT SUR SES COMPOSANTS.
 *
 * Le stock d'un pack est DÉRIVÉ (minimum de ses composants, voir refresh_bundle_stock) : y écrire n'a aucun effet durable,
 * et les composants, eux, ne bougent pas. Un retour « remettre en stock » d'un Duo Éclaircissant laissait donc le Savon et
 * la Lotion décrémentés à jamais. Même règle que la base à la vente : le pack est remplacé par ses composants.
 */
export type MouvementStock = { productId: number; qty: number }

export function developperMouvementsAvec(
  mouvements: MouvementStock[],
  composants: Map<number, Array<{ productId: number; quantity: number }>>,
): MouvementStock[] {
  const cumul = new Map<number, number>()
  const ordre: number[] = []
  const ajoute = (productId: number, qty: number) => {
    if (!cumul.has(productId)) { cumul.set(productId, 0); ordre.push(productId) }
    cumul.set(productId, (cumul.get(productId) ?? 0) + qty)
  }
  for (const m of mouvements) {
    const comps = composants.get(m.productId)
    if (!comps || comps.length === 0) { ajoute(m.productId, m.qty); continue }
    for (const c of comps) ajoute(c.productId, m.qty * (c.quantity || 1))
  }
  return ordre.map((productId) => ({ productId, qty: cumul.get(productId) ?? 0 })).filter((m) => m.qty !== 0)
}

export async function developperMouvements(mouvements: MouvementStock[]): Promise<MouvementStock[]> {
  if (mouvements.length === 0) return mouvements
  const ids = [...new Set(mouvements.map((m) => m.productId))]
  const r = await pool.query(
    `SELECT b."productId" AS pack, bi."productId" AS pid, bi.quantity AS q
       FROM "Bundle" b JOIN "BundleItem" bi ON bi."bundleId" = b.id
      WHERE b."productId" = ANY($1::int[])`,
    [ids],
  )
  const composants = new Map<number, Array<{ productId: number; quantity: number }>>()
  for (const x of r.rows) {
    const liste = composants.get(Number(x.pack)) ?? []
    liste.push({ productId: Number(x.pid), quantity: Number(x.q) || 1 })
    composants.set(Number(x.pack), liste)
  }
  return developperMouvementsAvec(mouvements, composants)
}
