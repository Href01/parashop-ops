# SEO Insights — Search Console dans Ops

## Ce qui est livré

Page protégée **`/analytics/seo`**, dans les onglets Analytics :

- mots-clés exacts ou contenant une expression, pages, pays et appareils ;
- comparaisons de 7 ou 28 journées finalisées avec la période précédente ;
- clics, impressions, CTR recalculé et position pondérée par les impressions ;
- clic sur un mot-clé → pages associées ; clic sur une page → mots-clés associés ;
- courbes sans interpolation des données manquantes, pagination des tableaux, export CSV protégé contre les formules ;
- signaux de recul, mots-clés non observés et potentiel CTR, avec seuils de volume ;
- contrôle du sitemap public : HTTP, redirections, noindex, canonique, titre, description et H1 ;
- inspection Google en lecture seule de l’accueil, Olaplex, milk_shake et K-beauty (version connue de Google, pas test live) ;
- journal des synchronisations, import reprenable, avertissements de fraîcheur et couverture ;
- cron Vercel **`/api/cron/seo` à 07:35 UTC chaque jour**, actif seulement une fois déployé et configuré.

Pas de service SEO payant ni de scraping des résultats Google. L’hébergement Ops et sa base continuent d’utiliser leurs ressources et quotas habituels. Les alertes sont consultables dans Ops ; aucun e-mail ou WhatsApp n’est envoyé.

## Activation, une seule fois

### 1. Base de données

Le stockage ajoute cinq tables indépendantes : `SeoSearchDaily`, `SeoImportDay`, `SeoSyncState`, `SeoSyncRun`, `SeoTechnicalAudit`. Il ne modifie ni produits, ni commandes, ni données clientes.

Après validation de la base cible et sauvegarde selon la procédure habituelle :

```bash
node scripts/run-migration.js 043_seo_insights.sql
```

Cette migration n’est **pas** appliquée automatiquement au chargement d’une page ou au build. Ops utilise actuellement une base partagée avec le site : ne pas la traiter comme une base locale jetable. Les tests de cette fonctionnalité utilisent PostgreSQL en mémoire, jamais `DATABASE_URL`.

### 2. Compte de service Google

1. Dans un projet Google Cloud contrôlé par Shine, activer **Google Search Console API**.
2. Créer un compte de service dédié. Aucun rôle global d’administration du projet ni délégation Google Workspace n’est nécessaire.
3. Dans la propriété Search Console **`sc-domain:shinecosmetics.ma`**, ajouter son adresse comme utilisateur avec les droits de lecture nécessaires. Commencer avec les droits les plus restreints. Si Google refuse l’inspection d’URL, vérifier les autorisations et demander validation avant de les élargir ; la fonctionnalité ne les élargit jamais automatiquement.
4. Fournir la clé privée du compte uniquement dans les variables d’environnement serveur d’Ops. Ne pas l’enregistrer dans Git, la base, les messages ou les captures d’écran. La création d’une clé et l’octroi de droits sont des actions de sécurité à valider par le propriétaire.

```dotenv
# Compte de service dédié, côté serveur uniquement
GSC_CLIENT_EMAIL=nom-du-compte@projet.iam.gserviceaccount.com
GSC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Conserver le secret existant s’il est déjà utilisé par les autres crons Ops.
# Sinon créer un secret fort dans le gestionnaire d’environnement, pas dans Git.
CRON_SECRET=...
```

Le code fixe la propriété Shine et le périmètre `https://www.googleapis.com/auth/webmasters.readonly`. Il ne demande aucune indexation, ne supprime aucune URL et n’envoie aucun sitemap. La session Google du navigateur n’est ni récupérée ni réutilisée.

En local, `GSC_PRIVATE_KEY_FILE` peut remplacer `GSC_PRIVATE_KEY` : indiquer le chemin absolu d’un fichier PEM protégé situé **hors du dépôt**. La variable inline reste prioritaire et convient à Vercel ; ne pas envoyer un chemin Windows à Vercel. Les erreurs ne révèlent ni chemin ni contenu. Le certificat public créé le 25 septembre 2026 expire le 25 septembre 2027 : prévoir sa rotation avant cette date.

### 3. Déploiement et import initial

1. Déployer Ops avec ces variables et le cron de `vercel.json`.
2. Vérifier que le plan et les limites Vercel permettent les crons déjà configurés et une fonction de 300 secondes. Le traitement se donne un budget interne de 240 secondes ; les journées déjà enregistrées restent intactes en cas d’interruption.
3. Se connecter comme fondateur sur `/analytics/seo`, puis cliquer **Synchroniser**.
4. L’import cible les 56 derniers jours, jusqu’à 10 journées par passage, avec reprise des journées manquantes. Les trois dernières journées finalisées sont relues à chaque passage. Il faut plusieurs passages pour compléter le premier historique ; le bouton permet de poursuivre sans attendre le lendemain.
5. Avant de prendre les écarts pour des tendances, attendre que les deux périodes soient complètes. Vérifier les totaux d’un même segment et d’une même période dans Search Console.
6. Vérifier le premier déclenchement Vercel et le journal Ops le jour suivant. La présence des variables seule ne prouve pas qu’un cron s’est exécuté.

Sans identifiants Google, le cron peut effectuer le contrôle technique HTTP seul après migration. L’interface continue d’afficher la connexion manquante, jamais des positions fictives.

## Contrat de mesure

Quatre jeux de données sont importés séparément, par jour et pour la recherche Web :

| Jeu | Dimensions | Agrégation Google | Usage |
|---|---|---|---|
| site | pays, appareil | byProperty | Totaux sans filtre mot-clé/page |
| query | mot-clé, pays, appareil | byProperty | Mots-clés et totaux filtrés sur un mot-clé |
| page | page, pays, appareil | byPage | Pages et totaux filtrés sur une page |
| detail | mot-clé, page, pays, appareil | byPage | Croisement mot-clé/page |

Ne jamais additionner ces quatre jeux. Une position est `SUM(position × impressions) / SUM(impressions)`. Le CTR est `SUM(clics) / SUM(impressions)` ; ni les positions ni les taux ne sont moyennés sans pondération.

- Dates Google : `America/Los_Angeles`, pas heure du Maroc. La dernière date vient des données finalisées Google, pas d’une hypothèse « aujourd’hui moins deux ».
- Lignes anonymisées et certaines lignes détaillées ne sont pas accessibles. Les totaux de détail peuvent donc être inférieurs aux totaux de propriété.
- Pagination API : 25 000 lignes par requête, plafond de 50 000 par jour et jeu. Le plafond est signalé et suspend les alertes/comparaisons, sans prétendre être exhaustif.
- Limite de lecture du rapport : 100 000 lignes brutes pour les segments pays/appareil demandés. Au-delà, un avertissement explicite suspend les comparaisons. Adapter la requête SQL à une agrégation serveur avant une montée significative de volume.
- Une journée importée sans ligne compte zéro observation. Une journée non importée reste manquante. Position sans impression : `null`, affichée « — ».
- Une disparition n’est pas une preuve de désindexation. Une baisse d’impressions n’est pas forcément une baisse de position.

Seuils actuels : aucune alerte comparative tant que la couverture des deux périodes n’est pas complète ; recul de position d’au moins 3 places ou d’impressions d’au moins 40 %, avec au moins 20 impressions dans chaque période. « Non observé » nécessite au moins 30 impressions auparavant. « Potentiel CTR » nécessite au moins 50 impressions, position de 4 à 20 et CTR inférieur à 3 %. Ce sont des règles d’examen, pas des certitudes statistiques ou des prédictions de ventes.

Les mots-clés GSC ne peuvent pas être attribués à chaque session/commande. Le lien vers Acquisition conserve les deux analyses séparées ; aucune attribution individuelle inventée.

## Sécurité et fiabilité

- Page et routes API réservées aux fondateurs ; réponse privée non mise en cache.
- POST manuel vérifie session et origine ; cron exige le secret serveur même si une session existe.
- Verrou distribué par propriété, bail de dix minutes ; exécution interrompue identifiée au passage suivant.
- Une journée est remplacée dans une transaction après récupération des quatre jeux. Un échec restaure l’ancienne journée. Relancer ne double pas les compteurs.
- Les erreurs Google sont reformulées sans persister l’objet d’erreur, les en-têtes d’autorisation ou les clés.
- Audit HTTP limité au domaine HTTPS public Shine, sans cookies ni exécution JavaScript, sans suivre les redirections. Exclusion des routes privées, des paramètres et des URL externes. Maximum 300 URL, deux requêtes simultanées, taille et délai bornés. Le sitemap actuel est un `urlset` ; un index de sitemaps non pris en charge est annoncé comme incomplet.
- Un audit partiel, une erreur réseau ou une inspection Google refusée n’est jamais présenté comme une validation globale.
- Les lots de rattrapage réutilisent un audit complet de moins d’une heure pour éviter de reparcourir le site à chaque lot. Le contrôle technique manuel force une nouvelle vérification. Chaque appel Google respecte également le budget global du passage.

## Vérification locale

```bash
npm run test:seo
npm run test:analytics
npm run type-check
npx eslint lib/seo app/analytics/seo app/api/ops/seo app/api/cron/seo tests/seo
npm run build
```

Tests PostgreSQL isolés : migration réexécutable, remplacement idempotent, rollback, import vide et exclusion mutuelle. Tests de données : moyennes pondérées, dimensions, dates, absence/caps, filtres exacts, export et faux positifs. Tests API Google avec réponses simulées : pagination, lecture seule, mauvaise réponse, plafonds. La validation d’une vraie synchronisation Google reste nécessaire après autorisation.

Contrôle navigateur local du 25 septembre 2026 : interface authentifiée vérifiée à 320, 390 et 1440 px. Les changements rapides de marque/période/appareil sont conservés après rechargement. Les paramètres Google sont isolés de ceux des Analytics internes lors du changement de module.

Activation du 25 septembre 2026 : compte dédié `shine-ops-seo`, sans rôle IAM de projet, ajouté avec **Accès limité** à Search Console. API activée, clé privée hors dépôt en local et secret de production dans le seul projet Vercel **parashop-ops**. Migration additive appliquée dans une transaction. Lecture réelle validée, dernière journée finalisée au 23 septembre. Les premiers lots sont visibles dans Ops, les filtres Olaplex et comparaisons de 7 jours fonctionnent, et l’inspection Google répond pour les quatre URL prioritaires. Le premier contrôle public a parcouru 218 URL ; ses anomalies restent visibles sans prétendre qu’elles expliquent à elles seules une baisse de trafic. Le journal de collecte reste la référence pour la couverture finale et les exécutions du cron.

## Références officielles

- [Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
- [Collecte quotidienne et limites](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data)
- [Inspection d’URL](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect)
- [Authentification des comptes de service](https://developers.google.com/identity/protocols/oauth2/service-account)
