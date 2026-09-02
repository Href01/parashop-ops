# Analytics: fiabilite et coherence - 2026-09-02

## Definitions retenues

- **Base commande**: commandes attribuees a leur date de creation. C'est la base des rapports Acquisition et Conversion, afin de rapprocher une campagne des commandes qu'elle a generees.
- **Base livraison**: commandes `DELIVERED` attribuees a `deliveredAt`. C'est une base de ventes realisees, pas une date d'encaissement.
- **Encaissement**: reste calcule dans le dashboard executif. Le COD et les virements/cartes payes ou partiels sont distingues, puis reunis dans le cash recu selon leur statut de paiement.
- **Fiche vers panier**: sessions ayant ajoute au panier / sessions ayant vu une fiche. Les volumes d'evenements ne sont plus melanges avec des sessions.
- **Cliente**: neuf derniers chiffres du telephone normalise. Les espaces, indicatifs et variantes de format ne creent plus plusieurs clientes.

## Corrections

- Suppression des lignes artificielles `(tous)` lorsqu'une dimension ne savait pas ventiler une source.
- Ajout des dimensions manquantes sur sessions, pages, evenements et commandes: canal, ville, langue, appareil, modele, gamme, page.
- Regroupement des evenements produit sur le produit canonique en base plutot que sur le nom historique envoye par le navigateur.
- Filtre `status = DELIVERED` obligatoire en base livraison; jour et heure suivent alors `deliveredAt`.
- Union des cles courantes et precedentes avant comparaison, avec seuil de fiabilite applique aux deux periodes.
- Funnel recalcule comme une vraie sequence ordonnee dans la fenetre choisie.
- Clic de recherche attribue a la recherche qui le precede, avant la recherche suivante.
- Cohortes et delai de deuxieme commande recalcules sur les dates de livraison et les telephones normalises.
- Sessions sans evenement visibles; evenements de cycle de vie serveur exclus de la duree de visite.
- Une panne Neon transitoire est retentee une fois et journalisee avec son code.
- Les lectures identiques simultanees partagent le meme calcul. Une revision atomique dans `AppSetting` coordonne maintenant les caches de toutes les instances Vercel.
- La revision n'est modifiee que par les ecritures metier: commandes storefront/BOS, articles, retours, recalculs, synchro Sendit et import Meta. Les evenements comportementaux gardent le TTL normal pour ne pas ajouter une ecriture Neon a chaque clic.
- Chaque instance ne relit la revision qu'une fois toutes les 15 secondes au maximum. Le bouton Actualiser force sa relecture et le recalcul.
- La vitrine renouvelle la session apres 30 minutes d'inactivite, propage le nouvel identifiant aux evenements qui avaient memorise l'ancien et remet a zero les gardes d'impression propres a la visite.
- Controles sans effet retires des pages concernees; dates et navigation rendues utilisables sur mobile.
- Toutes les sous-pages Analytics disposent du meme etat d'erreur accessible avec une action `Reessayer` qui conserve periode et filtres.
- Une suite de contrats automatisee couvre les bases commande/livraison, les produits canoniques, les croisements incompatibles, les comparaisons et les limites multi-sources.
- Next.js est passe de `16.2.1` a `16.3.4` et Auth.js de `4.24.13` a `4.24.15` sur BOS et storefront, afin d'integrer les correctifs de securite publies pour ces branches.

## Reconciliation independante

Periode testee: `2026-08-04` au `2026-09-02`, heure de Casablanca.

| Base | Mesure | SQL brut | UI |
|---|---:|---:|---:|
| Commande | Commandes | 34 | 34 |
| Commande | Livrees | 27 | 27 |
| Commande | CA livre | 9 632 MAD | 9 632 MAD |
| Commande | Marge | 5 481,64 MAD | 5 482 MAD affiche |
| Livraison | Livraisons | 32 | 32 |
| Livraison | CA livre | 11 090 MAD | 11 090 MAD |
| Livraison | Marge | 6 385,88 MAD | 6 386 MAD affiche |

Les ecarts d'affichage de marge sont uniquement l'arrondi visuel au MAD.

## Risques encore observes

- Deux visiteurs ont produit chacun dix sessions en moins d'une minute sans achat, dont une rafale geolocalisee a Columbus. Cela represente 20 sessions sur environ 3 087 sur la periode. Le signal reste documente mais n'est pas supprime automatiquement: sans preuve supplementaire, un filtre agressif pourrait retirer une vraie cliente qui ouvre plusieurs onglets.
- Les interactions de navigation convergent selon le TTL de cinq minutes. Elles ne declenchent volontairement pas la revision partagee, afin d'eviter une ecriture base par page vue.
- `xlsx@0.18.5` reste signale par `npm audit` sans version corrigee disponible sur le registre npm. Son remplacement demande une migration d'import/export dediee et ne doit pas etre force avec une mise a jour automatique.
- Prisma Studio conserve des alertes transitives cote storefront; la correction suggeree par l'outil est un retour de Prisma 7 vers Prisma 6, donc hors de cette livraison fonctionnelle.

## Verification

- `npx tsc --noEmit`
- `npm run test:analytics`
- `npm run build` avec Next.js `16.3.4` sur BOS et storefront.
- Invalidation partagee executee contre PostgreSQL: `analytics_cache_revision = 1` apres le premier signal.
- ESLint cible: aucune erreur.
- Les dix routes `/analytics*` chargees avec une session admin: aucune erreur, aucun `(tous)`, aucun chargement bloque.
- Test mobile du calendrier, de la navigation, des filtres et des tableaux.
