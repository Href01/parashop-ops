# Agent SEO concurrence — Claude dans le cloud, rapports dans Ops

Page **`/analytics/seo/concurrence`** (lien depuis SEO Insights). Pour chaque requête suivie : qui est premier, pourquoi (preuves mesurées), et le plan pour le dépasser avec les leviers réels du site.

## Qui fait quoi

| Pièce | Où | Rôle |
|---|---|---|
| Le cerveau | Claude, dans le cloud d'Anthropic (routines planifiées de Claude Code, abonnement d'Achraf) | Recherche web, mesure des pages, diagnostic, plan. Aucune API SEO payante. |
| Ses instructions | `scripts/seo/AGENT.md` du dépôt **parashop** (versionné) | Méthode, sources et limites, leviers, garde-fous, format du rapport. |
| Ses outils | `scripts/seo/*.mjs` du dépôt parashop | `analyser-pages` (signaux d'une page), `notre-page` (notre page candidate), `bos` (canal vers Ops). |
| Sa mémoire | Ops, migration **044** : `SeoAgentGroup`, `SeoAgentQuery`, `SeoAgentRequest`, `SeoAgentReport`, `SeoAgentAction`, `SeoSerpSnapshot` | File des demandes, rapports, actions à cocher, relevés quotidiens. |
| Les positions réelles | `SeoSearchDaily` (migration 043, Search Console) | Lues par Ops et transmises à l'agent. Jamais dupliquées. |

L'agent ne touche jamais la base : il parle à Ops par `/api/ops/seo/agent/machine/{demande,contexte,rapport,echec}` avec `SEO_AGENT_TOKEN` (le middleware laisse passer ces seuls chemins avec ce jeton ; la route le revérifie en temps constant). Il ne modifie ni le site, ni le code, ni l'admin : il recommande.

## Les deux routines

| Routine | Quand (heure du Maroc) | Modèle | Ce qu'elle fait |
|---|---|---|---|
| Relevé quotidien | 7 h 00 (06:00 UTC) | Sonnet 5 | Relève toutes les requêtes suivies (qui est #1, Shine dans le top 10 ?), puis analyse à fond UNE grappe, à tour de rôle (priorité, puis la moins récemment analysée). |
| Demandes | Chaque heure, 8 h 05 – 23 h 05 | Opus | Réclame la plus ancienne demande de la file ; s'il n'y en a pas, s'arrête aussitôt. Jusqu'à trois par passage. |

Une demande « en cours » depuis plus de deux heures sans rapport est close en erreur au passage suivant.

## Activation, une seule fois

1. **Base** : migration `044_seo_agent.sql` — appliquée le 26/09/2026 avec l'accord d'Achraf (additive, 25 requêtes de départ).
2. **Vercel, projet parashop-ops** : variable `SEO_AGENT_TOKEN` (production), même valeur que `.env.local`. Sans elle, les routes machine répondent 401.
3. **Environnement Claude des routines** (claude.ai → Code → Environments → l'environnement choisi) :
   - *Network access* : **Full** (l'agent lit les pages des concurrents, le sitemap de la boutique et Ops) ;
   - *Environment variables* : `SEO_AGENT_TOKEN=<même valeur>` et `SEO_BOS_URL=https://ops.shinecosmetics.ma`.
4. **Routines** : créées depuis Claude Code (`/schedule`) sur le dépôt `Href01/parashop`, outils Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch.
5. Vérifier le premier passage : la page affiche « Dernier passage de l'agent » et un rapport ; sinon, journal de la routine (claude.ai/code/routines).

Rotation du jeton : nouvelle valeur dans Vercel ET dans l'environnement Claude, puis redéployer Ops.

## Lire les chiffres

- **#1 et « Shine (moteur) »** : l'ordre du moteur de recherche de l'agent — le bon ensemble de concurrents, pas l'ordre exact de google.ma.
- **Position Google** : réelle, Search Console, Maroc, 28 jours, moyenne pondérée par les impressions, **variantes comprises** (toutes les recherches qui contiennent les mots porteurs de la requête : « olaplex n°3 prix maroc » ↔ « olaplex 3 », « olaplex no 3 »). Une requête exacte a souvent moins de cinq impressions par mois.
- **7 j vs 7 j avant** : flèche verte = la position s'améliore (le chiffre baisse).
- Ce que l'agent ne voit pas (liens entrants, âge du domaine) est écrit comme hypothèse dans ses rapports.

## Vérification locale

```bash
node --import tsx --test tests/seo/agent-model.test.ts
npm run type-check
```

Test de bout en bout du 26/09/2026 : demande envoyée depuis la page (bureau et 390 px), réclamée par l'agent, rapport publié dans Ops local, actions cochables, relevés visibles.
