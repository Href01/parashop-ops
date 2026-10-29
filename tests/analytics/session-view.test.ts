import test from 'node:test'
import assert from 'node:assert/strict'
import { dureeCourte, etapesAtteintes, issueSession, jourClef, libelleJour, libelleSource, regrouperParJour, type SessionVue } from '../../lib/analytics/session-view'

const base: SessionVue = { automatise: false, actions: 12, fiches: 2, paniers: 0, checkouts: 0, commande: null }

test('the outcome follows the most decisive thing the visitor did', () => {
  assert.equal(issueSession({ ...base, commande: { statut: 'DELIVERED' } }), 'livree')
  assert.equal(issueSession({ ...base, commande: { statut: 'CANCELLED' } }), 'annulee')
  assert.equal(issueSession({ ...base, commande: { statut: 'CONFIRMED' } }), 'commandee')
  assert.equal(issueSession({ ...base, paniers: 1 }), 'panier')
  assert.equal(issueSession({ ...base, paniers: 1, commande: { statut: 'PENDING' } }), 'commandee', 'an order beats an abandoned cart')
  assert.equal(issueSession(base), 'parcours')
  assert.equal(issueSession({ ...base, actions: 1, fiches: 0 }), 'rebond')
  assert.equal(issueSession({ ...base, automatise: true, paniers: 3 }), 'automatise', 'automated traffic is labelled as such, whatever it did')
})

test('an order implies every earlier funnel step; a cart implies a product view', () => {
  assert.deepEqual(etapesAtteintes({ ...base, fiches: 0, commande: { statut: 'CONFIRMED' } }), { fiche: true, panier: true, checkout: true, commande: true })
  assert.deepEqual(etapesAtteintes({ ...base, fiches: 0, paniers: 1 }), { fiche: true, panier: true, checkout: false, commande: false })
  assert.deepEqual(etapesAtteintes({ ...base, fiches: 0, actions: 1 }), { fiche: false, panier: false, checkout: false, commande: false })
  assert.deepEqual(etapesAtteintes({ ...base, checkouts: 1 }), { fiche: true, panier: true, checkout: true, commande: false })
})

test('day labels use the Moroccan day and read naturally', () => {
  assert.equal(jourClef('2026-10-29T23:30:00Z'), '2026-10-30', 'half past midnight in Morocco is already the next day')
  assert.equal(libelleJour('2026-10-30', '2026-10-30'), "Aujourd'hui")
  assert.equal(libelleJour('2026-10-29', '2026-10-30'), 'Hier')
  assert.match(libelleJour('2026-10-26', '2026-10-30'), /lun\.? 26 oct/i)
})

test('sessions are grouped by day without reordering them', () => {
  const g = regrouperParJour([
    { derniere: '2026-10-30T10:00:00Z', id: 1 }, { derniere: '2026-10-30T08:00:00Z', id: 2 },
    { derniere: '2026-10-29T20:00:00Z', id: 3 }, { derniere: '2026-10-28T09:00:00Z', id: 4 },
  ], '2026-10-30')
  assert.deepEqual(g.map((x) => [x.libelle, x.sessions.map((s) => s.id)]), [["Aujourd'hui", [1, 2]], ['Hier', [3]], [g[2].libelle, [4]]])
})

test('Meta placements stay separate and organic visits are not mistaken for ads', () => {
  assert.deepEqual(libelleSource('ig', 'paid'), { label: 'Instagram', code: 'ig', famille: 'meta' })
  assert.deepEqual(libelleSource('fb', 'paid_social'), { label: 'Facebook', code: 'fb', famille: 'meta' })
  assert.equal(libelleSource('an', 'paid').label, 'Audience Network')
  assert.equal(libelleSource('th', 'paid').label, 'Threads')
  assert.deepEqual(libelleSource('instagram', 'referral'), { label: 'Instagram (lien)', code: 'instagram', famille: 'organique' })
  assert.equal(libelleSource('google', 'cpc').famille, 'google')
  assert.equal(libelleSource('google', null).famille, 'organique')
  assert.equal(libelleSource('', null).label, 'Direct')
})

test('durations are short and French', () => {
  assert.equal(dureeCourte(45), '45 s')
  assert.equal(dureeCourte(1620), '27 min')
  assert.equal(dureeCourte(5400), '1,5 h')
})
