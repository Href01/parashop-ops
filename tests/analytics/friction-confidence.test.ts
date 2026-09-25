import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnosticBlockage, checkoutAttempts, SENS, BRUIT, detail, type Evenement } from '../../app/analytics/_components/Chronologie'

const event = (name: string, props: Record<string, unknown> = {}): Evenement => ({ name, props, path: '/marques/olaplex', at: '2026-09-19T21:03:32Z' })
test('historical dead clicks stay visible but are labelled as uncertain, not proven failures', () => {
  const e = event('DEAD_CLICK', { label: 'Prévenez-moi', id: 'brand_card_notify_oos' })
  const signal = diagnosticBlockage([e])!
  assert.equal(signal.level, 'suspected')
  assert.match(signal.quoi, /ancien détecteur/)
  assert.equal(SENS.DEAD_CLICK.famille, 'suspicion')
  assert.match(detail(e)!, /faux positifs possibles/)
})
test('new detector and repeated clicks are still only suspicions', () => {
  assert.equal(diagnosticBlockage([event('DEAD_CLICK', { detectorVersion: 2 })])?.level, 'suspected')
  assert.equal(diagnosticBlockage([event('RAGE_CLICK')])?.level, 'suspected')
})
test('explicit failures take precedence over later uncertain clicks without changing input order', () => {
  const events = [event('PURCHASE_FAILED', { error: 'Stock indisponible' }), event('DEAD_CLICK')]
  const signal = diagnosticBlockage(events)!
  assert.equal(signal.level, 'error'); assert.match(signal.quoi, /Stock indisponible/)
  assert.equal(events[0].name, 'PURCHASE_FAILED')
  assert.equal(diagnosticBlockage([...events, event('ORDER_CREATED')]), null)
})
test('restock opening and submission are distinct engagement events, not sales', () => {
  const opened = event('RESTOCK_NOTIFY_OPENED', { productId: 52, source: 'carte' })
  assert.equal(SENS.RESTOCK_NOTIFY_OPENED.famille, 'interet')
  assert.equal(SENS.RESTOCK_NOTIFY_SUBMITTED.famille, 'interet')
  assert.match(detail(opened)!, /pas encore de demande/)
  assert.match(diagnosticBlockage([opened])!.quoi, /sans demande enregistrée/)
  assert.equal(diagnosticBlockage([opened])!.level, undefined)
  assert.match(diagnosticBlockage([opened, event('RESTOCK_NOTIFY_SUBMITTED')])!.quoi, /pas une commande/)
})
test('raw Studio impressions have readable labels and remain hidden from significant actions', () => {
  assert.equal(SENS.CMS_BLOCK_IMPRESSION.label, 'Voit un bloc éditorial')
  assert.equal(BRUIT.has('CMS_BLOCK_IMPRESSION'), true)
})

test('temporary checkout exits have neutral labels, translated fields and no confirmed-abandon diagnosis', () => {
  for (const name of ['CHECKOUT_EXITED', 'CHECKOUT_FIELD_EXIT']) {
    const e = event(name, { champ: 'phone', step: 'delivery', reason: 'visibility_hidden', cartValue: 300 })
    assert.equal(SENS[name].famille, 'paiement')
    assert.match(detail(e)!, /livraison.*autre chose.*300 MAD au panier.*abandon non confirmé/)
    if (name === 'CHECKOUT_FIELD_EXIT') assert.match(detail(e)!, /téléphone/)
    const events = [event('BEGIN_CHECKOUT'), e, event('CHECKOUT_STEP', { step: 'summary' })]
    assert.equal(diagnosticBlockage(events)?.level, undefined)
    assert.doesNotMatch(diagnosticBlockage(events)!.quoi, /abandon|Erreur|Bloqu/i)
    assert.equal(diagnosticBlockage([...events, event('PURCHASE_SUCCESS')]), null)
  }
})

test('new explicit validation failures stay distinct from provisional exits and uncertain clicks', () => {
  for (const name of ['OTP_INVALID', 'OTP_SEND_FAILED', 'CHECKOUT_FIELD_ERROR']) {
    const e = event(name, { champ: 'district', step: 'delivery', raison: 'vide', phase: 'resend' })
    assert.equal(SENS[name].famille, 'friction')
    assert.ok(detail(e))
    assert.equal(diagnosticBlockage([e, event('CHECKOUT_EXITED'), event('DEAD_CLICK')])?.level, 'error')
    assert.equal(diagnosticBlockage([e, event('ORDER_CREATED')]), null)
  }
  assert.match(detail(event('CHECKOUT_FIELD_ERROR', { champ: 'district', raison: 'vide' }))!, /quartier.*non renseigné/)
})

test('purchase intent and engagement events are readable without pretending a sale occurred', () => {
  for (const name of ['PRODUCT_REMOVE_FROM_WISHLIST', 'WHATSAPP_ORDER', 'WHATSAPP_SHARE', 'CLICK_LOYALTY_HISTORY', 'BUY_NOW_CLICK', 'OTP_VERIFIED']) {
    assert.ok(SENS[name]?.label)
    assert.notEqual(SENS[name].famille, 'commande')
  }
  for (const name of ['WHATSAPP_ORDER', 'BUY_NOW_CLICK']) assert.match(detail(event(name))!, /pas une vente confirmée/)
  assert.match(detail(event('SEARCH_ZERO_RESULTS', { query: 'anua', source: 'catalog' }))!, /avec ces filtres/)
})
test('checkout attempts keep attribution, recovery and exits distinct from accepted orders', () => {
  const props = { attemptId: 'co_test', source: 'cart-drawer', entrySurface: 'product', elapsedMs: 1000 }
  const events = [event('BEGIN_CHECKOUT', props), event('CHECKOUT_FIELD_ERROR', { ...props, champ: 'phone' }), event('CHECKOUT_FIELD_RECOVERED', { ...props, champ: 'phone', elapsedMs: 4000 }), event('CHECKOUT_RESUMED', props), event('CHECKOUT_EXITED', props)]
  const [attempt] = checkoutAttempts(events)
  assert.equal(attempt.source, 'cart-drawer'); assert.equal(attempt.surface, 'product')
  assert.equal(attempt.recovered, 1); assert.equal(attempt.fields.size, 1)
  assert.equal(attempt.resumed, true); assert.equal(attempt.ordered, false); assert.equal(attempt.exited, true)
  assert.equal(attempt.elapsedMs, 4000)
  assert.notEqual(diagnosticBlockage(events)?.level, 'error')
  assert.equal(checkoutAttempts([...events, event('PURCHASE_SUCCESS', props)])[0].ordered, true)
  assert.equal(checkoutAttempts([event('BEGIN_CHECKOUT', { attemptId: 'unsafe id' })]).length, 0)
  for (const name of ['CHECKOUT_BLOCK_VIEWED', 'CHECKOUT_FIELD_STARTED', 'CHECKOUT_FIELD_COMPLETED', 'CHECKOUT_FIELD_RECOVERED', 'CHECKOUT_RESUMED', 'CHECKOUT_SUBMIT_ATTEMPT', 'CHECKOUT_STOCK_BLOCKED']) assert.ok(SENS[name]?.label)
  assert.equal(diagnosticBlockage([event('CHECKOUT_STOCK_BLOCKED', { reason: 'quantity_unavailable' })])?.level, 'error')
})

test('resolved validation and verification errors remain historical, not current blockers', () => {
  const p = { attemptId: 'co_same' }
  assert.notEqual(diagnosticBlockage([event('CHECKOUT_VALIDATION_FAILED', { ...p, missingFields: ['phone'] }), event('CHECKOUT_FIELD_RECOVERED', { ...p, champ: 'phone' })])?.level, 'error')
  for (const failure of ['CHECKOUT_STOCK_BLOCKED', 'CHECKOUT_FIELD_ERROR', 'CHECKOUT_VALIDATION_FAILED']) assert.notEqual(diagnosticBlockage([event(failure, p), event('ADD_PAYMENT_INFO', p)])?.level, 'error')
  assert.notEqual(diagnosticBlockage([event('OTP_INVALID', p), event('OTP_VERIFIED', p)])?.level, 'error')
  assert.notEqual(diagnosticBlockage([event('OTP_SEND_FAILED', p), event('OTP_RESENT', { ...p, ok: true })])?.level, 'error')
  assert.equal(diagnosticBlockage([event('OTP_INVALID', p), event('OTP_VERIFIED', { attemptId: 'co_other' })])?.level, 'error')
})

test('compact checkout phases, version and promotion removal have readable Ops labels', () => {
  const p = { attemptId: 'co_compact', checkoutVersion: 'atelier-v1', step: 'basket', source: 'conseil-header' }
  assert.match(detail(event('CHECKOUT_STEP', p))!, /panier/)
  assert.match(detail(event('CHECKOUT_STEP', p))!, /checkout compact v1/)
  assert.match(detail(event('CHECKOUT_BLOCK_VIEWED', { ...p, block: 'promotions' }))!, /codes et offres/)
  assert.equal(SENS.PROMO_CODE_REMOVED.famille, 'paiement')
  assert.match(detail(event('PROMO_CODE_REMOVED', { ...p, code: 'PUBLIC', discountAmount: 79 }))!, /remise retirés/)
})
