import assert from 'node:assert/strict'
import test from 'node:test'
import { actionsParJour, estBoost, fatigue, indicateurs, parSemaine } from '../../lib/ads/meta-model'
import { StrategieSchema, manquesStrategie, strategieParDefaut } from '../../lib/ads/strategie-model'
import { nettoyerArticle } from '../../lib/seo/article-html'

test('un achat Meta ne compte qu’une fois, même rapporté sous trois noms', () => {
  const actions = [
    { action_type: 'omni_purchase', value: '2' }, { action_type: 'purchase', value: '2' }, { action_type: 'offsite_conversion.fb_pixel_purchase', value: '2' },
    { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '5' }, { action_type: 'landing_page_view', value: '40' },
    { action_type: 'video_view', value: '300' }, { action_type: 'post_engagement', value: '90' },
  ]
  const a = actionsParJour(actions, [{ action_type: 'omni_purchase', value: '410.5' }, { action_type: 'purchase', value: '410.5' }], [{ action_type: 'video_view', value: '60' }])
  assert.equal(a.achats, 2)
  assert.equal(a.valeurAchats, 410.5)
  assert.equal(a.messages, 5)
  assert.equal(a.vuesPage, 40)
  assert.equal(a.vuesVideo3s, 300)
  assert.equal(a.thruplays, 60)
  assert.deepEqual(actionsParJour(undefined, undefined, undefined), { achats: 0, valeurAchats: 0, paniers: 0, commandesInitiees: 0, vuesPage: 0, messages: 0, vuesVideo3s: 0, thruplays: 0, engagements: 0 })
})

test('les indicateurs d’une pub ne s’inventent pas quand le dénominateur est nul', () => {
  const i = indicateurs({ depense: 200, impressions: 20000, clicsLien: 300, vuesPage: 150, achats: 2, valeurAchats: 700, messages: 8, vuesVideo3s: 5000, thruplays: 1000 })
  assert.equal(i.ctr, 1.5)
  assert.equal(i.cpm, 10)
  assert.equal(i.coutParResultat, 20)
  assert.equal(i.roasPixel, 3.5)
  assert.equal(i.accroche, 25)
  assert.equal(i.retention, 20)
  const vide = indicateurs({ depense: 0, impressions: 0, clicsLien: 0, vuesPage: 0, achats: 0, valeurAchats: 0, messages: 0, vuesVideo3s: 0, thruplays: 0 })
  assert.equal(vide.ctr, null)
  assert.equal(vide.coutParResultat, null)
})

test('fatigue : fréquence haute ET clics en baisse, pas l’un sans l’autre', () => {
  assert.equal(fatigue(4.2, 0.6, 1.2, 3), true)
  assert.equal(fatigue(4.2, 1.1, 1.2, 3), false, 'frequent but still clicking')
  assert.equal(fatigue(2, 0.5, 1.2, 3), false, 'clicks down, but not over-exposed')
  assert.equal(fatigue(null, 0.5, 1.2, 3), false)
})

test('un post boosté (engagement) n’est pas une campagne de vente ni de messages', () => {
  assert.equal(estBoost('OUTCOME_ENGAGEMENT', 'POST_ENGAGEMENT'), true)
  assert.equal(estBoost('POST_ENGAGEMENT', null), true)
  assert.equal(estBoost('OUTCOME_SALES', 'OFFSITE_CONVERSIONS'), false)
  assert.equal(estBoost('OUTCOME_ENGAGEMENT', 'CONVERSATIONS'), false, 'messages campaign is a sales lever in Morocco')
})

test('la stratégie : défauts prudents, cibles vides tant qu’Achraf ne les fixe pas, champs bornés', () => {
  const d = strategieParDefaut()
  assert.equal(d.objectif, 'rentabilite')
  assert.equal(d.cibles.coutParCommandeMax, null)
  assert.equal(d.regles.frequenceMax, 3)
  assert.equal(d.regles.boostsAutorises, false)
  assert.deepEqual(d.langues, ['fr', 'darija'])
  assert.deepEqual(manquesStrategie(d), ['budget mensuel', 'coût maximum par commande livrée', 'seuil de rentabilité (ROAS ou marge après pub)', 'produits ou marques à pousser'])
  const fixe = StrategieSchema.parse({ budgetMensuel: 3000, cibles: { coutParCommandeMax: 60, roasMin: 4 }, marquesPrioritaires: ['Milk Shake'] })
  assert.deepEqual(manquesStrategie(fixe), [])
  assert.equal(StrategieSchema.safeParse({ objectif: 'tout' }).success, false)
  assert.equal(StrategieSchema.safeParse({ budgetMensuel: -5 }).success, false)
  assert.equal(StrategieSchema.safeParse({ langues: [] }).success, false)
  assert.equal(StrategieSchema.safeParse({ calendrier: [{ nom: 'Black Friday', debut: '27/11', fin: '2026-11-30' }] }).success, false)
})

test('le nettoyeur d’articles est partagé et reste pur (garde-fou de la livraison SEO)', () => {
  assert.match(nettoyerArticle('<p><a href="/k-beauty">K</a></p>', 'ar'), /\/ar\/k-beauty/)
})

test('au-delà de 90 jours, la série se somme par semaine (du lundi au dimanche)', () => {
  const j = (jour: string, depense: number, livrees = 0) => ({ jour, depense, messages: 1, achats: 0, clics: 0, livrees, ca: 100 * livrees, marge: 40 * livrees })
  // 2026-09-20 est un dimanche, 2026-09-21 un lundi.
  const s = parSemaine([j('2026-09-19', 10), j('2026-09-20', 20, 1), j('2026-09-21', 5), j('2026-09-27', 7, 2)])
  assert.deepEqual(s.map((x) => x.jour), ['2026-09-14', '2026-09-21'])
  assert.equal(s[0].depense, 30); assert.equal(s[0].livrees, 1); assert.equal(s[0].messages, 2)
  assert.equal(s[1].depense, 12); assert.equal(s[1].ca, 200); assert.equal(s[1].marge, 80)
})
