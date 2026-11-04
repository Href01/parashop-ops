import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/* Mesure sur les vraies donnees (5 oct. - 3 nov.) : 18 commandes du site, toutes avec leur evenement d'achat ; l'entonnoir par defaut
   (fiche produit -> ... -> commande) n'en compte que 12. Les 6 autres ont saute une etape : 4 ont ajoute au panier depuis le rayon
   sans ouvrir de fiche, 3 avaient rempli leur panier lors d'une visite precedente (certaines cumulent les deux). Partir de
   « Panier ouvert » les compte toutes (18). Ce test garde le contrat : l'ecart doit se voir. */
const lire = (chemin: string) => readFileSync(new URL(`../../${chemin}`, import.meta.url), 'utf8')

test('l API de l entonnoir compte les commandes du site quand la derniere etape est la commande', () => {
  const route = lire('app/api/ops/analytics/analyses/route.ts')
  assert.ok(route.includes("etapes[etapes.length - 1] === 'PURCHASE_SUCCESS'"), 'seulement si la derniere etape est la commande')
  assert.ok(route.includes('o."sessionId" IS NOT NULL'), 'commandes du site : celles qui portent une session')
  assert.ok(route.includes('rapprochement'), 'renvoye au client')
})

test('la vue Conversion dit combien de commandes l entonnoir ne compte pas, et comment les inclure', () => {
  const vue = lire('app/analytics/_vues/Conversion.tsx')
  assert.ok(vue.includes('rapprochement.commandesSite > donnees[donnees.length - 1].sessions'), 'affichee seulement quand il y a un ecart')
  assert.ok(vue.includes('choisissez « Du panier à la commande »'), 'le correctif est un parcours préréglé, pas une consigne obscure')
  assert.ok(vue.includes('role="note"'))
})

test('le parcours par defaut part du panier (toutes les commandes) ; « depuis la fiche produit » reste un prereglage', () => {
  const vue = lire('app/analytics/_vues/Conversion.tsx')
  assert.ok(vue.includes('const DEFAUT: string[] = DU_PANIER'))
  assert.ok(vue.includes("['VIEW_CART', ...FUNNEL_PAR_DEFAUT.slice(2)]"), 'panier ouvert -> checkout -> ... -> commande')
  assert.ok(vue.includes('const DEPUIS_FICHE: string[] = [...FUNNEL_PAR_DEFAUT]'))
})
