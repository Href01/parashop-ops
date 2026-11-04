import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { analyticsModuleHref } from '@/lib/analytics/navigation'

/* Le lien « campagne → ses sessions » : verifie sur les vraies donnees (10 campagnes, 2 periodes : le nombre de
   sessions du tableau d'Acquisition egale celui de la liste Sessions). Ici on garde le contrat contre une derive. */
const lire = (chemin: string) => readFileSync(new URL(`../../${chemin}`, import.meta.url), 'utf8')

test('la campagne est un detail de page : elle ne voyage pas d un onglet a l autre', () => {
  assert.equal(
    analyticsModuleHref('/analytics/sessions', '/analytics/conversion', 'jours=7&campagne=Ventes&debut=2026-10-01&fin=2026-10-07'),
    '/analytics/conversion?jours=7&debut=2026-10-01&fin=2026-10-07',
  )
  assert.equal(analyticsModuleHref('/analytics/sessions', '/analytics/acquisition', 'campagne=Ventes'), '/analytics/acquisition')
  assert.equal(analyticsModuleHref('/analytics/sessions', '/analytics/produits', 'jours=30'), '/analytics/produits?jours=30', 'les autres reglages voyagent toujours')
})

test('l API Sessions filtre la campagne avec LE MEME calcul de nom que la dimension Campagne', () => {
  const route = lire('app/api/ops/analytics/sessions/route.ts')
  const modele = lire('lib/analytics/model.ts')
  assert.ok(route.includes("nomCampagneSql(`NULLIF(TRIM(s.\"utmCampaign\"), '')`)"), 'meme expression que model.ts')
  assert.ok(modele.includes("sessions: nomCampagneSql(`NULLIF(TRIM(s.\"utmCampaign\"), '')`)"), 'la dimension Campagne des sessions')
  assert.ok(route.includes("sp.get('campagne')"))
})

test('Acquisition ne lie que les campagnes qui ont des visites (ni DM, ni ligne sans campagne)', () => {
  const page = lire('app/analytics/_vues/AcquisitionResultat.tsx')
  assert.ok(page.includes("!l.cle.startsWith('(')"))
  assert.ok(page.includes('(l.mesures.sessions?.valeur ?? 0) > 0'))
})
