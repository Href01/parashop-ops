import assert from 'node:assert/strict'
import test from 'node:test'
import { allocateOrderLines, developperPacks, type CompositionPacks, type ItemRow, type OrderRow } from '../lib/partner-ledger'
import { LIGNES_COMPOSANTS } from '../lib/order-lignes'

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
