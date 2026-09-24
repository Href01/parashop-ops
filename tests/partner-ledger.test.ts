import assert from 'node:assert/strict'
import test from 'node:test'
import { allocateOrderLines, settle, type ItemRow, type OrderRow } from '../lib/partner-ledger'

/**
 * LE PARTAGE D'UN DEPOT-VENTE, VERIFIE A LA MAIN.
 *
 * C'est l'endroit ou une erreur coute une amitie : chaque cas ci-dessous est
 * calcule a la main dans son commentaire, puis compare au moteur. Les
 * montants sont ceux d'une vraie commande marocaine — livraison facturee a la
 * cliente, cout Sendit reel, emballage a 7 DH le colis.
 */

const PARTENAIRE = new Set([90, 96])
const close = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 0.011, `${msg} : ${a} au lieu de ${b}`)
const commande = (o: Partial<OrderRow>): OrderRow => ({
  id: 1, orderNumber: 'SC-1', at: '2026-09-25T10:00:00Z',
  revenue: 0, finalProfit: null, estimatedProfit: null, actualDeliveryCost: null, estimatedDeliveryCost: null, ...o,
})
const ligne = (productId: number, price: number, unitCost: number, quantity = 1): ItemRow => ({
  orderId: 1, productId, price, unitCost, quantity, name: `#${productId}`,
})

test('une commande 100 % partenaire : tout lui revient, frais compris', () => {
  /* Dr. Althea a 279 DH, achat 160. La cliente paie 279 + 30 de livraison
     = 309. Sendit facture 35. Benefice en base : 309 − 160 − 35 = 114.
     Marge avant emballage 114, emballage 7 → 107. Frais de commande :
     35 de Sendit − 30 factures = 5. */
  const [l] = allocateOrderLines(commande({ revenue: 279, finalProfit: 114 }), [ligne(90, 279, 160)], PARTENAIRE, 7)
  close(l.revenue, 279, 'CA')
  close(l.cogs, 160, 'cout')
  close(l.orderCosts, 5, 'livraison nette')
  close(l.packaging, 7, 'emballage')
  close(l.margin, 107, 'marge')
})

test('une commande mixte : le partenaire porte sa part, pas plus', () => {
  /* Beauty of Joseon 230 (achat 130) + un produit Shine 170 (achat 90).
     Valeur 400, part du partenaire w = 230/400 = 0,575.
     Remise 10 % : la cliente paie 360, livraison offerte. Sendit : 35.
     Benefice en base : 360 − 220 − 35 = 105.
     Partenaire : CA 360 × 0,575 = 207 ; cout 130 (exact, pas proratise) ;
     livraison 35 × 0,575 = 20,125 ; emballage 7 × 0,575 = 4,025 ;
     marge 207 − 130 − 20,125 − 4,025 = 52,85. */
  const lignes = allocateOrderLines(
    commande({ revenue: 360, finalProfit: 105 }),
    [ligne(96, 230, 130), ligne(12, 170, 90)],
    PARTENAIRE, 7,
  )
  assert.equal(lignes.length, 1, 'seule la ligne du partenaire est retournee')
  const [l] = lignes
  close(l.revenue, 207, 'CA proratise (remise comprise)')
  close(l.cogs, 130, 'cout exact de SA ligne')
  close(l.orderCosts, 20.13, 'livraison au prorata')
  close(l.packaging, 4.03, 'emballage au prorata')
  close(l.margin, 52.85, 'marge')
})

test('sa part plus celle de Shine redonnent toujours la commande entiere', () => {
  /* La propriete qui empeche de facturer deux fois un meme dirham : en
     repartissant la meme commande entre le partenaire et tout le reste, on
     doit retrouver exactement le CA, le cout et le benefice de la base. */
  const o = commande({ revenue: 612, finalProfit: 187 })
  const items = [ligne(90, 279, 160), ligne(96, 230, 130, 2), ligne(12, 170, 90), ligne(40, 65, 30)]
  const reste = new Set(items.map((i) => Number(i.productId)).filter((id) => !PARTENAIRE.has(id)))
  const a = allocateOrderLines(o, items, PARTENAIRE, 7)
  const b = allocateOrderLines(o, items, reste, 7)
  const somme = (ls: typeof a, k: 'revenue' | 'cogs' | 'margin' | 'packaging') => ls.reduce((s, l) => s + l[k], 0)
  close(somme(a, 'revenue') + somme(b, 'revenue'), 612, 'CA total')
  close(somme(a, 'cogs') + somme(b, 'cogs'), 160 + 260 + 90 + 30, 'cout total')
  close(somme(a, 'packaging') + somme(b, 'packaging'), 7, 'un seul colis')
  close(somme(a, 'margin') + somme(b, 'margin'), 187 - 7, 'benefice total, emballage deduit')
})

test("une commande sans ses produits ne lui coute rien", () => {
  assert.deepEqual(allocateOrderLines(commande({ revenue: 170, finalProfit: 45 }), [ligne(12, 170, 90)], PARTENAIRE, 7), [])
})

test('sans benefice calcule en base, le meme repli que le tableau de bord', () => {
  /* Ni finalProfit ni estimatedProfit : CA 279 − cout 160 − livraison 35 = 84. */
  const [l] = allocateOrderLines(
    commande({ revenue: 279, actualDeliveryCost: 35 }),
    [ligne(90, 279, 160)], PARTENAIRE, 0,
  )
  close(l.margin, 84, 'marge de repli')
})

test('le reglement : son argent, ses frais, sa part — moins ce qui est verse', () => {
  /* Vendus pour 290 de cout d'achat, 100 de douane payes par lui, marge
     nette 200 partagee 50/50 → il est du 290 + 100 + 100 = 490. */
  const r = settle({ cogs: 290, expensesPaidByPartner: 100, net: 200 }, 50, 0)
  close(r.partnerShare, 100, 'sa part')
  close(r.shineShare, 100, 'part Shine')
  close(r.owed, 490, 'du')
  close(r.balance, 490, 'solde')
  close(settle({ cogs: 290, expensesPaidByPartner: 100, net: 200 }, 50, 300).balance, 190, 'apres un versement de 300')
})

test('une perte se partage comme un gain', () => {
  /* Marge nette −80 : sa part est −40, qui vient en deduction de ce qu'on lui
     rembourse — Shine ne porte pas seule une campagne qui n'a pas marche. */
  const r = settle({ cogs: 290, expensesPaidByPartner: 100, net: -80 }, 50, 0)
  close(r.partnerShare, -40, 'sa part de la perte')
  close(r.owed, 350, 'du')
})
