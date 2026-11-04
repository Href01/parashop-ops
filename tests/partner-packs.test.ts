import assert from 'node:assert/strict'
import test from 'node:test'
import { allocateOrderLines, detailCommande, developperPacks, type CompositionPacks, type ItemRow, type OrderRow } from '../lib/partner-ledger'
import { LIGNES_COMPOSANTS, developperMouvementsAvec } from '../lib/order-lignes'

/**
 * LES PACKS DANS LE RELEVÉ DU PARTENAIRE.
 *
 * Cas réel, 4 novembre 2026 : la commande 369 contenait le « Duo Éclaircissant » (345 DH, revient à 165), un pack de DEUX
 * produits du partenaire (Savon Kojique 95 DH / revient 30 ; Lotion 15 % 250 DH / revient 135). Le relevé ne voyait que les
 * lignes dont le produit est au partenaire : le pack, produit sans partenaire, lui échappait, et son CA n'a pas bougé.
 */
const close = (a: number, b: number, msg: string, tol = 0.02) => assert.ok(Math.abs(a - b) < tol, `${msg} : ${a} au lieu de ${b}`)

const SAVON = 108, LOTION = 99, DUO = 116, ROUTINE = 70, SPRAY = 34, NOFRIZZ = 66, INTEGRITY = 50
const PACKS: CompositionPacks = new Map([
  [DUO, [
    { productId: SAVON, name: 'Savon Kojique', quantity: 1, price: 95, costPrice: 30 },
    { productId: LOTION, name: 'Lotion 15 %', quantity: 1, price: 250, costPrice: 135 },
  ]],
  [ROUTINE, [
    { productId: NOFRIZZ, name: 'No Frizz', quantity: 1, price: 140, costPrice: 55 },
    { productId: SPRAY, name: 'Spray Conditionner', quantity: 1, price: 179, costPrice: 66.06 },
  ]],
])
const ligne = (productId: number, price: number, unitCost: number, quantity = 1, name = `#${productId}`): ItemRow => ({ orderId: 369, productId, price, unitCost, quantity, name })

test('un pack se développe en lignes de composants, et les totaux se conservent au centime', () => {
  const [savon, lotion] = developperPacks([ligne(DUO, 345, 165)], PACKS)
  assert.equal(savon.productId, SAVON); assert.equal(lotion.productId, LOTION)
  close(Number(savon.price) * Number(savon.quantity), 95, 'valeur du savon')
  close(Number(lotion.price) * Number(lotion.quantity), 250, 'valeur de la lotion')
  close(Number(savon.unitCost) * Number(savon.quantity), 30, 'coût du savon')
  close(Number(lotion.unitCost) * Number(lotion.quantity), 135, 'coût de la lotion')
  close(Number(savon.price) + Number(lotion.price), 345, 'somme des prix = prix du pack')
})

test('la quantité du pack se multiplie par celle de chaque composant', () => {
  const lignes = developperPacks([ligne(DUO, 345, 165, 2)], PACKS)
  assert.deepEqual(lignes.map((l) => Number(l.quantity)), [2, 2])
  close(lignes.reduce((s, l) => s + Number(l.price) * Number(l.quantity), 0), 690, 'valeur de 2 packs')
  close(lignes.reduce((s, l) => s + Number(l.unitCost) * Number(l.quantity), 0), 330, 'coût de 2 packs')
})

test('une remise sur le pack se répartit au prorata : le total de la ligne vaut ce que la cliente a payé', () => {
  const lignes = developperPacks([ligne(DUO, 276, 165)], PACKS) // 345 − 20 %
  close(lignes.reduce((s, l) => s + Number(l.price) * Number(l.quantity), 0), 276, 'valeur remisée')
  close(Number(lignes[0].price), 276 * 95 / 345, 'part du savon')
})

test('un produit simple, ou un pack inconnu, ressort tel quel', () => {
  const brut = [ligne(INTEGRITY, 175, 60)]
  assert.deepEqual(developperPacks(brut, PACKS), brut)
  assert.equal(developperPacks([ligne(777, 100, 40)], PACKS)[0].productId, 777)
})

test('si le coût figé de la ligne manque, on retombe sur le prix d\'achat des composants', () => {
  const lignes = developperPacks([ligne(DUO, 345, 0)], PACKS)
  close(lignes.reduce((s, l) => s + Number(l.unitCost) * Number(l.quantity), 0), 165, 'coût reconstitué')
})

test('commande 369, calculée à la main : seule la part du Duo revient au partenaire (CA 310,45 ; coût 165)', () => {
  /* CA 755, bénéfice en base 389,94, emballage 7. Valeur catalogue : 345 + 175 + 319 = 839 → poids du Duo w = 345/839 = 0,4112.
     CA partenaire = 755 × w = 310,45, réparti 95/345 → 85,49 (savon) et 250/345 → 224,96 (lotion).
     Hors produits = 389,94 + coût total (165 + 60 + 121,06 = 346,06) = 736,00 ; × w = 302,64 ; moins le coût 165 = 137,64.
     Emballage 7 × w = 2,88 → marge 134,76. */
  const commande: OrderRow = { id: 369, orderNumber: null, at: '2026-11-04T13:49:13Z', revenue: 755, finalProfit: 389.94, estimatedProfit: 408.94, actualDeliveryCost: 19, estimatedDeliveryCost: 0 }
  const brut = [ligne(DUO, 345, 165), ligne(INTEGRITY, 175, 60), ligne(ROUTINE, 319, 121.06)]
  const lignes = allocateOrderLines(commande, developperPacks(brut, PACKS), new Set([SAVON, LOTION]), 7)
  assert.equal(lignes.length, 2, 'deux lignes : le savon et la lotion')
  const par = Object.fromEntries(lignes.map((l) => [l.productId, l]))
  close(par[SAVON].revenue, 85.49, 'CA savon'); close(par[LOTION].revenue, 224.96, 'CA lotion')
  close(lignes.reduce((s, l) => s + l.revenue, 0), 310.45, 'CA du partenaire')
  close(lignes.reduce((s, l) => s + l.cogs, 0), 165, 'coût du partenaire')
  close(lignes.reduce((s, l) => s + l.packaging, 0), 2.88, 'emballage')
  close(lignes.reduce((s, l) => s + l.margin, 0), 134.76, 'marge du partenaire')
})

test('sans développement, la même commande rendait ZÉRO au partenaire (le défaut constaté)', () => {
  const commande: OrderRow = { id: 369, orderNumber: null, at: '2026-11-04T13:49:13Z', revenue: 755, finalProfit: 389.94, estimatedProfit: null, actualDeliveryCost: 19, estimatedDeliveryCost: 0 }
  const brut = [ligne(DUO, 345, 165), ligne(INTEGRITY, 175, 60), ligne(ROUTINE, 319, 121.06)]
  assert.deepEqual(allocateOrderLines(commande, brut, new Set([SAVON, LOTION]), 7), [])
})

test('le fragment SQL partagé reflète la règle de la base : le pack est remplacé par ses composants', () => {
  assert.ok(LIGNES_COMPOSANTS.includes('LEFT JOIN "Bundle" b ON b."productId" = oi."productId"'))
  assert.ok(LIGNES_COMPOSANTS.includes('oi.quantity * COALESCE(bi.quantity, 1)'), 'quantité × quantité du composant')
  assert.ok(LIGNES_COMPOSANTS.includes('COALESCE(bi."productId", oi."productId")'), 'un produit simple reste lui-même')
})

const COMPOSANTS = new Map([[DUO, [{ productId: SAVON, quantity: 1 }, { productId: LOTION, quantity: 1 }]], [ROUTINE, [{ productId: NOFRIZZ, quantity: 1 }, { productId: SPRAY, quantity: 2 }]]])

test('retour d’un pack : chaque composant revient en stock, pas le pack (dont le stock est dérivé)', () => {
  assert.deepEqual(developperMouvementsAvec([{ productId: DUO, qty: 1 }], COMPOSANTS), [{ productId: SAVON, qty: 1 }, { productId: LOTION, qty: 1 }])
})

test('la quantité du pack et celle du composant se multiplient ; un produit simple reste tel quel', () => {
  assert.deepEqual(
    developperMouvementsAvec([{ productId: ROUTINE, qty: 3 }, { productId: INTEGRITY, qty: 2 }], COMPOSANTS),
    [{ productId: NOFRIZZ, qty: 3 }, { productId: SPRAY, qty: 6 }, { productId: INTEGRITY, qty: 2 }],
  )
})

test('un échange (retour d’un pack, envoi du même pack) ne déplace rien : le stock net est inchangé', () => {
  assert.deepEqual(developperMouvementsAvec([{ productId: DUO, qty: 1 }, { productId: DUO, qty: -1 }], COMPOSANTS), [])
})

test('une unité retournée d’un pack et le même composant vendu seul se cumulent sur une seule ligne', () => {
  assert.deepEqual(developperMouvementsAvec([{ productId: DUO, qty: 1 }, { productId: SAVON, qty: 2 }], COMPOSANTS), [{ productId: SAVON, qty: 3 }, { productId: LOTION, qty: 1 }])
})

/**
 * LES POINTS DE FIDÉLITÉ SONT À LA CHARGE DE SHINE (décision du 4/11).
 * Commande type #360 : panier 444 DH, code promo −44, 730 points (= 73 DH) → la cliente paie 327 DH de produits.
 * Partenaire : un produit à 200 DH (revient à 80) ; autre produit à 244 DH (revient à 90) ; livraison coûtée 29 ; emballage 7.
 * Bénéfice en base 327 − 170 − 29 = 128 ; AVANT points 128 + 73 = 201 ; « hors produits » 201 + 170 = 371 ; w = 200/444.
 */
const PARTENAIRE = 900, AUTRE = 901
const commandePoints: OrderRow = {
  id: 360, orderNumber: null, at: '2026-11-02T10:00:00Z', revenue: 327, finalProfit: 128, estimatedProfit: null,
  actualDeliveryCost: 29, estimatedDeliveryCost: 19, pointsUsed: 730, promoCode: 'BIENVENUE10', productsTotal: 444, deliveryFeeCharged: 19,
}
const articles: ItemRow[] = [
  { orderId: 360, productId: PARTENAIRE, price: 200, unitCost: 80, quantity: 1, name: 'Produit partenaire' },
  { orderId: 360, productId: AUTRE, price: 244, unitCost: 90, quantity: 1, name: 'Autre produit' },
]

test('points de fidélité : le partage se calcule AVANT la remise en points, Shine porte seul la perte', () => {
  const [l] = allocateOrderLines(commandePoints, articles, new Set([PARTENAIRE]), 7)
  close(l.revenue, 400 * 200 / 444, 'CA du partenaire = (327 + 73) × w')
  close(l.margin, 371 * 200 / 444 - 80 - 7 * 200 / 444, 'marge du partenaire')
  // Sans la règle, le partenaire aurait perdu 73 × w sur son CA : 32,88 DH.
  close(l.revenue - 327 * 200 / 444, 73 * 200 / 444, 'ce que Shine absorbe')
})

test('sans points utilisés, rien ne change', () => {
  const sans = { ...commandePoints, pointsUsed: 0, revenue: 400, finalProfit: 201 }
  const [a] = allocateOrderLines(sans, articles, new Set([PARTENAIRE]), 7)
  const [b] = allocateOrderLines(commandePoints, articles, new Set([PARTENAIRE]), 7)
  close(a.revenue, b.revenue, 'même CA'); close(a.margin, b.margin, 'même marge')
})

test('le détail du calcul : chaque champ se lit et se recoupe avec les lignes', () => {
  const idSet = new Set([PARTENAIRE])
  const lignes = allocateOrderLines(commandePoints, articles, idSet, 7)
  const d = detailCommande(commandePoints, articles, idSet, 7, lignes)
  close(d.valeurCommande, 444, 'valeur commande'); close(d.valeurPartenaire, 200, 'valeur partenaire'); close(d.poids, 0.4505, 'poids w', 0.0001)
  close(d.remisePromo, 44, 'promo'); assert.equal(d.pointsDh, 73); close(d.pointsShine, 73 * 200 / 444, 'points à la charge de Shine')
  close(d.caPaye, 327, 'payé'); close(d.caPartage, 400, 'CA de partage')
  close(d.livraisonFacturee, 19, 'livraison facturée'); close(d.coutLivraison, 29, 'coût livraison')
  close(d.coutProduits, 170, 'coût produits'); close(d.beneficeAvantPoints, 201, 'bénéfice avant points'); close(d.horsProduits, 371, 'hors produits')
  assert.equal(d.promoCode, 'BIENVENUE10')
  close(d.partenaire.revenue, lignes[0].revenue, 'CA = ligne'); close(d.partenaire.margin, lignes[0].margin, 'marge = ligne')
  // La chaîne se referme : CA − coût − livraison & frais − emballage = marge.
  close(d.partenaire.revenue - d.partenaire.cogs - d.partenaire.orderCosts - d.partenaire.packaging, d.partenaire.margin, 'chaîne de calcul')
})

test('une ligne issue d\'un pack porte le nom du pack', () => {
  const l = developperPacks([ligne(DUO, 345, 165)], PACKS)
  assert.ok(l.every((x) => x.pack === `#${DUO}`))
  const [a] = allocateOrderLines({ id: 1, orderNumber: null, at: '2026-11-04T10:00:00Z', revenue: 345, finalProfit: 180, estimatedProfit: null, actualDeliveryCost: 0, estimatedDeliveryCost: 0 }, l, new Set([SAVON, LOTION]), 0)
  assert.equal(a.pack, `#${DUO}`)
})
