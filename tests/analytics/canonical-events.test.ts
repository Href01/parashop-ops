import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalEventName,
  canonicalEventNameSql,
  canonicalFunnelSteps,
  sourceEventNames,
} from '../../lib/analytics/events'
import { countFunnel, type FunnelRawEvent } from '../../lib/analytics/funnel'
import { diagnosticBlockage, checkoutAttempts, SENS, detail, type Evenement } from '../../app/analytics/_components/Chronologie'

const ETAPES = ['PRODUCT_VIEW_DETAIL', 'BEGIN_CHECKOUT', 'CHECKOUT_SUBMIT_ATTEMPT', 'PURCHASE_SUCCESS']

const ev = (
  sessionId: string,
  name: string,
  secondes: number,
  dansPeriode = true,
): FunnelRawEvent => ({
  sessionId,
  name,
  at: new Date(Date.UTC(2026, 9, 18, 12, 0, secondes)),
  dansPeriode,
})

const compte = (rows: FunnelRawEvent[], etapes = ETAPES) => countFunnel(rows, etapes, 1440)

test('les anciens noms sont ramenes au contrat canonique', () => {
  assert.equal(canonicalEventName('PLACE_ORDER'), 'CHECKOUT_SUBMIT_ATTEMPT')
  assert.equal(canonicalEventName('ORDER_CREATED'), 'PURCHASE_SUCCESS')
  assert.equal(canonicalEventName('PURCHASE_SUCCESS'), 'PURCHASE_SUCCESS')
  assert.match(canonicalEventNameSql('e'), /WHEN 'PLACE_ORDER' THEN 'CHECKOUT_SUBMIT_ATTEMPT'/)
  assert.match(canonicalEventNameSql('e'), /WHEN 'ORDER_CREATED' THEN 'PURCHASE_SUCCESS'/)
})

test('deux noms pour une meme marche ne creent pas deux marches', () => {
  assert.deepEqual(
    canonicalFunnelSteps(['BEGIN_CHECKOUT', 'PLACE_ORDER', 'CHECKOUT_SUBMIT_ATTEMPT']),
    ['BEGIN_CHECKOUT', 'CHECKOUT_SUBMIT_ATTEMPT'],
  )
  assert.deepEqual(
    sourceEventNames(['PURCHASE_SUCCESS']).sort(),
    ['ORDER_CREATED', 'PURCHASE_SUCCESS'],
  )
  assert.deepEqual(
    sourceEventNames(['CHECKOUT_SUBMIT_ATTEMPT']).sort(),
    ['CHECKOUT_SUBMIT_ATTEMPT', 'PLACE_ORDER'],
  )
})

test('ancien contrat : PLACE_ORDER + ORDER_CREATED comptent une commande, une fois', () => {
  const rows = [
    ev('s-old', 'PRODUCT_VIEW_DETAIL', 0),
    ev('s-old', 'BEGIN_CHECKOUT', 10),
    ev('s-old', 'PLACE_ORDER', 20),
    ev('s-old', 'CHECKOUT_SUBMIT_ATTEMPT', 21),
    ev('s-old', 'ORDER_CREATED', 30),
    ev('s-old', 'PURCHASE_SUCCESS', 31),
  ]
  const etapes = compte(rows)
  assert.deepEqual(etapes.map((e) => e.sessions), [1, 1, 1, 1])
  assert.equal(etapes[2].evenement, 'CHECKOUT_SUBMIT_ATTEMPT')
  assert.equal(etapes[3].evenement, 'PURCHASE_SUCCESS')
})

test('contrat canonique : CHECKOUT_SUBMIT_ATTEMPT + PURCHASE_SUCCESS comptent une commande, une fois', () => {
  const rows = [
    ev('s-new', 'PRODUCT_VIEW_DETAIL', 0),
    ev('s-new', 'BEGIN_CHECKOUT', 10),
    ev('s-new', 'CHECKOUT_SUBMIT_ATTEMPT', 20),
    ev('s-new', 'PURCHASE_SUCCESS', 30),
  ]
  assert.deepEqual(compte(rows).map((e) => e.sessions), [1, 1, 1, 1])
})

test('transition : les deux contrats dans la meme session ne doublent aucune marche', () => {
  const rows = [
    ev('s-mix', 'PRODUCT_VIEW_DETAIL', 0),
    ev('s-mix', 'BEGIN_CHECKOUT', 10),
    ev('s-mix', 'PLACE_ORDER', 20),
    ev('s-mix', 'CHECKOUT_SUBMIT_ATTEMPT', 21),
    ev('s-mix', 'ORDER_CREATED', 30),
    ev('s-mix', 'PURCHASE_SUCCESS', 31),
    ev('s-mix', 'PURCHASE_SUCCESS', 32),
  ]
  assert.deepEqual(compte(rows).map((e) => e.sessions), [1, 1, 1, 1])
})

test('deux commandes distinctes restent deux sessions, jamais quatre', () => {
  const rows = [
    ev('s-1', 'PRODUCT_VIEW_DETAIL', 0),
    ev('s-1', 'BEGIN_CHECKOUT', 10),
    ev('s-1', 'PLACE_ORDER', 20),
    ev('s-1', 'ORDER_CREATED', 30),
    ev('s-2', 'PRODUCT_VIEW_DETAIL', 0),
    ev('s-2', 'BEGIN_CHECKOUT', 10),
    ev('s-2', 'CHECKOUT_SUBMIT_ATTEMPT', 20),
    ev('s-2', 'PURCHASE_SUCCESS', 30),
  ]
  assert.deepEqual(compte(rows).map((e) => e.sessions), [2, 2, 2, 2])
})

test('la sequence et la fenetre de conversion restent respectees', () => {
  const desordre = [
    ev('s-desordre', 'PRODUCT_VIEW_DETAIL', 0),
    ev('s-desordre', 'PURCHASE_SUCCESS', 5),
    ev('s-desordre', 'CHECKOUT_SUBMIT_ATTEMPT', 10),
  ]
  assert.deepEqual(compte(desordre).map((e) => e.sessions), [1, 0, 0, 0])

  const horsFenetre = [
    ev('s-loin', 'PRODUCT_VIEW_DETAIL', 0),
    ev('s-loin', 'BEGIN_CHECKOUT', 10),
    ev('s-loin', 'CHECKOUT_SUBMIT_ATTEMPT', 20),
    ev('s-loin', 'PURCHASE_SUCCESS', 3 * 3600),
  ]
  assert.deepEqual(
    countFunnel(horsFenetre, ETAPES, 60).map((e) => e.sessions),
    [1, 1, 1, 0],
  )
})

test('la chronologie reconnait une confirmation canonique et ancienne', () => {
  const e = (name: string, props: Record<string, unknown> = {}): Evenement => ({
    name, props, path: '/checkout', at: '2026-10-18T12:00:00Z',
  })
  assert.equal(diagnosticBlockage([e('CHECKOUT_SUBMIT_ATTEMPT'), e('PURCHASE_SUCCESS')]), null)
  assert.equal(diagnosticBlockage([e('PLACE_ORDER'), e('ORDER_CREATED')]), null)
  assert.match(
    diagnosticBlockage([e('BEGIN_CHECKOUT'), e('CHECKOUT_SUBMIT_ATTEMPT', { finalTotal: 349 })])!.quoi,
    /aucune confirmation/,
  )
  const props = { attemptId: 'co_canon', elapsedMs: 1000 }
  assert.equal(checkoutAttempts([e('CHECKOUT_SUBMIT_ATTEMPT', props), e('ORDER_CREATED', props)])[0].ordered, true)
  assert.ok(SENS.APPLY_PROMO_SUCCESS?.label)
  assert.match(detail(e('APPLY_PROMO_SUCCESS', { code: 'PUBLIC', discountAmount: 79 }))!, /PUBLIC/)
})
