# Nouvelle commande: fiabilisation UI, paiements et stock

Date: 2026-09-02

## Objectif

Rendre `/orders/new` rapide a utiliser, comprehensible financierement et coherent avec Sendit, le stock et le dashboard.

## Avant / apres

| Avant | Apres |
| --- | --- |
| Deux choix de canal sur la meme page | Un seul choix de canal, place en premier |
| Listes natives de 505 zones et de tout le catalogue | Recherche clavier par ville/quartier et par nom/marque/SKU |
| Le prix Sendit et le prix facture etaient confondus | Cout Sendit et livraison facturee sont deux montants distincts |
| Aucun apercu de cout ou de stock dans le choix produit | Prix, stock disponible, indisponibilite import et cout manquant sont visibles |
| Une commande vide ou une remise excessive pouvait atteindre l'API | Validation UI et validation serveur obligatoires |
| Le stock pouvait devenir negatif lors d'une vente | Reservation verifiee en transaction et garde SQL anti-stock negatif |
| La carte n'etait pas persistee comme paiement encaisse | Carte et virement enregistrent montant, date, reference et statut |
| Un echec Sendit pouvait etre masque par une redirection | La commande creee reste visible avec une alerte et un lien direct |
| Marketplace et main propre affichaient des controles Sendit | Chaque flux ne montre que ses champs utiles |
| Aucune lecture de marge avant validation | Recapitulatif de revenu, couts, commission, profit et marge en direct |
| Chargement Sendit repetait six appels externes | Cache SQL de 24 h; les 505 zones sont reutilisees |

## Calculs affiches

```text
Sous-total produits = somme(prix unitaire x quantite)
Total client = sous-total - remise + livraison facturee
Commission marketplace = sous-total x taux + fixe
Profit estime = total client - cout produits - cout Sendit - commission
Marge estimee = profit estime / (sous-total - remise)
```

Le cout Sendit est une charge de l'entreprise. La livraison facturee est ce que paie la cliente. Les deux peuvent etre differents sans fausser le total ni le profit.

## Flux pris en charge

- Sendit: telephone, district exact et adresse obligatoire. L'envoi peut etre cree immediatement ou laisse en brouillon.
- Main propre: pas de district, pas de frais transporteur, ville reelle obligatoire, paiement COD presente comme especes a la remise.
- Jumia / Marjane Mall: pas d'appel Sendit, ville reelle obligatoire, commission calculee et figee dans la commande.
- Virement: montant, date et reference; un paiement partiel affiche le reste a encaisser.
- Carte: montant verrouille sur le total client et date d'encaissement obligatoire.

## Garanties serveur

- Rejet d'une commande sans produit, avec produits dupliques ou prix non positif.
- Rejet d'une remise superieure au sous-total.
- Rejet d'une commission superieure au total produits.
- Rejet d'un mode marketplace incoherent avec le canal.
- Rejet d'une destination Sendit incomplete.
- Rejet d'un paiement superieur au total; la carte doit etre exacte.
- Verification transactionnelle du stock physique et des composants de bundles.
- Prise en compte des commandes ouvertes qui reservent deja du stock.
- Blocage SQL final si une sortie ferait passer le stock sous zero.
- Le champ Sendit `products` est construit depuis les vrais noms de produits en base.

## Migrations appliquees

- `038_order_creation_integrity.sql`: commission dans le profit et garde anti-stock negatif.
- `039_sendit_district_cache.sql`: cache persistant des destinations Sendit.

Verification sur la base courante:

- 505 districts en cache.
- Fonction de profit avec `channelCommission` active.
- Garde SQL anti-stock negatif active.

## Verification realisee

- `npm run type-check`: OK.
- Lint cible des six fichiers modifies: OK.
- `npm run build`: OK, 96 pages generees.
- Recherche produit, blocage des references indisponibles et calcul de marge: OK.
- Recherche `Fida`: selection exacte `Casablanca - Al fida`, cout 19 MAD: OK.
- Carte, marketplace, main propre et validation d'un formulaire incomplet: OK.
- Aucun ordre reel n'a ete cree pendant ces tests UI.

Le lint global reste en echec sur cinq erreurs preexistantes hors de ce chantier, notamment `app/workspace/page.tsx`.

## Dette de donnees existante

Trois stocks etaient deja negatifs avant l'activation de la garde. Ils ne sont pas modifies automatiquement car une correction exige un comptage physique:

| Produit | Stock actuel |
| --- | ---: |
| Masque sans rincage 200ml | -3 |
| Ampoules reparatrices Vitamine E 4X13ml | -1 |
| Ampoules Apres-shampoing aux Huiles Essentielles 4x13ml | -1 |

Action recommandee: effectuer un comptage physique, puis enregistrer un mouvement d'ajustement justifie pour chaque produit. Ne pas remplacer silencieusement ces valeurs par zero.

