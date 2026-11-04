import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/* Le design d'Analytics reprend l'identite reelle du BOS (fond gris clair, cartes blanches, accent rose #e11d74 : valeurs relevees
   dans le navigateur, pas dans les premieres lignes de globals.css qu'un theme plus recent ecrase). Garde-fous de structure. */
const lire = (chemin: string) => readFileSync(new URL(`../../${chemin}`, import.meta.url), 'utf8')

test('la toile et les blocs suivent le langage du BOS : canevas, cartes blanches, accent rose', () => {
  assert.ok(lire('app/analytics/layout.tsx').includes('background: MARQUE.canevas'))
  const rapport = lire('app/analytics/_components/Report.tsx')
  assert.ok(rapport.includes('rounded-2xl') && rapport.includes('boxShadow: MARQUE.ombre'), 'les blocs sont des cartes')
  assert.ok(lire('app/analytics/_components/Controls.tsx').includes('.ctrl[data-on] { background: ${MARQUE.rose}'), 'la selection est rose')
})

test('la navigation porte une icone par onglet et un etat actif rose', () => {
  const nav = lire('app/analytics/_components/AnalyticsNav.tsx')
  for (const href of ['sessions', 'acquisition', 'parcours', 'catalogue', 'clientes', 'seo', 'explorer']) assert.ok(nav.includes(`'/analytics/${href}':`), `icone ${href}`)
  assert.ok(nav.includes('MARQUE.roseFond') && nav.includes('aria-current'))
})

test('les ecarts sont des pastilles aux encres foncees (le vert et le rouge de marque ne tiennent pas 4,5:1 en petit texte)', () => {
  const viz = lire('app/analytics/_components/Viz.tsx')
  assert.ok(viz.includes("goodInk: '#08700a'") && viz.includes("criticalInk: '#b32d2d'"))
  assert.ok(lire('app/analytics/_components/Report.tsx').includes('color: encre'))
})

test('le graphique d Activite : un seul axe, vue en tableau, commandes en reperes, veille en ligne fine', () => {
  const a = lire('app/analytics/_components/Activite.tsx')
  assert.ok(a.includes("dimension = horaire ? 'heure' : 'jour'"), 'heure pour une journee, jour sinon')
  assert.ok(a.includes('Voir en tableau'), 'vue en tableau (accessibilite)')
  assert.ok(a.includes('Math.min(24,'), 'colonnes de 24 px au plus')
  assert.ok(!/yAxisId|dual|secondaire/i.test(a), 'jamais de second axe')
  assert.ok(lire('app/analytics/sessions/page.tsx').includes('<Activite debut={etat.periode.debut} fin={etat.periode.fin} />'))
})
