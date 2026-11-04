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
