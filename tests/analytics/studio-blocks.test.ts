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
