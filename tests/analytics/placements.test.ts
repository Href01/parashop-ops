import test from 'node:test'
import assert from 'node:assert/strict'
import { construirePlacements, parserInsightsMeta } from '../../lib/analytics/placements'

// Forme documentee de GET /act_<id>/insights?breakdowns=publisher_platform,platform_position
const META = {
  data: [
    { publisher_platform: 'instagram', platform_position: 'instagram_reels', spend: '120.50', impressions: '9000', clicks: '210',
      actions: [{ action_type: 'link_click', value: '210' }, { action_type: 'omni_purchase', value: '3' }],
      action_values: [{ action_type: 'omni_purchase', value: '1200' }] },
    { publisher_platform: 'instagram', platform_position: 'feed', spend: '80', impressions: '5000', clicks: '90' },
    { publisher_platform: 'audience_network', platform_position: 'an_classic', spend: '60.25', impressions: '30000', clicks: '40' },
    { publisher_platform: 'facebook', platform_position: 'feed', spend: '40', impressions: '4000', clicks: '55',
      actions: [{ action_type: 'purchase', value: '1' }], action_values: [{ action_type: 'purchase', value: '395' }] },
  ],
}

test('Meta insights are parsed per platform and position, converted to dirhams', () => {
  const l = parserInsightsMeta(META, 2)
  assert.equal(l.length, 4)
  assert.deepEqual(l[0], { publisher: 'instagram', source: 'ig', position: 'instagram_reels', depense: 241, impressions: 9000, clics: 210, achats: 3, valeur: 2400 })
  assert.equal(l[2].source, 'an', 'audience_network maps to the utm_source "an"')
  assert.equal(l[1].achats, 0, 'no purchase action means 0, not NaN')
  assert.deepEqual(parserInsightsMeta({}, 1), [])
  assert.deepEqual(parserInsightsMeta(null, 1), [])
})

test('profit = delivered margin − packaging − Meta spend, per placement, best first', () => {
  const meta = parserInsightsMeta(META, 1)
  const r = construirePlacements({
    meta, emballageParColis: 7,
    trafic: [{ source: 'ig', sessions: 1000, paniers: 40 }, { source: 'an', sessions: 900, paniers: 2 }, { source: 'fb', sessions: 300, paniers: 9 }, { source: 'direct', sessions: 800, paniers: 30 }],
    commandes: [
      { source: 'ig', passees: 5, livrees: 4, annulees: 1, enCours: 0, caLivre: 1580, margeLivree: 800 },
      { source: 'fb', passees: 2, livrees: 1, annulees: 0, enCours: 1, caLivre: 395, margeLivree: 150 },
      { source: 'direct', passees: 20, livrees: 19, annulees: 0, enCours: 1, caLivre: 9000, margeLivree: 4500 },
    ],
  })
  const ig = r.lignes.find((x) => x.source === 'ig')!
  assert.equal(ig.depense, 200.5)
  assert.equal(ig.marge, 800 - 7 * 4, 'packaging is deducted per delivered parcel')
  assert.equal(ig.profit, 772 - 200.5)
  assert.equal(ig.coutParLivree, 50.13)
  assert.equal(ig.roas, 7.88)
  assert.equal(ig.annulees, 1)

  // Audience Network : de la depense, des sessions, ZERO commande → perte nette, jamais « gratuit ».
  const an = r.lignes.find((x) => x.source === 'an')!
  assert.equal(an.profit, -60.25)
  assert.equal(an.roas, 0)
  assert.equal(an.coutParLivree, null, 'no delivered order, no cost per order')

  // Order : paid placements first, by profit; unattributed traffic last.
  assert.deepEqual(r.lignes.map((x) => x.source), ['ig', 'fb', 'an', 'direct'])
  assert.equal(r.lignes.find((x) => x.source === 'direct')!.payant, false)
  assert.equal(r.lignes.find((x) => x.source === 'direct')!.depense, null)
  // Total counts paid placements only.
  assert.equal(r.total.depense, 300.75)
  assert.equal(r.total.livrees, 5)
})

test('when Meta did not answer, spend and profit are unknown (null), never zero', () => {
  const r = construirePlacements({
    meta: null, emballageParColis: 7,
    trafic: [{ source: 'ig', sessions: 10, paniers: 1 }],
    commandes: [{ source: 'ig', passees: 1, livrees: 1, annulees: 0, enCours: 0, caLivre: 395, margeLivree: 150 }],
  })
  assert.equal(r.metaDisponible, false)
  assert.equal(r.lignes[0].depense, null)
  assert.equal(r.lignes[0].profit, null)
  assert.equal(r.lignes[0].roas, null)
  assert.equal(r.total.profit, null)
  assert.equal(r.lignes[0].marge, 143, 'the margin side still works without Meta')
})

test('rates never divide by zero', () => {
  const r = construirePlacements({ meta: [], emballageParColis: 7, trafic: [{ source: 'th', sessions: 0, paniers: 0 }], commandes: [] })
  const th = r.lignes[0]
  assert.equal(th.tauxCommande, null)
  assert.equal(th.roas, null)
  assert.equal(th.depense, 0, 'Meta answered with no spend on Threads: that is a real zero')
  assert.equal(th.profit, 0)
})
