# Fiabilite de l'edition des commandes - 16 octobre 2026

## Incident #351

La commande avait ete creee livree avec deux coffrets Bio-Collagen. Le passage
a une unite obligeait a supprimer puis recreer la ligne. Les mouvements de
stock etaient corrects, mais le total client restait a 540 MAD. Une annulation
ulterieure avait remis l'unite restante en stock et laisse la commande annulee.

Etat corrige :

- statut : `DELIVERED`
- quantite : `1`
- total produits et CA : `270 MAD`
- remise residuelle : `0 MAD`
- profit estime : `90 MAD`
- stock du produit : `7` apres un mouvement `Sale -1`

## Correctifs

- Edition directe de la quantite et du prix d'une ligne, y compris apres livraison.
- Mutation transactionnelle des lignes, des totaux et de l'historique.
- Recalcul de `productsTotal`, remise, CA, total, COD, paiement et marge.
- Refus d'une commande sans article et des quantites sans stock disponible.
- Avertissement lorsqu'un bordereau Sendit existe deja.
- Journalisation de chaque ajout, modification et suppression de ligne.
- Le dernier mouvement `Sale` ou `Return` devient la source de verite du stock.
- Une commande annulee puis remise en `DELIVERED` consomme a nouveau son stock.

## Verification

- TypeScript : OK
- Build Next.js : OK
- Tests de calcul commande : 4/4
- Test transactionnel stock : quantite `1 -> 2 -> 1`, stock `7 -> 6 -> 7`, rollback OK
