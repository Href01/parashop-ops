import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { baseRemise, calculerRemisePromo, cleMarque, lireMarquesPromo } from '@/lib/order-promo'

/* La remise d'une commande doit etre celle que la boutique donne au paiement
   (app/api/orders/route.ts) : pourcentage arrondi au dirham sur la base couverte,
   montant fixe plafonne a la base, marques couvertes seulement. */

const L = (brand: string | null, price: number, quantity: number) => ({ brand, price, quantity })

test('BIENVENUE10 : 10 % arrondi au dirham sur tout le panier', () => {
  const regle = { discount: 10, isPercent: true, marques: null }
  assert.deepEqual(calculerRemisePromo(regle, [L('Olaplex', 260, 2)]), { remise: 52, base: 520 })
  // 2 x 260 + 95 = 615 -> 61,5 -> 62 (comme Math.round cote boutique)
  assert.equal(calculerRemisePromo(regle, [L('A', 260, 2), L('B', 95, 1)]).remise, 62)
})

test('un code limite a une marque ne porte que sur ses produits (MILKSHAKE10)', () => {
  const regle = { discount: 10, isPercent: true, marques: ['Milk Shake'] }
  const lignes = [L('milk_shake', 100, 2), L('Olaplex', 300, 1)]
  assert.equal(baseRemise(regle.marques, lignes), 200)
  assert.equal(calculerRemisePromo(regle, lignes).remise, 20)
  assert.equal(calculerRemisePromo(regle, [L('Olaplex', 300, 1)]).remise, 0, 'aucun article de la marque : pas de remise')
})

test('un montant fixe ne depasse jamais sa base', () => {
  assert.equal(calculerRemisePromo({ discount: 50, isPercent: false, marques: null }, [L('A', 30, 1)]).remise, 30)
  assert.equal(calculerRemisePromo({ discount: 50, isPercent: false, marques: null }, [L('A', 300, 1)]).remise, 50)
})

test('les marques s ecrivent de plusieurs facons, le code ne les distingue pas', () => {
  assert.equal(cleMarque(' Milk-Shake '), 'milkshake')
  assert.deepEqual(lireMarquesPromo({ MILKSHAKE10: { marques: ['Milk Shake'] } }, 'milkshake10'), ['Milk Shake'])
  assert.equal(lireMarquesPromo({ MILKSHAKE10: { marques: [] } }, 'MILKSHAKE10'), null)
  assert.equal(lireMarquesPromo(null, 'X'), null)
})

test('l edition d une commande qui porte un code recalcule la remise depuis le code (sinon elle disparait)', () => {
  const src = readFileSync(new URL('../../lib/order-edit.ts', import.meta.url), 'utf8')
  assert.ok(src.includes('if (!order.promoCode) return manuelle'), 'sans code : la remise saisie a la main est gardee')
  assert.ok(src.includes('calculerRemisePromo('), 'avec code : remise recalculee depuis la definition du code')
  const route = readFileSync(new URL('../../app/api/ops/orders/[id]/items/route.ts', import.meta.url), 'utf8')
  assert.ok(route.includes("from '@/lib/order-edit'"), 'l editeur de lignes passe par le recalcul commun')
})
