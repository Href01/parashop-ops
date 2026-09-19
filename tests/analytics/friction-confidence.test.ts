import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnosticBlockage, SENS, BRUIT, detail, type Evenement } from '../../app/analytics/_components/Chronologie'

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
