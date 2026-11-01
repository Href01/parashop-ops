import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/* « Impossible de modifier les articles » sur la commande 362 : la requete de
   modification utilisait $3 pour `quantity` (entier) ET pour le calcul du cout
   (numerique). Postgres refuse un parametre deduit de deux types (42P08) ; le typage
   TypeScript ne relit pas le SQL, donc build et tsc restaient verts. */
const source = readFileSync(new URL('../../app/api/ops/orders/[id]/items/route.ts', import.meta.url), 'utf8')

test('la modification d une ligne type sa quantite : le meme parametre ne sert pas a deux types', () => {
  const requete = source.match(/`UPDATE "OrderItem"[\s\S]*?`/)?.[0] ?? ''
  assert.ok(requete.includes('quantity = $3::int'), 'quantity doit etre typee')
  assert.ok(requete.includes('* $3::int'), 'le calcul du cout doit utiliser la meme quantite typee')
  assert.ok(!/[^:]\$3(?!::)/.test(requete.replace(/\$3::int/g, '')), '$3 sans type dans la requete')
})
