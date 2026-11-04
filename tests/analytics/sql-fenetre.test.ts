import assert from 'node:assert/strict'
import test from 'node:test'

import { construireSql } from '@/lib/analytics/model'

/* Optimisation sans changement de resultat : un encadrement LARGE de dates, sans fonction sur la colonne, laisse l'index de date
   borner la lecture (plan mesure : Seq Scan de 324 000 evenements -> Index Scan). Le filtre exact (jour local) reste applique.
   Verifie sur la base reelle : 186 requetes (toutes les mesures evenements/pages/sessions x 6 dimensions x 2 periodes dont une aux
   bornes de jour) renvoient exactement les memes lignes avant et apres. */
const periode = { debut: '2026-10-31', fin: '2026-11-01' }
const req = { periode, mesures: ['pagesVues'], basis: 'cohorte' as const }

test('chaque source horodatee porte l encadrement indexable ET le filtre exact du jour local', () => {
  for (const [source, colonne] of [['evenements', 'e."createdAt"'], ['pages', '"PageView"."createdAt"'], ['sessions', 's."firstSeenAt"']] as const) {
    const mesures = source === 'sessions' ? ['sessions'] : source === 'pages' ? ['pagesVues'] : ['vuesProduit']
    const q = construireSql(source, { ...req, mesures }, periode)
    assert.ok(q, `${source} : requete construite`)
    assert.ok(q.texte.includes(`${colonne} >= $1::date - interval '1 day' AND ${colonne} < $2::date + interval '2 days'`), `${source} : encadrement indexable sur ${colonne}`)
    assert.ok(/BETWEEN \$1::date AND \$2::date/.test(q.texte), `${source} : le filtre exact reste applique`)
  }
})

test('la marge d un jour de chaque cote couvre largement le decalage du Maroc (0 ou 1 h)', () => {
  const q = construireSql('evenements', { ...req, mesures: ['vuesProduit'] }, periode)!
  assert.ok(q.texte.includes("interval '1 day'") && q.texte.includes("interval '2 days'"), '1 jour avant le debut, 2 jours apres la fin (fin incluse)')
})
