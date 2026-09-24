import test from 'node:test'
import assert from 'node:assert/strict'
import { SENS, BRUIT, detail } from '../../app/analytics/_components/Chronologie'

test('Studio exposure is ambient noise, while clicks and collections remain readable actions', () => {
  assert.ok(BRUIT.has('CMS_BLOCK_IMPRESSION'))
  assert.equal(BRUIT.has('CMS_BLOCK_CLICK'), false)
  assert.equal(SENS.CMS_VOUCHER_COLLECT.famille, 'interet')
  const text = detail({ name: 'CMS_VOUCHER_COLLECT', path: '/', at: '', props: { surface: 'home', sectionId: 'vouchers', itemId: '1', viewport: 'mobile' } })
  assert.match(text!, /home/)
  assert.match(text!, /pas une remise appliquée ni une vente/)
})

test('Ops reads page publication identity and distinguishes dynamic message actions', () => {
  const props = { scope: 'product:52', messageId: 'advice', pageExperience: { pageModelId: 'conseil-product-v1', revisionNo: 4, templateRevisionNo: 2 } }
  const text = detail({ name: 'CMS_MESSAGE_CLICK', path: '/products/52', at: '', props })
  assert.match(text!, /conseil-product-v1/)
  assert.match(text!, /publication v4/)
  assert.match(text!, /gabarit v2/)
  assert.match(text!, /advice/)
  assert.equal(BRUIT.has('CMS_MESSAGE_SHOWN'), true)
  assert.equal(BRUIT.has('CMS_MESSAGE_CLICK'), false)
  assert.equal(SENS.CMS_MESSAGE_CLICK.famille, 'interet')
  assert.match(detail({ name: 'CLICK_UI', path: '/', at: '', props: { component: 'studio_event', action: 'shown', messageId: 'old' } })!, /affiché · ancien suivi/)
})
