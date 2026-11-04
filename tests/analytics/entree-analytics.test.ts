import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

/* L'entree d'Analytics est TOUJOURS les sessions du jour, et chaque onglet de la navigation
   mene a une vraie page (une URL qui repond ne prouve pas qu'on peut y arriver : on lit la
   navigation, on verifie que chaque lien a sa page). Le parcours complet — 11 clics — est
   verifie dans un navigateur ; ceci garde le contrat contre un deplacement de fichier. */
const racine = new URL('../../', import.meta.url)
const lire = (chemin: string) => readFileSync(new URL(chemin, racine), 'utf8')

const report = lire('app/analytics/_components/Report.tsx')
const modules = [...report.matchAll(/\{ href: '([^']+)', label: ['"]([^'"]*(?:'[^'"]*)?)['"], groupe: '([^']+)' \}/g)]
  .map((m) => ({ href: m[1], label: m[2], groupe: m[3] }))

test('la navigation compte sept onglets (onze auparavant) et ouvre sur Sessions', () => {
  assert.equal(modules.length, 7)
  assert.equal(modules[0].href, '/analytics/sessions')
  assert.equal(new Set(modules.map((m) => m.href)).size, 7, 'aucun lien en double')
})

test('chaque onglet a sa page, et aucun ne pointe plus vers la racine /analytics', () => {
  for (const m of modules) {
    assert.ok(existsSync(new URL(`app${m.href}/page.tsx`, racine)), `page absente pour ${m.label} (${m.href})`)
    assert.notEqual(m.href, '/analytics', 'la racine redirige : elle ne peut plus etre un onglet')
  }
})

test('les groupes se suivent sans se melanger (un seul filet par changement de groupe)', () => {
  const ordre = modules.map((m) => m.groupe).filter((g, i, a) => i === 0 || g !== a[i - 1])
  assert.deepEqual(ordre, ['maintenant', 'analyse', 'outils'])
})

test('/analytics redirige vers les sessions du jour, et un ancien lien avec reglages garde sa vue', () => {
  const entree = lire('app/analytics/page.tsx')
  assert.ok(entree.includes("'/analytics/sessions')"), 'sans parametre : sessions (aujourd hui par defaut)')
  const appel = entree.split('\n').find((l) => l.trim().startsWith('redirect(')) ?? ''
  assert.ok(appel && !appel.includes('jours='), 'le defaut ne s ecrit pas dans l adresse : il voyagerait vers tous les onglets')
  assert.ok(entree.includes('/analytics/acquisition?${query}&vue=marge'), 'avec parametres : l ancienne Vue d ensemble (vue marge), memes reglages')
})

test('Sessions ouvre sur aujourd hui par defaut ; les autres modules gardent 30 jours', () => {
  assert.ok(lire('app/analytics/sessions/page.tsx').includes('useReport({ joursParDefaut: 1 })'))
  assert.ok(lire('app/analytics/_components/useReport.ts').includes('options.joursParDefaut ?? 30'))
})

test('une journee en cours ne se compare pas en fleche a une journee complete', () => {
  const page = lire('app/analytics/sessions/page.tsx')
  assert.ok(page.includes('const jourEnCours = estAujourdHui('))
  assert.ok((page.match(/jourEnCours \? undefined/g) ?? []).length >= 3, 'les indicateurs masquent la fleche')
})

/* Onze modules sont devenus sept onglets. Chaque ancienne adresse doit mener a la vue qui l'a absorbee
   (favoris, liens partages) : on verifie la table de redirection ET que la vue cible existe bien. */
const ANCIENNES: Array<[string, string, string | null]> = [
  ['ensemble', '/analytics/acquisition', 'marge'],
  ['conversion', '/analytics/parcours', 'conversion'],
  ['engagement', '/analytics/parcours', 'engagement'],
  ['qualite', '/analytics/parcours', 'qualite'],
  ['produits', '/analytics/catalogue', 'produits'],
  ['recherche', '/analytics/catalogue', 'recherche'],
  ['retention', '/analytics/clientes', null],
]

test('chaque ancienne adresse renvoie vers la vue qui l a absorbee, et cette vue existe', () => {
  for (const [ancienne, cible, vue] of ANCIENNES) {
    const page = lire(`app/analytics/${ancienne}/page.tsx`)
    assert.ok(page.includes(`redirigerVue('${cible}', ${vue === null ? 'null' : `'${vue}'`}`), `${ancienne} → ${cible}${vue ? ` (${vue})` : ''}`)
    if (vue) assert.ok(lire(`app${cible}/page.tsx`).includes(`cle: '${vue}'`), `la vue « ${vue} » existe dans ${cible}`)
  }
})

test('les deux vues Pub (Meta, Google Ads) vivent sous Acquisition et ne sont plus des onglets de Sessions', () => {
  const acquisition = lire('app/analytics/acquisition/page.tsx')
  assert.ok(acquisition.includes("cle: 'meta'") && acquisition.includes("cle: 'google'"))
  const sessions = lire('app/analytics/sessions/page.tsx')
  assert.ok(!sessions.includes('Emplacements Meta') && !sessions.includes("from '../_components/GoogleAds'"))
})
