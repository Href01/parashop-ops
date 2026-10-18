# Analytics : contrat canonique des evenements de commande

**Date :** 2026-10-18
**Portee :** BOS `parashop-ops`, en preparation du merge de la PR site #3
(`feat/tracking-events-completion`).

## Le probleme

Le site et le BOS partagent la meme table `AnalyticsEvent`. La PR site #3 change
le vocabulaire des conversions de commande :

| Ancien nom (en base) | Nom canonique (PR #3) | Sens |
| --- | --- | --- |
| `PLACE_ORDER` | `CHECKOUT_SUBMIT_ATTEMPT` | tentative d'envoi, pas une vente |
| `ORDER_CREATED` | `PURCHASE_SUCCESS` | commande acceptee (seule conversion) |

La migration `20261018_analytics_canonical_events.sql` renomme et dedoublonne
les lignes existantes, mais elle **n'est pas executee** (accord Achraf requis).
Pendant la transition, la base contient donc les deux contrats. Merger la PR
site #3 seule casserait l'etape « Commande envoyee » de l'entonnoir BOS.

## La solution

`lib/analytics/events.ts` est la seule definition des correspondances.

- Le `WHERE` du funnel filtre les anciens **et** les nouveaux noms
  (`name = ANY(...)`), afin de conserver l'index sur `name`.
- Le `SELECT` ramene chaque ligne a son nom canonique.
- `canonicalFunnelSteps` dedoublonne les etapes : envoyer `PLACE_ORDER` et
  `CHECKOUT_SUBMIT_ATTEMPT` ne cree pas deux marches.
- `lib/analytics/funnel.ts` isole le comptage sequentiel. Une session porteuse
  de `PLACE_ORDER` + `CHECKOUT_SUBMIT_ATTEMPT` + `ORDER_CREATED` +
  `PURCHASE_SUCCESS` compte **une** tentative et **une** commande.

Le catalogue de l'entonnoir expose uniquement les noms canoniques
(`CHECKOUT_SUBMIT_ATTEMPT`, `PURCHASE_SUCCESS`), et la chronologie de session
continue d'afficher les anciens noms deja en base.

## Ordre de merge

1. **BOS (cette PR)** : lit les deux contrats, sans double comptage.
2. **Site PR #3** : emet uniquement les noms canoniques.
3. Migration de renommage : **hors PR**, script SQL propose, execution apres
   accord explicite d'Achraf (sauvegarde + clone d'abord).

## Tests

- `npm run test:analytics` : 32 tests, dont 8 nouveaux sur le contrat.
- `npm run test:orders` : 4 tests.
- `npm run test:seo` : 45 tests.
- `npx tsc --noEmit` : OK.

Aucune ecriture, migration ou execution en production.
