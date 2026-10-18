# Fuite COD — table de vérité hebdomadaire

**Période :** 4 semaines ISO, du lundi **21/09/2026** au dimanche **18/10/2026** (S39 à S42).
La semaine S42 est la semaine en cours, arrêtée au **18/10/2026**.
**Source :** base Neon partagée (`neondb`), tables `Order`, `OrderItem`, `Product`, `OrderStatusHistory`, `SenditStaging`.
**Requête :** `scripts/cod-weekly-truth-table.sql` (transaction `READ ONLY`, aucune écriture).
**Monnaie :** MAD. **Arrondis :** les pourcentages et montants peuvent ne pas sommer exactement à la dernière décimale.

---

## 1. L'essentiel pour le CEO

- **17 commandes posées**, **16 confirmées**, **14 livrées**, **12 payées vérifiées** sur les 4 dernières semaines.
- **82,4 %** des commandes posées sont livrées ; **93,3 %** des commandes résolues (livrées + annulées). La dernière semaine n'est pas mature : 2 commandes sont encore en cours.
- **1 annulation** (Témara), **0 refus à la porte**, **0 retour tagué** sur la période.
- **6 216 MAD** de CA produits livré, **2 518 MAD** de marge de contribution, soit **40,5 %** du CA produits et **179,85 MAD par commande livrée**.
- **La fuite ~25 % n'est pas le taux de livraison.** Elle correspond à une lecture « posées → payées à date » : **29,4 %** des commandes posées ne sont pas encore payées sur 4 semaines (5/17 : 1 annulée, 2 en cours, 2 livrées non marquées payées). Sur les seules commandes résolues, la fuite d'encaissement est de **20,0 %** ; à maturité sur 90 jours, elle tombe à **15,7 %**.
- **La fuite logistique** (non livrées / résolues) est de **6,7 %** sur 4 semaines et **10,8 %** sur 90 jours. Elle est concentrée sur **Website : 18,4 %** d'annulations sur 90 jours, contre **0 % sur Instagram** (25/25 livrées).
- **Alertes :** Website 18,4 % d'annulations sur 90 jours ; Tanger 50 % (2/4) ; marge octobre 36,8 % contre 58,0 % en septembre ; 2 livrées Famille non marquées payées (950 MAD) ; UTM source manquant sur 59 % des commandes de la période.

---

## 2. Définitions utilisées

Chaque chiffre du rapport renvoie à ces définitions et à la section de requête indiquée.

| Terme | Définition | Source |
|---|---|---|
| **Posée** | Commande créée dans la période (`Order."createdAt"`). | `§1` |
| **Confirmée** | Statut `CONFIRMED` ou `DELIVERED`, ou passage `CONFIRMED` dans `OrderStatusHistory`. Une livraison implique une confirmation. | `§1`, `§2` |
| **Livrée** | Statut `DELIVERED` (`deliveredAt` renseigné par trigger). | `§1` |
| **Payée** | `paymentStatus = 'PAID'` **et** `paidAmount > 0` (encaissement vérifié, pas une simple livraison). | `§1`, `§2`, `§8` |
| **Annulée** | Statut `CANCELLED`. Ventilation : `CANCELED/CANCELLED` (transporteur), `REJECTED/REFUSED` (refus), `RETURNED/RETURN` (retour), `NULL/PENDING/TOPICKUP` (motif inconnu). | `§10c` |
| **En cours** | Statut `PENDING` ou `CONFIRMED` : dénouement pas encore connu. | `§2` |
| **Résolue** | Livrée + annulée. Base du taux de livraison « à maturité ». | `§2` |
| **CA produits livré** | `SUM(Order.revenue)` des livrées. `revenue` = encaissé produits **hors frais de livraison**, remises déduites (migration 023). | `§8` |
| **Encaissé théorique** | `COALESCE(codAmount, total, revenue)` des livrées. | `§8` |
| **COGS** | `SUM(COALESCE(OrderItem.unitCost, Product.costPrice, 0) × quantité)`. | `§8` |
| **Livraison réelle** | `COALESCE(actualDeliveryCost, estimatedDeliveryCost, 0)`. `actualDeliveryCost` = frais Sendit réel. | `§8` |
| **Retours** | `returnOrFailedFees + returnDeliveryFee`. | `§8` |
| **Marge de contribution** | Encaissé théorique − COGS − livraison réelle − retours − commission canal. C'est la définition du BOS (`finalProfit` / `estimatedProfit`) ; la requête la recalcule terme par terme. | `§8` |
| **Fuite logistique** | Non livrées / résolues = annulées / (livrées + annulées). | `§2` |
| **Fuite d'encaissement** | Non payées / résolues = (résolues − payées) / résolues. | `§2` |
| **Fuite à date** | Non payées / posées = (posées − payées) / posées. C'est la lecture qui se rapproche du « ~25 % » du document initial. | `§2` |

---

## 3. Table de vérité hebdomadaire

| Semaine | Posées | Confirmées | Livrées | Payées | Annulées | En cours | Taux livraison (résolues) | Taux annulation (résolues) | Délai moyen livraison | CA produits livré | Marge contribution | Marge % CA |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| S39 — 21–27/09 | 2 | 2 | 2 | 2 | 0 | 0 | 100,0 % | 0,0 % | 4,56 j | 1 030 | 501,13 | 48,7 % |
| S40 — 28/09–04/10 | 4 | 3 | 3 | 3 | 1 | 0 | 75,0 % | 25,0 % | 2,45 j | 1 590 | 760,10 | 47,8 % |
| S41 — 05–11/10 | 5 | 5 | 5 | 4 | 0 | 0 | 100,0 % | 0,0 % | 2,26 j | 2 660 | 899,73 | 33,8 % |
| S42 — 12–18/10 *(en cours)* | 6 | 6 | 4 | 3 | 0 | 2 | 100,0 % | 0,0 % | 1,49 j | 936 | 357,00 | 38,1 % |
| **Total 4 semaines** | **17** | **16** | **14** | **12** | **1** | **2** | **93,3 %** | **6,7 %** | **2,41 j** | **6 216** | **2 517,96** | **40,5 %** |

**Lecture :**
- Le taux de livraison « résolues » est la bonne mesure de maturité : **93,3 %** (14/15).
- Le taux de livraison « posées » est plus bas (**82,4 %**, 14/17) parce que 2 commandes de S42 sont encore en transit. Ce n'est pas une dégradation : c'est un délai de maturation.
- S42 affiche 100 % sur les résolues mais 66,7 % sur les posées : **2 commandes en cours** (Dakhla, Marrakech). À re-mesurer la semaine prochaine.
- La seule annulation de la période est une commande Website de Témara, jamais confirmée, annulée manuellement (`PENDING → CANCELLED`, 175 MAD postés, 140 MAD de CA potentiel).

*Source : `scripts/cod-weekly-truth-table.sql` `§1` et `§2`, 18/10/2026.*

---

## 4. Les deux lectures de la fuite

Le « ~25 % » du document initial mélange deux phénomènes. Il faut les séparer pour piloter.

| Lecture | 4 semaines | 90 jours | Où est le problème |
|---|---:|---:|---|
| **Fuite logistique** — non livrées / résolues | **6,7 %** (1/15) | **10,8 %** (9/83) | Website : **18,4 %** sur 90 jours |
| **Fuite d'encaissement** — non payées / résolues | **20,0 %** (3/15) | **15,7 %** (13/83) | 2 livrées Famille non marquées payées ; 9 annulées sur 90 j |
| **Fuite à date** — non payées / posées | **29,4 %** (5/17) | **17,6 %** (15/85) | Ajoute les 2 commandes en cours de S42 |

**Interprétation :**
- Le **~25 %** se lit comme une **fuite à date** : 29,4 % sur 4 semaines, 20,0 % sur les résolues. Il ne signifie pas que 25 % des commandes sont annulées.
- À maturité (90 jours), la fuite d'encaissement est de **15,7 %**, pas 25 %.
- Sur 4 semaines, la différence entre 20,0 % et 6,7 % vient de **2 livraisons non marquées payées** (Famille, 950 MAD) et de **2 commandes encore en cours**. Si les 2 Famille sont confirmées payées, la fuite d'encaissement sur résolues tombe à **6,7 %** (1/15) et la fuite à date à **17,6 %** (3/17).
- La fuite **logistique** est réelle mais plus faible que 25 % ; elle est très concentrée sur **Website**.

*Source : `§2`, `§10a`, `§10f`, 18/10/2026 ; fenêtre 90 jours = 21/07/2026 au 18/10/2026.*

---

## 5. Par canal

| Canal | Posées | Livrées | Payées | Annulées | En cours | Taux livraison (résolues) | Taux annulation | Taux paiement / livrées | Délai moyen | Panier moyen livré | CA produits | Marge contribution | Marge % CA |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Website** | 9 | 7 | 7 | 1 | 1 | 87,5 % | 12,5 % | 100,0 % | 2,84 j | 317,29 | 2 221 | 1 111,13 | 50,0 % |
| **Instagram** | 6 | 5 | 5 | 0 | 1 | 100,0 % | 0,0 % | 100,0 % | 2,77 j | 609,00 | 3 045 | 1 046,83 | 34,4 % |
| **Famille** | 2 | 2 | 0 | 0 | 0 | 100,0 % | 0,0 % | **0,0 %** | 0,00 j | 475,00 | 950 | 360,00 | 37,9 % |
| **Total** | **17** | **14** | **12** | **1** | **2** | **93,3 %** | **6,7 %** | **85,7 %** | **2,41 j** | **444,00** | **6 216** | **2 517,96** | **40,5 %** |

**Lecture :**
- **Website concentre la fuite** : 1 annulation sur 8 commandes résolues (12,5 %) sur 4 semaines, **18,4 % sur 90 jours**.
- **Instagram : 0 annulation sur 90 jours** (25/25 livrées). Le canal est plus cher en panier moyen (609 MAD) et plus faible en marge (34,4 %) : le volume est là, la marge moins.
- **Famille** : 2 livraisons à 950 MAD de CA, mais **aucune n'est marquée payée** (`paymentStatus` PENDING/UNVERIFIED, `paidAmount` NULL). C'est un trou de saisie, pas nécessairement une perte. La marge 360 MAD correspondante est donc **non vérifiée**.
- Le taux de paiement global de 85,7 % est uniquement dû à ces 2 commandes Famille : Website et Instagram sont à **100 %**.

*Source : `§5`, 4 semaines ; `§10a` pour le 90 jours.*

---

## 6. Par ville

| Ville | Posées | Livrées | Annulées | En cours | Taux livraison (résolues) | Taux annulation | Délai moyen | Panier moyen livré | CA produits | Marge contribution | Marge % CA |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Casablanca | 5 | 5 | 0 | 0 | 100,0 % | 0,0 % | 1,47 j | 499,80 | 2 499 | 1 078,04 | 43,1 % |
| Marrakech | 3 | 2 | 0 | 1 | 100,0 % | 0,0 % | 2,05 j | 453,00 | 906 | 377,27 | 41,6 % |
| Kénitra | 2 | 2 | 0 | 0 | 100,0 % | 0,0 % | 4,56 j | 535,50 | 1 071 | 543,19 | 50,7 % |
| Agadir | 1 | 1 | 0 | 0 | 100,0 % | 0,0 % | 2,03 j | 299,00 | 299 | 84,00 | 28,1 % |
| Dakhla | 1 | 0 | 0 | 1 | — | — | — | — | — | — | — |
| Missour | 1 | 1 | 0 | 0 | 100,0 % | 0,0 % | **7,14 j** | 280,00 | 280 | 84,00 | 30,0 % |
| Mohammedia | 1 | 1 | 0 | 0 | 100,0 % | 0,0 % | 1,99 j | 225,00 | 225 | 96,00 | 42,7 % |
| Rabat | 1 | 1 | 0 | 0 | 100,0 % | 0,0 % | 0,91 j | 225,00 | 225 | 90,00 | 40,0 % |
| Tanger | 1 | 1 | 0 | 0 | 100,0 % | 0,0 % | 1,09 j | 711,00 | 711 | 165,46 | **23,3 %** |
| Témara | 1 | 0 | 1 | 0 | 0,0 % | 100,0 % | — | — | — | — | — |
| **Total** | **17** | **14** | **1** | **2** | **93,3 %** | **6,7 %** | **2,41 j** | **444,00** | **6 216** | **2 517,96** | **40,5 %** |

**Lecture :**
- **Tanger** : marge la plus faible de la période (23,3 %) sur un gros panier (711 MAD). Ce n'est pas une perte, mais le coût de livraison (35 MAD) et le COGS pèsent.
- **Missour** : délai de **7,14 j**, très au-dessus de la moyenne (2,41 j). Ville à surveiller logistiquement.
- **Témara** : la seule annulation, avant expédition. Aucune commande livrée.
- Les volumes par ville sont très faibles (souvent 1 commande) : **ne pas tirer de conclusion structurelle** d'une semaine isolée. La lecture 90 jours (§10b) est plus robuste : Tanger 50 % (2/4), Témara 20 % (1/5), Agadir 16,7 % (1/6), Kénitra 11,1 % (1/9), Casablanca 7,7 % (2/26).

*Source : `§4`, 4 semaines ; `§10b` pour le 90 jours.*

---

## 7. Par catégorie et par produit

Les montants par produit sont **alloués au prorata de la valeur article** dans chaque commande. La somme des catégories/produits est donc égale au total commande (6 216 MAD de CA, 2 517,96 MAD de marge). Cela corrige l'écart entre prix catalogue (`productsTotal`) et net encaissé (`revenue`, remises déduites).

### 7.1 Catégories

| Catégorie | Commandes livrées | Unités livrées | CA produit alloué | COGS | Marge brute | Marge brute % | Marge contribution |
|---|---:|---:|---:|---:|---:|---:|---:|
| Cheveux | 7 | 12 | 4 021 | 2 193,04 | 1 827,96 | 45,5 % | 1 722,96 |
| Visage | 4 | 6 | 1 529 | 950,00 | 579,00 | 37,9 % | 528,00 |
| Corps | 3 | 3 | 666 | 405,00 | 261,00 | 39,2 % | 267,00 |
| **Total** | **14 commandes** | **21 unités** | **6 216** | **3 548,04** | **2 667,96** | **42,9 %** | **2 517,96** |

**Lecture :** Cheveux porte 65 % du CA livré et 68 % de la marge de contribution. Visage a la marge brute la plus faible (37,9 %), à surveiller si le mix visage augmente.

### 7.2 Produits principaux

| Produit | Commandes livrées | Unités | CA alloué | Marge brute | Marge brute % | Contribution |
|---|---:|---:|---:|---:|---:|---:|
| N3 plus Soin Réparateur Complet Cheveux 100 ml | 4 | 4 | 1 411 | 517,81 | 36,7 % | 468,48 |
| N°7 Huile Réparatrice 30 ml | 2 | 2 | 705 | 465,00 | 66,0 % | 457,00 |
| Intensive Healing Lotion 15 % Acide Lactique 225 ml | 3 | 3 | 666 | 261,00 | 39,2 % | 267,00 |
| Bio-Collagen Real Deep Mask — coffret 4 masques | 3 | 3 | 849 | 309,00 | 36,4 % | 258,00 |
| N°6 Crème Sans Rinçage 100 ml | 1 | 1 | 355 | 235,00 | 66,2 % | 228,67 |
| Milk Shake Routine Cheveux | 1 | 1 | 319 | 197,94 | 62,1 % | 197,94 |
| N°0 Traitement Préparateur 155 ml | 2 | 2 | 711 | 205,38 | **28,9 %** | 170,38 |
| N°4 Shampoing Réparateur 250 ml | 1 | 1 | 355 | 103,83 | **29,2 %** | 97,50 |
| SUN&MORE Masque Nourrissant 200 ml | 0 | 0 | — | — | — | — |

**Lecture :**
- Les deux meilleures contributions unitaires sont **N°7 Huile** (66,0 % de marge brute) et **N°6 Crème** (66,2 %).
- **N°0** (28,9 %) et **N°4** (29,2 %) sont les produits à faible marge de la période. Ils tirent la marge globale vers le bas.
- **SUN&MORE** : 1 commande résolue, **0 livrée** (c'est l'annulation de Témara). Aucun CA.
- Les taux de livraison par produit sont à 100 % pour tous les produits livrés ; le seul 0 % est le produit annulé. Avec 1 à 4 commandes par produit, ces taux ne sont pas interprétables comme des taux structurels.

*Source : `§6` et `§7`, 4 semaines.*

---

## 8. Décomposition de la marge de contribution

| Ligne | Montant (MAD) | Définition / source |
|---|---:|---|
| CA produits livré | **6 216,00** | `SUM(Order.revenue)` des 14 livrées |
| + Livraison facturée | **226,00** | `deliveryFeeCharged` |
| = Encaissé théorique | **6 442,00** | `COALESCE(codAmount, total, revenue)` |
| − COGS | **−3 548,04** | `unitCost` ou `costPrice` × quantité |
| − Livraison réelle | **−376,00** | `actualDeliveryCost` (2 valeurs manquantes, cf. §9) |
| − Retours | **0,00** | `returnOrFailedFees` + `returnDeliveryFee` |
| − Commissions | **0,00** | `channelCommission` |
| **= Marge de contribution** | **2 517,96** | Calculée ; identique au `finalProfit` BOS (écart 0,00) |

**Ratios :**
- Marge / CA produits : **40,5 %**.
- Marge / encaissé théorique : **39,1 %**.
- Marge par commande livrée : **179,85 MAD**.
- CA produits par commande livrée : **444,00 MAD**.
- COGS / CA produits : **57,1 %**.
- Coût de livraison réel par commande livrée : **26,86 MAD**.
- **Livraison nette absorbée : −150 MAD** (226 MAD facturés − 376 MAD réels). La livraison n'est pas rentable en soi sur la période ; elle est subventionnée par la marge produit.

**Sensibilité Famille :** la marge de 2 517,96 MAD inclut **360 MAD** de contribution des 2 commandes Famille non marquées payées. En les excluant par prudence : CA **5 266 MAD**, marge **2 157,96 MAD** (41,0 %). Si le cash Famille est confirmé, la marge réelle est bien 2 517,96 MAD.

*Source : `§8`, 4 semaines.*

---

## 9. Anomalies et qualité data

### 9.1 Website : la fuite est concentrée là

| Canal | 90 jours : résolues | Annulées | Taux d'annulation | Toutes périodes : taux d'annulation |
|---|---:|---:|---:|---:|
| Website | 49 | 9 | **18,4 %** | **20,5 %** (17/83) |
| Instagram | 25 | 0 | **0,0 %** | 4,2 % (3/71) |
| Sendit | — | — | — | 12,7 % (9/71) |
| WhatsApp | 5 | 0 | 0,0 % | 5,9 % (1/17) |
| Famille | 3 | 0 | 0,0 % | 0,0 % (0/3) |
| Jumia | 1 | 0 | 0,0 % | 0,0 % (0/1) |

- **Website est le seul canal avec une fuite structurelle** : 18,4 % sur 90 jours, 20,5 % toutes périodes. Instagram est à 0 % sur 90 jours (25/25) et 4,2 % toutes périodes.
- **Ce n'est pas un problème de refus à la porte.** Sur 90 jours, les 9 annulations se répartissent en : **5 CANCELED** transporteur (1 541 MAD postés), **2 PENDING** (809 MAD), **1 TOPICKUP** (154 MAD), **1 sans statut** (175 MAD). **0 REJECTED / REFUSED** dans la fenêtre.
- Le levier est donc **avant/au dispatch** : confirmation de commande, qualité d'adresse/téléphone, transmission Sendit, annulations transporteur. À croiser avec le taux de confirmation et les motifs d'annulation Website.

*Source : `§10a`, `§10c`, `§10e`.*

### 9.2 Villes à surveiller

| Ville | 90 jours : résolues | Annulées | Taux d'annulation |
|---|---:|---:|---:|
| **Tanger** | 4 | 2 | **50,0 %** |
| Témara | 5 | 1 | 20,0 % |
| Agadir | 6 | 1 | 16,7 % |
| Kénitra | 9 | 1 | 11,1 % |
| Casablanca | 26 | 2 | 7,7 % |

- **Tanger** est la seule ville avec **N ≥ 3 et taux ≥ 20 %** : 2 annulations sur 4 commandes résolues. Volume faible, mais signal à surveiller (adresse, transporteur, confirmation).
- **Témara** : 1/5 (20 %) ; l'annulation de la période est dans cette ville.
- Les autres villes sont sous 20 % ou avec un volume trop faible pour conclure.

*Source : `§10b`, `§11b`, 90 jours.*

### 9.3 Compression de marge en octobre

| Mois | Livrées | CA produits | Marge | Marge % |
|---|---:|---:|---:|---:|
| Juillet 2026 | 53 | 21 531,50 | 10 590,97 | 49,2 % |
| Août 2026 | 36 | 12 430,00 | 7 074,32 | 56,9 % |
| Septembre 2026 | 15 | 8 885,00 | 5 149,51 | **58,0 %** |
| **Octobre 2026** | **11** | **4 826,00** | **1 776,83** | **36,8 %** |

- La marge d'octobre chute à **36,8 %**, contre 58,0 % en septembre et 55,0 % sur 90 jours.
- **Aucune commande à marge négative** sur 90 jours ; aucune commande où la livraison dépasse la marge brute. Le seuil d'alerte « marge < 20 % » n'est pas déclenché.
- Les plus faibles de la période : Tanger **23,3 %**, Agadir **28,1 %**, Missour **30,0 %** ; produits N°0 **28,9 %**, N°4 **29,2 %**.
- Causes probables à vérifier : remises/promos plus fortes, mix produit moins favorable, hausse de COGS, panier plus petit. **À investiguer avant de conclure** (N=11 livrées en octobre).

*Source : `§10d` et `§11a`.*

### 9.4 Paiement et coût de livraison : trous de saisie

| Indicateur 90 jours | Valeur |
|---|---:|
| Livrées | 74 |
| Livrées non payées (`paymentStatus` ≠ PAID ou `paidAmount` = 0) | **4** |
| CA des livrées non payées | **1 600 MAD** |
| Livrées sans `actualDeliveryCost` | **4** |

- Sur 4 semaines : **2 livrées Famille** non payées (950 MAD de CA, 360 MAD de marge), sans statut Sendit ni coût réel.
- Ces 2 commandes expliquent à elles seules l'écart entre 12 payées et 14 livrées. **Si le cash Famille est confirmé, le taux de paiement passe à 100 % sur les livrées.**
- Le calcul de marge utilise `estimatedDeliveryCost` (0 pour ces commandes) quand `actualDeliveryCost` manque. Le coût réel est donc potentiellement sous-estimé.

*Source : `§8`, `§11c`.*

### 9.5 Attribution : impossible de piloter le ROAS par campagne

| Champ (4 semaines) | Manquant | Taux de remplissage |
|---|---:|---:|
| `sourceChannel` | 0/17 | 100 % |
| `utmSource` | 10/17 | **41,2 %** |
| `utmMedium` | 10/17 | 41,2 % |
| `utmCampaign` | 12/17 | **29,4 %** |
| `campaignId` | 17/17 | **0 %** |
| `deliveryCity` | 0/17 | 100 % |

- Sur 90 jours : `utmSource` manquant **46/85 (54,1 %)**, `utmCampaign` **60/85 (70,6 %)**, `campaignId` **85/85 (100 %)**.
- Le rapport par canal utilise donc `sourceChannel` (rempli manuellement), pas l'attribution UTM. **Aucun CAC / ROAS livré par campagne n'est fiable aujourd'hui.** C'est une limite de mesure, pas un résultat.
- **Doublons :** 0 commande suspecte sur 4 semaines (même téléphone + même total + < 48 h).

*Source : `§9a`, `§9c`, `§9b`.*

---

## 10. Limites

1. **Volumes faibles** : 17 commandes posées, 15 résolues sur 4 semaines. Les taux par ville/produit (souvent N=1) ne sont pas statistiquement robustes. Les chiffres 90 jours et toutes périodes sont donnés pour le contexte.
2. **Dernière semaine partielle** : S42 est arrêtée au 18/10 ; 2 commandes sont en cours. Le taux de livraison sur posées (82,4 %) va mécaniquement monter si elles sont livrées.
3. **Paiement** : `paymentStatus` dépend de la saisie manuelle et du sync Sendit. Les 2 commandes Famille non marquées payées sont traitées comme non payées par prudence ; leur cash est peut-être réel.
4. **Retours** : 0 retour tagué sur la période. Un retour non tagué (pas de `returnedAt` / frais) n'est pas visible. Le taux de retour réel peut être supérieur.
5. **Attribution** : UTM et `campaignId` très incomplets ; le canal est manuel. Pas de ROAS/CAC par campagne, pas de first-touch/last-touch fiable dans ce rapport.
6. **Définition du CA** : le CA produits exclut la livraison facturée. La marge inclut cette livraison facturée puis déduit la livraison réelle. C'est la définition BOS ; ne pas comparer directement à un CA TTC.
7. **Le « ~25 % »** dépend du dénominateur : 29,4 % « à date » sur posées, 20,0 % sur résolues, 15,7 % à maturité 90 jours. Toujours préciser la lecture.
8. **Pas de spend Meta joint** : le ROAS livré par campagne n'est pas calculé ici. La table `AdCampaign`/spend existe, mais l'attribution commande→campagne est trop incomplète pour un chiffre honnête.

---

## 11. Recommandations

1. **Vérifier les 2 commandes Famille** (#347 et #351) : cash reçu ? si oui, passer `paymentStatus = PAID` et `paidAmount`. Sinon, les exclure explicitement des KPI COD.
2. **Renseigner `actualDeliveryCost` et `senditStatus`** pour toutes les livrées, y compris hors Sendit. Sans cela, la marge est estimée, pas réelle.
3. **Auditer Website** : 18,4 % d'annulations sur 90 jours, 20,5 % toutes périodes, contre 0 % Instagram. Priorité : confirmation, qualité adresse/téléphone, transmission Sendit, motifs `CANCELED`.
4. **Surveiller Tanger** (50 %, 2/4) et **Missour** (délai 7,14 j) avec des seuils d'alerte : ville ≥ 20 % d'annulation avec N ≥ 3 ; délai > 5 j.
5. **Investiguer la marge d'octobre** (36,8 %) : remises, mix produit, COGS, panier. Les produits N°0 et N°4 sont sous 30 % de marge brute.
6. **Prioriser l'attribution** : propager `fbclid`/`utm_*` jusqu'à `Order`, remplir `campaignId`. Sans cela, impossible de calculer un CAC/ROAS livré par campagne.
7. **Automatiser le rapport** : exécuter `scripts/cod-weekly-truth-table.sql` chaque lundi, publier les sections 1–5, et alerter sur les sections 11a–11c.

---

## 12. Reproduire

```bash
# 4 dernières semaines ISO, arrêtées à aujourd'hui
psql "$DATABASE_URL" -f scripts/cod-weekly-truth-table.sql

# Période explicite (bornes : début inclus, fin exclue)
psql "$DATABASE_URL" \
  -v start_date=2026-09-21 \
  -v end_date=2026-10-19 \
  -f scripts/cod-weekly-truth-table.sql
```

La requête ouvre une transaction `READ ONLY` : aucune écriture, aucun DDL.

---

*Rapport généré le 18/10/2026. Chaque tableau cite sa section de requête et sa période. Les montants sont en MAD.*
