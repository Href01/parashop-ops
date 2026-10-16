import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateEditedOrderEconomics } from '../../lib/order-economics'

const base = {
  productsTotal: 270,
  discountTotal: 0,
  deliveryFeeCharged: 0,
  paymentMethod: 'COD',
  paidAmount: null,
  currentCodAmount: null,
  hasSenditShipment: false,
  currentPaymentStatus: 'PENDING',
}

test('une vente remise en main propre garde le COD transporteur vide', () => {
  assert.deepEqual(calculateEditedOrderEconomics(base), {
    productsTotal: 270,
    discountTotal: 0,
    revenue: 270,
    total: 270,
    codAmount: null,
    paymentStatus: 'PENDING',
    overpaidAmount: 0,
  })
})

test('un colis Sendit recalcule aussi le montant COD', () => {
  const result = calculateEditedOrderEconomics({
    ...base,
    deliveryFeeCharged: 30,
    hasSenditShipment: true,
  })
  assert.equal(result.revenue, 270)
  assert.equal(result.total, 300)
  assert.equal(result.codAmount, 300)
})

test('la remise ne peut pas rendre une commande negative', () => {
  const result = calculateEditedOrderEconomics({ ...base, productsTotal: 50, discountTotal: 90 })
  assert.equal(result.discountTotal, 50)
  assert.equal(result.revenue, 0)
  assert.equal(result.total, 0)
})

test('un virement est requalifie apres une baisse du total', () => {
  const result = calculateEditedOrderEconomics({
    ...base,
    paymentMethod: 'VIREMENT',
    paidAmount: 300,
    currentPaymentStatus: 'PARTIAL',
  })
  assert.equal(result.codAmount, null)
  assert.equal(result.paymentStatus, 'PAID')
  assert.equal(result.overpaidAmount, 30)
})
